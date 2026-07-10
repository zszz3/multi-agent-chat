import type { BrowserWindowConstructorOptions } from "electron";

export type WindowPresentationOptions = Pick<
  BrowserWindowConstructorOptions,
  "titleBarStyle" | "trafficLightPosition"
>;

export function windowPresentationOptions(platform: NodeJS.Platform): WindowPresentationOptions {
  if (platform !== "darwin") return {};
  return {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 14 },
  };
}
