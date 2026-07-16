import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("workbench layout stylesheet", () => {
  test("defines the complete MCP and evaluation canvas contract", () => {
    const css = readFileSync(new URL("./workbench.css", import.meta.url), "utf8");
    expect(css).toContain(".mcp-content,");
    expect(css).toContain(".mcp-workbench,");
    expect(css).toContain(".evaluation-workbench");
    expect(css).toContain(".workbench-layout");
    expect(css).toContain("overflow: hidden");
  });
});
