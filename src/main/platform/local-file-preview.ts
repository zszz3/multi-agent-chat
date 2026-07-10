import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { LocalFilePreview } from "../../shared/types";
import { createPlatformPathPolicy, type PlatformPathPolicy } from "./platform-paths";

export const MAX_LOCAL_FILE_PREVIEW_BYTES = 512 * 1024;

const hostPathPolicy = createPlatformPathPolicy({
  pathApi: path,
  caseSensitive: path.sep !== "\\",
});

async function resolveExistingFileUnderRoot(
  filePath: string,
  rawRoot: string,
  homeDir: string,
  pathPolicy: PlatformPathPolicy,
): Promise<string | undefined> {
  const root = pathPolicy.pathApi.resolve(rawRoot);
  const expandedPath = pathPolicy.expandHome(filePath, homeDir);
  const candidate = pathPolicy.pathApi.resolve(root, expandedPath);
  if (!pathPolicy.isWithin(root, candidate)) return undefined;

  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    if (!pathPolicy.isWithin(realRoot, realCandidate)) return undefined;
    const info = await stat(realCandidate);
    return info.isFile() ? realCandidate : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve an existing regular file whose real path remains under the work directory. */
export async function resolveWorkDirFile(
  filePath: string,
  workDir: string,
  homeDir: string,
  pathPolicy: PlatformPathPolicy = hostPathPolicy,
): Promise<string> {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("File path is required.");
  const resolved = await resolveExistingFileUnderRoot(filePath, workDir, homeDir, pathPolicy);
  if (!resolved) throw new Error("Only files under the current work directory can be used.");
  return resolved;
}

async function resolveFileUnderRoots(
  filePath: string,
  roots: string[],
  homeDir: string,
  pathPolicy: PlatformPathPolicy,
): Promise<string> {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("File path is required.");
  for (const rawRoot of roots) {
    if (!rawRoot) continue;
    const resolved = await resolveExistingFileUnderRoot(filePath, rawRoot, homeDir, pathPolicy);
    if (resolved) return resolved;
  }
  throw new Error("Only files under the work directory or a workflow directory can be used.");
}

function readPreviewFromBuffer(
  absolutePath: string,
  buffer: Buffer,
  pathPolicy: PlatformPathPolicy,
): LocalFilePreview {
  const truncated = buffer.byteLength > MAX_LOCAL_FILE_PREVIEW_BYTES;
  const contentBuffer = truncated ? buffer.subarray(0, MAX_LOCAL_FILE_PREVIEW_BYTES) : buffer;
  return {
    path: absolutePath,
    title: pathPolicy.pathApi.basename(absolutePath),
    content: contentBuffer.toString("utf8"),
    truncated,
  };
}

export async function createLocalTextFilePreview(
  filePath: string,
  workDir: string,
  homeDir: string,
  pathPolicy: PlatformPathPolicy,
): Promise<LocalFilePreview> {
  const absolutePath = await resolveWorkDirFile(filePath, workDir, homeDir, pathPolicy);
  return readPreviewFromBuffer(absolutePath, await readFile(absolutePath), pathPolicy);
}

export async function createLocalTextFilePreviewUnderRoots(
  filePath: string,
  roots: string[],
  homeDir: string,
  pathPolicy: PlatformPathPolicy,
): Promise<LocalFilePreview> {
  const absolutePath = await resolveFileUnderRoots(filePath, roots, homeDir, pathPolicy);
  return readPreviewFromBuffer(absolutePath, await readFile(absolutePath), pathPolicy);
}
