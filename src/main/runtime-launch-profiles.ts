import path from "node:path";
import type { AgentId, RuntimeCommandOverride, RuntimeLaunchSource } from "../shared/types";
import { lookupDarwinLoginShellPath } from "./darwin-shell-path";

type NativeRuntimeId = Extract<AgentId, "codex" | "claude">;

interface RuntimeLaunchSpec {
  runtimeId: NativeRuntimeId;
  label: string;
  envVar: "CODEX_PATH" | "CLAUDE_PATH";
  executable: string;
}

interface RuntimeLaunchCandidate {
  executable: string;
  fixedArgs: string[];
  source: Exclude<RuntimeLaunchSource, "unavailable">;
}

export interface RuntimeCommandProbeInput {
  runtimeId: NativeRuntimeId;
  executable: string;
  fixedArgs: string[];
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

export interface RuntimeCommandResolutionInput {
  runtimeId: AgentId;
  override?: RuntimeCommandOverride;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform?: NodeJS.Platform;
}

export interface ResolvedRuntimeCommand {
  runtimeId: AgentId;
  executable: string;
  fixedArgs: string[];
  command: string;
  source: RuntimeLaunchSource;
  version: string | null;
  fingerprint: string;
  available: boolean;
  error?: string;
}

export interface RuntimeLaunchProfile {
  runtimeId: AgentId;
  label: string;
  resolveCommand(input: RuntimeCommandResolutionInput): Promise<ResolvedRuntimeCommand>;
}

export interface RuntimeLaunchProfileRegistry {
  driverFor(runtimeId: AgentId): RuntimeLaunchProfile;
}

export interface RuntimeLaunchProfileOptions {
  probeVersion(input: RuntimeCommandProbeInput): Promise<string>;
  shellPathLookup?: (options: { env?: NodeJS.ProcessEnv | Record<string, string | undefined>; shell?: string }) => Promise<string[] | null>;
}

const RUNTIME_SPECS: Record<NativeRuntimeId, RuntimeLaunchSpec> = {
  codex: { runtimeId: "codex", label: "Codex", envVar: "CODEX_PATH", executable: "codex" },
  claude: { runtimeId: "claude", label: "Claude Code", envVar: "CLAUDE_PATH", executable: "claude" },
};

function normalizeFixedArgs(fixedArgs: string[] | undefined): string[] {
  return Array.isArray(fixedArgs) ? fixedArgs.filter((item): item is string => typeof item === "string") : [];
}

function runtimeCandidate(
  input: {
    executable: string;
    source: RuntimeLaunchCandidate["source"];
  },
  fixedArgs?: string[],
): RuntimeLaunchCandidate {
  return {
    executable: input.executable,
    fixedArgs: normalizeFixedArgs(fixedArgs),
    source: input.source,
  };
}

function appendCandidate(target: RuntimeLaunchCandidate[], candidate: RuntimeLaunchCandidate): void {
  const key = `${candidate.executable}\u0000${candidate.fixedArgs.join("\u0000")}`;
  const existing = target.some((item) => `${item.executable}\u0000${item.fixedArgs.join("\u0000")}` === key);
  if (!existing) target.push(candidate);
}

function firstAvailableRecord(env: NodeJS.ProcessEnv | Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function profileCandidates(spec: RuntimeLaunchSpec, input: RuntimeCommandResolutionInput): RuntimeLaunchCandidate[] {
  const env = input.env ?? process.env;
  const candidates: RuntimeLaunchCandidate[] = [];
  if (input.override?.executable) {
    appendCandidate(
      candidates,
      runtimeCandidate(
        {
          executable: input.override.executable,
          source: "app_override",
        },
        input.override.fixedArgs,
      ),
    );
  }
  const envExecutable = firstAvailableRecord(env, spec.envVar);
  if (envExecutable) {
    appendCandidate(candidates, runtimeCandidate({ executable: envExecutable, source: "env_override" }));
  }
  appendCandidate(candidates, runtimeCandidate({ executable: spec.executable, source: "path" }));
  return candidates;
}

async function resolveShellHydratedCandidate(
  spec: RuntimeLaunchSpec,
  input: RuntimeCommandResolutionInput,
  shellPathLookup: RuntimeLaunchProfileOptions["shellPathLookup"],
): Promise<RuntimeLaunchCandidate[]> {
  if ((input.platform ?? process.platform) !== "darwin") return [];
  const lookup = shellPathLookup ?? ((options) => lookupDarwinLoginShellPath(options));
  const entries = await lookup({
    ...(input.env ? { env: input.env } : {}),
    ...(typeof input.env?.SHELL === "string" ? { shell: input.env.SHELL } : {}),
  });
  if (!entries || entries.length === 0) return [];
  return entries.map((entry) =>
    runtimeCandidate({
      executable: path.posix.join(entry, spec.executable),
      source: "shell_hydrated_path",
    }),
  );
}

function successfulResolution(
  input: RuntimeCommandProbeInput & { source: RuntimeLaunchSource; version: string },
): ResolvedRuntimeCommand {
  return {
    runtimeId: input.runtimeId,
    executable: input.executable,
    fixedArgs: input.fixedArgs,
    command: input.executable,
    source: input.source,
    version: input.version,
    fingerprint: buildCliFingerprint(input),
    available: true,
  };
}

function unavailableResolution(input: {
  runtimeId: NativeRuntimeId;
  candidate: RuntimeLaunchCandidate;
  error?: string;
}): ResolvedRuntimeCommand {
  return {
    runtimeId: input.runtimeId,
    executable: input.candidate.executable,
    fixedArgs: input.candidate.fixedArgs,
    command: input.candidate.executable,
    source: "unavailable",
    version: null,
    fingerprint: buildCliFingerprint({
      executable: input.candidate.executable,
      fixedArgs: input.candidate.fixedArgs,
      version: null,
    }),
    available: false,
    ...(input.error ? { error: input.error } : {}),
  };
}

export function buildCliFingerprint(input: {
  executable: string;
  fixedArgs?: string[];
  version: string | null;
}): string {
  return JSON.stringify({
    executable: input.executable,
    fixedArgs: normalizeFixedArgs(input.fixedArgs),
    version: input.version ?? null,
  });
}

export function createRuntimeLaunchProfiles(options: RuntimeLaunchProfileOptions): RuntimeLaunchProfileRegistry {
  const nativeDrivers = Object.fromEntries(
    (Object.keys(RUNTIME_SPECS) as NativeRuntimeId[]).map((runtimeId) => {
      const spec = RUNTIME_SPECS[runtimeId];
      const driver: RuntimeLaunchProfile = {
        runtimeId,
        label: spec.label,
        async resolveCommand(input: RuntimeCommandResolutionInput): Promise<ResolvedRuntimeCommand> {
          const env = input.env ?? process.env;
          const candidates = profileCandidates(spec, input);
          const pathCandidate = candidates.find((candidate) => candidate.source === "path") ?? runtimeCandidate({ executable: spec.executable, source: "path" });
          let lastError: string | undefined;
          let pathProbeFailed = false;

          for (const candidate of candidates) {
            try {
              const version = await options.probeVersion({
                runtimeId,
                executable: candidate.executable,
                fixedArgs: candidate.fixedArgs,
                env,
              });
              return successfulResolution({
                runtimeId,
                executable: candidate.executable,
                fixedArgs: candidate.fixedArgs,
                source: candidate.source,
                version,
                env,
              });
            } catch (error) {
              lastError = error instanceof Error ? error.message : String(error);
              if (candidate.source === "path") pathProbeFailed = true;
            }
          }

          if (pathProbeFailed) {
            const shellCandidates = await resolveShellHydratedCandidate(spec, input, options.shellPathLookup);
            for (const shellCandidate of shellCandidates) {
              try {
                const version = await options.probeVersion({
                  runtimeId,
                  executable: shellCandidate.executable,
                  fixedArgs: shellCandidate.fixedArgs,
                  env,
                });
                return successfulResolution({
                  runtimeId,
                  executable: shellCandidate.executable,
                  fixedArgs: shellCandidate.fixedArgs,
                  source: shellCandidate.source,
                  version,
                  env,
                });
              } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
              }
            }
          }

          return unavailableResolution({
            runtimeId,
            candidate: pathCandidate,
            ...(lastError ? { error: lastError } : {}),
          });
        },
      };
      return [runtimeId, driver];
    }),
  ) as Record<NativeRuntimeId, RuntimeLaunchProfile>;

  const apiDriver: RuntimeLaunchProfile = {
    runtimeId: "api",
    label: "API",
    async resolveCommand(input: RuntimeCommandResolutionInput): Promise<ResolvedRuntimeCommand> {
      const executable = input.override?.executable ?? "api";
      const fixedArgs = normalizeFixedArgs(input.override?.fixedArgs);
      return {
        runtimeId: "api",
        executable,
        fixedArgs,
        command: executable,
        source: "path",
        version: null,
        fingerprint: "api",
        available: true,
      };
    },
  };

  return {
    driverFor(runtimeId: AgentId): RuntimeLaunchProfile {
      if (runtimeId === "api") return apiDriver;
      return nativeDrivers[runtimeId];
    },
  };
}
