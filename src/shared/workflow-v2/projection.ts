import type { WorkflowGraph } from "../types";
import type { WorkflowV2Definition } from "./definition";

export function projectWorkflowV2DefinitionToLegacyCanvas(definition: WorkflowV2Definition, title: string): WorkflowGraph {
  const nodes: WorkflowGraph["nodes"] = [
    { id: "__start__", kind: "start", title: "Start", prompt: "" },
    ...definition.nodes.map((node) => ({
      id: node.id,
      kind: "agent" as const,
      title: node.title,
      prompt: node.execModel === "llm" ? node.prompt : `Run ${node.script.language ?? "script"} script node ${node.title}.`,
    })),
    { id: "__end__", kind: "end", title: "Done", prompt: "" },
  ];
  const incoming = new Set(definition.edges.map((edge) => edge.toNodeId));
  const outgoing = new Set(definition.edges.map((edge) => edge.fromNodeId));
  const edges: WorkflowGraph["edges"] = [
    ...definition.nodes.filter((node) => !incoming.has(node.id)).map((node) => ({ id: `__start__->${node.id}`, fromNodeId: "__start__", toNodeId: node.id })),
    ...definition.edges.map((edge) => ({ id: `${edge.fromNodeId}->${edge.toNodeId}`, fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId })),
    ...definition.nodes.filter((node) => !outgoing.has(node.id)).map((node) => ({ id: `${node.id}->__end__`, fromNodeId: node.id, toNodeId: "__end__" })),
  ];
  return { title, objective: definition.objective, nodes, edges };
}
