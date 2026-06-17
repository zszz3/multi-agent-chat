import { describe, expect, test } from "vitest";
import { centeredWindowBounds } from "./window-bounds";

describe("centeredWindowBounds", () => {
  test("centers the desired window size inside the primary display work area", () => {
    expect(centeredWindowBounds({ x: 0, y: 25, width: 2560, height: 1415 }, 1360, 860)).toEqual({
      x: 600,
      y: 303,
      width: 1360,
      height: 860,
    });
  });

  test("fits the window into smaller work areas", () => {
    expect(centeredWindowBounds({ x: 1440, y: 0, width: 1200, height: 800 }, 1360, 860)).toEqual({
      x: 1440,
      y: 0,
      width: 1200,
      height: 800,
    });
  });
});
