import { RUNTIME_DEFINITIONS, runtimeDefinition } from "../../../shared/runtime-catalog";
import type { AgentId, AgentRuntime } from "../../../shared/types";
import { createExecutableLocator, type ExecutableLocator } from "../../platform/cli-locator";
import { execCli, type ExecCli } from "../../platform/cli-launcher";

export function resolveRuntimeExecutables(
  overrides: Partial<Record<AgentId, string>> = {},
  environment: Record<string, string | undefined> = process.env,
): Record<AgentId, string> {
  return Object.fromEntries(
    RUNTIME_DEFINITIONS.map((definition) => [
      definition.id,
      overrides[definition.id]
        ?? ("executableEnv" in definition ? environment[definition.executableEnv] : undefined)
        ?? definition.executable,
    ]),
  ) as Record<AgentId, string>;
}

export function parseCliVersion(raw: string): string {
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(/(\d+\.\d+[\w.+-]*)/);
  return match?.[1] ?? firstLine;
}

interface RuntimeDetectionDependencies {
  executableLocator: ExecutableLocator;
  execute: ExecCli;
}

async function detectOne(
  id: AgentId,
  executables: Record<AgentId, string>,
  dependencies: RuntimeDetectionDependencies,
): Promise<AgentRuntime> {
  const definition = runtimeDefinition(id);
  const requestedCommand = executables[id];
  if (definition.detection === "virtual") {
    return {
      id,
      label: definition.label,
      command: requestedCommand,
      version: null,
      available: true,
    };
  }

  try {
    const executable = await dependencies.executableLocator.resolve({ executable: requestedCommand });
    const { stdout } = await dependencies.execute({
      executable: executable.resolvedPath,
      args: ["--version"],
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 1024 * 16,
    });
    return {
      id,
      label: definition.label,
      command: executable.resolvedPath,
      version: parseCliVersion(String(stdout).trim()),
      available: true,
    };
  } catch (error) {
    return {
      id,
      label: definition.label,
      command: requestedCommand,
      version: null,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function detectAgentRuntimes(
  executables: Record<AgentId, string> = resolveRuntimeExecutables(),
  dependencies: Partial<RuntimeDetectionDependencies> = {},
): Promise<AgentRuntime[]> {
  const execute = dependencies.execute ?? execCli;
  const executableLocator = dependencies.executableLocator ?? createExecutableLocator({ execute });
  return Promise.all(
    RUNTIME_DEFINITIONS.map((definition) => detectOne(definition.id, executables, { execute, executableLocator })),
  );
}
