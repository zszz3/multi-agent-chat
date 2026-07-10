import { lstat, readlink, realpath, symlink, unlink } from "node:fs/promises";
import type { Stats } from "node:fs";
import type { PlatformPathPolicy } from "./platform-paths";

export type DirectoryLinkType = "dir" | "junction";

export interface ManagedDirectoryLinkService {
  readonly linkType: DirectoryLinkType;
  replaceOwnedLink(linkPath: string, sourceDir: string): Promise<boolean>;
  removeOwnedLink(linkPath: string, sourceDir: string): Promise<boolean>;
}

export interface ManagedDirectoryLinkOptions {
  pathPolicy: PlatformPathPolicy;
  linkType: DirectoryLinkType;
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function linkStats(linkPath: string): Promise<Stats | undefined> {
  try {
    return await lstat(linkPath);
  } catch (error) {
    if (isMissingPathError(error)) return undefined;
    throw error;
  }
}

async function resolvedLinkTarget(linkPath: string, pathPolicy: PlatformPathPolicy): Promise<string> {
  try {
    return await realpath(linkPath);
  } catch {
    const rawTarget = await readlink(linkPath);
    return pathPolicy.pathApi.resolve(pathPolicy.pathApi.dirname(linkPath), rawTarget);
  }
}

async function assertOwnedLink(
  linkPath: string,
  sourceDir: string,
  stats: Stats,
  pathPolicy: PlatformPathPolicy,
): Promise<void> {
  if (!stats.isSymbolicLink()) {
    throw new Error(`${linkPath} already exists and is not an app-managed directory link. Refusing to overwrite user content.`);
  }
  const [actualTarget, expectedTarget] = await Promise.all([
    resolvedLinkTarget(linkPath, pathPolicy),
    realpath(sourceDir),
  ]);
  if (!pathPolicy.equals(actualTarget, expectedTarget)) {
    throw new Error(`${linkPath} points to ${actualTarget}, not this app's managed skill. Refusing to modify it.`);
  }
}

export function createManagedDirectoryLinkService(
  options: ManagedDirectoryLinkOptions,
): ManagedDirectoryLinkService {
  return {
    linkType: options.linkType,
    async replaceOwnedLink(linkPath, sourceDir) {
      await realpath(sourceDir);
      const stats = await linkStats(linkPath);
      if (stats) {
        await assertOwnedLink(linkPath, sourceDir, stats, options.pathPolicy);
        await unlink(linkPath);
      }
      await symlink(sourceDir, linkPath, options.linkType);
      return Boolean(stats);
    },
    async removeOwnedLink(linkPath, sourceDir) {
      const stats = await linkStats(linkPath);
      if (!stats) return false;
      await assertOwnedLink(linkPath, sourceDir, stats, options.pathPolicy);
      await unlink(linkPath);
      return true;
    },
  };
}
