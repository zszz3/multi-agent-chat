import { describe, expect, test } from "vitest";

import type { WorkflowV2AuthoredDefinition, WorkflowV2NodeTemplate } from "./definition";
import { compileWorkflowV2Definition, createWorkflowV2TemplateRegistry } from "./templates";

describe("workflow-v2 templates", () => {
  test("compiles template-backed llm nodes into explicit executable nodes", () => {
    const templates: WorkflowV2NodeTemplate[] = [
      {
        id: "research",
        kind: "research",
        execModel: "llm",
        prompt: "Research {{params.topic}} in scope {{params.scope}}.",
        outputFields: [{ key: "summary", required: true }],
        role: "executor",
        modelProfile: "fast",
        executionLease: {
          inactivityTimeoutMs: 1_000,
          softTimeoutMs: 5_000,
          hardTimeoutMs: 10_000,
          progressProbeTimeoutMs: 500,
          maxExtensions: 1,
          maxExtensionMs: 1_000,
        },
      },
    ];
    const authored: WorkflowV2AuthoredDefinition = {
      workflowId: "wf-v2",
      graphVersion: 1,
      objective: "Research a topic",
      nodes: [
        {
          id: "n1",
          templateId: "research",
          params: { topic: "workflow v2", scope: ["design", "execution"] },
          overrides: {
            title: "Targeted Research",
            prompt: "{{templatePrompt}}\nReturn only structured output.",
          },
        },
      ],
      edges: [],
    };

    const compiled = compileWorkflowV2Definition(authored, createWorkflowV2TemplateRegistry(templates));

    expect(compiled.nodes).toEqual([
      {
        id: "n1",
        kind: "research",
        title: "Targeted Research",
        execModel: "llm",
        outputFields: [{ key: "summary", required: true }],
        role: "executor",
        modelProfile: "fast",
        executionLease: {
          inactivityTimeoutMs: 1_000,
          softTimeoutMs: 5_000,
          hardTimeoutMs: 10_000,
          progressProbeTimeoutMs: 500,
          maxExtensions: 1,
          maxExtensionMs: 1_000,
        },
        prompt: "Research workflow v2 in scope design, execution.\nReturn only structured output.",
      },
    ]);
  });

  test("compiles template-backed script nodes with rendered code", () => {
    const templates: WorkflowV2NodeTemplate[] = [
      {
        id: "json-export",
        kind: "export",
        execModel: "script",
        script: {
          language: "typescript",
          code: "console.log('{{params.payload}}')",
        },
        outputFields: [{ key: "artifact", required: true }],
        sandboxMode: "workspace",
      },
    ];

    const compiled = compileWorkflowV2Definition(
      {
        workflowId: "wf-v2",
        graphVersion: 1,
        objective: "Render a script",
        nodes: [{ id: "n1", templateId: "json-export", params: { payload: "ok" } }],
        edges: [],
      },
      createWorkflowV2TemplateRegistry(templates),
    );

    expect(compiled.nodes[0]).toMatchObject({
      id: "n1",
      execModel: "script",
      script: { language: "typescript", code: "console.log('ok')" },
      sandboxMode: "workspace",
    });
  });
});
