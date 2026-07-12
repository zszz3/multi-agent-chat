import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { WorkflowController } from "./workflow-controller";
import { WorkflowPage } from "./WorkflowPage";

function controller(definitionReady: boolean): WorkflowController {
  return {
    workflowId: "workflow", title: "Workflow", status: definitionReady ? "running" : "draft", definitionReady,
    definition: { workflowId: "workflow", graphVersion: 1, objective: "Answer a question", nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "interactive", prompt: "Answer the question.", outputFields: [{ key: "answer_markdown", required: true }] }], edges: [] },
    objective: "Answer a question", messages: [], reply: "", error: undefined, configuredAgentId: "default-agent", runtimes: [], channels: [], workDir: "C:/workspace", running: definitionReady,
    activeRunId: definitionReady ? "run" : undefined, runProgress: definitionReady ? [{ nodeId: "answer", title: "Answer", status: "running" }] : [],
    onObjectiveChange: () => undefined, onSelectConfiguredAgent: () => undefined, onBuildDefinition: () => undefined, onReplyChange: () => undefined, onSendReply: () => undefined, onUpdateNode: () => undefined, onRunWorkflow: () => undefined, onResetSession: () => undefined,
  };
}

describe("WorkflowPage input ownership", () => {
  test("renders the planning composer before a workflow graph exists", () => {
    expect(renderToStaticMarkup(<WorkflowPage controller={controller(false)} />)).toContain("workflow-composer");
  });
  test("removes the planning composer once node execution owns user input", () => {
    const html = renderToStaticMarkup(<WorkflowPage controller={controller(true)} />);
    expect(html).not.toContain("workflow-composer");
  });

  test("requires explicit confirmation before a valid draft can run", () => {
    const value = controller(true);
    value.status = "draft";
    value.running = false;
    value.activeRunId = undefined;
    value.runProgress = [];
    value.revision = 3;
    delete value.confirmedRevision;
    value.onConfirmWorkflow = () => undefined;
    const unconfirmedHtml = renderToStaticMarkup(<WorkflowPage controller={value} />);
    expect(unconfirmedHtml).toContain("Confirm workflow");
    expect(unconfirmedHtml).toContain("Awaiting confirmation");
    expect(unconfirmedHtml).toContain('<button class="send-btn" disabled="">');

    value.confirmedRevision = 3;
    const confirmedHtml = renderToStaticMarkup(<WorkflowPage controller={value} />);
    expect(confirmedHtml).not.toContain("Confirm workflow");
    expect(confirmedHtml).toContain("Confirmed r3");
    expect(confirmedHtml).toContain('<button class="send-btn">');
  });
  test("does not render the legacy inline gate input for an awaiting node", () => {
    const value = controller(true);
    value.runProgress = [{ nodeId: "answer", title: "Answer", status: "awaiting_input", detail: "Provide more context" }];
    const html = renderToStaticMarkup(<WorkflowPage controller={value} />);
    expect(html).not.toContain("workflow-gate-panel");
    expect(html).not.toContain("workflow-gate-panel-input");
  });

  test("does not render the legacy intervention action panel for a paused node", () => {
    const value = controller(true);
    value.runProgress = [{
      nodeId: "answer",
      title: "Echo User Input",
      status: "paused",
      intervention: {
        nodeId: "answer",
        source: "supervision_pause",
        reason: "Interactive node is waiting for user confirmation.",
        allowedActions: ["continue", "skip", "escalate", "replan", "increase_review_strength"],
        requestedAt: 1,
      },
    }];
    const html = renderToStaticMarkup(<WorkflowPage controller={value} />);
    expect(html).not.toContain("workflow-intervention-panel");
    expect(html).not.toContain("Interactive node is waiting for user confirmation.");
  });
});
