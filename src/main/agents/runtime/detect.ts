import { RUNTIME_DEFINITIONS, runtimeDefinition } from "../../../shared/runtime-catalog";
import type { AgentId, AgentRuntime } from "../../../shared/types";
import type { ExecutableResolutionSourceHint } from "../../platform/executable-resolver";
import { createExecutableLocator, type ExecutableLocator } from "../../platform/cli-locator";
import { execCli, type ExecCli } from "../../platform/cli-launcher";

export interface RuntimeExecutableConfiguration {
  executables: Record<AgentId, string>;
  sources: Partial<Record<AgentId, ExecutableResolutionSourceHint>>;
}

export function resolveRuntimeExecutableConfiguration(
  overrides: Partial<Record<AgentId, string>> = {},
  environment: Record<string, string | undefined> = process.env,
): RuntimeExecutableConfiguration {
  const executables = {} as Record<AgentId, string>;
  const sources: Partial<Record<AgentId, ExecutableResolutionSourceHint>> = {};
  for (const definition of RUNTIME_DEFINITIONS) {
    const explicit = overrides[definition.id];
    const fromEnvironment = "executableEnv" in definition
      ? environment[definition.executableEnv]
      : undefined;
    if (explicit !== undefined) {
      executables[definition.id] = explicit;
      sources[definition.id] = "explicit";
    } else if (fromEnvironment !== undefined) {
      executables[definition.id] = fromEnvironment;
      sources[definition.id] = "environment";
    } else {
      executables[definition.id] = definition.executable;
    }
  }
  return { executables, sources };
}

export function resolveRuntimeExecutables(
  overrides: Partial<Record<AgentId, string>> = {},
  environment: Record<string, string | undefined> = process.env,
): Record<AgentId, string> {
  return resolveRuntimeExecutableConfiguration(overrides, environment).executables;
}

export function parseCliVersion(raw: string): string {
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(/(\d+\.\d+[\w.+-]*)/);
  return match?.[1] ?? firstLine;
}

interface RuntimeDetectionDependencies {
  executableLocator: ExecutableLocator;
  execute: ExecCli;
  executableSources: Partial<Record<AgentId, ExecutableResolutionSourceHint>>;
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
    const sourceHint = dependencies.executableSources[id];
    const executable = await dependencies.executableLocator.resolve({
      executable: requestedCommand,
      ...(sourceHint ? { sourceHint } : {}),
    });
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
      commandSource: executable.source,
    };
  } catch (error) {
    return {
      id,
      label: definition.label,
      command: requestedCommand,
      version: null,
      available: false,
      ...(dependencies.executableSources[id]
        ? { commandSource: dependencies.executableSources[id] }
        : {}),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function detectAgentRuntimes(
  executables?: Record<AgentId, string>,
  dependencies: Partial<RuntimeDetectionDependencies> = {},
): Promise<AgentRuntime[]> {
  const defaultConfiguration = executables ? undefined : resolveRuntimeExecutableConfiguration();
  const configuredExecutables = executables ?? defaultConfiguration!.executables;
  const executableSources = dependencies.executableSources ?? defaultConfiguration?.sources ?? {};
  const execute = dependencies.execute ?? execCli;
  const executableLocator = dependencies.executableLocator ?? createExecutableLocator({ execute });
  return Promise.all(
    RUNTIME_DEFINITIONS.map((definition) => detectOne(definition.id, configuredExecutables, {
      execute,
      executableLocator,
      executableSources,
    })),
  );
}
