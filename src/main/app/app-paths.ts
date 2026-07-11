import path from "node:path";

export function resolvePreloadBundlePath(mainBundleDir: string): string {
  return path.join(mainBundleDir, "../preload/index.mjs");
}

export function resolveBundledWorkflowsPath(mainBundleDir: string): string {
  return path.join(mainBundleDir, "../shared/bundled-workflows");
}
