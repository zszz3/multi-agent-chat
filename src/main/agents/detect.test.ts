import { describe, expect, test } from "vitest";
import { parseCliVersion } from "./detect";

describe("parseCliVersion", () => {
  test("extracts semver-like versions from common agent output", () => {
    expect(parseCliVersion("codex-cli 0.136.0")).toBe("0.136.0");
    expect(parseCliVersion("2.1.121 (Claude Code)")).toBe("2.1.121");
    expect(parseCliVersion("claude v1.2.3-alpha\nextra")).toBe("1.2.3-alpha");
  });

  test("falls back to the first trimmed line when output has no semver", () => {
    expect(parseCliVersion("custom build\nmore")).toBe("custom build");
  });
});
