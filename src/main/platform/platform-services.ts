import path from "node:path";
import type { AppResourceLocator } from "./app-resource-locator";
import { createExecutableLocator, type ExecutableLocator } from "./cli-locator";
import { createProcessLauncher, type ProcessLauncher } from "./cli-launcher";
import {
  createPosixProcessTreeController,
  createWindowsProcessTreeController,
  type ProcessTreeController,
} from "./process-tree";
import { createPlatformPathPolicy, type PlatformPathPolicy } from "./platform-paths";
import {
  createManagedDirectoryLinkService,
  type ManagedDirectoryLinkService,
} from "./managed-directory-link";

export interface PlatformServices {
  executableLocator: ExecutableLocator;
  processLauncher: ProcessLauncher;
  processTreeController: ProcessTreeController;
  pathPolicy: PlatformPathPolicy;
  managedDirectoryLinks: ManagedDirectoryLinkService;
  resourceLocator: AppResourceLocator;
}

export type PlatformProcessServices = Pick<PlatformServices, "processLauncher" | "processTreeController">;

export interface PlatformServiceDependencies {
  resourceLocator: AppResourceLocator;
  processTreeController?: ProcessTreeController;
  executableLocator?: ExecutableLocator;
  processLauncher?: ProcessLauncher;
  managedDirectoryLinks?: ManagedDirectoryLinkService;
  environment?: Record<string, string | undefined>;
  cwd?: string;
  fileExists?: (filePath: string) => Promise<boolean>;
}

function platformPathPolicy(platform: NodeJS.Platform): PlatformPathPolicy {
  switch (platform) {
    case "win32":
      return createPlatformPathPolicy({ pathApi: path.win32, caseSensitive: false });
    case "darwin":
    case "linux":
      return createPlatformPathPolicy({ pathApi: path.posix, caseSensitive: true });
    default:
      throw new Error(`Unsupported desktop platform: ${platform}`);
  }
}

export function createPlatformServices(
  platform: NodeJS.Platform,
  dependencies: PlatformServiceDependencies,
): PlatformServices {
  const pathPolicy = platformPathPolicy(platform);
  const environment = dependencies.environment ?? process.env;
  const comspec = environment.comspec ?? environment.ComSpec;
  const processLauncher = dependencies.processLauncher ?? createProcessLauncher({
    platform,
    ...(comspec ? { comspec } : {}),
  });
  const executableLocator = dependencies.executableLocator ?? createExecutableLocator({
    platform,
    environment,
    execute: processLauncher.exec,
    pathApi: pathPolicy.pathApi,
    ...(dependencies.cwd !== undefined ? { cwd: dependencies.cwd } : {}),
    ...(dependencies.fileExists ? { fileExists: dependencies.fileExists } : {}),
  });
  const processTreeController = dependencies.processTreeController ?? (
    platform === "win32"
      ? createWindowsProcessTreeController(processLauncher.exec)
      : createPosixProcessTreeController(processLauncher.exec)
  );
  const managedDirectoryLinks = dependencies.managedDirectoryLinks ?? createManagedDirectoryLinkService({
    pathPolicy,
    linkType: platform === "win32" ? "junction" : "dir",
  });

  return {
    executableLocator,
    processLauncher,
    processTreeController,
    pathPolicy,
    managedDirectoryLinks,
    resourceLocator: dependencies.resourceLocator,
  };
}
