import { describe, expect, test } from "vitest";
import { extractWorkflowArtifactRefs, parseWorkflowGateRequest, projectNodeStates, workflowNodeRunPrompt } from "./workflow-run";
import type { WorkflowEvent, WorkflowGraph, WorkflowGraphNode } from "./types";

const NODES = [
  { nodeId: "a", title: "Alpha" },
  { nodeId: "b", title: "Beta" },
];

function event(partial: Partial<WorkflowEvent> & Pick<WorkflowEvent, "type" | "nodeId">): WorkflowEvent {
  return { at: 1, ...partial };
}

describe("projectNodeStates", () => {
  test("defaults every node to queued when there are no events", () => {
    const projected = projectNodeStates([], NODES);
    expect(projected).toEqual([
      { nodeId: "a", title: "Alpha", status: "queued", detail: "Queued" },
      { nodeId: "b", title: "Beta", status: "queued", detail: "Queued" },
    ]);
  });

  test("marks a node running with its task id after it starts", () => {
    const projected = projectNodeStates(
      [event({ type: "node_ready", nodeId: "a" }), event({ type: "node_started", nodeId: "a", taskId: "task-1", attempt: 1 })],
      NODES,
    );
    expect(projected[0]).toMatchObject({ nodeId: "a", status: "running", taskId: "task-1" });
    expect(projected[1]).toMatchObject({ nodeId: "b", status: "queued" });
  });

  test("keeps the task id when a running node is paused", () => {
    const projected = projectNodeStates(
      [event({ type: "node_started", nodeId: "a", taskId: "task-1" }), event({ type: "node_paused", nodeId: "a", at: 2 })],
      NODES,
    );
    expect(projected[0]).toMatchObject({ nodeId: "a", status: "paused", taskId: "task-1", detail: "Paused" });
  });

  test("clears the task id and reports the reason once a node completes", () => {
    const projected = projectNodeStates(
      [
        event({ type: "node_started", nodeId: "a", taskId: "task-1" }),
        event({ type: "node_output", nodeId: "a", at: 2, summary: "did work" }),
        event({ type: "node_judged", nodeId: "a", at: 3, pass: true, detail: "looks good" }),
        event({ type: "node_completed", nodeId: "a", at: 4, detail: "Approved: looks good" }),
      ],
      NODES,
    );
    expect(projected[0]).toMatchObject({ nodeId: "a", status: "completed", detail: "Approved: looks good" });
    expect(projected[0]?.taskId).toBeUndefined();
  });

  test("treats the latest event as authoritative so resume overrides pause", () => {
    const projected = projectNodeStates(
      [
        event({ type: "node_started", nodeId: "a", taskId: "task-1" }),
        event({ type: "node_paused", nodeId: "a", at: 2 }),
        event({ type: "node_started", nodeId: "a", at: 3, taskId: "task-2", attempt: 2 }),
      ],
      NODES,
    );
    expect(projected[0]).toMatchObject({ nodeId: "a", status: "running", taskId: "task-2" });
  });

  test("marks a node awaiting_input when a gate opens, and running again once answered", () => {
    const openOnly = projectNodeStates(
      [event({ type: "node_started", nodeId: "a", taskId: "task-1" }), event({ type: "gate_opened", nodeId: "a", at: 2, question: "Prod or staging?" })],
      NODES,
    );
    expect(openOnly[0]).toMatchObject({ nodeId: "a", status: "awaiting_input", detail: "Prod or staging?" });

    const answered = projectNodeStates(
      [
        event({ type: "node_started", nodeId: "a", taskId: "task-1" }),
        event({ type: "gate_opened", nodeId: "a", at: 2, question: "Prod or staging?" }),
        event({ type: "gate_answered", nodeId: "a", at: 3, answer: "staging" }),
      ],
      NODES,
    );
    expect(answered[0]).toMatchObject({ nodeId: "a", status: "running" });
  });

  test("surfaces the error when a node fails", () => {
    const projected = projectNodeStates(
      [event({ type: "node_started", nodeId: "a", taskId: "task-1" }), event({ type: "node_failed", nodeId: "a", at: 2, error: "boom" })],
      NODES,
    );
    expect(projected[0]).toMatchObject({ nodeId: "a", status: "failed", detail: "boom" });
    expect(projected[0]?.taskId).toBeUndefined();
  });

  test("includes nodes that only appear in events, preserving declared order first", () => {
    const projected = projectNodeStates(
      [event({ type: "node_started", nodeId: "__final_review__", taskId: "task-9", detail: "reviewing" })],
      NODES,
      [{ nodeId: "__final_review__", title: "Main agent review" }],
    );
    expect(projected.map((item) => item.nodeId)).toEqual(["a", "b", "__final_review__"]);
    expect(projected[2]).toMatchObject({ nodeId: "__final_review__", status: "running", detail: "reviewing" });
  });
});

describe("extractWorkflowArtifactRefs", () => {
  test("extracts file paths produced by the node", () => {
    const refs = extractWorkflowArtifactRefs(
      "### Handoff\nWrote results to `.multi-agent-chat/workflows/wf/output/report.md` and updated docs/spec.txt.",
    );
    expect(refs).toEqual([
      { kind: "file", title: "report.md", path: ".multi-agent-chat/workflows/wf/output/report.md" },
      { kind: "file", title: "spec.txt", path: "docs/spec.txt" },
    ]);
  });

  test("extracts http urls", () => {
    const refs = extractWorkflowArtifactRefs("See https://example.com/data for details.");
    expect(refs).toEqual([{ kind: "url", title: "https://example.com/data", url: "https://example.com/data" }]);
  });

  test("dedupes repeated references", () => {
    const refs = extractWorkflowArtifactRefs("a/b.md again a/b.md and https://x.io https://x.io");
    expect(refs).toEqual([
      { kind: "file", title: "b.md", path: "a/b.md" },
      { kind: "url", title: "https://x.io", url: "https://x.io" },
    ]);
  });

  test("returns nothing for prose without paths or urls", () => {
    expect(extractWorkflowArtifactRefs("The team finished the analysis and agreed on next steps.")).toEqual([]);
  });
});

describe("parseWorkflowGateRequest", () => {
  test("extracts the question from the string form", () => {
    expect(parseWorkflowGateRequest('Some reasoning.\nworkflowGate.ask("Should I deploy to prod or staging?")')).toEqual({
      question: "Should I deploy to prod or staging?",
    });
  });

  test("extracts the question from the object form", () => {
    expect(parseWorkflowGateRequest('workflowGate.ask({ question: "Which region?" })')).toEqual({ question: "Which region?" });
  });

  test("returns undefined when there is no gate marker", () => {
    expect(parseWorkflowGateRequest("### Handoff\nEverything is clear, proceeding.")).toBeUndefined();
  });
});

describe("workflowNodeRunPrompt artifact references", () => {
  const graph: WorkflowGraph = { title: "WF", objective: "Do it", nodes: [], edges: [] };
  const node: WorkflowGraphNode = { id: "b", kind: "agent", title: "Beta", prompt: "Continue." };
  const upstream: WorkflowGraphNode = { id: "a", kind: "agent", title: "Alpha", prompt: "Start." };

  test("surfaces upstream file and url references as a dedicated section", () => {
    const prompt = workflowNodeRunPrompt(
      graph,
      node,
      [{ node: upstream, artifact: "### Handoff\nSaved `out/result.json`. Reference https://docs.internal/x." }],
      "",
    );
    expect(prompt).toContain("Upstream artifact references");
    expect(prompt).toContain("out/result.json");
    expect(prompt).toContain("https://docs.internal/x");
  });
});
