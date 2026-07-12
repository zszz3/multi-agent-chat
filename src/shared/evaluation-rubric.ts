import type {
  EvaluationRubric,
  EvaluationRubricInput,
  EvaluationRubricScore,
} from "./types";

export const EVALUATION_RUBRIC_SCORES: EvaluationRubricScore[] = [
  0, 0.25, 0.5, 0.75, 1,
];

const INPUT_LABELS: Record<EvaluationRubricInput, string> = {
  input: "Input",
  output: "Answer",
  ground_truth: "Ground truth",
  context: "Context",
};

export function createDefaultEvaluationRubric(): EvaluationRubric {
  return {
    version: 1,
    objective: "判断 Answer 是否满足 Input 中定义的业务质量要求。",
    requiredInputs: ["input", "output"],
    checks: [
      {
        id: "requirement-coverage",
        label: "要求覆盖",
        description: "Answer 覆盖业务场景中必须满足的核心要求。",
      },
      {
        id: "blocking-defects",
        label: "阻断问题",
        description: "Answer 不包含会导致结果不可用的严重问题。",
      },
    ],
    steps: [
      "从 Input 中识别本次评估必须满足的业务要求。",
      "逐项检查 Answer，记录满足项、失败项和对应证据。",
      "根据失败项的重要程度匹配最接近的评分锚点。",
    ],
    anchors: [
      {
        score: 0,
        label: "不通过",
        description: "核心目标未完成，结果不可用。",
      },
      {
        score: 0.25,
        label: "较差",
        description: "存在多个严重问题，需要大幅修改。",
      },
      {
        score: 0.5,
        label: "一般",
        description: "部分要求已满足，但仍有一个关键问题或多个明显问题。",
      },
      {
        score: 0.75,
        label: "良好",
        description: "全部关键要求已满足，仅有不阻碍使用的轻微问题。",
      },
      {
        score: 1,
        label: "优秀",
        description: "完整满足所有要求，没有可识别的质量问题。",
      },
    ],
    rules: [
      "只依据已定义的检查项评分。",
      "必须在 reason 中说明分数对应的证据。",
    ],
  };
}

export function validateEvaluationRubric(rubric: EvaluationRubric): string[] {
  const errors: string[] = [];
  if (!rubric.objective.trim()) errors.push("Rubric objective is required.");
  if (rubric.checks.length < 2)
    errors.push("Rubric must define at least two evaluation checks.");
  if (rubric.steps.length < 2)
    errors.push("Rubric must define at least two evaluation steps.");
  if (
    rubric.anchors.length !== EVALUATION_RUBRIC_SCORES.length ||
    rubric.anchors.some(
      (anchor, index) => anchor.score !== EVALUATION_RUBRIC_SCORES[index],
    )
  ) {
    errors.push(
      "Rubric must define the five score anchors: 0, 0.25, 0.5, 0.75, 1.",
    );
  }
  return errors;
}

export function normalizeEvaluationRubricScore(
  value: number,
): EvaluationRubricScore {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return EVALUATION_RUBRIC_SCORES.reduce((nearest, score) =>
    Math.abs(score - clamped) < Math.abs(nearest - clamped) ? score : nearest,
  );
}

export function compileEvaluationRubric(
  rubric: EvaluationRubric,
  values: Partial<Record<EvaluationRubricInput, string>>,
  customInstructions?: string,
): { prompt: string; missingInputs: EvaluationRubricInput[] } {
  const missingInputs = rubric.requiredInputs.filter(
    (input) => values[input] === undefined,
  );
  const sections = [
    "You are a strict, impartial evaluator. Evaluate only the stated objective and do not reward qualities outside this rubric.",
    `## Evaluation objective\n${rubric.objective}`,
    `## Evaluation checks\n${rubric.checks
      .map((check) => `- [${check.id}] ${check.label}: ${check.description}`)
      .join("\n")}`,
    `## Evaluation steps\n${rubric.steps
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n")}`,
    `## Score anchors\n${rubric.anchors
      .map(
        (anchor) =>
          `- ${anchor.score.toFixed(2)} (${anchor.label}): ${anchor.description}`,
      )
      .join("\n")}`,
  ];

  if (rubric.rules.length) {
    sections.push(
      `## Special rules\n${rubric.rules.map((rule) => `- ${rule}`).join("\n")}`,
    );
  }
  if (rubric.examples?.length) {
    sections.push(
      `## Calibration examples\n${rubric.examples
        .map(
          (example, index) =>
            `### Example ${index + 1}\n${example.input ? `Input: ${example.input}\n` : ""}Answer: ${example.output}\nScore: ${example.score.toFixed(2)}\nReason: ${example.reason}`,
        )
        .join("\n\n")}`,
    );
  }
  if (customInstructions?.trim()) {
    sections.push(
      `## Evaluator-specific instructions\n${customInstructions.trim()}`,
    );
  }

  const data = rubric.requiredInputs
    .filter((input) => values[input] !== undefined)
    .map((input) => `### ${INPUT_LABELS[input]}\n${values[input]}`)
    .join("\n\n");
  sections.push(`## Evaluation data\n${data}`);
  sections.push(
    '## Output format\nReturn JSON only: {"score": 0|0.25|0.5|0.75|1, "reason": "concise explanation tied to the rubric", "evidence": ["exact supporting span"], "failedCriteria": ["check-id"]}\nUse an empty array when there is no evidence or no failed criterion.',
  );

  return { prompt: sections.join("\n\n"), missingInputs };
}
