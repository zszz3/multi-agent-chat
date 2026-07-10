import type { AgentExecutableSource } from "../../shared/types";

export type ExecutableResolutionSource = AgentExecutableSource;
export type ExecutableResolutionSourceHint = Extract<ExecutableResolutionSource, "explicit" | "environment">;
export type ExecutableKind = "exe" | "cmd" | "bat" | "script";

export interface ExecutableResolutionRequest {
  executable: string;
  sourceHint?: ExecutableResolutionSourceHint;
}

export interface ResolvedExecutable {
  requested: string;
  resolvedPath: string;
  source: ExecutableResolutionSource;
  kind: ExecutableKind;
}

export interface ExecutableResolver {
  resolve(request: ExecutableResolutionRequest): Promise<ResolvedExecutable | undefined>;
}

export function executableKind(executable: string): ExecutableKind {
  const normalized = executable.trim().toLowerCase();
  if (normalized.endsWith(".exe")) return "exe";
  if (normalized.endsWith(".cmd")) return "cmd";
  if (normalized.endsWith(".bat")) return "bat";
  return "script";
}
