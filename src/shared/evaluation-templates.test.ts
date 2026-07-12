import { describe, expect, it } from "vitest";
import {
  DATASET_TEMPLATES,
  EVALUATOR_TEMPLATES,
  instantiateDatasetTemplate,
  instantiateEvaluatorTemplate,
} from "./evaluation-templates";

describe("evaluation templates", () => {
  it("provides practical Dataset and Evaluator starter templates", () => {
    expect(DATASET_TEMPLATES.map((item) => item.id)).toEqual([
      "code-review",
      "structured-json",
      "tool-selection",
      "instruction-following",
      "chinese-writing",
    ]);
    expect(EVALUATOR_TEMPLATES.map((item) => item.id)).toEqual([
      "exact-match",
      "contains-expected",
      "valid-json",
      "hallucination",
      "helpfulness",
      "relevance",
      "toxicity",
      "correctness",
      "context-relevance",
      "context-correctness",
      "conciseness",
      "completeness",
      "clarity",
      "coherence",
      "instruction-following-judge",
      "format-compliance",
      "language-consistency",
      "refusal-quality",
      "code-quality",
      "reasoning-quality",
      "laziness",
      "fairness",
      "pii-leakage",
      "injection-resistance",
      "code-security",
    ]);

    for (const template of EVALUATOR_TEMPLATES.filter(
      (item) => item.kind === "llm_judge",
    )) {
      expect(template.rubric, template.id).toBeDefined();
      expect(template.rubric?.version, template.id).toBe(1);
      expect(template.rubric?.checks.length, template.id).toBeGreaterThanOrEqual(
        2,
      );
      expect(template.rubric?.steps.length, template.id).toBeGreaterThanOrEqual(
        2,
      );
      expect(
        template.rubric?.anchors.map((anchor) => anchor.score),
        template.id,
      ).toEqual([0, 0.25, 0.5, 0.75, 1]);
      expect(template.rubric?.source?.url, template.id).toMatch(/^https:\/\//);
      expect(template.rubric?.source?.license, template.id).toBeTruthy();
      expect(template.prompt, template.id).toBeUndefined();
      expect(
        template.rubric?.anchors.some(
          (anchor) => anchor.score === template.threshold,
        ),
        template.id,
      ).toBe(true);
    }
  });

  it("copies templates into independently editable user resources", () => {
    const dataset = instantiateDatasetTemplate(DATASET_TEMPLATES[0]!, 100);
    const evaluator = instantiateEvaluatorTemplate(
      EVALUATOR_TEMPLATES[4]!,
      200,
    );
    expect(dataset.id).toBe("dataset-100");
    expect(dataset.items[0]?.id).toBe("dataset-100-item-1");
    expect(dataset.items).not.toBe(DATASET_TEMPLATES[0]?.items);
    expect(evaluator).toMatchObject({
      id: "evaluator-200",
      kind: "llm_judge",
      createdAt: 200,
    });
    expect(evaluator.runtimeId).toBeUndefined();
    expect(evaluator.rubric).toEqual(EVALUATOR_TEMPLATES[4]?.rubric);
    expect(evaluator.rubric).not.toBe(EVALUATOR_TEMPLATES[4]?.rubric);
  });
});
