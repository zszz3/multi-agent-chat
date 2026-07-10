import { describe, expect, test } from "vitest";

import type { WorkflowV2AuthoredDefinition, WorkflowV2Definition, WorkflowV2NodeTemplate } from "./definition";
import { createWorkflowV2TemplateRegistry } from "./templates";
import { compileAndValidateWorkflowV2Definition, validateWorkflowV2Definition } from "./validation";

function validDefinition(): WorkflowV2Definition {
  return {
    workflowId: "wf-v2",
    graphVersion: 1,
    objective: "Implement workflow v2 authoring",
    nodes: [
      {
        id: "plan",
        kind: "plan",
        title: "Plan",
        execModel: "llm",
        role: "orchestrator",
        outputFields: [{ key: "plan", required: true }],
        prompt: "Create the implementation plan.",
      },
      {
        id: "apply",
        kind: "apply",
        title: "Apply",
        execModel: "script",
        role: "executor",
        outputFields: [{ key: "result", required: true }],
        script: {
          language: "bash",
          code: "echo ok",
        },
        sandboxMode: "workspace",
      },
    ],
    edges: [{ fromNodeId: "plan", toNodeId: "apply" }],
  };
}

describe("workflow-v2 validation", () => {
  test("accepts a valid compiled definition", () => {
    const result = validateWorkflowV2Definition(validDefinition());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.topologicalNodeIds).toEqual(["plan", "apply"]);
  });

  test("accepts a negative safe integer expected exit code", () => {
    const definition = validDefinition();
    const node = definition.nodes[1]!;
    if (node.execModel !== "script") throw new Error("expected script node");
    node.expectedExitCode = -1;

    expect(validateWorkflowV2Definition(definition).valid).toBe(true);
  });

  test("returns structured errors for an unsupported execution model instead of throwing", () => {
    const invalid = validDefinition();
    invalid.nodes[0]!.execModel = "tool" as unknown as typeof invalid.nodes[0]["execModel"];

    expect(() => validateWorkflowV2Definition(invalid)).not.toThrow();
    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 node plan has unsupported execution model tool.");
  });

  test("rejects an unsupported script language from an untrusted caller", () => {
    const invalid = validDefinition();
    const node = invalid.nodes[1]!;
    if (node.execModel !== "script") throw new Error("expected script node");
    node.script.language = "powershell" as unknown as typeof node.script.language;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 script node apply has unsupported language powershell.");
  });

  test("rejects an explicit unsupported node role from an untrusted caller", () => {
    const invalid = validDefinition();
    invalid.nodes[0]!.role = "admin" as unknown as NonNullable<typeof invalid.nodes[0]["role"]>;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 node plan has unsupported role admin.");
  });

  test("rejects an unsupported llm model profile from an untrusted caller", () => {
    const invalid = validDefinition();
    const node = invalid.nodes[0]!;
    if (node.execModel !== "llm") throw new Error("expected llm node");
    node.modelProfile = "turbo" as unknown as NonNullable<typeof node.modelProfile>;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 llm node plan has unsupported model profile turbo.");
  });

  test("rejects duplicate directed edges", () => {
    const invalid = validDefinition();
    invalid.edges.push({ fromNodeId: "plan", toNodeId: "apply" });

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 definition has duplicate edge plan -> apply.");
  });

  test.each([
    ["non-finite", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s graphVersion", (_name, graphVersion) => {
    const invalid = { ...validDefinition(), graphVersion };

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 definition must have a positive safe-integer graphVersion.");
  });

  test("rejects duplicate ids, missing node references, and cycles", () => {
    const invalid: WorkflowV2Definition = {
      ...validDefinition(),
      nodes: [
        validDefinition().nodes[0]!,
        { ...validDefinition().nodes[1]!, id: "plan" },
      ],
      edges: [
        { fromNodeId: "plan", toNodeId: "missing" },
        { fromNodeId: "plan", toNodeId: "plan" },
      ],
    };

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 definition has duplicate node id plan.");
    expect(result.errors).toContain("Workflow V2 edge plan -> missing references a missing node.");
    expect(result.errors).toContain("Workflow V2 definition must be acyclic.");
  });

  test("rejects nodes with missing execution details", () => {
    const invalid: WorkflowV2Definition = {
      workflowId: "wf-v2",
      graphVersion: 1,
      objective: "Broken",
      nodes: [
        {
          id: "llm-node",
          kind: "review",
          title: "Review",
          execModel: "llm",
          outputFields: [],
          prompt: "",
        },
        {
          id: "script-node",
          kind: "transform",
          title: "Transform",
          execModel: "script",
          outputFields: [{ key: "artifact" }],
          script: {
            language: "python",
            code: "",
          },
          sandboxMode: "workspace",
          expectedExitCode: 1.2 as unknown as number,
        },
      ],
      edges: [],
    };

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 node llm-node must declare at least one output field.");
    expect(result.errors).toContain("Workflow V2 llm node llm-node must have a prompt.");
    expect(result.errors).toContain("Workflow V2 script node script-node must have script code.");
    expect(result.errors).toContain("Workflow V2 script node script-node must have a safe-integer expectedExitCode.");
  });

  test.each([
    ["non-finite", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects an llm node with a %s maxRetry", (_name, maxRetry) => {
    const invalid = validDefinition();
    const node = invalid.nodes[0]!;
    if (node.execModel !== "llm") throw new Error("expected llm node");
    node.maxRetry = maxRetry;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 llm node plan must have a non-negative safe-integer maxRetry.");
  });

  test.each([
    ["non-safe maxContextTokens", { maxContextTokens: Number.MAX_SAFE_INTEGER + 1 }],
    ["negative maxEvidenceItems", { maxContextTokens: 1_000, maxEvidenceItems: -1 }],
    ["non-finite maxUpstreamNodes", { maxContextTokens: 1_000, maxUpstreamNodes: Number.NaN }],
    ["unsupported summaryFallbackPolicy", { maxContextTokens: 1_000, summaryFallbackPolicy: "drop" }],
  ])("rejects an llm node with %s", (_name, contextBudget) => {
    const invalid = validDefinition();
    const node = invalid.nodes[0]!;
    if (node.execModel !== "llm") throw new Error("expected llm node");
    node.contextBudget = contextBudget as NonNullable<typeof node.contextBudget>;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 llm node plan has an invalid context budget.");
  });

  test.each([
    ["non-finite", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
    ["zero", 0],
  ])("rejects a script node with a %s timeout", (_name, timeoutMs) => {
    const invalid = validDefinition();
    const node = invalid.nodes[1]!;
    if (node.execModel !== "script") throw new Error("expected script node");
    node.script.timeoutMs = timeoutMs;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 script node apply must have a positive safe-integer timeoutMs.");
  });

  test.each([
    ["non-finite", Number.NaN],
    ["infinite", Number.NEGATIVE_INFINITY],
    ["unsafe positive", Number.MAX_SAFE_INTEGER + 1],
    ["unsafe negative", Number.MIN_SAFE_INTEGER - 1],
  ])("rejects a script node with a %s expected exit code", (_name, expectedExitCode) => {
    const invalid = validDefinition();
    const node = invalid.nodes[1]!;
    if (node.execModel !== "script") throw new Error("expected script node");
    node.expectedExitCode = expectedExitCode;

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 script node apply must have a safe-integer expectedExitCode.");
  });

  test("accepts a bounded execution lease policy", () => {
    const definition = validDefinition();
    definition.nodes[0]!.executionLease = {
      inactivityTimeoutMs: 1_000,
      softTimeoutMs: 5_000,
      hardTimeoutMs: 10_000,
      progressProbeTimeoutMs: 500,
      maxExtensions: 2,
      maxExtensionMs: 1_000,
    };

    expect(validateWorkflowV2Definition(definition).valid).toBe(true);
  });

  test("rejects an execution lease whose soft deadline is not below its hard deadline", () => {
    const invalid = validDefinition();
    invalid.nodes[0]!.executionLease = {
      inactivityTimeoutMs: 1_000,
      softTimeoutMs: 10_000,
      hardTimeoutMs: 10_000,
      progressProbeTimeoutMs: 500,
      maxExtensions: 2,
      maxExtensionMs: 1_000,
    };

    const result = validateWorkflowV2Definition(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Workflow V2 node plan has an invalid execution lease policy.");
  });

  test("fails fast when a template reference cannot be compiled", () => {
    const authored: WorkflowV2AuthoredDefinition = {
      workflowId: "wf-v2",
      graphVersion: 1,
      objective: "Broken template",
      nodes: [{ id: "n1", templateId: "missing-template" }],
      edges: [],
    };

    const templates: WorkflowV2NodeTemplate[] = [];
    const result = compileAndValidateWorkflowV2Definition(authored, createWorkflowV2TemplateRegistry(templates));

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["Unknown workflow-v2 template: missing-template"]);
    expect(result.topologicalNodeIds).toEqual([]);
  });
});
