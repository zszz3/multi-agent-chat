import type {
  TaskRun,
  WorkflowArtifactReference,
  WorkflowEvent,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowRunNodeStatus,
  WorkflowRunProgressItem,
} from "./types";

export const WORKFLOW_TASK_POLL_MS = 1000;
export const WORKFLOW_TASK_TIMEOUT_MS = 30 * 60 * 1000;
export const WORKFLOW_NODE_MAX_ATTEMPTS = 2;
export const WORKFLOW_FINAL_REVIEW_NODE_ID = "__final_review__";

const WORKFLOW_STORAGE_ROOT = ".multi-agent-chat/workflows";

export interface WorkflowStoragePlan {
  memoryPath: string;
  outputDir: string;
}

export interface WorkflowJudgeResult {
  complete: boolean;
  reason: string;
  retryPrompt: string;
}

const WORKFLOW_EVENT_STATUS: Record<WorkflowEvent["type"], WorkflowRunNodeStatus> = {
  node_ready: "queued",
  node_started: "running",
  node_paused: "paused",
  node_output: "running",
  node_judged: "running",
  node_failed: "failed",
  node_completed: "completed",
  gate_opened: "awaiting_input",
  gate_answered: "running",
};

function workflowEventDefaultDetail(event: WorkflowEvent, status: WorkflowRunNodeStatus): string | undefined {
  if (event.detail) return event.detail;
  if (status === "awaiting_input") return event.question;
  if (status === "failed") return event.error;
  if (status === "paused") return "Paused";
  if (status === "queued") return "Queued";
  return undefined;
}

export interface WorkflowGateRequest {
  question: string;
}

/**
 * Parse a human-gate request emitted by a node agent. A node that needs a human
 * decision before it can safely proceed emits `workflowGate.ask("question")`
 * (string) or `workflowGate.ask({ question: "..." })` (object). See
 * src/main/WORKFLOW-RUNTIME.md.
 */
