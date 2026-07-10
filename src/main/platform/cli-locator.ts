import { access } from "node:fs/promises";
import path from "node:path";
import type { ExecCli } from "./cli-launcher";
import {
  executableKind,
  type ExecutableResolutionRequest,
  type ExecutableResolver,
  type ResolvedExecutable,
} from "./executable-resolver";

export interface ExecutableLocator {
  resolve(request: ExecutableResolutionRequest): Promise<ResolvedExecutable>;
  invalidate(): void;
}

interface ExecutableLocatorOptions {
  platform?: NodeJS.Platform;
  environment?: Record<string, string | undefined>;
  cwd?: string;
  execute: ExecCli;
  fileExists?: (filePath: string) => Promise<boolean>;
  pathApi?: Pick<typeof path, "isAbsolute" | "join" | "resolve">;
  cacheTtlMs?: number;
  now?: () => number;
}

interface ExecutableCacheEntry {
  expiresAt: number;
  resolution: Promise<ResolvedExecutable>;
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolved(
  requested: string,
  resolvedPath: string,
  source: ResolvedExecutable["source"],
): ResolvedExecutable {
  return {
    requested,
    resolvedPath,
    source,
    kind: executableKind(resolvedPath),
  };
}

function explicitPathResolver(
  pathApi: Pick<typeof path, "isAbsolute" | "resolve">,
  cwd: string,
): ExecutableResolver {
  return {
    async resolve(request) {
      const executable = request.executable.trim();
      if (!executable) throw new Error("Executable is required.");
      if (!pathApi.isAbsolute(executable) && !/[\\/]/.test(executable)) return undefined;
      return resolved(executable, pathApi.resolve(cwd, executable), "explicit");
    },
  };
}

function windowsPathResolver(execute: ExecCli): ExecutableResolver {
  return {
    async resolve(request) {
      try {
        const { stdout } = await execute({
          executable: "where.exe",
          args: [request.executable],
          timeout: 5000,
          windowsHide: true,
          maxBuffer: 1024 * 16,
        });
        const firstMatch = stdout.split(/\r?\n/).map((item) => item.trim()).find(Boolean);
        return firstMatch ? resolved(request.executable, firstMatch, "path") : undefined;
      } catch {
        // PATH lookup failure is an expected discovery miss; later resolvers still get a chance.
        return undefined;
      }
    },
  };
}

function windowsNpmShimResolver(input: {
  appData: string | undefined;
  fileExists: (filePath: string) => Promise<boolean>;
  pathApi: Pick<typeof path, "join">;
}): ExecutableResolver {
  return {
    async resolve(request) {
      if (!input.appData || /[\\/]/.test(request.executable) || /\.[a-z0-9]+$/i.test(request.executable)) {
        return undefined;
      }
      const candidate = input.pathApi.join(input.appData, "npm", `${request.executable}.cmd`);
      return await input.fileExists(candidate)
        ? resolved(request.executable, candidate, "known-location")
        : undefined;
    },
  };
}

function fallbackPathResolver(): ExecutableResolver {
  return {
    async resolve(request) {
      const executable = request.executable.trim();
      if (!executable) throw new Error("Executable is required.");
      return resolved(executable, executable, "path");
    },
  };
}

export function createExecutableLocator(options: ExecutableLocatorOptions): ExecutableLocator {
  const platform = options.platform ?? process.platform;
  const environment = options.environment ?? process.env;
  const pathApi = options.pathApi ?? (platform === "win32" ? path.win32 : path);
  const fileExists = options.fileExists ?? defaultFileExists;
  const cacheTtlMs = options.cacheTtlMs ?? 30_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, ExecutableCacheEntry>();
  const resolvers: ExecutableResolver[] = [
    explicitPathResolver(pathApi, options.cwd ?? process.cwd()),
    ...(platform === "win32"
      ? [
          windowsPathResolver(options.execute),
          windowsNpmShimResolver({
            appData: environment.APPDATA,
            fileExists,
            pathApi,
          }),
        ]
      : []),
    fallbackPathResolver(),
  ];

  const resolveUncached = async (request: ExecutableResolutionRequest): Promise<ResolvedExecutable> => {
    for (const resolver of resolvers) {
      const result = await resolver.resolve(request);
      if (result) {
        return request.sourceHint ? { ...result, source: request.sourceHint } : result;
      }
    }
    throw new Error(`Unable to resolve executable: ${request.executable}`);
  };

  return {
    async resolve(request) {
      const cacheKey = `${request.sourceHint ?? ""}\u0000${request.executable.trim()}`;
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > now()) return cached.resolution;

      const resolution = resolveUncached(request);
      if (cacheTtlMs > 0) {
        cache.set(cacheKey, { expiresAt: now() + cacheTtlMs, resolution });
      }
      try {
        return await resolution;
      } catch (error) {
        if (cache.get(cacheKey)?.resolution === resolution) cache.delete(cacheKey);
        throw error;
      }
    },
    invalidate() {
      cache.clear();
    },
  };
}
