import { describe, expect, it } from "vitest";
import type { EvaluationRubric } from "./types";
import {
  compileEvaluationRubric,
  createDefaultEvaluationRubric,
  normalizeEvaluationRubricScore,
  validateEvaluationRubric,
} from "./evaluation-rubric";

const rubric: EvaluationRubric = {
  version: 1,
  objective: "Evaluate only whether the answer is concise.",
  requiredInputs: ["input", "output"],
  checks: [
    {
      id: "focus",
      label: "Focus",
      description: "Every statement contributes to the requested task.",
    },
    {
      id: "completeness",
      label: "Completeness",
      description: "Necessary information is not removed for brevity.",
    },
  ],
  steps: ["Identify the requested information.", "Mark removable content."],
  anchors: [
    { score: 0, label: "Unusable", description: "No useful answer." },
    { score: 0.25, label: "Poor", description: "Mostly padding." },
    { score: 0.5, label: "Mixed", description: "Noticeable redundancy." },
    { score: 0.75, label: "Good", description: "Minor redundancy." },
    { score: 1, label: "Excellent", description: "Complete and compact." },
  ],
  rules: ["Do not reward an incomplete answer for being short."],
};

describe("evaluation rubric", () => {
  it("compiles stable sections and only declared inputs", () => {
    const result = compileEvaluationRubric(
      rubric,
      {
        input: "Summarize the release.",
        output: "The release improves speed.",
        ground_truth: "Speed and reliability improved.",
        context: "Internal release notes",
      },
      "Treat required safety warnings as necessary content.",
    );

    expect(result.missingInputs).toEqual([]);
    expect(result.prompt).toContain("## Evaluation objective");
    expect(result.prompt).toContain("## Evaluation checks");
    expect(result.prompt).toContain("## Evaluation steps");
    expect(result.prompt).toContain("## Score anchors");
    expect(result.prompt).toContain("## Evaluation data");
    expect(result.prompt).toContain("### Input\nSummarize the release.");
    expect(result.prompt).toContain("### Answer\nThe release improves speed.");
    expect(result.prompt).not.toContain("Ground truth:");
    expect(result.prompt).not.toContain("Internal release notes");
    expect(result.prompt).toContain(
      "Treat required safety warnings as necessary content.",
    );
    expect(result.prompt).toContain('"failedCriteria": ["check-id"]');
  });

  it("reports missing required inputs without inventing placeholders", () => {
    const result = compileEvaluationRubric(rubric, { input: "Question" });
    expect(result.missingInputs).toEqual(["output"]);
    expect(result.prompt).not.toContain("(none)");
  });

  it("validates the five ordered score anchors", () => {
    expect(validateEvaluationRubric(rubric)).toEqual([]);
    expect(
      validateEvaluationRubric({ ...rubric, anchors: rubric.anchors.slice(1) }),
    ).toContain(
      "Rubric must define the five score anchors: 0, 0.25, 0.5, 0.75, 1.",
    );
  });

  it("normalizes arbitrary Judge scores to the nearest anchor", () => {
    expect(normalizeEvaluationRubricScore(0.62)).toBe(0.5);
    expect(normalizeEvaluationRubricScore(0.7)).toBe(0.75);
    expect(normalizeEvaluationRubricScore(4)).toBe(1);
    expect(normalizeEvaluationRubricScore(-1)).toBe(0);
  });

  it("creates a valid editable rubric for a custom LLM Judge", () => {
    const value = createDefaultEvaluationRubric();
    expect(validateEvaluationRubric(value)).toEqual([]);
    expect(value.requiredInputs).toEqual(["input", "output"]);
    expect(value.source).toBeUndefined();
  });
});
