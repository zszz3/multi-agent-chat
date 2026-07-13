import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { WorkflowV2ScriptNode } from "../../../../shared/workflow-v2/definition";
import { WorkflowScriptNodePanel } from "./WorkflowScriptNodePanel";

const node: WorkflowV2ScriptNode = {
  id: "echo",
  kind: "transform",
  title: "Echo input",
  execModel: "script",
  executionMode: "script",
  script: {
    executable: { kind: "inline", language: "typescript", code: "return { echoed: inputs.text };" },
    parameters: [
      { key: "text", label: "Text", location: "stdin", valueType: "string", source: "user", required: true },
      { key: "prefix", label: "Prefix", location: "environment", valueType: "string", source: "literal", required: false, literalValue: "value:" },
    ],
    capabilities: [],
    managerRisk: { level: "safe", rationale: "Pure transform." },
    outputSchema: { type: "object", required: ["echoed"] },
  },
  outputFields: [{ key: "echoed", required: true }],
};

describe("WorkflowScriptNodePanel", () => {
  test("shows script code and variable bindings without agent conversation chrome", () => {
    const html = renderToStaticMarkup(<WorkflowScriptNodePanel node={node} onClose={() => undefined} />);
    expect(html).toContain('aria-label="Echo input script details"');
    expect(html).toContain("return { echoed: inputs.text };");
    expect(html).toContain("Input variables");
    expect(html).toContain("User input");
    expect(html).toContain("Literal");
    expect(html).toContain("Output fields");
    expect(html).not.toContain("Node conversations");
    expect(html).not.toContain("Send information to this node agent");
  });

  test("renders typed user inputs inside the script surface", () => {
    const html = renderToStaticMarkup(<WorkflowScriptNodePanel
      node={node}
      progress={{ nodeId: "echo", title: "Echo input", status: "awaiting_input", inputRequest: { kind: "script_parameters", parameters: [node.script.parameters[0]!] } }}
      onSubmitInput={() => undefined}
      onClose={() => undefined}
    />);
    expect(html).toContain("Required run inputs");
    expect(html).toContain("Run script");
    expect(html).toContain('name="text"');
  });
});
