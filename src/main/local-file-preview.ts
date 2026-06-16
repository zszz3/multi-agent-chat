import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { LocalFilePreview } from "../shared/types";

export const MAX_LOCAL_FILE_PREVIEW_BYTES = 512 * 1024;

export async function createLocalTextFilePreview(filePath: string, workDir: string, homeDir: string): Promise<LocalFilePreview> {
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("File path is required.");
  const absoluteWorkDir = path.resolve(workDir);
  const expandedPath = filePath.startsWith("~/") ? path.join(homeDir, filePath.slice(2)) : filePath;
  const absolutePath = path.resolve(absoluteWorkDir, expandedPath);
  const relativePath = path.relative(absoluteWorkDir, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Only files under the current work directory can be previewed.");
  }
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new Error("Only regular files can be previewed.");
  const buffer = await readFile(absolutePath);
  const truncated = buffer.byteLength > MAX_LOCAL_FILE_PREVIEW_BYTES;
  const contentBuffer = truncated ? buffer.subarray(0, MAX_LOCAL_FILE_PREVIEW_BYTES) : buffer;
  return {
    path: absolutePath,
    title: path.basename(absolutePath),
    content: contentBuffer.toString("utf8"),
    truncated,
  };
}
