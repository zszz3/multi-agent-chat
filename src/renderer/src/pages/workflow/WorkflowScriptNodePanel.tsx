import { useMemo, useState } from "react";
import { Braces, CheckCircle2, Code2, FileCode2, Play, ShieldCheck, X } from "lucide-react";
import type { WorkflowRunProgressItem } from "../../../../shared/types";
import type { WorkflowV2ScriptNode, WorkflowV2ScriptParameterDef } from "../../../../shared/workflow-v2/definition";
import { useWorkflowNodeInputController } from "./workflow-node-input-controller";

const sourceLabels: Record<WorkflowV2ScriptParameterDef["source"], string> = {
  user: "User input",
  workflow: "Workflow context",
  upstream: "Upstream output",
  literal: "Literal",
};

const inputTabDefinitions: Array<{ id: string; label: string; locations: WorkflowV2ScriptParameterDef["location"][] }> = [
  { id: "params", label: "Params", locations: ["argument", "query"] },
  { id: "headers", label: "Headers", locations: ["header"] },
  { id: "body", label: "Body", locations: ["body"] },
  { id: "environment", label: "Environment", locations: ["environment"] },
  { id: "stdin", label: "Standard input", locations: ["stdin"] },
];

function parameterBinding(parameter: WorkflowV2ScriptParameterDef): string {
  if (parameter.source === "upstream") return `${parameter.upstreamNodeId ?? "node"}.${parameter.upstreamOutputKey ?? "output"}`;
  if (parameter.source === "workflow") return parameter.workflowPath ?? "workflow context";
  if (parameter.source === "literal") return JSON.stringify(parameter.literalValue ?? parameter.defaultValue ?? "");
  return "Provided when the run reaches this node";
}

