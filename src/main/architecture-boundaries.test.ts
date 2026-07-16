import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("architecture boundaries", () => {
  it("keeps runtime implementations under the canonical runtime and provider directories", () => {
    const removedCompatibilityModules = [
      "src/main/agents/runtime-router.ts",
      "src/main/agents/runtime-driver.ts",
      "src/main/agents/runtime-state-codec.ts",
      "src/main/agents/interactive-session-manager.ts",
      "src/main/agents/session-reconfigure.ts",
      "src/main/agents/claude-interactive-session.ts",
      "src/main/agents/codex-interactive-session.ts",
      "src/main/agents/claude-agent-sdk.ts",
      "src/main/agents/claude-agent-sdk-interactive.ts",
    ];
    for (const relativePath of removedCompatibilityModules) {
      expect(existsSync(path.join(projectRoot, relativePath)), `${relativePath} must not be restored`).toBe(false);
    }
  });

  it("prevents known orchestration files from growing beyond their current extraction budgets", () => {
    const budgets = new Map([
      ["src/main/workflows/workflow-runtime.ts", 705],
      ["src/main/workflows/v2/workflow-v2-run-executor.ts", 1_036],
      ["src/main/hub/agent-hub.ts", 2_742],
      ["src/renderer/src/pages/workflow/WorkflowPage.tsx", 644],
      ["src/shared/types.ts", 811],
    ]);
    for (const [relativePath, maximumLines] of budgets) {
      const lines = readFileSync(path.join(projectRoot, relativePath), "utf8").split(/\r?\n/).length;
      expect(lines, `${relativePath} exceeds its extraction budget`).toBeLessThanOrEqual(maximumLines);
    }
  });

  it("keeps the SQLite app store as a persistence facade", () => {
    const relativePath = "src/main/hub/persisted/sqlite-store.ts";
    const source = readFileSync(path.join(projectRoot, relativePath), "utf8");
    expect(source).toContain("sqlite-chat-repository");
    expect(source).toContain("sqlite-workflow-repository");
    expect(source.split(/\r?\n/u).length).toBeLessThanOrEqual(260);
  });
});
