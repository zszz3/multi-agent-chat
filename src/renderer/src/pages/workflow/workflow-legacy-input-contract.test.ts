import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const rendererFiles = [
  "src/renderer/src/app/services/workflow-service.ts",
  "src/renderer/src/pages/workflow/workflow-controller.ts",
  "src/renderer/src/pages/workflow/hooks/useWorkflowFeatureController.ts",
  "src/renderer/src/pages/workflow/workflow-text.ts",
  "src/renderer/src/styles.css",
];

describe("workflow input ownership", () => {
  test("does not expose the legacy gate or intervention input chain in the renderer", () => {
    const source = rendererFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/onResolveIntervention|resolveIntervention|onAnswerGate|answerGate/);
    expect(source).not.toMatch(/gateAnswerPlaceholder|gateSubmit|workflow-gate-panel/);
  });
});
