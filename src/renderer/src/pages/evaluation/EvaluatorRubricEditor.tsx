import { Plus, Trash2 } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { compileEvaluationRubric } from "../../../../shared/evaluation-rubric";
import type {
  EvaluationRubric,
  EvaluationRubricInput,
} from "../../../../shared/types";

const INPUT_OPTIONS: Array<{
  id: EvaluationRubricInput;
  zh: string;
  en: string;
}> = [
  { id: "input", zh: "Input", en: "Input" },
  { id: "output", zh: "Answer", en: "Answer" },
  { id: "ground_truth", zh: "Ground truth", en: "Ground truth" },
  { id: "context", zh: "Context", en: "Context" },
];

export function EvaluatorRubricEditor({
  zh,
  rubric,
  customInstructions,
  onChange,
  onChangeCustomInstructions,
}: {
  zh: boolean;
  rubric: EvaluationRubric;
  customInstructions?: string;
  onChange: (rubric: EvaluationRubric) => void;
  onChangeCustomInstructions: (value: string) => void;
}) {
  const preview = useMemo(
    () =>
      compileEvaluationRubric(
        rubric,
        {
          input: "{{input}}",
          output: "{{output}}",
          ground_truth: "{{ground_truth}}",
          context: "{{context}}",
        },
        customInstructions,
      ).prompt,
    [customInstructions, rubric],
  );

  const setRequiredInput = (input: EvaluationRubricInput, checked: boolean) => {
    const requiredInputs = checked
      ? [...rubric.requiredInputs, input]
      : rubric.requiredInputs.filter((item) => item !== input);
    onChange({ ...rubric, requiredInputs });
  };

  return (
    <div className="evaluator-rubric-editor">
      <section className="evaluator-rubric-block">
        <h5>{zh ? "评估目标" : "Evaluation objective"}</h5>
        <textarea
          rows={3}
          value={rubric.objective}
          onChange={(event) =>
            onChange({ ...rubric, objective: event.target.value })
          }
        />
      </section>

      <section className="evaluator-rubric-block">
        <h5>{zh ? "所需输入" : "Required inputs"}</h5>
        <div className="evaluator-rubric-inputs">
          {INPUT_OPTIONS.map((input) => (
            <label key={input.id}>
              <input
                type="checkbox"
                checked={rubric.requiredInputs.includes(input.id)}
                onChange={(event) =>
                  setRequiredInput(input.id, event.target.checked)
                }
              />
              <span>{zh ? input.zh : input.en}</span>
            </label>
          ))}
        </div>
      </section>

      <RubricList
        title={zh ? "检查项" : "Evaluation checks"}
        addLabel={zh ? "添加检查项" : "Add check"}
        onAdd={() =>
          onChange({
            ...rubric,
            checks: [
              ...rubric.checks,
              {
                id: `check-${Date.now()}`,
                label: zh ? "新检查项" : "New check",
                description: "",
              },
            ],
          })
        }
      >
        {rubric.checks.map((check, index) => (
          <div className="evaluator-rubric-row has-label" key={check.id}>
            <input
              aria-label={zh ? "检查项名称" : "Check label"}
              value={check.label}
              onChange={(event) => {
                const checks = rubric.checks.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, label: event.target.value }
                    : item,
                );
                onChange({ ...rubric, checks });
              }}
            />
            <textarea
              rows={2}
              aria-label={zh ? "检查项说明" : "Check description"}
              value={check.description}
              onChange={(event) => {
                const checks = rubric.checks.map((item, itemIndex) =>
                  itemIndex === index
                    ? { ...item, description: event.target.value }
                    : item,
                );
                onChange({ ...rubric, checks });
              }}
            />
            <DeleteButton
              label={zh ? "删除检查项" : "Delete check"}
              disabled={rubric.checks.length <= 2}
              onClick={() =>
                onChange({
                  ...rubric,
                  checks: rubric.checks.filter(
                    (_item, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            />
          </div>
        ))}
      </RubricList>

      <RubricList
        title={zh ? "评估步骤" : "Evaluation steps"}
        addLabel={zh ? "添加步骤" : "Add step"}
        onAdd={() => onChange({ ...rubric, steps: [...rubric.steps, ""] })}
      >
        {rubric.steps.map((step, index) => (
          <div className="evaluator-rubric-row" key={`step-${index}`}>
            <span className="evaluator-rubric-index">{index + 1}</span>
            <textarea
              rows={2}
              aria-label={`${zh ? "步骤" : "Step"} ${index + 1}`}
              value={step}
              onChange={(event) => {
                const steps = rubric.steps.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                );
                onChange({ ...rubric, steps });
              }}
            />
            <DeleteButton
              label={zh ? "删除步骤" : "Delete step"}
              disabled={rubric.steps.length <= 2}
              onClick={() =>
                onChange({
                  ...rubric,
                  steps: rubric.steps.filter(
                    (_item, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            />
          </div>
        ))}
      </RubricList>

      <section className="evaluator-rubric-block">
        <h5>{zh ? "五档评分锚点" : "Five score anchors"}</h5>
        <div className="evaluator-rubric-anchors">
          {rubric.anchors.map((anchor, index) => (
            <div key={anchor.score}>
              <output>{anchor.score.toFixed(2)}</output>
              <input
                aria-label={`${zh ? "分档名称" : "Anchor label"} ${anchor.score}`}
                value={anchor.label}
                onChange={(event) => {
                  const anchors = rubric.anchors.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, label: event.target.value }
                      : item,
                  );
                  onChange({ ...rubric, anchors });
                }}
              />
              <textarea
                rows={2}
                aria-label={`${zh ? "分档标准" : "Anchor criteria"} ${anchor.score}`}
                value={anchor.description}
                onChange={(event) => {
                  const anchors = rubric.anchors.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, description: event.target.value }
                      : item,
                  );
                  onChange({ ...rubric, anchors });
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <RubricList
        title={zh ? "特殊规则" : "Special rules"}
        addLabel={zh ? "添加规则" : "Add rule"}
        onAdd={() => onChange({ ...rubric, rules: [...rubric.rules, ""] })}
      >
        {rubric.rules.map((rule, index) => (
          <div className="evaluator-rubric-row" key={`rule-${index}`}>
            <span className="evaluator-rubric-index">{index + 1}</span>
            <textarea
              rows={2}
              aria-label={`${zh ? "规则" : "Rule"} ${index + 1}`}
              value={rule}
              onChange={(event) => {
                const rules = rubric.rules.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                );
                onChange({ ...rubric, rules });
              }}
            />
            <DeleteButton
              label={zh ? "删除规则" : "Delete rule"}
              onClick={() =>
                onChange({
                  ...rubric,
                  rules: rubric.rules.filter(
                    (_item, itemIndex) => itemIndex !== index,
                  ),
                })
              }
            />
          </div>
        ))}
      </RubricList>

      <section className="evaluator-rubric-block">
        <h5>{zh ? "补充指令" : "Additional instructions"}</h5>
        <textarea
          rows={3}
          value={customInstructions ?? ""}
          placeholder={
            zh
              ? "可选：添加仅适用于这个 Evaluator 的业务规则。"
              : "Optional rules specific to this evaluator."
          }
          onChange={(event) => onChangeCustomInstructions(event.target.value)}
        />
      </section>

      {rubric.source ? (
        <section className="evaluator-rubric-block evaluator-rubric-source">
          <h5>{zh ? "来源" : "Source"}</h5>
          <strong>{rubric.source.framework}</strong>
          <span>{rubric.source.license}</span>
          <a href={rubric.source.url} target="_blank" rel="noreferrer">
            {rubric.source.url}
          </a>
        </section>
      ) : null}

      <details className="evaluator-rubric-preview">
        <summary>{zh ? "Prompt 预览" : "Prompt preview"}</summary>
        <pre>{preview}</pre>
      </details>
    </div>
  );
}

function RubricList({
  title,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="evaluator-rubric-block">
      <div className="evaluator-rubric-heading">
        <h5>{title}</h5>
        <button
          type="button"
          className="control-btn compact secondary"
          onClick={onAdd}
        >
          <Plus size={12} />
          {addLabel}
        </button>
      </div>
      <div className="evaluator-rubric-list">{children}</div>
    </section>
  );
}

function DeleteButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="icon-btn evaluator-rubric-delete"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 size={12} />
    </button>
  );
}
