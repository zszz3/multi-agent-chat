import {
  createAppResourceLocator,
  type AppResourceLocator,
} from "../platform/app-resource-locator";

export interface MainAppResourceContext {
  mainBundleDir: string;
  isPackaged: boolean;
  resourcesPath: string;
}

export function createMainAppResourceLocator(context: MainAppResourceContext): AppResourceLocator {
  return createAppResourceLocator(context);
}