export function parseWorkflowGateRequest(content: string): WorkflowGateRequest | undefined {
  const objectMatch = content.match(/workflowGate\.ask\(\s*\{[\s\S]*?question\s*:\s*["'`]([\s\S]*?)["'`][\s\S]*?\}\s*\)/i);
  if (objectMatch?.[1]) return { question: objectMatch[1].trim() };
  const stringMatch = content.match(/workflowGate\.ask\(\s*["'`]([\s\S]*?)["'`]\s*\)/i);
  if (stringMatch?.[1]) return { question: stringMatch[1].trim() };
  return undefined;
}

/**
 * Project the append-only workflow event log into the UI-facing node progress list.
 * The event log is the source of truth; this pure function derives current node
 * state from it. `declaredNodes` fixes the display order/titles (execution order);
 * `extraNodes` (e.g. the synthetic final-review node) are appended after them.
 * See src/main/WORKFLOW-RUNTIME.md.
 */
export function projectNodeStates(
  events: WorkflowEvent[],
  declaredNodes: Array<{ nodeId: string; title: string }>,
  extraNodes: Array<{ nodeId: string; title: string }> = [],
): WorkflowRunProgressItem[] {
  const titleByNodeId = new Map<string, string>();
  const order: string[] = [];
  for (const node of [...declaredNodes, ...extraNodes]) {
    if (!titleByNodeId.has(node.nodeId)) order.push(node.nodeId);
    titleByNodeId.set(node.nodeId, node.title);
  }
  for (const event of events) {
    if (!titleByNodeId.has(event.nodeId)) {
      order.push(event.nodeId);
      titleByNodeId.set(event.nodeId, event.nodeId);
    }
  }

  const latestByNodeId = new Map<string, WorkflowEvent>();
  const latestStartByNodeId = new Map<string, WorkflowEvent>();
  for (const event of events) {
    latestByNodeId.set(event.nodeId, event);
    if (event.type === "node_started") latestStartByNodeId.set(event.nodeId, event);
  }

  return order.map((nodeId) => {
    const title = titleByNodeId.get(nodeId) ?? nodeId;
    const latest = latestByNodeId.get(nodeId);
    if (!latest) return { nodeId, title, status: "queued", detail: "Queued" };
    const status = WORKFLOW_EVENT_STATUS[latest.type];
    const item: WorkflowRunProgressItem = { nodeId, title, status };
    const detail = workflowEventDefaultDetail(latest, status);
    if (detail) item.detail = detail;
    if (status === "running" || status === "paused") {
      const taskId = latest.taskId ?? latestStartByNodeId.get(nodeId)?.taskId;
      if (taskId) item.taskId = taskId;
    }
    return item;
  });
}

export function truncateWorkflowContext(content: string, limit = 2400): string {
  const normalized = content.replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}\n\n[truncated]`;
}

/**
 * Storage plan relative to the workflow's own working directory. Each workflow
 * runs in a dedicated dir, so memory/outputs live flat inside it rather than
 * being namespaced by workflow id. `workflowDir` (when the workflow has a
 * dedicated dir) makes these relative paths; a legacy nested layout is used only
 * as a fallback for workflows without their own dir.
 */
export function workflowStoragePlanFor(workflowId: string, hasDedicatedDir = true): WorkflowStoragePlan {
  if (hasDedicatedDir) {
    return { memoryPath: "memory.md", outputDir: "outputs" };
  }
  const safeWorkflowId = workflowId.replace(/[^a-zA-Z0-9_-]/g, "_") || "workflow";
  const baseDir = `${WORKFLOW_STORAGE_ROOT}/${safeWorkflowId}`;
  return {
    memoryPath: `${baseDir}/memory.md`,
    outputDir: `${baseDir}/outputs`,
  };
}

/** Default dedicated working directory (relative to a base) for a workflow. */
export function defaultWorkflowWorkDirSuffix(workflowId: string): string {
  const safeWorkflowId = workflowId.replace(/[^a-zA-Z0-9_-]/g, "_") || "workflow";
  return `${WORKFLOW_STORAGE_ROOT}/${safeWorkflowId}`;
}

export function workflowStoragePlanDocument(plan: WorkflowStoragePlan): string {
  return [
    "# Workflow Storage Plan",
    "",
    `- Shared memory file: ${plan.memoryPath}`,
    `- Output document directory: ${plan.outputDir}`,
    "",
    "All agent nodes should treat the Workflow Context in the app as the source of shared memory.",
    "If an agent creates user-facing documents, write them under the output document directory and report the exact relative file path.",
  ].join("\n");
}

function extractWorkflowSection(content: string, headings: string[]): string | undefined {
  const normalizedHeadings = headings.map((heading) => heading.toLowerCase());
  const lines = content.split(/\r?\n/);
  let collecting = false;
  const collected: string[] = [];
  for (const line of lines) {
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const heading = headingMatch[1]!.trim().toLowerCase().replace(/[:：]$/, "");
      if (collecting) break;
      if (normalizedHeadings.some((item) => heading.includes(item))) {
        collecting = true;
        continue;
      }
    }
    if (collecting) collected.push(line);
  }
  const section = collected.join("\n").trim();
  return section ? section : undefined;
}

function extractWorkflowHandoffSection(content: string): string | undefined {
  return extractWorkflowSection(content, ["handoff", "summary", "key context", "context"]);
}

function workflowStringField(content: string, field: string): string | undefined {
  const match = content.match(new RegExp(`${field}\\s*:\\s*["'\`]([\\s\\S]*?)["'\`]\\s*,?`, "i"));
  return match?.[1]?.trim();
}

export function workflowArtifactSummary(artifact: string): string {
  const report = extractWorkflowSection(artifact, ["work completion report", "completion report"]);
  const handoff = extractWorkflowSection(artifact, ["handoff"]);
  if (report && handoff) {
    return truncateWorkflowContext(["### Work Completion Report", report, "", "### Handoff", handoff].join("\n"));
  }
  return truncateWorkflowContext(report ?? extractWorkflowHandoffSection(artifact) ?? artifact);
}

const WORKFLOW_URL_REGEX = /\bhttps?:\/\/[^\s`)<>"']+/g;
const WORKFLOW_PATH_REGEX = /[A-Za-z0-9_.\-/]*\/[A-Za-z0-9_.\-/]*\.[A-Za-z0-9]{1,6}\b/g;

/**
 * Extract structured artifact references (files and URLs) a node produced from its
 * raw Markdown output. These are the primary hand-off channel between nodes: a
 * downstream agent can open the actual file/link rather than relying only on the
 * prose summary. See src/main/WORKFLOW-RUNTIME.md.
 */
export function extractWorkflowArtifactRefs(artifact: string): WorkflowArtifactReference[] {
  const refs: WorkflowArtifactReference[] = [];
  const seen = new Set<string>();

  const remainder = artifact.replace(WORKFLOW_URL_REGEX, " ");
  for (const raw of remainder.match(WORKFLOW_PATH_REGEX) ?? []) {
    const path = raw.replace(/^[`'"]+|[`'"]+$/g, "").replace(/[.,;]+$/, "");
    if (!path.includes("/")) continue;
    const key = `file:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind: "file", title: path.split("/").pop() || path, path });
  }

  for (const raw of artifact.match(WORKFLOW_URL_REGEX) ?? []) {
    const url = raw.replace(/[.,;)]+$/, "");
    const key = `url:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ kind: "url", title: url, url });
  }

  return refs;
}

export function workflowContextDocumentFromArtifacts(artifacts: Array<{ nodeId: string; title: string; summary: string }>): string {
  if (artifacts.length === 0) return "";
  return [
    "# Workflow Context",
    "",
    ...artifacts.flatMap((artifact) => [
      `## ${artifact.title} (${artifact.nodeId})`,
      artifact.summary.trim() || "No handoff summary.",
      "",
    ]),
  ].join("\n").trim();
}

export function workflowNodeRunPrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  upstreamArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument: string,
  storagePlan?: WorkflowStoragePlan,
): string {
  const upstreamSection =
    upstreamArtifacts.length > 0
      ? upstreamArtifacts.map((item) => `## ${item.node.title}\n${item.artifact}`).join("\n\n")
      : "No upstream agent artifacts yet.";
  const upstreamRefs: WorkflowArtifactReference[] = [];
  const seenRefs = new Set<string>();
  for (const item of upstreamArtifacts) {
    for (const ref of extractWorkflowArtifactRefs(item.artifact)) {
      const key = ref.kind === "file" ? `file:${ref.path}` : `url:${ref.url}`;
      if (seenRefs.has(key)) continue;
      seenRefs.add(key);
      upstreamRefs.push(ref);
    }
  }
  const referencesSection =
    upstreamRefs.length > 0
      ? upstreamRefs.map((ref) => `- ${ref.kind === "file" ? ref.path : ref.url}`).join("\n")
      : "No file or link references from upstream.";
  const contextSection = contextDocument.trim() || "No workflow context document yet.";
  return [
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    "",
    `Current node: ${node.title}`,
    "",
    "Node instructions:",
    node.prompt || "Execute this workflow node.",
    "",
    "Use this workflow context document first:",
    contextSection,
    "",
    ...(storagePlan
      ? [
          "Workflow storage plan:",
          workflowStoragePlanDocument(storagePlan),
          "",
        ]
      : []),
    "Upstream agent artifacts:",
    upstreamSection,
    "",
    "Upstream artifact references (open these files/links directly for authoritative detail):",
    referencesSection,
    "",
    "Return a concise Markdown artifact with these sections:",
    "## Work Completion Report",
    "- What you did",
    "- Concrete findings or outputs",
    "- Files, commands, or evidence when relevant",
    "",
    "## Handoff",
    "- What downstream agents need to know",
    "- Any unresolved risks or follow-up work",
    "",
    "This report will be appended to the shared Workflow Context document, so make it useful as one-way handoff context.",
    "",
    "If you genuinely cannot proceed safely without a human decision (ambiguous requirements, a risky or irreversible action, or a choice only a person should make), do not guess. Instead output a single line `workflowGate.ask(\"<your concrete question>\")` and stop. A human will answer and you will be resumed with their decision in the workflow context.",
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
    "Evaluate the node output strictly but pragmatically.",
    "",
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    "",
    `Node: ${node.title}`,
    "Node instructions:",
    node.prompt || "Execute this workflow node.",
    "",
    "Shared Workflow Context document:",
    contextDocument.trim() || "No workflow context document yet.",
    "",
    `Attempt: ${attempt}/${maxAttempts}`,
    "",
    "Agent artifact:",
    artifact.trim() || "No artifact returned.",
    "",
    "Decide whether this node is complete enough for downstream workflow execution.",
    "Return only a TypeScript-like call in this exact shape:",
    "",
    "workflowEvaluation.submit({",
    "  complete: true | false,",
    '  reason: "short reason",',
    '  retryPrompt: "specific retry instruction if complete is false, otherwise empty string"',
    "})",
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
      ? nodeArtifacts.map((item) => `## ${item.node.title}\n${item.artifact}`).join("\n\n")
      : "No node artifacts were produced.";
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
          workflowStoragePlanDocument(storagePlan),
          "",
        ]
      : []),
    "Progress:",
    progress.map((item) => `- ${item.title}: ${item.status}${item.detail ? ` (${item.detail})` : ""}`).join("\n") || "- No progress items",
    "",
    "Node artifacts:",
    artifactSection,
    "",
    "Write a Markdown Final User Report with:",
    "- Completed work",
    "- Key outputs and evidence",
    "- Remaining risks or recommended next steps",
    "",
    "Review the full workflow once for the user. Check whether the node outputs collectively satisfy the objective, whether evidence is concrete, and what risks or gaps remain.",
    "Do not rerun the workflow nodes. Do not invent work that is not supported by the node outputs or context.",
  ].join("\n");
}

export function parseWorkflowJudgeResult(content: string): WorkflowJudgeResult | undefined {
  if (!content.includes("workflowEvaluation.submit")) return undefined;
  const completeMatch = content.match(/complete\s*:\s*(true|false)/i);
  if (!completeMatch) return undefined;
  const complete = completeMatch[1]?.toLowerCase() === "true";
  return {
    complete,
    reason: workflowStringField(content, "reason") || (complete ? "Judge approved the node output." : "Judge requested a retry."),
    retryPrompt: workflowStringField(content, "retryPrompt") || "",
  };
}

export function workflowProgressAfterFailure(progress: WorkflowRunProgressItem[], errorMessage: string): WorkflowRunProgressItem[] {
  if (progress.some((item) => item.status === "failed")) return progress;
  if (progress.length === 0) {
    return [{ nodeId: "__workflow__", title: "Workflow", status: "failed", detail: errorMessage }];
  }
  const index = progress.findIndex((item) => item.status === "running" || item.status === "queued");
  const targetIndex = index >= 0 ? index : progress.length - 1;
  return progress.map((item, itemIndex) => (itemIndex === targetIndex ? { ...item, status: "failed", detail: errorMessage } : item));
}

export function taskArtifact(task: TaskRun): string {
  const assistantMessage = [...task.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
  if (assistantMessage) return assistantMessage.content.trim();
  const errorMessage = [...task.messages].reverse().find((message) => message.role === "error" && message.content.trim());
  if (errorMessage) return errorMessage.content.trim();
  return `${task.title} completed without assistant output.`;
}
