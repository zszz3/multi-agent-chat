import { describe, expect, test } from "vitest";
import { createWorkflowGraphFromObjective, parseWorkflowGraphUpsert, validateWorkflowGraph, workflowGraphDisplayLayers, workflowGraphExecutionLevels } from "./workflow-graph";

describe("workflow graph tools", () => {
  test("creates a valid workflow graph from an objective", () => {
    const graph = createWorkflowGraphFromObjective("Review the payment service for release risk");
    const validation = validateWorkflowGraph(graph);

    expect(graph.title).toBe("Review the payment service for release risk");
    expect(graph.nodes.map((node) => node.kind)).toEqual(["start", "agent", "agent", "agent", "end"]);
    expect(graph.nodes.find((node) => node.id === "plan")?.prompt).toContain("Loop Engineering Agent");
    expect(graph.nodes.find((node) => node.id === "plan")?.prompt).toContain("Review the payment service for release risk");
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.startNodeIds).toEqual(["start"]);
    expect(validation.executableNodeIds).toEqual(["plan", "work", "review"]);
    expect(validation.topologicalNodeIds).toEqual(["start", "plan", "work", "review", "end"]);
  });

  test("rejects graphs without one reachable acyclic start", () => {
    const noStart = validateWorkflowGraph({
      title: "Broken",
      objective: "Broken",
      nodes: [{ id: "agent-a", kind: "agent", title: "Agent A", prompt: "Work" }],
      edges: [],
    });

    expect(noStart.valid).toBe(false);
    expect(noStart.errors).toContain("Workflow graph must have exactly one start node.");

    const cyclic = validateWorkflowGraph({
      title: "Cyclic",
      objective: "Cyclic",
      nodes: [
        { id: "start", kind: "start", title: "Start", prompt: "" },
        { id: "a", kind: "agent", title: "A", prompt: "A" },
        { id: "b", kind: "agent", title: "B", prompt: "B" },
      ],
      edges: [
        { id: "start->a", fromNodeId: "start", toNodeId: "a" },
        { id: "a->b", fromNodeId: "a", toNodeId: "b" },
        { id: "b->a", fromNodeId: "b", toNodeId: "a" },
      ],
    });

    expect(cyclic.valid).toBe(false);
    expect(cyclic.errors).toContain("Workflow graph must be acyclic.");
  });

  test("parses an agent-generated workflowGraph.upsert block", () => {
    const graph = parseWorkflowGraphUpsert(`Agent is thinking...\`\`\`ts
workflowGraph.upsert({
  title: "Sample Repo Learning Highlights Review",
  objective: "Review ./sample-repo and generate a learning document.",
  nodes: [
    { id: "start", kind: "start", title: "Start", prompt: "" },
    { id: "repo_inventory", kind: "agent", title: "Repository Inventory Agent", prompt: "Inspect the repo.", agentId: "codex", channelId: "", modelId: "default" },
    { id: "highlight_mining", kind: "agent", title: "Technical Highlights Agent", prompt: "Mine highlights.", agentId: "claude", channelId: "", modelId: "default" },
    { id: "end", kind: "end", title: "Done", prompt: "" }
  ],
  edges: [
    { id: "start->repo_inventory", fromNodeId: "start", toNodeId: "repo_inventory" },
    { id: "repo_inventory->highlight_mining", fromNodeId: "repo_inventory", toNodeId: "highlight_mining" },
    { id: "highlight_mining->end", fromNodeId: "highlight_mining", toNodeId: "end" }
  ]
});
\`\`\``);

    expect(graph?.title).toBe("Sample Repo Learning Highlights Review");
    expect(graph?.nodes.map((node) => node.id)).toEqual(["start", "repo_inventory", "highlight_mining", "end"]);
    expect(validateWorkflowGraph(graph!).valid).toBe(true);
  });

  test("preserves valid node positions and drops malformed ones", () => {
    const graph = parseWorkflowGraphUpsert(`workflowGraph.upsert({
  title: "Positioned",
  objective: "Pin nodes",
  nodes: [
    { id: "start", kind: "start", title: "Start", prompt: "", position: { x: 40, y: 120 } },
    { id: "plan", kind: "agent", title: "Plan", prompt: "Plan it.", position: { x: "nope", y: 10 } },
    { id: "end", kind: "end", title: "Done", prompt: "" }
  ],
  edges: [
    { id: "start->plan", fromNodeId: "start", toNodeId: "plan" },
    { id: "plan->end", fromNodeId: "plan", toNodeId: "end" }
  ]
});`)!;

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get("start")!.position).toEqual({ x: 40, y: 120 });
    expect(byId.get("plan")!.position).toBeUndefined();
    expect(byId.get("end")!.position).toBeUndefined();
  });

  test("groups executable workflow nodes by satisfied dependencies", () => {
    const graph = parseWorkflowGraphUpsert(`workflowGraph.upsert({
  title: "Review DAG",
  objective: "Review repo",
  nodes: [
    { id: "start", kind: "start", title: "Start", prompt: "" },
    { id: "repo_inventory", kind: "agent", title: "Repository Inventory", prompt: "Map repo." },
    { id: "architecture_analysis", kind: "agent", title: "Architecture", prompt: "Analyze architecture." },
    { id: "highlight_mining", kind: "agent", title: "Highlights", prompt: "Mine highlights." },
    { id: "claim_verification", kind: "agent", title: "Verify", prompt: "Verify claims." },
    { id: "doc_writer", kind: "agent", title: "Writer", prompt: "Write doc." },
    { id: "end", kind: "end", title: "Done", prompt: "" }
  ],
  edges: [
    { id: "start->repo_inventory", fromNodeId: "start", toNodeId: "repo_inventory" },
    { id: "repo_inventory->architecture_analysis", fromNodeId: "repo_inventory", toNodeId: "architecture_analysis" },
    { id: "repo_inventory->highlight_mining", fromNodeId: "repo_inventory", toNodeId: "highlight_mining" },
    { id: "architecture_analysis->claim_verification", fromNodeId: "architecture_analysis", toNodeId: "claim_verification" },
    { id: "highlight_mining->claim_verification", fromNodeId: "highlight_mining", toNodeId: "claim_verification" },
    { id: "claim_verification->doc_writer", fromNodeId: "claim_verification", toNodeId: "doc_writer" },
    { id: "doc_writer->end", fromNodeId: "doc_writer", toNodeId: "end" }
  ]
});`)!;

    expect(workflowGraphExecutionLevels(graph)).toEqual([
      ["repo_inventory"],
      ["architecture_analysis", "highlight_mining"],
      ["claim_verification"],
      ["doc_writer"],
    ]);
    expect(workflowGraphDisplayLayers(graph)).toEqual([
      ["start"],
      ["repo_inventory"],
      ["architecture_analysis", "highlight_mining"],
      ["claim_verification"],
      ["doc_writer"],
      ["end"],
    ]);
  });
});
