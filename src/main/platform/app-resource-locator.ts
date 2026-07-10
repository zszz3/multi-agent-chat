import path from "node:path";

export interface AppResourceLocator {
  preloadBundlePath(): string;
  rendererHtmlPath(): string;
  bundledSkillsRoot(): string;
  bundledWorkflowsRoot(): string;
  mcpServerBundlePath(): string;
}

export interface AppResourceLocatorOptions {
  mainBundleDir: string;
  isPackaged: boolean;
  resourcesPath: string;
  pathApi?: Pick<typeof path, "join">;
}

export function createAppResourceLocator(options: AppResourceLocatorOptions): AppResourceLocator {
  const pathApi = options.pathApi ?? path;
  const builtOutputRoot = pathApi.join(options.mainBundleDir, "..");
  const sharedResourceRoot = options.isPackaged
    ? pathApi.join(options.resourcesPath, "shared")
    : pathApi.join(builtOutputRoot, "shared");
  const mcpResourceRoot = options.isPackaged
    ? pathApi.join(options.resourcesPath, "mcp")
    : pathApi.join(builtOutputRoot, "mcp");

  return {
    preloadBundlePath: () => pathApi.join(builtOutputRoot, "preload", "index.mjs"),
    rendererHtmlPath: () => pathApi.join(builtOutputRoot, "renderer", "index.html"),
    bundledSkillsRoot: () => pathApi.join(sharedResourceRoot, "bundled-skills"),
    bundledWorkflowsRoot: () => pathApi.join(sharedResourceRoot, "bundled-workflows"),
    mcpServerBundlePath: () => pathApi.join(mcpResourceRoot, "server.cjs"),
  };
}
