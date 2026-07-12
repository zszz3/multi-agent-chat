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
    ]);
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
  });
});
