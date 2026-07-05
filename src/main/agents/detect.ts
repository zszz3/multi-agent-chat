import type { AgentId, AgentRuntime, RuntimeCommandConfig } from "../../shared/types";
import { execCli } from "../cli-launcher";
import { createRuntimeLaunchProfiles, type RuntimeLaunchProfileRegistry } from "../runtime-launch-profiles";

const AGENT_COMMANDS: Record<Exclude<AgentId, "api">, { label: string; env: string; executable: string }> = {
  codex: { label: "Codex", env: "CODEX_PATH", executable: "codex" },
  claude: { label: "Claude Code", env: "CLAUDE_PATH", executable: "claude" },
};

export interface DetectAgentRuntimesOptions {
  runtimeCommandConfigs?: RuntimeCommandConfig[];
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  profiles?: RuntimeLaunchProfileRegistry;
}

export function parseCliVersion(raw: string): string {
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(/(\d+\.\d+[\w.+-]*)/);
  return match?.[1] ?? firstLine;
}

function runtimeCommandOverrideFor(configs: RuntimeCommandConfig[] | undefined, runtimeId: AgentId) {
  return configs?.find((config) => config.runtimeId === runtimeId)?.override;
}

function defaultRuntimeLaunchProfiles(): RuntimeLaunchProfileRegistry {
  return createRuntimeLaunchProfiles({
    probeVersion: async ({ executable, fixedArgs }) => {
      const { stdout } = await execCli({
        executable,
        args: [...fixedArgs, "--version"],
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 1024 * 16,
      });
      return parseCliVersion(String(stdout).trim());
    },
  });
}

async function detectOne(
  id: Exclude<AgentId, "api">,
  input: {
    runtimeCommandConfigs: RuntimeCommandConfig[] | undefined;
    env: NodeJS.ProcessEnv | Record<string, string | undefined>;
    platform: NodeJS.Platform;
    profiles: RuntimeLaunchProfileRegistry;
  },
): Promise<AgentRuntime> {
  const spec = AGENT_COMMANDS[id];
  const profile = input.profiles.driverFor(id);
  const override = runtimeCommandOverrideFor(input.runtimeCommandConfigs, id);
  const resolved = await profile.resolveCommand({
    runtimeId: id,
    ...(override ? { override } : {}),
    env: input.env,
    platform: input.platform,
  });

  return {
    id,
    label: profile.label || spec.label,
    command: resolved.command,
    version: resolved.version,
    available: resolved.available,
    ...(resolved.fixedArgs.length > 0 ? { fixedArgs: resolved.fixedArgs } : {}),
    source: resolved.source,
    fingerprint: resolved.fingerprint,
    ...(resolved.error ? { error: resolved.error } : {}),
  };
}

export async function detectAgentRuntimes(input: DetectAgentRuntimesOptions = {}): Promise<AgentRuntime[]> {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const profiles = input.profiles ?? defaultRuntimeLaunchProfiles();
  return Promise.all([
    detectOne("codex", { runtimeCommandConfigs: input.runtimeCommandConfigs, env, platform, profiles }),
    detectOne("claude", { runtimeCommandConfigs: input.runtimeCommandConfigs, env, platform, profiles }),
    Promise.resolve({
      id: "api" as const,
      label: "API",
      command: "api",
      version: null,
      available: true,
      source: "path" as const,
      fingerprint: "api",
    }),
  ]);
}