function coerceScriptInput(parameter: WorkflowV2ScriptParameterDef, raw: string): unknown {
  if (parameter.valueType === "number") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${parameter.label} must be a valid number.`);
    return value;
  }
  if (parameter.valueType === "boolean") return raw === "true";
  if (parameter.valueType === "json") return JSON.parse(raw);
  return raw;
}

export function WorkflowScriptNodePanel({ node, progress, onSubmitInput, onClose }: {
  node: WorkflowV2ScriptNode;
  progress?: WorkflowRunProgressItem;
  onSubmitInput?: (values: Record<string, unknown>) => void | Promise<void>;
  onClose: () => void;
}) {
  const requestedParameters = progress?.inputRequest?.kind === "script_parameters" ? progress.inputRequest.parameters : [];
  const [activeInputTab, setActiveInputTab] = useState("params");
  const inputTabs = useMemo(() => {
    const groups = new Map<WorkflowV2ScriptParameterDef["location"], WorkflowV2ScriptParameterDef[]>();
    for (const parameter of requestedParameters) {
      groups.set(parameter.location, [...(groups.get(parameter.location) ?? []), parameter]);
    }
    return inputTabDefinitions
      .map((tab) => ({ ...tab, groups: tab.locations.map((location) => [location, groups.get(location) ?? []] as const).filter(([, parameters]) => parameters.length > 0) }))
      .filter((tab) => tab.groups.length > 0);
  }, [requestedParameters]);
  const inputAdapter = useMemo(() => ({
    prepare: (values: Record<string, string>) => {
      const submitted: Record<string, unknown> = {};
      for (const parameter of requestedParameters) {
        const raw = values[parameter.key] ?? "";
        if (!raw.trim() && parameter.required) throw new Error(`${parameter.label} is required.`);
        if (raw.trim()) submitted[parameter.key] = coerceScriptInput(parameter, raw);
      }
      return submitted;
    },
    submit: async (values: Record<string, unknown>) => {
      if (!onSubmitInput) throw new Error("This script node cannot accept runtime input.");
      await onSubmitInput(values);
    },
  }), [onSubmitInput, requestedParameters]);
  const input = useWorkflowNodeInputController({ scope: `script:${node.id}`, adapter: inputAdapter });
  const visibleInputTab = inputTabs.find((tab) => tab.id === activeInputTab) ?? inputTabs[0];
  const executable = node.script.executable;
  const code = executable.kind === "inline" ? executable.code : [executable.command, ...(executable.args ?? [])].join(" ");
  const language = executable.kind === "inline" ? executable.language : "command";
  const renderedOutput = progress?.outputs ? JSON.stringify(progress.outputs, null, 2) : undefined;

  const renderInput = (parameter: WorkflowV2ScriptParameterDef) => {
    const value = input.values[parameter.key] ?? "";
    const setValue = (next: string) => input.setValue(parameter.key, next);
    if (parameter.enum?.length) {
      return <select name={parameter.key} value={value} onChange={(event) => setValue(event.currentTarget.value)}>
        <option value="">Select...</option>
        {parameter.enum.map((option) => <option key={`${typeof option}:${String(option)}`} value={String(option)}>{String(option)}</option>)}
      </select>;
    }
    if (parameter.valueType === "json") {
      return <textarea name={parameter.key} rows={4} value={value} onChange={(event) => setValue(event.currentTarget.value)} />;
    }
    if (parameter.valueType === "boolean") {
      return <select name={parameter.key} value={value} onChange={(event) => setValue(event.currentTarget.value)}>
        <option value="">Select...</option><option value="true">true</option><option value="false">false</option>
      </select>;
    }
    return <input
      name={parameter.key}
      type={parameter.valueType === "secret" ? "password" : "text"}
      inputMode={parameter.valueType === "number" ? "numeric" : undefined}
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
    />;
  };

  return <section className="workflow-script-node-overlay" role="dialog" aria-modal="true" aria-label={`${node.title} script details`}>
    <article className="workflow-script-node-panel">
      <header className="workflow-script-node-header">
        <div><span className="workflow-script-node-icon"><FileCode2 size={18} /></span><div><strong>{node.title}</strong><span>Script node · read-only</span></div></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close script details"><X size={16} /></button>
      </header>
      <div className="workflow-script-node-scroll">
        <section className="workflow-script-node-section">
          <div className="workflow-script-node-section-title"><Code2 size={15} /><div><strong>Execution logic</strong><span>The exact code executed by this node.</span></div><em>{language}</em></div>
          <pre className="workflow-script-code"><code>{code}</code></pre>
        </section>

        {requestedParameters.length ? <section className="workflow-script-node-section is-runtime-input">
          <div className="workflow-script-node-section-title"><Play size={15} /><div><strong>Required run inputs</strong><span>Provide only the values declared as user input. No agent is started.</span></div></div>
          <div className="workflow-script-input-tabs" role="tablist" aria-label="Script request inputs">
            {inputTabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === visibleInputTab?.id} className={tab.id === visibleInputTab?.id ? "is-active" : ""} onClick={() => setActiveInputTab(tab.id)}>{tab.label}</button>)}
          </div>
          <div className="workflow-script-runtime-inputs">
            {visibleInputTab?.groups.map(([location, parameters]) => <div className="workflow-script-runtime-group" key={location}>
              <h4>{location}</h4>
              {parameters.map((parameter) => <label key={parameter.key}>
                <span><b>{parameter.label}{parameter.required ? " *" : ""}</b><small>{parameter.key} · {parameter.valueType}</small></span>
                {renderInput(parameter)}
              </label>)}
            </div>)}
          </div>
          {input.error ? <div className="workflow-script-node-error" role="alert">{input.error}</div> : null}
          <button className="send-btn workflow-script-run-button" onClick={() => void input.submit()}><Play size={14} /><span>Run script</span></button>
        </section> : null}

        {renderedOutput ? <section className="workflow-script-node-section is-output">
          <div className="workflow-script-node-section-title"><CheckCircle2 size={15} /><div><strong>Output</strong><span>The values returned by this script node.</span></div></div>
          <pre className="workflow-script-output"><code>{renderedOutput}</code></pre>
        </section> : null}

        <section className="workflow-script-node-section">
          <div className="workflow-script-node-section-title"><Braces size={15} /><div><strong>Input variables</strong><span>Typed bindings resolved before the script executes.</span></div></div>
          <div className="workflow-script-binding-table">
            {node.script.parameters.length ? node.script.parameters.map((parameter) => <div key={parameter.key} className="workflow-script-binding-row"><div><code>{parameter.key}</code><span>{parameter.label}</span></div><span className={`workflow-script-source is-${parameter.source}`}>{sourceLabels[parameter.source]}</span><span>{parameter.valueType}</span><p>{parameterBinding(parameter)}</p></div>) : <div className="workflow-script-empty-row">No input variables</div>}
          </div>
        </section>

        <section className="workflow-script-node-section workflow-script-meta-grid">
          <div><div className="workflow-script-node-section-title"><CheckCircle2 size={15} /><div><strong>Output fields</strong><span>Values exposed to downstream nodes.</span></div></div><ul>{node.outputFields.map((field) => <li key={field.key}><code>{field.key}</code><span>{field.required ? "required" : "optional"}</span></li>)}</ul></div>
          <div><div className="workflow-script-node-section-title"><ShieldCheck size={15} /><div><strong>Execution policy</strong><span>Capabilities and risk declared by the Manager.</span></div></div><dl><div><dt>Risk</dt><dd>{node.script.managerRisk.level}</dd></div><div><dt>Timeout</dt><dd>{node.script.timeoutMs ? `${node.script.timeoutMs} ms` : "default"}</dd></div><div><dt>Capabilities</dt><dd>{node.script.capabilities.join(", ") || "none"}</dd></div></dl><p>{node.script.managerRisk.rationale}</p></div>
        </section>
      </div>
    </article>
  </section>;
}
