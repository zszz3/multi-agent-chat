import type {
  TaskRun,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowRunProgressItem,
} from "../../../../shared/types";
import { truncateWorkflowContext, type WorkflowStoragePlan } from "./workflow-utils";
import {
  parseWorkflowGraphUpsert,
} from "../../../../shared/workflow-graph";

function workflowStringField(content: string, field: string): string | undefined {
  const pattern = `["']?${field}["']?\\s*:\\s*("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*'|\`([^\`\\\\]|\\\\.)*\`)`;
  const match = new RegExp(pattern, "s").exec(content);
  if (!match) return undefined;
  const raw = match[1]!;
  const body = raw.slice(1, -1);
  return body
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, `"`)
    .replace(/\\'/g, `'`)
    .replace(/\\`/g, "`")
    .replace(/\\\\/g, "\\")
    .trim();
}

export interface WorkflowJudgeResult {
  complete: boolean;
  reason: string;
  retryPrompt: string;
}

export function workflowNodeRunPrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  upstreamArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument = "",
  storagePlan?: WorkflowStoragePlan,
): string {
  const upstreamSection =
    upstreamArtifacts.length > 0
      ? upstreamArtifacts
          .map((item) => [`## Upstream: ${item.node.title} (${item.node.id})`, item.artifact].join("\n"))
          .join("\n\n")
      : "No upstream agent artifacts.";
  const contextSection = contextDocument.trim() || "No workflow context document yet.";

  return [
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    `Node: ${node.title} (${node.id})`,
    "",
    "Follow this node instruction:",
    node.prompt || "Execute this workflow node.",
    "",
    "Use this workflow context document first:",
    contextSection,
    "",
    ...(storagePlan
      ? [
          "Workflow storage plan:",
          `- Shared memory file: ${storagePlan.memoryPath}`,
          `- Output document directory: ${storagePlan.outputDir}`,
          "If you create a user-facing document, write it under the output document directory and include the exact relative path in your Work Completion Report.",
          "",
        ]
      : []),
    "Use these upstream artifacts as context:",
    upstreamSection,
    "",
    "Before you finish, write a Work Completion Report.",
    "The report must include what you did, concrete evidence or produced artifacts, remaining gaps or risks, and what downstream nodes need next.",
    "This report will be appended to the shared Workflow Context document, so make it useful as one-way handoff context.",
    "",
    "When you finish, include a concise Handoff section.",
    "The Handoff section should capture key findings, decisions, produced artifacts, risks, and what downstream nodes need next.",
  ].join("\n");
}

export function workflowJudgePrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  artifact: string,
  contextDocument: string,
  attempt: number,
  maxAttempts: number,
): string {
  return [
    "You are the workflow judge for one completed agent node.",
    `Evaluate attempt ${attempt} of ${maxAttempts}.`,
    "",
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    `Node: ${node.title} (${node.id})`,
    "",
    "Original node instruction:",
    node.prompt || "Execute this workflow node.",
    "",
    "Shared Workflow Context document:",
    contextDocument.trim() || "No workflow context document yet.",
    "",
    "Node output to judge:",
    artifact,
    "",
    "Decide whether this node is complete enough for downstream workflow execution.",
    "Do not perform the work yourself. Judge only the output against the objective, node instruction, evidence, and handoff quality.",
    "",
    "Return only this TypeScript-style call:",
    "workflowEvaluation.submit({",
    "  complete: true,",
    '  reason: "short reason",',
    '  retryPrompt: ""',
    "});",
    "",
    "If complete is false, retryPrompt must be a concrete instruction for rerunning this same node.",
  ].join("\n");
}

export function workflowFinalReviewPrompt(
  graph: WorkflowGraph,
  nodeArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument: string,
  progress: WorkflowRunProgressItem[],
  storagePlan?: WorkflowStoragePlan,
): string {
  const artifactSection =
    nodeArtifacts.length > 0
      ? nodeArtifacts
          .map((item) => [`## Node: ${item.node.title} (${item.node.id})`, item.artifact.trim() || "No output captured."].join("\n"))
          .join("\n\n")
      : "No node outputs captured.";
  const progressSection =
    progress.length > 0
      ? progress.map((item) => `- ${item.title} (${item.nodeId}): ${item.status}${item.detail ? ` - ${item.detail}` : ""}`).join("\n")
      : "No run progress captured.";

  return [
    "You are the main workflow agent. All workflow nodes have finished and passed evaluation.",
    "Continue the same workflow chat with the user: summarize the run result, explain what the worker agents produced, and stay ready for follow-up questions.",
    "",
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    "",
    "Shared Workflow Context document:",
    contextDocument.trim() || "No workflow context document yet.",
    "",
    ...(storagePlan
      ? [
          "Workflow storage plan:",
          `- Shared memory file: ${storagePlan.memoryPath}`,
          `- Output document directory: ${storagePlan.outputDir}`,
          "Only list output documents that are under the output document directory.",
          "",
        ]
      : []),
    "Run progress:",
    progressSection,
    "",
    "Node outputs:",
    artifactSection,
    "",
    "Review the full workflow once for the user. Check whether the node outputs collectively satisfy the objective, whether evidence is concrete, and what risks or gaps remain.",
    "Do not rerun the workflow nodes. Do not invent work that is not supported by the node outputs or context.",
    "",
    "Write a concise Markdown report for the user. It must start with:",
    "## Final User Report",
    "",
    "Include: outcome, important evidence or artifacts, output document paths under the planned output directory, remaining risks/gaps, and concrete next steps.",
  ].join("\n");
}

export function parseWorkflowJudgeResult(content: string): WorkflowJudgeResult | undefined {
  const completeMatch = /["']?complete["']?\s*:\s*(true|false)/i.exec(content);
  if (!completeMatch) return undefined;
  const complete = completeMatch[1]!.toLowerCase() === "true";
  return {
    complete,
    reason: workflowStringField(content, "reason") || (complete ? "Judge approved the node output." : "Judge requested a retry."),
    retryPrompt: workflowStringField(content, "retryPrompt") || "",
  };
}

export function workflowProgressAfterFailure(progress: WorkflowRunProgressItem[], errorMessage: string): WorkflowRunProgressItem[] {
  return progress.map((item) => {
    if (item.status !== "running" && item.status !== "queued") return item;
    const next: WorkflowRunProgressItem = {
      ...item,
      status: "failed",
      detail: errorMessage,
    };
    delete next.taskId;
    return next;
  });
}

export function workflowAssistantDisplayContent(content: string): string {
  const graph = parseWorkflowGraphUpsert(content);
  return graph ? `Workflow graph ready: ${graph.title}` : content;
}
