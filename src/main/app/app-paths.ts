import path from "node:path";

export function resolvePreloadBundlePath(mainBundleDir: string): string {
  return path.join(mainBundleDir, "../preload/index.mjs");
}
