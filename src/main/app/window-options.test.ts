import { describe, expect, test } from "vitest";
import { windowPresentationOptions } from "./window-options";

describe("windowPresentationOptions", () => {
  test("keeps the inset title bar and traffic lights on macOS", () => {
    expect(windowPresentationOptions("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 12, y: 14 },
    });
  });

  test.each(["win32", "linux"] satisfies NodeJS.Platform[])(
    "uses native window chrome on %s",
    (platform) => {
      expect(windowPresentationOptions(platform)).toEqual({});
    },
  );
});
