export type ExecutableResolutionSource = "explicit" | "path" | "known-location";
export type ExecutableKind = "exe" | "cmd" | "bat" | "script";

export interface ExecutableResolutionRequest {
  executable: string;
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
