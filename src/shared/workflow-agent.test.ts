import { describe, expect, test } from "vitest";
import {
  buildWorkflowAgentPrompt,
  firstWorkflowQuestionForObjective,
  nextWorkflowQuestion,
  WORKFLOW_FOLLOW_UP_QUESTIONS,
  WORKFLOW_V2_DEFINITION_TEMPLATE,
} from "./workflow-agent";

describe("workflow V2 manager prompt", () => {
  test("requires V2 creation and correct interaction classification", () => {
    const prompt = buildWorkflowAgentPrompt({ objective: "Determine the user's mood from user input" });
    expect(prompt).toContain("Workflow V2 Manager");
    expect(prompt).toContain("workflow_create");
    expect(prompt).toContain("WorkflowV2Definition");
    expect(prompt).toContain("it must use executionMode interactive");
    expect(prompt).toContain("Never classify an input-dependent node as one-shot");
    expect(prompt).toContain("execModel script");
    expect(prompt).toContain("echoing or passing through input unchanged");
    expect(prompt).toContain("separate the interactive input collection from the deterministic script transformation");
    expect(prompt).toContain("Build the smallest graph");
    expect(prompt).toContain("Every script input must be declared exactly once");
    expect(prompt).toContain("Classify pure in-memory transformations as safe");
  });

  test("provides a valid-shape V2 definition example", () => {
    const definition = JSON.parse(WORKFLOW_V2_DEFINITION_TEMPLATE);
    expect(definition).toMatchObject({ graphVersion: 1, nodes: [{ execModel: "llm",
        executionMode: "interactive" }, { execModel: "script", executionMode: "script", script: { managerRisk: { level: "safe" } } }] });
    expect(definition.edges).toEqual([{ from: "collect-input", to: "echo-input" }]);
    expect(definition.nodes.some((node: { kind: string }) => node.kind === "start" || node.kind === "end")).toBe(false);
  });

  test("questions include a recommended answer", () => {
    expect(firstWorkflowQuestionForObjective("review a repository")).toContain("Recommended answer");
    for (let index = 0; index < WORKFLOW_FOLLOW_UP_QUESTIONS.length; index += 1) {
      expect(nextWorkflowQuestion(index + 1)).toContain("Recommended answer");
    }
  });
});
