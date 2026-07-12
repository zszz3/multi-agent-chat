# Structured Evaluator Rubrics

## Goal

Replace one-paragraph LLM Judge prompts with structured, source-traceable rubrics. The implementation should adopt proven patterns from Ragas, G-Eval/DeepEval, OpenEvals, LangSmith, and Prometheus without importing text whose license does not permit reuse.

## Source Policy

- Ragas (Apache-2.0): five-level score anchors and reference-aware rubrics.
- DeepEval (Apache-2.0) and G-Eval: fixed evaluation steps before scoring.
- OpenEvals (MIT): task-specific criteria, reminders, and input selection.
- LangSmith documentation: only map variables required by a metric and support later calibration with labeled examples.
- Prometheus papers: strict rubric-scoped feedback followed by a discrete score. The repository has no detected license, so no source text is copied.
- Every built-in rubric records its framework, URL, license, and whether it was adapted.

## Data Model

Add an `EvaluationRubric` object to LLM Judge evaluators:

```ts
interface EvaluationRubric {
  version: 1;
  objective: string;
  requiredInputs: Array<"input" | "output" | "ground_truth" | "context">;
  checks: Array<{ id: string; label: string; description: string }>;
  steps: string[];
  anchors: Array<{
    score: 0 | 0.25 | 0.5 | 0.75 | 1;
    label: string;
    description: string;
  }>;
  rules: string[];
  examples?: Array<{
    input?: string;
    output: string;
    score: 0 | 0.25 | 0.5 | 0.75 | 1;
    reason: string;
  }>;
  source?: {
    framework: string;
    url: string;
    license: string;
    adapted: boolean;
  };
}
```

`prompt` remains available as optional custom instructions for user-created evaluators. Built-in templates use `rubric`; the runner compiles the rubric and appends custom instructions when present.

## Scoring Contract

- Each evaluator measures one dimension only. Experiments combine multiple evaluators instead of using one general quality score.
- Scores are restricted to `0`, `0.25`, `0.5`, `0.75`, or `1`, matching a five-level rubric while preserving the current normalized threshold model.
- The Judge returns `score`, `reason`, `evidence`, and `failedCriteria` as JSON.
- Only fields listed in `requiredInputs` are included in the Judge prompt.
- Missing required data produces an explicit failed score reason rather than silently asking the Judge to guess.

## Built-In Coverage

Rewrite all current LLM Judge templates as full rubrics. Incorporate supported OpenEvals dimensions such as answer relevance, correctness, conciseness, hallucination, laziness, code correctness, toxicity, fairness, PII leakage, and injection resistance. Keep the existing RAG, instruction-following, refusal, language, format, and reasoning evaluators.

Do not expose Plan Adherence until experiment runs persist an execution plan and trace. It cannot be evaluated honestly from the final answer alone.

## User Interface

The Evaluator editor shows structured sections for objective, required inputs, checks, evaluation steps, score anchors, special rules, and source. Each section is editable for user-owned evaluators. The source is informational and does not lock the copied evaluator.

The template menu continues to create an independent editable evaluator. A compact prompt preview shows the compiled Judge prompt for debugging, but the compiled prompt is not the primary editing surface.

## Runner

Create a pure rubric compiler shared by tests and the evaluation runner. It produces stable section ordering and a fixed JSON output contract. The runner parses and stores optional evidence and failed criteria alongside the existing reason.

## Validation

- Unit tests cover rubric validation, score anchors, required-input mapping, compilation, and output parsing.
- Template tests require every built-in LLM Judge to contain five anchors, at least two checks, explicit steps, and source metadata.
- Runner tests prove that unrelated inputs are omitted and missing required fields fail explicitly.
- Renderer tests cover structured sections, source display, and compiled preview.
- Typecheck and production build must pass.
