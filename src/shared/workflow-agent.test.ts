import { describe, expect, test } from "vitest";
import {
  buildWorkflowAgentPrompt,
  firstWorkflowQuestionForObjective,
  nextWorkflowQuestion,
  WORKFLOW_FOLLOW_UP_QUESTIONS,
  WORKFLOW_GRAPH_CODE_TEMPLATE,
} from "./workflow-agent";

describe("workflow agent prompt", () => {
  test("describes the loop engineering agent contract", () => {
    const prompt = buildWorkflowAgentPrompt({ objective: "我要生成 loop engineering agent" });

    expect(prompt).toContain("Loop Engineering Agent");
    expect(prompt).toContain("我要生成 loop engineering agent");
    expect(prompt).toContain("Ask exactly one question");
    expect(prompt).toContain("recommended answer");
    expect(prompt).toContain("DAG");
    expect(prompt).toContain("workflowGraph.upsert");
    expect(prompt).toContain("Output code template");
    expect(prompt).toContain(WORKFLOW_GRAPH_CODE_TEMPLATE);
    expect(prompt).toContain("Workflow storage plan");
    expect(prompt).toContain("shared memory");
    expect(prompt).toContain("output documents");
  });

  test("provides a fillable workflow graph code template", () => {
    expect(WORKFLOW_GRAPH_CODE_TEMPLATE).toContain("workflowGraph.upsert({");
    expect(WORKFLOW_GRAPH_CODE_TEMPLATE).toContain("nodes:");
    expect(WORKFLOW_GRAPH_CODE_TEMPLATE).toContain("edges:");
    expect(WORKFLOW_GRAPH_CODE_TEMPLATE).toContain('kind: "start"');
    expect(WORKFLOW_GRAPH_CODE_TEMPLATE).toContain('kind: "agent"');
    expect(WORKFLOW_GRAPH_CODE_TEMPLATE).toContain('kind: "end"');
  });

  test("builds the first grill question with a recommended answer from the submitted workflow task", () => {
    const question = firstWorkflowQuestionForObjective("我想review一下 ./sample-repo 的代码，生成一份学习文档");

    expect(question).toContain("sample-repo");
    expect(question).toContain("代码");
    expect(question).toContain("推荐答案：");
    expect(question).toContain("学习文档");
    expect(question).not.toContain("只读 review");
    expect(question).not.toContain("最终交付物是什么");
  });

  test("all workflow follow-up questions include a recommended answer", () => {
    for (let index = 0; index < WORKFLOW_FOLLOW_UP_QUESTIONS.length; index += 1) {
      expect(nextWorkflowQuestion(index + 1)).toContain("推荐答案：");
    }
  });
});
