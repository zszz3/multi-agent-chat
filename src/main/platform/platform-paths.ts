import type path from "node:path";

export type PlatformPathApi = Pick<
  typeof path.win32,
  "basename" | "dirname" | "isAbsolute" | "join" | "normalize" | "relative" | "resolve" | "sep"
>;

export interface PlatformPathPolicy {
  pathApi: PlatformPathApi;
  caseSensitive: boolean;
  expandHome(input: string, homeDir: string): string;
  normalize(input: string): string;
  isDevicePath(input: string): boolean;
  equals(left: string, right: string): boolean;
  isWithin(root: string, candidate: string): boolean;
}

export interface PlatformPathPolicyOptions {
  pathApi: PlatformPathApi;
  caseSensitive: boolean;
}

function normalizedDriveLetter(input: string, caseSensitive: boolean): string {
  if (caseSensitive || !/^[a-z]:/i.test(input)) return input;
  return `${input[0]?.toUpperCase() ?? ""}${input.slice(1)}`;
}

export function createPlatformPathPolicy(options: PlatformPathPolicyOptions): PlatformPathPolicy {
  const normalize = (input: string): string => normalizedDriveLetter(
    options.pathApi.normalize(input),
    options.caseSensitive,
  );
  const comparisonPath = (input: string): string => {
    const normalized = normalize(input);
    return options.caseSensitive ? normalized : normalized.toLocaleLowerCase("en-US");
  };
  const isDevicePath = (input: string): boolean => {
    if (options.caseSensitive) return false;
    const windowsPath = input.replace(/\//g, "\\");
    return windowsPath.startsWith("\\\\?\\") || windowsPath.startsWith("\\\\.\\");
  };

  return {
    pathApi: options.pathApi,
    caseSensitive: options.caseSensitive,
    expandHome(input, homeDir) {
      if (input === "~") return normalize(homeDir);
      return /^~[\\/]/.test(input)
        ? options.pathApi.join(homeDir, input.slice(2))
        : input;
    },
    normalize,
    isDevicePath,
    equals(left, right) {
      return comparisonPath(left) === comparisonPath(right);
    },
    isWithin(root, candidate) {
      if (isDevicePath(root) || isDevicePath(candidate)) return false;
      const relative = options.pathApi.relative(comparisonPath(root), comparisonPath(candidate));
      return relative === ""
        || (relative !== ".."
          && !relative.startsWith(`..${options.pathApi.sep}`)
          && !options.pathApi.isAbsolute(relative));
    },
  };
}
