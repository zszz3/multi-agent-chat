import type {
  AnswerWorkflowGateRequest,
  AppSnapshot,
  FinishWorkflowRunRequest,
  PauseWorkflowNodeRequest,
  ResolveWorkflowV2InterventionRequest,
  RunTaskRequest,
  RunWorkflowGraphRequest,
  StartWorkflowNodeRequest,
  TaskRun,
  WorkflowDraftState,
  WorkflowEvent,
  WorkflowGraphNode,
  WorkflowOperationResult,
  RuntimeConversation,
  WorkflowV2InterventionAction,
  WorkflowRunState,
  WorkflowRunProgressItem,
} from "../../shared/types";
import type {
  WorkflowV2ContextBudget,
  WorkflowV2LLMNode,
  WorkflowV2ModelProfile,
  WorkflowV2ScriptNode,
} from "../../shared/workflow-v2/definition";
import type { WorkflowV2WorkerOutput, WorkflowV2WorkProposal } from "../../shared/workflow-v2/packets";
import type {
  WorkflowV2Plan,
  WorkflowV2ResultPacket,
  WorkflowV2TaskPacket,
} from "../../shared/workflow-v2/planning";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_MODEL_ID } from "../../shared/models";
import { validateWorkflowGraph, workflowGraphExecutionLevels } from "../../shared/workflow-graph";
import {
  isNonNegativeSafeInteger,
  isValidWorkflowV2AcceptanceCriteria,
  isValidWorkflowV2BudgetEnvelope,
  isValidWorkflowV2ContextBudget,
  isValidWorkflowV2CostBudget,
  isWorkflowV2ModelProfile,
  validateWorkflowV2Definition,
} from "../../shared/workflow-v2/validation";
import {
  createWorkflowV2TaskPacket,
  deriveWorkflowV2DirectUpstreamDigest,
} from "../../shared/workflow-v2/planning";
import {
  WORKFLOW_FINAL_REVIEW_NODE_ID,
  WORKFLOW_NODE_MAX_ATTEMPTS,
  WORKFLOW_TASK_POLL_MS,
  WORKFLOW_TASK_TIMEOUT_MS,
  extractWorkflowArtifactRefs,
  parseWorkflowGateRequest,
  parseWorkflowJudgeResult,
  taskArtifact,
  truncateWorkflowContext,
  workflowArtifactSummary,
  workflowContextDocumentFromArtifacts,
  workflowFinalReviewPrompt,
  workflowJudgePrompt,
  workflowNodeRunPrompt,
  workflowProgressAfterFailure,
  workflowStoragePlanDocument,
  workflowStoragePlanFor,
  type WorkflowJudgeResult,
} from "../../shared/workflow-run";
import { executeWorkflowV2Plan } from "./v2/workflow-v2-executor";
import type {
  WorkflowV2ExecutionLeaseState,
  WorkflowV2ProgressReport,
} from "../../shared/workflow-v2/supervision";
import type { WorkflowV2ReviewerInput, WorkflowV2ReviewerResponse } from "../../shared/workflow-v2/review";
import { isWorkflowV2InterventionAction } from "../../shared/workflow-v2/review";
import {
  createWorkflowV2ExecutionLease,
  inspectWorkflowV2ExecutionLease,
  recordWorkflowV2LeaseActivity,
  resolveWorkflowV2SupervisorDecision,
} from "./v2/workflow-v2-supervisor";
import {
  parseWorkflowV2ProgressReport,
  parseWorkflowV2SupervisorDecision,
  workflowV2ContinueAfterProbePrompt,
  workflowV2ProgressProbePrompt,
  workflowV2SupervisorDecisionPrompt,
} from "./v2/workflow-v2-supervision-prompts";
import { WorkflowV2SupervisionSignal } from "./v2/workflow-v2-supervision-signal";
import {
  parseWorkflowV2ReviewerResponse,
  workflowV2ReviewerPrompt,
} from "./v2/workflow-v2-reviewer";
import {
  WORKFLOW_V2_STORAGE_SCHEMA_VERSION,
  type WorkflowV2CacheEntryMetadata,
  type WorkflowV2DurableEvent,
  type WorkflowV2DurableNodeControlState,
  type WorkflowV2PersistedRunState,
  type WorkflowV2NodeCacheFingerprint,
} from "../../shared/workflow-v2/storage";
import type { ExecuteWorkflowV2Checkpoint } from "./v2/workflow-v2-executor";
import {
  buildWorkflowV2FinalReport,
  buildWorkflowV2RecoveryPlan,
  createWorkflowV2NodeCacheFingerprint,
  materializeWorkflowV2Recovery,
} from "./v2/workflow-v2-recovery";
import { transitionWorkflowV2NodeState } from "./v2/workflow-v2-scheduler";

export interface WorkflowRunStateUpdate {
  workflowId: string;
  runId: string;
  status?: "running";
  progress?: WorkflowRunProgressItem[];
  appendEvents?: WorkflowEvent[];
  contextDocument?: string;
  finalReport?: string;
  lastError?: string;
}

export interface ExecuteWorkflowV2ScriptRequest {
  node: WorkflowV2ScriptNode;
  workDir: string;
  sandboxMode: WorkflowV2ScriptNode["sandboxMode"];
  upstreamOutputs: readonly WorkflowV2ResultPacket[];
  signal: AbortSignal;
  timeoutMs: number;
}

interface WorkflowRuntimeDependencies {
  snapshot: () => AppSnapshot;
  startWorkflowRun: (input: { workflowId: string; contextDocument?: string }) => WorkflowOperationResult;
  finishWorkflowRun: (input: FinishWorkflowRunRequest) => WorkflowOperationResult;
  updateWorkflowRunState: (input: WorkflowRunStateUpdate) => void;
  runTask: (input: RunTaskRequest) => Promise<AppSnapshot>;
  stopTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string, options?: { preserveRuntimeConversation?: boolean }) => Promise<AppSnapshot>;
  executeWorkflowV2Script: (input: ExecuteWorkflowV2ScriptRequest) => Promise<WorkflowV2WorkerOutput>;
  createWorkflowV2Store?: () => WorkflowV2StorePort | undefined;
}

export interface WorkflowV2StorePort {
  persistRunState: (state: WorkflowV2PersistedRunState) => Promise<void>;
  appendEvents: (input: {
    workflowId: string;
    runId: string;
    events: readonly WorkflowV2DurableEvent[];
  }) => Promise<void>;
  persistCacheEntry?: (entry: WorkflowV2CacheEntryMetadata) => Promise<void>;
  readRunState?: (workflowId: string, runId: string) => Promise<WorkflowV2PersistedRunState | undefined>;
  readCacheEntry?: (
    workflowId: string,
    graphVersion: number,
    nodeId: string,
  ) => Promise<WorkflowV2CacheEntryMetadata | undefined>;
}

const WORKFLOW_V2_MAX_PARALLEL_NODES = 4;
const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configuredAgentModelId(workflow: WorkflowDraftState, snapshot: AppSnapshot): string {
  const agent = snapshot.configuredAgents.find((item) => item.id === workflow.configuredAgentId);
  return workflow.modelId || agent?.modelId || DEFAULT_MODEL_ID;
}

function workflowV2ExecutionEnvironment(input: {
  node: WorkflowV2LLMNode | WorkflowV2ScriptNode;
  workDir: string;
  configuredAgentId: string;
  modelId: string;
}): Record<string, unknown> {
  return {
    workDir: input.workDir,
    configuredAgentId: input.configuredAgentId,
    modelId: input.modelId,
    execModel: input.node.execModel,
    ...(input.node.execModel === "script"
      ? { sandboxMode: input.node.sandboxMode, language: input.node.script.language }
      : {}),
  };
}

function workflowV2ReviewerPolicy(
  node: WorkflowV2LLMNode | WorkflowV2ScriptNode,
  forceIndependentReview = false,
): Record<string, unknown> {
  return {
    judgeDimensions: node.execModel === "llm" ? node.judgeDimensions ?? [] : [],
    requiresIndependentReview: node.execModel === "llm"
      && node.role !== "reviewer"
      && (forceIndependentReview || (node.judgeDimensions?.length ?? 0) > 0),
    forceIndependentReview,
  };
}

function workflowV2InterventionResolutionReason(
  action: WorkflowV2InterventionAction,
  nodeTitle: string,
  reason: string | undefined,
): string {
  if (reason?.trim()) return reason.trim();
  if (action === "continue") return `Continue ${nodeTitle} from durable recovery state.`;
  if (action === "skip") return `Skip ${nodeTitle} and continue eligible downstream work.`;
  if (action === "escalate") return `Escalate ${nodeTitle} to expert execution with mandatory independent review.`;
  if (action === "replan") return `Keep the run stopped and create a new graph revision for ${nodeTitle}.`;
  return `Rerun ${nodeTitle} with mandatory independent review.`;
}

function workflowV2PlanValidationError(workflow: WorkflowDraftState, plan: WorkflowV2Plan): string | undefined {
  if (!isRecord(plan)) return "Workflow V2 frozen plan must be an object.";
  if (typeof plan.approvedBy !== "string" || !plan.approvedBy.trim()) {
    return "Workflow V2 frozen plan requires a non-empty approvedBy.";
  }
  if (!isNonNegativeSafeInteger(plan.frozenAt)) {
    return "Workflow V2 frozen plan requires a finite non-negative frozenAt timestamp.";
  }
  if (typeof plan.objective !== "string" || !plan.objective.trim()) {
    return "Workflow V2 frozen plan requires a non-empty objective.";
  }
  if (!isRecord(plan.definition) || !Array.isArray(plan.definition.nodes) || !Array.isArray(plan.definition.edges)) {
    return "Workflow V2 frozen plan definition is malformed.";
  }
  if (plan.workflowId !== workflow.workflowId) {
    return `Workflow V2 plan ${plan.workflowId} does not belong to workflow ${workflow.workflowId}.`;
  }
  if (plan.definition.workflowId !== workflow.workflowId) {
    return `Workflow V2 definition ${plan.definition.workflowId} does not belong to workflow ${workflow.workflowId}.`;
  }
  if (plan.graphVersion !== plan.definition.graphVersion) {
    return `Workflow V2 plan graph version ${plan.graphVersion} does not match definition version ${plan.definition.graphVersion}.`;
  }
  const validation = (() => {
    try {
      return validateWorkflowV2Definition(plan.definition);
    } catch {
      return undefined;
    }
  })();
  if (!validation) return "Workflow V2 frozen plan definition is malformed.";
  if (!validation.valid) return validation.errors.join(" ");

  if (!isValidWorkflowV2AcceptanceCriteria(plan.acceptanceCriteria)) {
    return "Workflow V2 frozen plan acceptance criteria are malformed.";
  }
  if (!isWorkflowV2Budget(plan.budget)) return "Workflow V2 frozen plan budget is malformed.";
  if (!isWorkflowV2RoleDefaults(plan.roleDefaults)) return "Workflow V2 frozen plan role defaults are malformed.";
  if (!Array.isArray(plan.nodes)) return "Workflow V2 frozen plan nodes are malformed.";

  const definitionNodeById = new Map(plan.definition.nodes.map((node) => [node.id, node]));
  const planNodeIds = new Set<string>();
  if (plan.nodes.length !== definitionNodeById.size) return "Workflow V2 plan nodes do not match the frozen definition.";
  for (const planNode of plan.nodes) {
    if (!isRecord(planNode) || typeof planNode.nodeId !== "string") {
      return "Workflow V2 frozen plan nodes are malformed.";
    }
    const definitionNode = definitionNodeById.get(planNode.nodeId);
    if (!definitionNode || planNodeIds.has(planNode.nodeId)) {
      return "Workflow V2 plan nodes do not match the frozen definition.";
    }
    planNodeIds.add(planNode.nodeId);
  }
  if (!isDeepStrictEqual(plan.nodes.map((node) => node.nodeId), validation.topologicalNodeIds)) {
    return "Workflow V2 plan node order does not match the frozen definition topological order.";
  }

  for (const planNode of plan.nodes) {
    const definitionNode = definitionNodeById.get(planNode.nodeId)!;
    try {
      const expectedTaskPacket = createWorkflowV2TaskPacket({
        node: definitionNode,
        workflowObjective: plan.objective,
        acceptanceCriteria: plan.acceptanceCriteria,
        roleRoutes: plan.roleDefaults,
        defaultContextBudget: plan.budget.context,
        upstreamDigest: deriveWorkflowV2DirectUpstreamDigest(plan.definition, definitionNode.id),
        ...(plan.budget.cost ? { costBudget: plan.budget.cost } : {}),
      });
      if (
        planNode.title !== definitionNode.title
        || planNode.execModel !== definitionNode.execModel
        || planNode.role !== expectedTaskPacket.role
        || planNode.modelProfile !== expectedTaskPacket.modelProfile
        || !isDeepStrictEqual(planNode.acceptanceCriteria, expectedTaskPacket.acceptanceCriteria)
        || !isDeepStrictEqual(planNode.budget, expectedTaskPacket.budget)
        || !isDeepStrictEqual(planNode.taskPacket, expectedTaskPacket)
      ) {
        return `Workflow V2 plan node ${planNode.nodeId} does not match the frozen definition and task packet.`;
      }
    } catch {
      return `Workflow V2 plan node ${planNode.nodeId} does not match the frozen definition and task packet.`;
    }
  }
  return undefined;
}

function isWorkflowV2Budget(value: unknown): value is WorkflowV2Plan["budget"] {
  return isValidWorkflowV2BudgetEnvelope(value);
}

function isWorkflowV2RoleDefaults(value: unknown): value is WorkflowV2Plan["roleDefaults"] {
  if (!isRecord(value)) return false;
  const roles = ["orchestrator", "executor", "reviewer"] as const;
  if (Object.keys(value).some((role) => !roles.includes(role as typeof roles[number]))) return false;
  return roles.every((role) => {
    const route = value[role];
    return isRecord(route) && route.role === role && isWorkflowV2ModelProfile(route.modelProfile);
  });
}

export function workflowV2LlmNodePrompt(input: {
  node: WorkflowV2LLMNode;
  taskPacket: WorkflowV2TaskPacket;
  upstreamOutputs: readonly WorkflowV2ResultPacket[];
  baseWorkflowContextDocument: string;
  storagePlanDocument: string;
}): string {
  if (!isValidWorkflowV2ContextBudget(input.taskPacket.budget.context)) {
    throw new Error(`Workflow V2 LLM node ${input.node.id} received an invalid context budget.`);
  }
  if (input.taskPacket.budget.cost !== undefined && !isValidWorkflowV2CostBudget(input.taskPacket.budget.cost)) {
    throw new Error(`Workflow V2 LLM node ${input.node.id} received an invalid cost budget.`);
  }
  const taskPacketDocument = JSON.stringify(input.taskPacket, null, 2);
  const dynamicContextSource = [
    "Actual direct upstream worker outputs:",
    JSON.stringify({ upstreamOutputs: input.upstreamOutputs }, null, 2),
    "",
    "Base workflow context:",
    input.baseWorkflowContextDocument.trim() || "No base workflow context.",
  ].join("\n");
  const contextCharacterBudget = input.taskPacket.budget.context.maxContextTokens * 4;
  if (taskPacketDocument.length > contextCharacterBudget) {
    throw new Error(
      `Workflow V2 LLM node ${input.node.id} fixed context exceeds maxContextTokens approximate budget; this is not an exact tokenizer count.`,
    );
  }
  const dynamicCharacterBudget = contextCharacterBudget - taskPacketDocument.length;
  const truncatedDynamicContext = dynamicContextSource.slice(0, dynamicCharacterBudget);
  const buildPrompt = (dynamicContext: string): string => [
    "Execute exactly one node from a frozen Workflow V2 plan.",
    "Do not infer graph navigation, run a judge, request a retry, or perform final review.",
    "",
    "Workflow V2 task packet:",
    taskPacketDocument,
    "",
    "Node prompt:",
    input.node.prompt,
    "",
    `Dynamic execution context (approximate character budget: ${dynamicCharacterBudget}; this is not an exact tokenizer count):`,
    dynamicContext || "[dynamic context omitted by budget]",
    "",
    "Workflow storage plan:",
    input.storagePlanDocument,
    "",
    "Return only one structured JSON worker-output packet with this shape:",
    JSON.stringify({
      nodeId: input.node.id,
      summary: "concise summary",
      outputs: Object.fromEntries(input.node.outputFields.map((field) => [field.key, "value"])),
      evidence: ["optional evidence"],
      risks: ["optional risk"],
      nextStepSuggestions: ["optional suggestion"],
      proposals: [],
    }, null, 2),
    "Worker proposals are data for the leader only; they must not mutate downstream behavior.",
    // RunTask currently has no completion-token option. maxCompletionTokens remains visible in the task packet,
    // but this runtime does not claim to enforce it.
  ].join("\n");
  // Preserve the existing full-prompt fail-fast before applying a fallback policy that may itself reject overflow.
  const promptForBudgetCheck = buildPrompt(truncatedDynamicContext);
  const maxPromptTokens = input.taskPacket.budget.cost?.maxPromptTokens;
  if (maxPromptTokens !== undefined && promptForBudgetCheck.length > maxPromptTokens * 4) {
    throw new Error(
      `Workflow V2 LLM node ${input.node.id} prompt budget exceeded maxPromptTokens; this is an approximate character check, not an exact tokenizer count.`,
    );
  }
  const dynamicContext = selectWorkflowV2DynamicContext({
    nodeId: input.node.id,
    source: dynamicContextSource,
    characterBudget: dynamicCharacterBudget,
    fallbackPolicy: input.taskPacket.budget.context.summaryFallbackPolicy,
  });
  return dynamicContext === truncatedDynamicContext ? promptForBudgetCheck : buildPrompt(dynamicContext);
}

function selectWorkflowV2DynamicContext(input: {
  nodeId: string;
  source: string;
  characterBudget: number;
  fallbackPolicy: WorkflowV2ContextBudget["summaryFallbackPolicy"];
}): string {
  if (input.source.length <= input.characterBudget) return input.source;
  if (input.fallbackPolicy === "summarize") {
    throw new Error(`Workflow V2 LLM node ${input.nodeId} summarize fallback is unavailable.`);
  }
  if (input.fallbackPolicy === "ask_human") {
    throw new Error(`Workflow V2 LLM node ${input.nodeId} ask_human fallback requires Phase 04 human intervention.`);
  }
  return input.source.slice(0, input.characterBudget);
}

export function parseWorkflowV2WorkerArtifact(node: WorkflowV2LLMNode, artifact: string): WorkflowV2WorkerOutput {
  const normalized = artifact.trim();
  if (!normalized) throw new Error(`Workflow V2 LLM node ${node.id} returned an empty artifact.`);
  const jsonCandidate = unwrapJsonFence(normalized);

  try {
    const parsed: unknown = JSON.parse(jsonCandidate);
    return parseStructuredWorkflowV2WorkerOutput(node.id, parsed);
  } catch (error) {
    if (jsonCandidate.startsWith("{") || jsonCandidate.startsWith("[")) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Workflow V2 LLM node ${node.id} returned an invalid structured worker-output packet: ${message}`);
    }
  }

  if (node.outputFields.length !== 1) {
    throw new Error(`Workflow V2 LLM node ${node.id} must return structured JSON for multiple output fields.`);
  }
  const outputField = node.outputFields[0]!;
  return {
    nodeId: node.id,
    summary: truncateWorkflowContext(normalized, 240),
    outputs: { [outputField.key]: normalized },
    proposals: [],
  };
}

function unwrapJsonFence(content: string): string {
  const fenced = content.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  return fenced?.[1]?.trim() ?? content;
}

function parseStructuredWorkflowV2WorkerOutput(expectedNodeId: string, value: unknown): WorkflowV2WorkerOutput {
  if (!isRecord(value)) throw new Error("the packet must be a JSON object");
  if (typeof value.nodeId !== "string" || !value.nodeId.trim()) throw new Error("nodeId must be a non-empty string");
  if (typeof value.summary !== "string" || !value.summary.trim()) throw new Error("summary must be a non-empty string");
  if (!isRecord(value.outputs)) throw new Error("outputs must be a JSON object");
  if (!Array.isArray(value.proposals) || !value.proposals.every(isWorkflowV2WorkProposal)) {
    throw new Error("proposals must be an array of valid worker proposals");
  }
  if (value.nodeId !== expectedNodeId) {
    throw new Error(`nodeId ${value.nodeId} does not match expected node ${expectedNodeId}`);
  }
  const evidence = parseOptionalStringArray(value.evidence, "evidence");
  const risks = parseOptionalStringArray(value.risks, "risks");
  const nextStepSuggestions = parseOptionalStringArray(value.nextStepSuggestions, "nextStepSuggestions");

  return {
    nodeId: value.nodeId,
    summary: value.summary,
    outputs: value.outputs,
    ...(evidence !== undefined ? { evidence } : {}),
    ...(risks !== undefined ? { risks } : {}),
    ...(nextStepSuggestions !== undefined ? { nextStepSuggestions } : {}),
    proposals: value.proposals as WorkflowV2WorkProposal[],
  };
}

function parseOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${field} must be an array of strings`);
  }
  return value;
}

function isWorkflowV2WorkProposal(value: unknown): value is WorkflowV2WorkProposal {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.reason !== "string") return false;
  if (value.kind === "continue") {
    return value.targetNodeIds === undefined || (Array.isArray(value.targetNodeIds) && value.targetNodeIds.every((item) => typeof item === "string"));
  }
  if (value.kind === "retry") return value.targetNodeId === undefined || typeof value.targetNodeId === "string";
  return value.kind === "escalate" || value.kind === "graph-revision";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Resolve the agent + model an individual agent node runs with. A node may
 * override the workflow-level default via `node.configuredAgentId` / `node.modelId`.
 * When a node overrides only the agent, it uses that agent's own default model.
 */
export function resolveWorkflowNodeAgent(
  node: { configuredAgentId?: string | undefined; modelId?: string | undefined },
  workflowDefaults: { configuredAgentId: string; modelId: string },
  configuredAgents: Array<{ id: string; modelId: string }>,
): { configuredAgentId: string; modelId: string } {
  const configuredAgentId = node.configuredAgentId || workflowDefaults.configuredAgentId;
  const agent = configuredAgents.find((item) => item.id === configuredAgentId);
  const modelId = node.modelId
    ? node.modelId
    : node.configuredAgentId
      ? agent?.modelId || DEFAULT_MODEL_ID
      : workflowDefaults.modelId || agent?.modelId || DEFAULT_MODEL_ID;
  return { configuredAgentId, modelId };
}

class WorkflowNodePausedError extends Error {
  constructor(readonly nodeId: string) {
    super(`Workflow node ${nodeId} is paused.`);
  }
}

interface ActiveWorkflowRun {
  workflowId: string;
  runId: string;
  pausedNodeIds: Set<string>;
  pausedTaskIds: Set<string>;
  gatedNodeIds: Set<string>;
  taskIdByNodeId: Map<string, string>;
  manualPauseReasonByNodeId?: Map<string, string>;
  abortControllerByNodeId?: Map<string, AbortController>;
}

interface WorkflowV2RecoveryOverride {
  modelProfile?: WorkflowV2ModelProfile;
  forceIndependentReview: boolean;
  instruction: string;
}

export class WorkflowRuntime {
  private activeRuns = new Map<string, ActiveWorkflowRun>();

  constructor(private readonly deps: WorkflowRuntimeDependencies) {}

  runWorkflowGraph(input: RunWorkflowGraphRequest): WorkflowOperationResult {
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    const hasRunningRun = snapshot.workflowStore.runs.some(
      (run) => run.workflowId === workflow.workflowId && run.status === "running",
    );
    if (workflow.status === "running" || hasRunningRun) {
      return { ok: false, workflowId: workflow.workflowId, error: "Workflow is already running." };
    }

    if (workflow.workflowV2Plan) {
      const planError = workflowV2PlanValidationError(workflow, workflow.workflowV2Plan);
      if (planError) return { ok: false, workflowId: workflow.workflowId, error: planError };

      const storagePlan = workflowStoragePlanFor(workflow.workflowId);
      const baseWorkflowContextDocument = [input.contextDocument ?? workflow.contextDocument, workflowStoragePlanDocument(storagePlan)]
        .map((item) => item.trim())
        .filter(Boolean)
        .join("\n\n");
      const started = this.deps.startWorkflowRun({
        workflowId: workflow.workflowId,
        contextDocument: baseWorkflowContextDocument,
      });
      if (!started.ok || !started.runId) return started;

      this.activeRuns.set(started.runId, {
        workflowId: workflow.workflowId,
        runId: started.runId,
        pausedNodeIds: new Set(),
        pausedTaskIds: new Set(),
        gatedNodeIds: new Set(),
        taskIdByNodeId: new Map(),
        manualPauseReasonByNodeId: new Map(),
        abortControllerByNodeId: new Map(),
      });
      void this.executeWorkflowV2Run({
        workflow,
        plan: workflow.workflowV2Plan,
        runId: started.runId,
        baseWorkflowContextDocument,
        storagePlanDocument: workflowStoragePlanDocument(storagePlan),
      }).finally(() => {
        this.activeRuns.delete(started.runId!);
      });
      return started;
    }

    const validation = validateWorkflowGraph(workflow.graph);
    if (!validation.valid) {
      return {
        ok: false,
        workflowId: workflow.workflowId,
        error: validation.errors.join(" "),
        validation,
      };
    }
    const executionLevels = workflowGraphExecutionLevels(workflow.graph);
    if (executionLevels.length === 0) {
      return {
        ok: false,
        workflowId: workflow.workflowId,
        error: "Workflow graph has no executable agent nodes.",
        validation,
      };
    }

    const storagePlan = workflowStoragePlanFor(workflow.workflowId);
    const baseWorkflowContextDocument = [input.contextDocument ?? workflow.contextDocument, workflowStoragePlanDocument(storagePlan)]
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n\n");
    const started = this.deps.startWorkflowRun({
      workflowId: workflow.workflowId,
      contextDocument: baseWorkflowContextDocument,
    });
    if (!started.ok || !started.runId) return started;

    this.activeRuns.set(started.runId, {
      workflowId: workflow.workflowId,
      runId: started.runId,
      pausedNodeIds: new Set(),
      pausedTaskIds: new Set(),
      gatedNodeIds: new Set(),
      taskIdByNodeId: new Map(),
    });
    void this.executeRun({
      workflow,
      runId: started.runId,
      executionLevels,
      baseWorkflowContextDocument,
    }).finally(() => {
      const activeRun = this.activeRuns.get(started.runId!);
      if (!activeRun || (activeRun.pausedNodeIds.size === 0 && activeRun.gatedNodeIds.size === 0)) this.activeRuns.delete(started.runId!);
    });
    return started;
  }

  isRunning(runId: string): boolean {
    return this.activeRuns.has(runId);
  }

  async pauseWorkflowNode(input: PauseWorkflowNodeRequest): Promise<WorkflowOperationResult> {
    const snapshot = this.deps.snapshot();
    const run = snapshot.workflowStore.runs.find((item) => item.runId === input.runId && item.workflowId === input.workflowId);
    if (!run) return { ok: false, error: `Workflow run ${input.runId} was not found.` };
    if (run.workflowV2Plan) {
      return this.pauseWorkflowV2Node({ run, nodeId: input.nodeId });
    }
    if (run.status !== "running") return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow run is not running." };
    const progressItem = run.progress.find((item) => item.nodeId === input.nodeId);
    if (!progressItem) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${input.nodeId} was not found in this run.` };
    if (progressItem.status !== "running") {
      return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${progressItem.title} is not running.` };
    }

    const activeRun = this.activeRuns.get(input.runId) ?? {
      workflowId: input.workflowId,
      runId: input.runId,
      pausedNodeIds: new Set<string>(),
      pausedTaskIds: new Set<string>(),
      gatedNodeIds: new Set<string>(),
      taskIdByNodeId: new Map<string, string>(),
    };
    this.activeRuns.set(input.runId, activeRun);
    activeRun.pausedNodeIds.add(input.nodeId);

    const taskId = activeRun.taskIdByNodeId.get(input.nodeId) ?? progressItem.taskId;
    if (taskId) activeRun.pausedTaskIds.add(taskId);
    const nextProgress = run.progress.map((item) =>
      item.nodeId === input.nodeId
        ? {
            ...item,
            status: "paused" as const,
            detail: "Paused",
            ...(taskId ? { taskId } : {}),
          }
        : item,
    );
    this.deps.updateWorkflowRunState({
      workflowId: input.workflowId,
      runId: input.runId,
      status: "running",
      progress: nextProgress,
      appendEvents: [{ type: "node_paused", nodeId: input.nodeId, at: Date.now(), ...(taskId ? { taskId } : {}) }],
      contextDocument: run.contextDocument,
      ...(run.finalReport ? { finalReport: run.finalReport } : {}),
    });

    if (taskId) await this.deps.stopTask(taskId);

    // If nothing is running anymore, the run has effectively stopped: no node will
    // make progress until the user resumes one. End the run cleanly.
    const stillRunning = nextProgress.some((item) => item.status === "running");
    if (!stillRunning) {
      this.deps.finishWorkflowRun({
        workflowId: input.workflowId,
        runId: input.runId,
        status: "stopped",
        progress: nextProgress,
        contextDocument: run.contextDocument,
        ...(run.finalReport ? { finalReport: run.finalReport } : {}),
      });
    }
    return { ok: true, workflowId: input.workflowId, runId: input.runId };
  }

  private async pauseWorkflowV2Node(input: {
    run: WorkflowRunState;
    nodeId: string;
  }): Promise<WorkflowOperationResult> {
    if (input.run.status !== "running") {
      return {
        ok: false,
        workflowId: input.run.workflowId,
        runId: input.run.runId,
        error: "Workflow run is not running.",
      };
    }
    const progressItem = input.run.progress.find((item) => item.nodeId === input.nodeId);
    if (!progressItem) {
      return {
        ok: false,
        workflowId: input.run.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 node ${input.nodeId} was not found in this run.`,
      };
    }
    if (progressItem.status !== "running") {
      return {
        ok: false,
        workflowId: input.run.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 node ${progressItem.title} is not running.`,
      };
    }
    const activeRun = this.activeRuns.get(input.run.runId);
    if (!activeRun) {
      return {
        ok: false,
        workflowId: input.run.workflowId,
        runId: input.run.runId,
        error: "Workflow V2 run is not active in this process.",
      };
    }

    const reason = "Paused by user through the unified Workflow V2 intervention boundary.";
    activeRun.manualPauseReasonByNodeId ??= new Map();
    activeRun.manualPauseReasonByNodeId.set(input.nodeId, reason);
    const taskId = activeRun.taskIdByNodeId.get(input.nodeId) ?? progressItem.taskId;
    if (taskId) await this.deps.stopTask(taskId);
    activeRun.abortControllerByNodeId?.get(input.nodeId)?.abort(new Error(reason));
    return { ok: true, workflowId: input.run.workflowId, runId: input.run.runId };
  }

  async startWorkflowNode(input: StartWorkflowNodeRequest): Promise<WorkflowOperationResult> {
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    const run = snapshot.workflowStore.runs.find((item) => item.runId === input.runId && item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run) return { ok: false, workflowId: input.workflowId, error: `Workflow run ${input.runId} was not found.` };
    if (run.workflowV2Plan) {
      return this.resumeWorkflowV2Node({ workflow, run, nodeId: input.nodeId, action: "continue" });
    }
    if (run.status !== "running" && run.status !== "stopped") {
      return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow run is not resumable." };
    }
    const node = run.graphSnapshot.nodes.find((item) => item.id === input.nodeId && item.kind === "agent");
    if (!node) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${input.nodeId} was not found.` };
    const progressItem = run.progress.find((item) => item.nodeId === input.nodeId);
    if (!progressItem) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${input.nodeId} was not found in this run.` };
    if (progressItem.status === "running") return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${progressItem.title} is already running.` };
    if (progressItem.status === "completed") return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${progressItem.title} is already completed.` };

    const progressByNodeId = new Map(run.progress.map((item) => [item.nodeId, item]));
    const blockedBy = run.graphSnapshot.edges
      .filter((edge) => edge.toNodeId === input.nodeId)
      .map((edge) => run.graphSnapshot.nodes.find((item) => item.id === edge.fromNodeId))
      .filter((upstreamNode): upstreamNode is WorkflowGraphNode => Boolean(upstreamNode && upstreamNode.kind === "agent"))
      .filter((upstreamNode) => progressByNodeId.get(upstreamNode.id)?.status !== "completed");
    if (blockedBy.length > 0) {
      return {
        ok: false,
        workflowId: input.workflowId,
        runId: input.runId,
        error: `Workflow node ${progressItem.title} is blocked by ${blockedBy.map((item) => item.title).join(", ")}.`,
      };
    }

    const activeRun = this.activeRuns.get(input.runId) ?? {
      workflowId: input.workflowId,
      runId: input.runId,
      pausedNodeIds: new Set<string>(),
      pausedTaskIds: new Set<string>(),
      gatedNodeIds: new Set<string>(),
      taskIdByNodeId: new Map<string, string>(),
    };
    this.activeRuns.set(input.runId, activeRun);
    activeRun.pausedNodeIds.delete(input.nodeId);
    activeRun.taskIdByNodeId.delete(input.nodeId);

    const nextProgress = run.progress.map((item) => {
      if (item.nodeId !== input.nodeId) return item;
      const next: WorkflowRunProgressItem = {
        ...item,
        status: "queued",
        detail: "Queued",
      };
      delete next.taskId;
      return next;
    });
    this.deps.updateWorkflowRunState({
      workflowId: input.workflowId,
      runId: input.runId,
      status: "running",
      progress: nextProgress,
      appendEvents: [{ type: "node_ready", nodeId: input.nodeId, at: Date.now() }],
      contextDocument: run.contextDocument,
      ...(run.finalReport ? { finalReport: run.finalReport } : {}),
    });

    const executionLevels = workflowGraphExecutionLevels(run.graphSnapshot);
    void this.executeRun({
      workflow: { ...workflow, graph: run.graphSnapshot },
      runId: input.runId,
      executionLevels,
      baseWorkflowContextDocument: run.contextDocument,
      initialProgress: nextProgress,
    }).finally(() => {
      const currentActiveRun = this.activeRuns.get(input.runId);
      if (!currentActiveRun || (currentActiveRun.pausedNodeIds.size === 0 && currentActiveRun.gatedNodeIds.size === 0)) this.activeRuns.delete(input.runId);
    });
    return { ok: true, workflowId: input.workflowId, runId: input.runId };
  }

  async resolveWorkflowV2Intervention(
    input: ResolveWorkflowV2InterventionRequest,
  ): Promise<WorkflowOperationResult> {
    if (!isWorkflowV2InterventionAction(input.action)) {
      return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow V2 intervention action is invalid." };
    }
    if (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.trim().length > 2_000)) {
      return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow V2 intervention reason is invalid." };
    }
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    const run = snapshot.workflowStore.runs.find((item) => item.runId === input.runId && item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run) return { ok: false, workflowId: input.workflowId, error: `Workflow run ${input.runId} was not found.` };
    if (!run.workflowV2Plan) {
      return {
        ok: false,
        workflowId: input.workflowId,
        runId: input.runId,
        error: "Unified intervention actions are available only for Workflow V2 runs.",
      };
    }
    return this.resumeWorkflowV2Node({
      workflow,
      run,
      nodeId: input.nodeId,
      action: input.action,
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    });
  }

  private async resumeWorkflowV2Node(input: {
    workflow: WorkflowDraftState;
    run: WorkflowRunState;
    nodeId: string;
    action: WorkflowV2InterventionAction;
    reason?: string;
  }): Promise<WorkflowOperationResult> {
    if (input.run.status !== "stopped" && input.run.status !== "failed") {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: "Workflow run is not resumable.",
      };
    }
    if (this.activeRuns.has(input.run.runId)) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: "Workflow run is already active.",
      };
    }
    const store = this.deps.createWorkflowV2Store?.();
    if (!store?.readRunState) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: "Workflow V2 durable state is unavailable.",
      };
    }
    const persisted = await store.readRunState(input.workflow.workflowId, input.run.runId);
    if (!persisted) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: "Workflow V2 durable run state was not found.",
      };
    }
    if (persisted.workflowId !== input.workflow.workflowId || persisted.runId !== input.run.runId) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: "Workflow V2 durable run state identity does not match the requested run.",
      };
    }
    const plan = input.workflow.workflowV2Plan;
    if (!plan) {
      return { ok: false, workflowId: input.workflow.workflowId, runId: input.run.runId, error: "Workflow V2 plan was not found." };
    }
    const targetNode = plan.definition.nodes.find((node) => node.id === input.nodeId);
    if (!targetNode) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 node ${input.nodeId} was not found.`,
      };
    }
    const persistedNode = persisted.runState.nodes[input.nodeId];
    const intervention = persistedNode?.intervention;
    if (input.action !== "continue" && !intervention) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 node ${input.nodeId} has no pending human intervention.`,
      };
    }
    if (intervention && !intervention.allowedActions.includes(input.action)) {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 intervention does not allow action ${input.action}.`,
      };
    }
    if ((input.action === "escalate" || input.action === "increase_review_strength") && targetNode.execModel !== "llm") {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 action ${input.action} requires an llm node.`,
      };
    }
    const resolvedAt = Date.now();
    const resolutionReason = workflowV2InterventionResolutionReason(input.action, targetNode.title, input.reason);
    const initialNodeControl = structuredClone(persisted.nodeControl);
    initialNodeControl[input.nodeId] = {
      ...(initialNodeControl[input.nodeId] ?? { extensionCount: 0 }),
      interventionResolution: {
        action: input.action,
        reason: resolutionReason,
        resolvedAt,
      },
    };
    const resolutionEvent: WorkflowV2DurableEvent = {
      sequence: persisted.eventCount,
      workflowId: input.workflow.workflowId,
      runId: input.run.runId,
      nodeId: input.nodeId,
      type: `intervention_${input.action}`,
      at: resolvedAt,
      detail: resolutionReason,
    };
    const initialDurableEventCount = persisted.eventCount + 1;

    if (input.action === "replan") {
      await store.appendEvents({
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        events: [resolutionEvent],
      });
      await store.persistRunState({
        ...structuredClone(persisted),
        savedAt: resolvedAt,
        eventCount: initialDurableEventCount,
        nodeControl: initialNodeControl,
      });
      const progress = input.run.progress.map((item) => item.nodeId === input.nodeId
        ? { ...item, status: "paused" as const, detail: resolutionReason }
        : item);
      this.deps.finishWorkflowRun({
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        status: "stopped",
        progress,
        appendEvents: [{
          type: "node_paused",
          nodeId: input.nodeId,
          at: resolvedAt,
          detail: resolutionReason,
          ...(intervention ? { intervention: structuredClone(intervention) } : {}),
        }],
        contextDocument: input.run.contextDocument,
      });
      return { ok: true, workflowId: input.workflow.workflowId, runId: input.run.runId };
    }

    const snapshot = this.deps.snapshot();
    const workDir = input.workflow.workDir || snapshot.workDir;
    const configuredAgentId = input.workflow.configuredAgentId || snapshot.configuredAgents[0]?.id || "default-agent";
    const modelId = configuredAgentModelId(input.workflow, snapshot);
    const cacheEntries = new Map<string, WorkflowV2CacheEntryMetadata>();
    const targetFingerprints = new Map<string, WorkflowV2NodeCacheFingerprint>();
    const knownOutputs = new Map(persisted.workerOutputs.map((output) => [output.nodeId, output]));

    for (const node of plan.definition.nodes) {
      const planNode = plan.nodes.find((item) => item.nodeId === node.id);
      if (!planNode) {
        return {
          ok: false,
          workflowId: input.workflow.workflowId,
          runId: input.run.runId,
          error: `Workflow V2 plan node ${node.id} was not found.`,
        };
      }
      const cacheEntry = await store.readCacheEntry?.(input.workflow.workflowId, plan.graphVersion, node.id);
      if (cacheEntry) cacheEntries.set(node.id, cacheEntry);
      const upstreamOutputs = plan.definition.edges
        .filter((edge) => edge.toNodeId === node.id)
        .map((edge) => knownOutputs.get(edge.fromNodeId))
        .filter((output): output is WorkflowV2WorkerOutput => Boolean(output));
      const fingerprint = createWorkflowV2NodeCacheFingerprint({
        graphVersion: plan.graphVersion,
        node,
        planNode,
        upstreamOutputs,
        executionEnvironment: workflowV2ExecutionEnvironment({ node, workDir, configuredAgentId, modelId }),
        reviewerPolicy: workflowV2ReviewerPolicy(node),
      });
      targetFingerprints.set(node.id, fingerprint);
      if (cacheEntry) knownOutputs.set(node.id, cacheEntry.output);
    }

    const recovery = buildWorkflowV2RecoveryPlan({
      persisted,
      targetDefinition: plan.definition,
      targetFingerprints,
      cacheEntries,
    });
    const targetDecision = recovery.decisions.find((decision) => decision.nodeId === input.nodeId);
    if (!targetDecision || targetDecision.action === "reuse") {
      return {
        ok: false,
        workflowId: input.workflow.workflowId,
        runId: input.run.runId,
        error: `Workflow V2 node ${input.nodeId} does not require recovery.`,
      };
    }
    await store.appendEvents({
      workflowId: input.workflow.workflowId,
      runId: input.run.runId,
      events: [resolutionEvent],
    });
    const materialized = materializeWorkflowV2Recovery({
      persisted,
      targetDefinition: plan.definition,
      recovery,
    });
    if (input.action === "skip") {
      materialized.checkpoint.runState = transitionWorkflowV2NodeState(materialized.checkpoint.runState, {
        nodeId: input.nodeId,
        status: "skipped",
        now: resolvedAt,
      });
      materialized.checkpoint.workerOutputs.push({
        nodeId: input.nodeId,
        summary: `Skipped by human intervention: ${resolutionReason}`,
        outputs: {},
        risks: [resolutionReason],
        proposals: [],
      });
      materialized.recoveryCheckpoints.delete(input.nodeId);
      materialized.resumeConversations.delete(input.nodeId);
    }
    const recoveryOverrides = new Map<string, WorkflowV2RecoveryOverride>();
    if (input.action === "escalate") {
      recoveryOverrides.set(input.nodeId, {
        modelProfile: "expert",
        forceIndependentReview: true,
        instruction: resolutionReason,
      });
    } else if (input.action === "increase_review_strength") {
      recoveryOverrides.set(input.nodeId, {
        forceIndependentReview: true,
        instruction: resolutionReason,
      });
    }

    this.activeRuns.set(input.run.runId, {
      workflowId: input.workflow.workflowId,
      runId: input.run.runId,
      pausedNodeIds: new Set(),
      pausedTaskIds: new Set(),
      gatedNodeIds: new Set(),
      taskIdByNodeId: new Map(),
      manualPauseReasonByNodeId: new Map(),
      abortControllerByNodeId: new Map(),
    });
    this.deps.updateWorkflowRunState({
      workflowId: input.workflow.workflowId,
      runId: input.run.runId,
      status: "running",
      contextDocument: input.run.contextDocument,
    });
    const storagePlan = workflowStoragePlanFor(input.workflow.workflowId);
    void this.executeWorkflowV2Run({
      workflow: input.workflow,
      plan,
      runId: input.run.runId,
      baseWorkflowContextDocument: input.run.contextDocument,
      storagePlanDocument: workflowStoragePlanDocument(storagePlan),
      initialCheckpoint: materialized.checkpoint,
      initialNodeControl,
      initialDurableEventCount,
      recoveryCheckpoints: materialized.recoveryCheckpoints,
      resumeConversations: materialized.resumeConversations,
      recoveryOverrides,
    }).finally(() => {
      this.activeRuns.delete(input.run.runId);
    });
    return { ok: true, workflowId: input.workflow.workflowId, runId: input.run.runId };
  }

  async answerWorkflowGate(input: AnswerWorkflowGateRequest): Promise<WorkflowOperationResult> {
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    const run = snapshot.workflowStore.runs.find((item) => item.runId === input.runId && item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run) return { ok: false, workflowId: input.workflowId, error: `Workflow run ${input.runId} was not found.` };
    if (run.workflowV2Plan) {
      const answer = input.answer.trim();
      if (!answer) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "A gate answer is required." };
      return this.resolveWorkflowV2Intervention({
        workflowId: input.workflowId,
        runId: input.runId,
        nodeId: input.nodeId,
        action: "continue",
        reason: answer,
      });
    }
    if (run.status !== "running" && run.status !== "stopped") {
      return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow run is not resumable." };
    }
    const node = run.graphSnapshot.nodes.find((item) => item.id === input.nodeId && item.kind === "agent");
    if (!node) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${input.nodeId} was not found.` };
    const progressItem = run.progress.find((item) => item.nodeId === input.nodeId);
    if (!progressItem) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${input.nodeId} was not found in this run.` };
    if (progressItem.status !== "awaiting_input") {
      return { ok: false, workflowId: input.workflowId, runId: input.runId, error: `Workflow node ${progressItem.title} is not waiting for input.` };
    }
    const answer = input.answer.trim();
    if (!answer) return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "A gate answer is required." };

    const question = [...run.events].reverse().find((event) => event.type === "gate_opened" && event.nodeId === input.nodeId)?.question ?? "";
    const humanDecision = [`## Human decision — ${node.title}`, question ? `Question: ${question}` : "", `Answer: ${answer}`]
      .filter(Boolean)
      .join("\n");
    const nextContextDocument = [run.contextDocument.trim(), humanDecision].filter(Boolean).join("\n\n");

    const activeRun = this.activeRuns.get(input.runId) ?? {
      workflowId: input.workflowId,
      runId: input.runId,
      pausedNodeIds: new Set<string>(),
      pausedTaskIds: new Set<string>(),
      gatedNodeIds: new Set<string>(),
      taskIdByNodeId: new Map<string, string>(),
    };
    this.activeRuns.set(input.runId, activeRun);
    activeRun.gatedNodeIds.delete(input.nodeId);
    activeRun.taskIdByNodeId.delete(input.nodeId);

    const nextProgress = run.progress.map((item) => {
      if (item.nodeId !== input.nodeId) return item;
      const next: WorkflowRunProgressItem = { ...item, status: "queued", detail: "Resuming after human decision" };
      delete next.taskId;
      return next;
    });
    this.deps.updateWorkflowRunState({
      workflowId: input.workflowId,
      runId: input.runId,
      status: "running",
      progress: nextProgress,
      appendEvents: [
        { type: "gate_answered", nodeId: input.nodeId, at: Date.now(), answer },
        { type: "node_ready", nodeId: input.nodeId, at: Date.now() },
      ],
      contextDocument: nextContextDocument,
      ...(run.finalReport ? { finalReport: run.finalReport } : {}),
    });

    const executionLevels = workflowGraphExecutionLevels(run.graphSnapshot);
    void this.executeRun({
      workflow: { ...workflow, graph: run.graphSnapshot },
      runId: input.runId,
      executionLevels,
      baseWorkflowContextDocument: nextContextDocument,
      initialProgress: nextProgress,
    }).finally(() => {
      const currentActiveRun = this.activeRuns.get(input.runId);
      if (!currentActiveRun || (currentActiveRun.pausedNodeIds.size === 0 && currentActiveRun.gatedNodeIds.size === 0)) this.activeRuns.delete(input.runId);
    });
    return { ok: true, workflowId: input.workflowId, runId: input.runId };
  }

  private async executeWorkflowV2Run(input: {
    workflow: WorkflowDraftState;
    plan: WorkflowV2Plan;
    runId: string;
    baseWorkflowContextDocument: string;
    storagePlanDocument: string;
    initialCheckpoint?: ExecuteWorkflowV2Checkpoint;
    initialNodeControl?: Record<string, WorkflowV2DurableNodeControlState>;
    initialDurableEventCount?: number;
    recoveryCheckpoints?: ReadonlyMap<string, string>;
    resumeConversations?: ReadonlyMap<string, RuntimeConversation>;
    recoveryOverrides?: ReadonlyMap<string, WorkflowV2RecoveryOverride>;
  }): Promise<void> {
    const { workflow, plan, runId, baseWorkflowContextDocument, storagePlanDocument } = input;
    const executionStartedAt = Date.now();
    const maxWallClockMs = plan.budget.cost?.maxWallClockMs;
    const maxModelCalls = plan.budget.cost?.maxModelCalls;
    let startedModelCalls = 0;
    const durableStore = this.deps.createWorkflowV2Store?.();
    let durableEventCount = input.initialDurableEventCount ?? 0;
    let latestExecutorCheckpoint: ExecuteWorkflowV2Checkpoint | undefined;
    let previousDurableRunState: ExecuteWorkflowV2Checkpoint["runState"] | undefined = input.initialCheckpoint
      ? structuredClone(input.initialCheckpoint.runState)
      : undefined;
    const persistedCacheNodeIds = new Set<string>();
    const durableNodeControl: Record<string, WorkflowV2DurableNodeControlState> = input.initialNodeControl
      ? structuredClone(input.initialNodeControl)
      : Object.fromEntries(plan.definition.nodes.map((node) => [node.id, { extensionCount: 0 }]));
    let latestSnapshot = this.deps.snapshot();
    let latestProgress = plan.definition.nodes.map((node): WorkflowRunProgressItem => {
      const recovered = input.initialCheckpoint?.runState.nodes[node.id];
      if (recovered?.status === "completed" || recovered?.status === "skipped") {
        return { nodeId: node.id, title: node.title, status: "completed", detail: "Recovered" };
      }
      if (recovered?.status === "failed") {
        return { nodeId: node.id, title: node.title, status: "failed", detail: recovered.lastError ?? "Recovery failed" };
      }
      return { nodeId: node.id, title: node.title, status: "queued", detail: "Queued" };
    });
    const workflowWorkDir = workflow.workDir || latestSnapshot.workDir;
    const configuredAgentId = workflow.configuredAgentId || latestSnapshot.configuredAgents[0]?.id || "default-agent";
    const modelId = configuredAgentModelId(workflow, latestSnapshot);

    const appendDurableEvents = async (
      events: Array<Omit<WorkflowV2DurableEvent, "sequence" | "workflowId" | "runId">>,
    ): Promise<void> => {
      if (!durableStore || events.length === 0) return;
      const sequenced = events.map((event, index): WorkflowV2DurableEvent => ({
        ...event,
        sequence: durableEventCount + index,
        workflowId: workflow.workflowId,
        runId,
      }));
      await durableStore.appendEvents({ workflowId: workflow.workflowId, runId, events: sequenced });
      durableEventCount += sequenced.length;
    };

    const persistExecutorCheckpoint = async (checkpoint: ExecuteWorkflowV2Checkpoint): Promise<void> => {
      latestExecutorCheckpoint = structuredClone(checkpoint);
      if (!durableStore) return;
      const transitionEvents = checkpoint.runState.nodeOrder.flatMap((nodeId) => {
        const current = checkpoint.runState.nodes[nodeId];
        const previous = previousDurableRunState?.nodes[nodeId];
        if (!current || previous?.status === current.status) return [];
        return [{
          nodeId,
          type: `node_${current.status}`,
          at: Date.now(),
          ...(current.lastError ? { detail: current.lastError } : {}),
        } satisfies Omit<WorkflowV2DurableEvent, "sequence" | "workflowId" | "runId">];
      });
      await appendDurableEvents(transitionEvents);
      const persisted: WorkflowV2PersistedRunState = {
        schemaVersion: WORKFLOW_V2_STORAGE_SCHEMA_VERSION,
        workflowId: workflow.workflowId,
        runId,
        graphVersion: plan.graphVersion,
        savedAt: Date.now(),
        eventCount: durableEventCount,
        plan: structuredClone(plan),
        runState: structuredClone(checkpoint.runState),
        workerOutputs: checkpoint.workerOutputs.map((output) => structuredClone(output)),
        nodeControl: structuredClone(durableNodeControl),
      };
      await durableStore.persistRunState(persisted);
      if (durableStore.persistCacheEntry) {
        const outputByNodeId = new Map(checkpoint.workerOutputs.map((output) => [output.nodeId, output]));
        for (const output of checkpoint.workerOutputs) {
          if (persistedCacheNodeIds.has(output.nodeId)) continue;
          const node = plan.definition.nodes.find((item) => item.id === output.nodeId);
          const planNode = plan.nodes.find((item) => item.nodeId === output.nodeId);
          if (!node || !planNode || checkpoint.runState.nodes[output.nodeId]?.status !== "completed") continue;
          const recoveryOverride = input.recoveryOverrides?.get(output.nodeId);
          const effectivePlanNode = recoveryOverride?.modelProfile
            ? { ...planNode, modelProfile: recoveryOverride.modelProfile }
            : planNode;
          const upstreamOutputs = plan.definition.edges
            .filter((edge) => edge.toNodeId === output.nodeId)
            .map((edge) => outputByNodeId.get(edge.fromNodeId))
            .filter((item): item is WorkflowV2WorkerOutput => Boolean(item));
          await durableStore.persistCacheEntry({
            schemaVersion: WORKFLOW_V2_STORAGE_SCHEMA_VERSION,
            workflowId: workflow.workflowId,
            nodeId: output.nodeId,
            graphVersion: plan.graphVersion,
            fingerprint: createWorkflowV2NodeCacheFingerprint({
              graphVersion: plan.graphVersion,
              node,
              planNode: effectivePlanNode,
              upstreamOutputs,
              executionEnvironment: workflowV2ExecutionEnvironment({
                node,
                workDir: workflowWorkDir,
                configuredAgentId,
                modelId,
              }),
              reviewerPolicy: workflowV2ReviewerPolicy(node, recoveryOverride?.forceIndependentReview === true),
            }),
            output: structuredClone(output),
            savedAt: Date.now(),
            ...(checkpoint.runState.nodes[output.nodeId]?.reviewVerdict
              ? { reviewVerdict: structuredClone(checkpoint.runState.nodes[output.nodeId]!.reviewVerdict!) }
              : {}),
          });
          persistedCacheNodeIds.add(output.nodeId);
        }
      }
      previousDurableRunState = structuredClone(checkpoint.runState);
    };

    const persistLatestControlState = async (nodeId: string, type: string, detail?: string): Promise<void> => {
      if (!latestExecutorCheckpoint || !durableStore) return;
      await appendDurableEvents([{
        nodeId,
        type,
        at: Date.now(),
        ...(detail ? { detail } : {}),
      }]);
      await persistExecutorCheckpoint(latestExecutorCheckpoint);
    };

    const remainingWallClockMs = (): number => maxWallClockMs === undefined
      ? Number.POSITIVE_INFINITY
      : maxWallClockMs - (Date.now() - executionStartedAt);
    const assertWallClockBudget = (nodeId: string): number => {
      const remainingMs = remainingWallClockMs();
      if (remainingMs <= 0) {
        throw new Error(`Workflow V2 wall-clock budget exhausted before node ${nodeId}.`);
      }
      return remainingMs;
    };
    const consumeModelCallBudget = (nodeId: string): void => {
      if (maxModelCalls !== undefined && startedModelCalls >= maxModelCalls) {
        throw new Error(`Workflow V2 model-call budget exhausted before node ${nodeId}.`);
      }
      startedModelCalls += 1;
    };

    const updateNode = (
      nodeId: string,
      update: Partial<WorkflowRunProgressItem>,
      event?: Omit<WorkflowEvent, "at">,
      clearTaskId = false,
    ): void => {
      latestProgress = latestProgress.map((item) => {
        if (item.nodeId !== nodeId) return item;
        const next = { ...item, ...update };
        if (clearTaskId) delete next.taskId;
        return next;
      });
      this.deps.updateWorkflowRunState({
        workflowId: workflow.workflowId,
        runId,
        status: "running",
        progress: latestProgress,
        ...(event ? { appendEvents: [{ ...event, at: Date.now() }] } : {}),
        contextDocument: baseWorkflowContextDocument,
      });
    };

    const startWorkflowTask = async (request: RunTaskRequest): Promise<TaskRun> => {
      const existingTaskIds = new Set(latestSnapshot.tasks.map((task) => task.id));
      latestSnapshot = await this.deps.runTask(request);
      const task = latestSnapshot.tasks
        .filter((item) => !existingTaskIds.has(item.id))
        .sort((left, right) => right.createdAt - left.createdAt)
        .find((item) => item.prompt === request.prompt && item.configuredAgentId === request.configuredAgentId);
      if (task) return task;
      const fallbackTask = latestSnapshot.tasks
        .filter((item) => !existingTaskIds.has(item.id))
        .sort((left, right) => right.createdAt - left.createdAt)[0];
      if (!fallbackTask) throw new Error("Workflow V2 task creation did not return a new task.");
      return fallbackTask;
    };

    const throwIfWorkflowV2ManuallyPaused = async (nodeId: string, task?: TaskRun): Promise<void> => {
      const activeRun = this.activeRuns.get(runId);
      const reason = activeRun?.manualPauseReasonByNodeId?.get(nodeId);
      if (!reason) return;
      activeRun?.manualPauseReasonByNodeId?.delete(nodeId);
      const node = plan.definition.nodes.find((item) => item.id === nodeId);
      const attempt = latestExecutorCheckpoint?.runState.nodes[nodeId]?.attempt ?? 1;
      const checkpoint = durableNodeControl[nodeId]?.checkpoint;
      const partialArtifact = task ? truncateWorkflowContext(taskArtifact(task), 500) : "";
      const report: WorkflowV2ProgressReport = {
        nodeId,
        attempt: Math.max(1, attempt),
        phase: "manual intervention",
        completedItems: [],
        remainingItems: [node?.title ?? nodeId],
        blockers: [reason],
        evidence: partialArtifact ? [partialArtifact] : [],
        ...(checkpoint ? { checkpoint } : {}),
        safeToInterrupt: true,
        requestedAction: "need_input",
        reportedAt: Date.now(),
      };
      durableNodeControl[nodeId] = {
        ...(durableNodeControl[nodeId] ?? { extensionCount: 0 }),
        progressReport: structuredClone(report),
        stopReason: reason,
      };
      await persistLatestControlState(nodeId, "manual_pause", reason);
      throw new WorkflowV2SupervisionSignal({
        report,
        resolution: {
          action: "pause",
          question: `Choose how to continue Workflow V2 node ${node?.title ?? nodeId}.`,
          reason,
        },
        ...(task?.runtimeConversation ? { resumeConversation: task.runtimeConversation } : {}),
      });
    };

    const waitForTask = async (taskId: string, nodeId: string, timeoutMs = WORKFLOW_TASK_TIMEOUT_MS): Promise<TaskRun> => {
      const startedAt = Date.now();
      while (true) {
        assertWallClockBudget(nodeId);
        const remainingTaskMs = timeoutMs - (Date.now() - startedAt);
        if (remainingTaskMs <= 0) throw new Error(`Workflow V2 task ${taskId} timed out.`);
        latestSnapshot = this.deps.snapshot();
        const task = latestSnapshot.tasks.find((item) => item.id === taskId);
        if (!task) throw new Error(`Workflow V2 task ${taskId} was deleted before completion.`);
        await throwIfWorkflowV2ManuallyPaused(nodeId, task);
        if (task.status === "completed") return task;
        if (task.status === "failed" || task.status === "stopped") {
          throw new Error(task.lastError || `Workflow V2 task ${task.title} ${task.status}.`);
        }
        updateNode(nodeId, { status: "running", detail: taskArtifact(task), taskId });
        await delay(Math.min(WORKFLOW_TASK_POLL_MS, remainingTaskMs, remainingWallClockMs()));
      }
    };

    const runtimeAttemptByNodeId = new Map<string, number>();
    const consumedRecoveryNodeIds = new Set<string>();

    const startModelTask = async (nodeId: string, request: RunTaskRequest): Promise<TaskRun> => {
      consumeModelCallBudget(nodeId);
      const task = await startWorkflowTask(request);
      this.activeRuns.get(runId)?.taskIdByNodeId.set(nodeId, task.id);
      return task;
    };

    const cleanupSupervisedTasks = async (
      taskIds: readonly string[],
      archiveTaskIds: ReadonlySet<string>,
    ): Promise<void> => {
      for (const taskId of taskIds) {
        latestSnapshot = await this.deps.deleteTask(taskId, {
          preserveRuntimeConversation: !archiveTaskIds.has(taskId),
        });
      }
    };

    const stoppedTaskSnapshot = (task: TaskRun): TaskRun => {
      latestSnapshot = this.deps.snapshot();
      return latestSnapshot.tasks.find((item) => item.id === task.id) ?? task;
    };

    const unavailableProgressReport = (
      node: WorkflowV2LLMNode,
      attempt: number,
      partialArtifact: string,
      lease: WorkflowV2ExecutionLeaseState,
    ): WorkflowV2ProgressReport => ({
      nodeId: node.id,
      attempt,
      phase: "progress probe unavailable",
      completedItems: [],
      remainingItems: [node.title],
      blockers: ["The runtime did not expose a resumable conversation after interruption."],
      evidence: partialArtifact.trim() ? [truncateWorkflowContext(partialArtifact, 500)] : [],
      safeToInterrupt: true,
      requestedAction: "need_input",
      reportedAt: Math.min(Date.now(), lease.hardDeadlineAt),
    });

    const waitForLeasedLlmTask = async (input: {
      node: WorkflowV2LLMNode;
      initialTask: TaskRun;
      attempt: number;
      configuredAgentId: string;
      modelId: string;
      workDir: string;
      taskIds: string[];
      supervisorTaskIds: string[];
    }): Promise<TaskRun> => {
      const policy = input.node.executionLease;
      if (!policy) {
        return waitForTask(input.initialTask.id, input.node.id);
      }

      let currentTask = input.initialTask;
      let lease = createWorkflowV2ExecutionLease({
        nodeId: input.node.id,
        attempt: input.attempt,
        startedAt: Date.now(),
        policy,
      });
      durableNodeControl[input.node.id] = {
        ...durableNodeControl[input.node.id],
        lease: structuredClone(lease),
        extensionCount: lease.extensionCount,
      };
      await persistLatestControlState(input.node.id, "lease_started");
      let previousReport: WorkflowV2ProgressReport | undefined;
      const boundedProbeTimeoutMs = (): number => {
        const remainingLeaseMs = lease.hardDeadlineAt - Date.now();
        const remainingRunMs = remainingWallClockMs();
        const timeoutMs = Math.min(policy.progressProbeTimeoutMs, remainingLeaseMs, remainingRunMs);
        if (timeoutMs <= 0) throw new Error(`Workflow V2 node ${input.node.id} reached its hard execution timeout.`);
        return timeoutMs;
      };

      while (true) {
        assertWallClockBudget(input.node.id);
        latestSnapshot = this.deps.snapshot();
        const task = latestSnapshot.tasks.find((item) => item.id === currentTask.id);
        if (!task) throw new Error(`Workflow V2 task ${currentTask.id} was deleted before completion.`);
        currentTask = task;
        await throwIfWorkflowV2ManuallyPaused(input.node.id, task);
        if (task.status === "completed") return task;
        if (task.status === "failed" || task.status === "stopped") {
          throw new Error(task.lastError || `Workflow V2 task ${task.title} ${task.status}.`);
        }

        if (task.updatedAt > lease.lastActivityAt) {
          lease = recordWorkflowV2LeaseActivity(lease, Math.min(task.updatedAt, lease.hardDeadlineAt));
          durableNodeControl[input.node.id] = {
            ...durableNodeControl[input.node.id],
            lease: structuredClone(lease),
            extensionCount: lease.extensionCount,
          };
        }
        updateNode(input.node.id, { status: "running", detail: taskArtifact(task), taskId: task.id });
        const now = Date.now();
        const inspection = inspectWorkflowV2ExecutionLease({ lease, policy, now });
        if (inspection === "active") {
          const untilInactivity = policy.inactivityTimeoutMs - (now - lease.lastActivityAt);
          const waitMs = Math.max(1, Math.min(
            WORKFLOW_TASK_POLL_MS,
            lease.softDeadlineAt - now,
            lease.hardDeadlineAt - now,
            untilInactivity,
            remainingWallClockMs(),
          ));
          await delay(waitMs);
          continue;
        }
        if (inspection === "hard_timeout") {
          await this.deps.stopTask(task.id);
          const report: WorkflowV2ProgressReport = {
            ...unavailableProgressReport(input.node, input.attempt, taskArtifact(task), lease),
            phase: "hard execution timeout",
            blockers: ["The node reached its absolute hard execution timeout."],
            ...(durableNodeControl[input.node.id]?.checkpoint
              ? { checkpoint: durableNodeControl[input.node.id]!.checkpoint }
              : {}),
          };
          durableNodeControl[input.node.id] = {
            ...durableNodeControl[input.node.id],
            lease: structuredClone(lease),
            progressReport: structuredClone(report),
            extensionCount: lease.extensionCount,
            stopReason: "Hard execution timeout reached.",
          };
          await persistLatestControlState(input.node.id, "lease_hard_timeout", "Hard execution timeout reached.");
          throw new WorkflowV2SupervisionSignal({
            report,
            resolution: {
              action: "pause",
              question: `Node ${input.node.title} reached its hard timeout. Choose whether to retry, skip, escalate, or replan.`,
              reason: "Hard execution timeout reached.",
            },
            ...(task.runtimeConversation ? { resumeConversation: task.runtimeConversation } : {}),
          });
        }

        await this.deps.stopTask(task.id);
        const stoppedTask = stoppedTaskSnapshot(task);
        const partialArtifact = truncateWorkflowContext(taskArtifact(stoppedTask), 4_000);
        if (!stoppedTask.runtimeConversation) {
          const report = unavailableProgressReport(input.node, input.attempt, partialArtifact, lease);
          durableNodeControl[input.node.id] = {
            ...durableNodeControl[input.node.id],
            lease: structuredClone(lease),
            progressReport: structuredClone(report),
            extensionCount: lease.extensionCount,
            stopReason: "Progress probe requires a resumable runtime conversation.",
          };
          await persistLatestControlState(
            input.node.id,
            "progress_probe_unavailable",
            "Progress probe requires a resumable runtime conversation.",
          );
          throw new WorkflowV2SupervisionSignal({
            report,
            resolution: {
              action: "pause",
              question: `Node ${input.node.title} exceeded its soft timeout but its runtime cannot resume for a progress probe.`,
              reason: "Progress probe requires a resumable runtime conversation.",
            },
          });
        }

        const progressTask = await startModelTask(input.node.id, {
          prompt: workflowV2ProgressProbePrompt({
            node: input.node,
            attempt: input.attempt,
            partialArtifact,
            now: Date.now(),
          }),
          configuredAgentId: input.configuredAgentId,
          modelId: input.modelId,
          workDir: input.workDir,
          continuationPolicy: "resume-required",
          runtimeConversation: stoppedTask.runtimeConversation,
        });
        input.taskIds.push(progressTask.id);

        let completedProgressTask: TaskRun;
        try {
          completedProgressTask = await waitForTask(progressTask.id, input.node.id, boundedProbeTimeoutMs());
        } catch (error) {
          await this.deps.stopTask(progressTask.id);
          const reason = error instanceof Error ? error.message : String(error);
          const report = unavailableProgressReport(input.node, input.attempt, partialArtifact, lease);
          report.phase = "progress probe failed";
          report.blockers = [reason];
          durableNodeControl[input.node.id] = {
            ...durableNodeControl[input.node.id],
            lease: structuredClone(lease),
            progressReport: structuredClone(report),
            extensionCount: lease.extensionCount,
            stopReason: reason,
          };
          await persistLatestControlState(input.node.id, "progress_probe_failed", reason);
          throw new WorkflowV2SupervisionSignal({
            report,
            resolution: {
              action: "pause",
              question: `The progress probe for ${input.node.title} did not complete. Choose the next recovery action.`,
              reason,
            },
            ...(stoppedTask.runtimeConversation ? { resumeConversation: stoppedTask.runtimeConversation } : {}),
          });
        }
        const report = parseWorkflowV2ProgressReport(taskArtifact(completedProgressTask));
        durableNodeControl[input.node.id] = {
          ...durableNodeControl[input.node.id],
          lease: structuredClone(lease),
          progressReport: structuredClone(report),
          ...(report.checkpoint ? { checkpoint: report.checkpoint } : {}),
          extensionCount: lease.extensionCount,
        };
        await persistLatestControlState(input.node.id, "progress_reported", report.phase);

        const supervisorTask = await startModelTask(input.node.id, {
          prompt: workflowV2SupervisorDecisionPrompt({
            node: input.node,
            report,
            policy,
            extensionCount: lease.extensionCount,
          }),
          configuredAgentId: input.configuredAgentId,
          modelId: input.modelId,
          workDir: input.workDir,
        });
        input.taskIds.push(supervisorTask.id);
        input.supervisorTaskIds.push(supervisorTask.id);

        let completedSupervisorTask: TaskRun;
        try {
          completedSupervisorTask = await waitForTask(supervisorTask.id, input.node.id, boundedProbeTimeoutMs());
        } catch (error) {
          await this.deps.stopTask(supervisorTask.id);
          const reason = error instanceof Error ? error.message : String(error);
          durableNodeControl[input.node.id] = {
            ...durableNodeControl[input.node.id],
            lease: structuredClone(lease),
            progressReport: structuredClone(report),
            ...(report.checkpoint ? { checkpoint: report.checkpoint } : {}),
            extensionCount: lease.extensionCount,
            stopReason: reason,
          };
          await persistLatestControlState(input.node.id, "supervisor_response_failed", reason);
          throw new WorkflowV2SupervisionSignal({
            report,
            resolution: {
              action: "pause",
              question: `The supervisor decision for ${input.node.title} did not complete. Choose the next recovery action.`,
              reason,
            },
            ...(completedProgressTask.runtimeConversation
              ? { resumeConversation: completedProgressTask.runtimeConversation }
              : {}),
          });
        }
        const decision = parseWorkflowV2SupervisorDecision(taskArtifact(completedSupervisorTask));
        const resolution = resolveWorkflowV2SupervisorDecision({
          lease,
          policy,
          report,
          ...(previousReport ? { previousReport } : {}),
          decision,
          now: Date.now(),
        });
        if (resolution.action !== "continue") {
          durableNodeControl[input.node.id] = {
            ...durableNodeControl[input.node.id],
            lease: structuredClone(lease),
            progressReport: structuredClone(report),
            ...(report.checkpoint ? { checkpoint: report.checkpoint } : {}),
            extensionCount: lease.extensionCount,
            stopReason: resolution.reason,
          };
          await persistLatestControlState(input.node.id, `supervisor_${resolution.action}`, resolution.reason);
          throw new WorkflowV2SupervisionSignal({
            report,
            resolution,
            ...(completedProgressTask.runtimeConversation
              ? { resumeConversation: completedProgressTask.runtimeConversation }
              : {}),
          });
        }
        if (decision.action !== "continue") {
          throw new Error(`Workflow V2 supervisor resolution for node ${input.node.id} lost its continue decision.`);
        }
        if (!completedProgressTask.runtimeConversation) {
          throw new Error(`Workflow V2 progress probe for node ${input.node.id} did not return a resumable conversation.`);
        }

        previousReport = report;
        lease = resolution.lease;
        durableNodeControl[input.node.id] = {
          ...durableNodeControl[input.node.id],
          lease: structuredClone(lease),
          progressReport: structuredClone(report),
          ...(report.checkpoint ? { checkpoint: report.checkpoint } : {}),
          extensionCount: lease.extensionCount,
          stopReason: resolution.reason,
        };
        await persistLatestControlState(input.node.id, "lease_extended", resolution.reason);
        currentTask = await startModelTask(input.node.id, {
          prompt: workflowV2ContinueAfterProbePrompt({ node: input.node, report, decision }),
          configuredAgentId: input.configuredAgentId,
          modelId: input.modelId,
          workDir: input.workDir,
          continuationPolicy: "resume-required",
          runtimeConversation: completedProgressTask.runtimeConversation,
        });
        input.taskIds.push(currentTask.id);
      }
    };

    const runLlmNode = async (request: {
      node: WorkflowV2LLMNode;
      taskPacket: WorkflowV2TaskPacket;
      upstreamOutputs: readonly WorkflowV2ResultPacket[];
    }): Promise<WorkflowV2WorkerOutput> => {
      assertWallClockBudget(request.node.id);
      const recoveryOverride = input.recoveryOverrides?.get(request.node.id);
      const effectiveTaskPacket = recoveryOverride?.modelProfile
        ? { ...request.taskPacket, modelProfile: recoveryOverride.modelProfile }
        : request.taskPacket;
      const prompt = workflowV2LlmNodePrompt({
        node: request.node,
        taskPacket: effectiveTaskPacket,
        upstreamOutputs: request.upstreamOutputs,
        baseWorkflowContextDocument,
        storagePlanDocument,
      });
      const recoveryCheckpoint = consumedRecoveryNodeIds.has(request.node.id)
        ? undefined
        : input.recoveryCheckpoints?.get(request.node.id);
      const recoveryConversation = consumedRecoveryNodeIds.has(request.node.id)
        ? undefined
        : input.resumeConversations?.get(request.node.id);
      const effectivePrompt = [
        prompt,
        ...(recoveryCheckpoint
          ? [
              "",
              "# Recovery checkpoint",
              "Resume the interrupted node attempt from this checkpoint. It is control context, not a completed result:",
              recoveryCheckpoint,
            ]
          : []),
        ...(recoveryOverride
          ? [
              "",
              "# Human intervention resolution",
              recoveryOverride.instruction,
              ...(recoveryOverride.modelProfile ? [`Effective model profile: ${recoveryOverride.modelProfile}`] : []),
              ...(recoveryOverride.forceIndependentReview ? ["This attempt requires independent semantic review."] : []),
            ]
          : []),
      ].join("\n");
      const attempt = (runtimeAttemptByNodeId.get(request.node.id) ?? 0) + 1;
      runtimeAttemptByNodeId.set(request.node.id, attempt);
      const task = await startModelTask(request.node.id, {
        prompt: effectivePrompt,
        configuredAgentId,
        modelId,
        workDir: workflowWorkDir,
        ...(recoveryConversation
          ? { continuationPolicy: "resume-required" as const, runtimeConversation: recoveryConversation }
          : {}),
      });
      consumedRecoveryNodeIds.add(request.node.id);
      updateNode(request.node.id, { status: "running", detail: "Task running", taskId: task.id });

      let taskIds = [task.id];
      const supervisorTaskIds: string[] = [];
      let archiveTaskId: string | undefined = task.id;
      try {
        const completedTask = await waitForLeasedLlmTask({
          node: request.node,
          initialTask: task,
          attempt,
          configuredAgentId,
          modelId,
          workDir: workflowWorkDir,
          taskIds,
          supervisorTaskIds,
        });
        archiveTaskId = completedTask.id;
        const artifact = taskArtifact(completedTask);
        const output = parseWorkflowV2WorkerArtifact(request.node, artifact);
        updateNode(request.node.id, { status: "running", detail: output.summary, taskId: task.id }, {
          type: "node_output",
          nodeId: request.node.id,
          taskId: task.id,
          attempt: 1,
          summary: output.summary,
        });
        return output;
      } catch (error) {
        if (
          error instanceof WorkflowV2SupervisionSignal
          && (error.resolution.action === "pause" || error.resolution.action === "escalate")
        ) {
          archiveTaskId = undefined;
        }
        throw error;
      } finally {
        await cleanupSupervisedTasks(
          taskIds,
          new Set([
            ...supervisorTaskIds,
            ...(archiveTaskId ? [archiveTaskId] : []),
          ]),
        );
      }
    };

    const runScriptNode = async (request: {
      node: WorkflowV2ScriptNode;
      upstreamOutputs: readonly WorkflowV2ResultPacket[];
    }): Promise<WorkflowV2WorkerOutput> => {
      const remainingScriptMs = assertWallClockBudget(request.node.id);
      const timeoutMs = Math.min(
        request.node.script.timeoutMs ?? WORKFLOW_TASK_TIMEOUT_MS,
        remainingScriptMs,
        MAX_NODE_TIMER_DELAY_MS,
      );
      const controller = new AbortController();
      this.activeRuns.get(runId)?.abortControllerByNodeId?.set(request.node.id, controller);
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          const timeoutError = new Error(`Workflow V2 script node ${request.node.id} timed out after ${timeoutMs}ms.`);
          reject(timeoutError);
          controller.abort(timeoutError);
        }, timeoutMs);
      });
      let output: WorkflowV2WorkerOutput;
      try {
        const execution = this.deps.executeWorkflowV2Script({
          node: request.node,
          workDir: workflowWorkDir,
          sandboxMode: request.node.sandboxMode,
          upstreamOutputs: request.upstreamOutputs,
          signal: controller.signal,
          timeoutMs,
        });
        output = await Promise.race([execution, deadline]);
      } catch (error) {
        await throwIfWorkflowV2ManuallyPaused(request.node.id);
        throw error;
      } finally {
        if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
        this.activeRuns.get(runId)?.abortControllerByNodeId?.delete(request.node.id);
      }
      updateNode(request.node.id, { status: "running", detail: output.summary }, {
        type: "node_output",
        nodeId: request.node.id,
        attempt: 1,
        summary: output.summary,
      });
      return output;
    };

    const reviewNodeOutput = async (reviewInput: WorkflowV2ReviewerInput): Promise<WorkflowV2ReviewerResponse> => {
      const task = await startModelTask(`reviewer:${reviewInput.executorNodeId}`, {
        prompt: workflowV2ReviewerPrompt(reviewInput),
        configuredAgentId,
        modelId,
        workDir: workflowWorkDir,
      });
      updateNode(reviewInput.executorNodeId, {
        status: "running",
        detail: "Independent semantic review running",
        taskId: task.id,
      });
      try {
        const completedTask = await waitForTask(task.id, reviewInput.executorNodeId);
        return parseWorkflowV2ReviewerResponse(taskArtifact(completedTask), reviewInput.executorNodeId);
      } finally {
        latestSnapshot = await this.deps.deleteTask(task.id);
      }
    };

    try {
      this.deps.updateWorkflowRunState({
        workflowId: workflow.workflowId,
        runId,
        status: "running",
        progress: latestProgress,
        contextDocument: baseWorkflowContextDocument,
      });
      const result = await executeWorkflowV2Plan({
        plan,
        maxParallelNodes: WORKFLOW_V2_MAX_PARALLEL_NODES,
        ...(input.initialCheckpoint ? { initialCheckpoint: input.initialCheckpoint } : {}),
        runLlmNode,
        executeScript: runScriptNode,
        reviewNodeOutput,
        forceIndependentReviewNodeIds: new Set(
          [...(input.recoveryOverrides?.entries() ?? [])]
            .filter(([, override]) => override.forceIndependentReview)
            .map(([nodeId]) => nodeId),
        ),
        onRunCheckpoint: persistExecutorCheckpoint,
        onNodeStateTransition: (transition) => {
          if (transition.status === "running") {
            updateNode(transition.nodeId, { status: "running", detail: "Starting" }, {
              type: "node_started",
              nodeId: transition.nodeId,
              attempt: 1,
              detail: "Starting",
            });
          } else if (transition.status === "completed") {
            updateNode(transition.nodeId, { status: "completed", detail: transition.output.summary }, {
              type: "node_completed",
              nodeId: transition.nodeId,
              detail: transition.output.summary,
            }, true);
          } else if (transition.status === "paused") {
            const activeRun = this.activeRuns.get(runId);
            activeRun?.pausedNodeIds.add(transition.nodeId);
            updateNode(transition.nodeId, {
              status: "paused",
              detail: transition.intervention.reason,
              intervention: structuredClone(transition.intervention),
            }, {
              type: "node_paused",
              nodeId: transition.nodeId,
              detail: transition.intervention.reason,
              intervention: transition.intervention,
            }, true);
          } else {
            updateNode(transition.nodeId, { status: "failed", detail: transition.error }, {
              type: "node_failed",
              nodeId: transition.nodeId,
              error: transition.error,
            }, true);
          }
        },
      });

      const finalReport = buildWorkflowV2FinalReport(plan, result.workerOutputs, result.runState.status);
      if (result.runState.status === "completed") {
        this.deps.finishWorkflowRun({
          workflowId: workflow.workflowId,
          runId,
          status: "completed",
          progress: latestProgress,
          contextDocument: baseWorkflowContextDocument,
          finalReport,
        });
        return;
      }
      if (result.runState.status === "paused") {
        this.deps.finishWorkflowRun({
          workflowId: workflow.workflowId,
          runId,
          status: "stopped",
          progress: latestProgress,
          contextDocument: baseWorkflowContextDocument,
          finalReport,
        });
        return;
      }

      const lastError = result.runState.nodeOrder
        .map((nodeId) => result.runState.nodes[nodeId])
        .find((node) => node?.status === "failed")?.lastError ?? "Workflow V2 execution failed.";
      this.deps.finishWorkflowRun({
        workflowId: workflow.workflowId,
        runId,
        status: "failed",
        progress: latestProgress,
        contextDocument: baseWorkflowContextDocument,
        finalReport,
        lastError,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      latestProgress = workflowProgressAfterFailure(latestProgress, message);
      this.deps.finishWorkflowRun({
        workflowId: workflow.workflowId,
        runId,
        status: "failed",
        progress: latestProgress,
        contextDocument: baseWorkflowContextDocument,
        lastError: message,
      });
    }
  }

  private async executeRun(input: {
    workflow: WorkflowDraftState;
    runId: string;
    executionLevels: string[][];
    baseWorkflowContextDocument: string;
    initialProgress?: WorkflowRunProgressItem[];
  }): Promise<void> {
    const { workflow, runId, executionLevels, baseWorkflowContextDocument, initialProgress } = input;
    const runGraph = workflow.graph;
    const nodeById = new Map(runGraph.nodes.map((node) => [node.id, node]));
    const validation = validateWorkflowGraph(runGraph);
    const storagePlan = workflowStoragePlanFor(workflow.workflowId);
    const artifactsByNodeId = new Map<string, string>();
    const contextArtifacts: Array<{ nodeId: string; title: string; summary: string }> = [];
    const upstreamAgentNodeIdsByNodeId = new Map<string, string[]>();
    let latestSnapshot = this.deps.snapshot();
    let latestRunProgress =
      initialProgress ??
      executionLevels.flat().map((nodeId): WorkflowRunProgressItem => {
        const node = nodeById.get(nodeId);
        return {
          nodeId,
          title: node?.title ?? nodeId,
          status: "queued",
        };
      });
    let runContextDocument = baseWorkflowContextDocument;
    let finalRunContextDocument = baseWorkflowContextDocument;
    let finalReport = "";

    const configuredAgentId = workflow.configuredAgentId || latestSnapshot.configuredAgents[0]?.id || "default-agent";
    const modelId = configuredAgentModelId(workflow, latestSnapshot);
    const workflowWorkDir = workflow.workDir || latestSnapshot.workDir;
    await mkdir(path.join(workflowWorkDir, storagePlan.outputDir), { recursive: true }).catch(() => undefined);
    const activeRun = this.activeRuns.get(runId);
    const isNodePaused = (nodeId: string): boolean => Boolean(activeRun?.pausedNodeIds.has(nodeId));

    const updateRunState = (): void => {
      this.deps.updateWorkflowRunState({
        workflowId: workflow.workflowId,
        runId,
        status: "running",
        progress: latestRunProgress,
        contextDocument: finalRunContextDocument,
        ...(finalReport ? { finalReport } : {}),
      });
    };
    const updateWorkflowRunProgress = (nodeId: string, update: Partial<WorkflowRunProgressItem>): void => {
      latestRunProgress = latestRunProgress.map((item) => (item.nodeId === nodeId ? { ...item, ...update } : item));
      updateRunState();
    };
    const clearWorkflowRunProgressTaskId = (nodeId: string): void => {
      latestRunProgress = latestRunProgress.map((item) => {
        if (item.nodeId !== nodeId || item.taskId === undefined) return item;
        const next = { ...item };
        delete next.taskId;
        return next;
      });
      updateRunState();
    };
    const recordEvent = (event: Omit<WorkflowEvent, "at">): void => {
      this.deps.updateWorkflowRunState({
        workflowId: workflow.workflowId,
        runId,
        status: "running",
        progress: latestRunProgress,
        appendEvents: [{ at: Date.now(), ...event }],
        contextDocument: finalRunContextDocument,
        ...(finalReport ? { finalReport } : {}),
      });
    };

    try {
      for (const nodeId of validation.executableNodeIds) upstreamAgentNodeIdsByNodeId.set(nodeId, []);
      for (const edge of runGraph.edges) {
        const fromNode = nodeById.get(edge.fromNodeId);
        if (fromNode?.kind !== "agent" || !upstreamAgentNodeIdsByNodeId.has(edge.toNodeId)) continue;
        upstreamAgentNodeIdsByNodeId.get(edge.toNodeId)?.push(edge.fromNodeId);
      }
      updateRunState();

      const startWorkflowTask = async (request: RunTaskRequest): Promise<TaskRun> => {
        const existingTaskIds = new Set(latestSnapshot.tasks.map((task) => task.id));
        latestSnapshot = await this.deps.runTask(request);
        const task = latestSnapshot.tasks
          .filter((item) => !existingTaskIds.has(item.id))
          .sort((left, right) => right.createdAt - left.createdAt)
          .find((item) => item.prompt === request.prompt && item.configuredAgentId === request.configuredAgentId);
        if (task) return task;
        const fallbackTask = latestSnapshot.tasks.filter((item) => !existingTaskIds.has(item.id)).sort((left, right) => right.createdAt - left.createdAt)[0];
        if (!fallbackTask) throw new Error("Workflow task creation did not return a new task.");
        return fallbackTask;
      };

      const waitForTask = async (taskId: string, onTaskUpdate?: (task: TaskRun) => void): Promise<TaskRun> => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < WORKFLOW_TASK_TIMEOUT_MS) {
          latestSnapshot = this.deps.snapshot();
          const task = latestSnapshot.tasks.find((item) => item.id === taskId);
          if (!task) throw new Error(`Workflow task ${taskId} was deleted before completion.`);
          onTaskUpdate?.(task);
          if (task.status === "completed") return task;
          if (task.status === "failed" || task.status === "stopped") {
            throw new Error(task.lastError || `Workflow task ${task.title} ${task.status}.`);
          }
          await delay(WORKFLOW_TASK_POLL_MS);
        }
        throw new Error(`Workflow task ${taskId} timed out.`);
      };

      const cleanupWorkflowTask = async (taskId: string): Promise<void> => {
        latestSnapshot = await this.deps.deleteTask(taskId);
      };

      const upstreamArtifactsForNode = (node: WorkflowGraphNode): Array<{ node: WorkflowGraphNode; artifact: string }> =>
        (upstreamAgentNodeIdsByNodeId.get(node.id) ?? [])
          .map((upstreamNodeId) => {
            const upstreamNode = nodeById.get(upstreamNodeId);
            const artifact = artifactsByNodeId.get(upstreamNodeId);
            return upstreamNode && artifact ? { node: upstreamNode, artifact } : undefined;
          })
          .filter((item): item is { node: WorkflowGraphNode; artifact: string } => Boolean(item));

      const nodeAttemptPrompt = (node: WorkflowGraphNode, attempt: number, retryPrompt: string, contextDocument: string): string => {
        const workflowV2PlanNode = workflow.workflowV2Plan?.nodes.find((item) => item.nodeId === node.id);
        const basePrompt = workflowNodeRunPrompt(
          runGraph,
          node,
          upstreamArtifactsForNode(node),
          contextDocument,
          storagePlan,
          workflowV2PlanNode?.taskPacket,
        );
        if (!retryPrompt.trim()) return basePrompt;
        return [
          basePrompt,
          "",
          `This is retry attempt ${attempt} of ${WORKFLOW_NODE_MAX_ATTEMPTS}.`,
          "The workflow judge rejected the previous attempt. Address this retry instruction exactly:",
          retryPrompt.trim(),
        ].join("\n");
      };

      const startNodeAttempt = async (
        node: WorkflowGraphNode,
        attempt: number,
        retryPrompt: string,
        contextDocument: string,
      ): Promise<{ node: WorkflowGraphNode; taskId: string; attempt: number }> => {
        const nodeAgent = resolveWorkflowNodeAgent(node, { configuredAgentId, modelId }, latestSnapshot.configuredAgents);
        const task = await startWorkflowTask({
          prompt: nodeAttemptPrompt(node, attempt, retryPrompt, contextDocument),
          configuredAgentId: nodeAgent.configuredAgentId,
          modelId: nodeAgent.modelId,
          workDir: workflowWorkDir,
        });
        const startDetail = attempt === 1 ? "Task running" : `Retry ${attempt}/${WORKFLOW_NODE_MAX_ATTEMPTS} running`;
        updateWorkflowRunProgress(node.id, {
          status: "running",
          detail: startDetail,
          taskId: task.id,
        });
        activeRun?.taskIdByNodeId.set(node.id, task.id);
        recordEvent({ type: "node_started", nodeId: node.id, taskId: task.id, attempt, detail: startDetail });
        return { node, taskId: task.id, attempt };
      };

      const waitForNodeAttempt = async (startedTask: {
        node: WorkflowGraphNode;
        taskId: string;
        attempt: number;
      }): Promise<{ node: WorkflowGraphNode; task: TaskRun; attempt: number }> => {
        try {
          return {
            node: startedTask.node,
            task: await waitForTask(startedTask.taskId, (task) =>
              updateWorkflowRunProgress(startedTask.node.id, {
                status: "running",
                detail: taskArtifact(task),
                taskId: startedTask.taskId,
              }),
            ),
            attempt: startedTask.attempt,
          };
        } catch (error) {
          if (isNodePaused(startedTask.node.id) || activeRun?.pausedTaskIds.has(startedTask.taskId)) {
            if (activeRun?.taskIdByNodeId.get(startedTask.node.id) === startedTask.taskId) {
              updateWorkflowRunProgress(startedTask.node.id, {
                status: "paused",
                detail: "Paused",
                taskId: startedTask.taskId,
              });
              recordEvent({ type: "node_paused", nodeId: startedTask.node.id, taskId: startedTask.taskId });
            }
            throw new WorkflowNodePausedError(startedTask.node.id);
          }
          const failureMessage = error instanceof Error ? error.message : String(error);
          updateWorkflowRunProgress(startedTask.node.id, {
            status: "failed",
            detail: failureMessage,
            taskId: startedTask.taskId,
          });
          recordEvent({ type: "node_failed", nodeId: startedTask.node.id, error: failureMessage });
          await cleanupWorkflowTask(startedTask.taskId);
          clearWorkflowRunProgressTaskId(startedTask.node.id);
          throw error;
        }
      };

      const evaluateNodeAttempt = async (
        node: WorkflowGraphNode,
        artifact: string,
        attempt: number,
        contextDocument: string,
      ): Promise<WorkflowJudgeResult> => {
        updateWorkflowRunProgress(node.id, {
          status: "running",
          detail: `Evaluating attempt ${attempt}/${WORKFLOW_NODE_MAX_ATTEMPTS}`,
        });
        const judgeTask = await startWorkflowTask({
          prompt: workflowJudgePrompt(runGraph, node, artifact, contextDocument, attempt, WORKFLOW_NODE_MAX_ATTEMPTS),
          configuredAgentId,
          modelId,
          workDir: workflowWorkDir,
        });
        const completedJudgeTask = await (async (): Promise<TaskRun> => {
          try {
            return await waitForTask(judgeTask.id, (task) =>
              updateWorkflowRunProgress(node.id, {
                status: "running",
                detail: `Judge: ${taskArtifact(task)}`,
              }),
            );
          } finally {
            await cleanupWorkflowTask(judgeTask.id);
          }
        })();
        const result = parseWorkflowJudgeResult(taskArtifact(completedJudgeTask));
        if (!result) throw new Error(`Workflow judge for ${node.title} did not return workflowEvaluation.submit(...).`);
        return result;
      };

      for (const level of executionLevels) {
        const levelContextDocument = runContextDocument;
        let pendingNodes = level
          .map((nodeId) => nodeById.get(nodeId))
          .filter((node): node is WorkflowGraphNode => {
            if (!node || node.kind !== "agent") return false;
            const status = latestRunProgress.find((item) => item.nodeId === node.id)?.status;
            return status !== "completed" && status !== "paused" && status !== "awaiting_input";
          });
        if (pendingNodes.length === 0) continue;
        const attemptsByNodeId = new Map<string, number>();
        const retryPromptByNodeId = new Map<string, string>();

        while (pendingNodes.length > 0) {
          const startedTasks: Array<{ node: WorkflowGraphNode; taskId: string; attempt: number }> = [];
          for (const node of pendingNodes) {
            const attempt = (attemptsByNodeId.get(node.id) ?? 0) + 1;
            attemptsByNodeId.set(node.id, attempt);
            startedTasks.push(await startNodeAttempt(node, attempt, retryPromptByNodeId.get(node.id) ?? "", levelContextDocument));
          }

          const completedTasks = await Promise.all(startedTasks.map(waitForNodeAttempt));
          const nextPendingNodes: WorkflowGraphNode[] = [];
          for (const completedTask of completedTasks) {
            const artifact = taskArtifact(completedTask.task);
            const artifactRefs = extractWorkflowArtifactRefs(artifact);
            recordEvent({
              type: "node_output",
              nodeId: completedTask.node.id,
              taskId: completedTask.task.id,
              attempt: completedTask.attempt,
              summary: workflowArtifactSummary(artifact),
              ...(artifactRefs.length > 0 ? { artifactRefs } : {}),
            });

            const gate = parseWorkflowGateRequest(artifact);
            if (gate) {
              activeRun?.gatedNodeIds.add(completedTask.node.id);
              updateWorkflowRunProgress(completedTask.node.id, {
                status: "awaiting_input",
                detail: gate.question,
                taskId: completedTask.task.id,
              });
              clearWorkflowRunProgressTaskId(completedTask.node.id);
              recordEvent({ type: "gate_opened", nodeId: completedTask.node.id, question: gate.question });
              continue;
            }

            const judge = await (async (): Promise<WorkflowJudgeResult> => {
              try {
                return await evaluateNodeAttempt(completedTask.node, artifact, completedTask.attempt, levelContextDocument);
              } finally {
                await cleanupWorkflowTask(completedTask.task.id);
              }
            })();
            recordEvent({
              type: "node_judged",
              nodeId: completedTask.node.id,
              attempt: completedTask.attempt,
              pass: judge.complete,
              detail: truncateWorkflowContext(judge.reason, 160),
            });
            if (judge.complete) {
              artifactsByNodeId.set(completedTask.node.id, artifact);
              contextArtifacts.push({
                nodeId: completedTask.node.id,
                title: completedTask.node.title,
                summary: workflowArtifactSummary(artifact),
              });
              runContextDocument = [baseWorkflowContextDocument.trim(), workflowContextDocumentFromArtifacts(contextArtifacts)].filter(Boolean).join("\n\n");
              finalRunContextDocument = runContextDocument;
              const approvedDetail = `Approved: ${truncateWorkflowContext(judge.reason, 160)}`;
              updateWorkflowRunProgress(completedTask.node.id, {
                status: "completed",
                detail: approvedDetail,
                taskId: completedTask.task.id,
              });
              clearWorkflowRunProgressTaskId(completedTask.node.id);
              recordEvent({ type: "node_completed", nodeId: completedTask.node.id, detail: approvedDetail });
              continue;
            }

            if (completedTask.attempt < WORKFLOW_NODE_MAX_ATTEMPTS) {
              retryPromptByNodeId.set(completedTask.node.id, judge.retryPrompt || judge.reason);
              updateWorkflowRunProgress(completedTask.node.id, {
                status: "queued",
                detail: `Retry requested: ${truncateWorkflowContext(judge.reason, 160)}`,
                taskId: completedTask.task.id,
              });
              clearWorkflowRunProgressTaskId(completedTask.node.id);
              nextPendingNodes.push(completedTask.node);
              continue;
            }

            const rejectedDetail = `Judge rejected after ${WORKFLOW_NODE_MAX_ATTEMPTS} attempts: ${truncateWorkflowContext(judge.reason, 160)}`;
            updateWorkflowRunProgress(completedTask.node.id, {
              status: "failed",
              detail: rejectedDetail,
              taskId: completedTask.task.id,
            });
            clearWorkflowRunProgressTaskId(completedTask.node.id);
            recordEvent({ type: "node_failed", nodeId: completedTask.node.id, error: rejectedDetail });
            throw new Error(`Workflow node ${completedTask.node.title} did not pass evaluation after ${WORKFLOW_NODE_MAX_ATTEMPTS} attempts: ${judge.reason}`);
          }
          pendingNodes = nextPendingNodes;
        }
      }

      if (activeRun && activeRun.gatedNodeIds.size > 0) return;

      const completedNodeProgress = latestRunProgress;
      const finalReviewProgress: WorkflowRunProgressItem = {
        nodeId: WORKFLOW_FINAL_REVIEW_NODE_ID,
        title: "Main agent review",
        status: "running",
        detail: "Main agent reviewing all node outputs",
      };
      latestRunProgress = [...completedNodeProgress, finalReviewProgress];
      updateRunState();
      recordEvent({ type: "node_started", nodeId: WORKFLOW_FINAL_REVIEW_NODE_ID, detail: "Main agent reviewing all node outputs" });

      const nodeArtifacts = validation.executableNodeIds
        .map((nodeId) => {
          const node = nodeById.get(nodeId);
          const artifact = artifactsByNodeId.get(nodeId);
          return node && artifact ? { node, artifact } : undefined;
        })
        .filter((item): item is { node: WorkflowGraphNode; artifact: string } => Boolean(item));
      const finalReviewTask = await startWorkflowTask({
        prompt: workflowFinalReviewPrompt(runGraph, nodeArtifacts, runContextDocument, completedNodeProgress, storagePlan),
        configuredAgentId,
        modelId,
        workDir: workflowWorkDir,
      });
      const completedFinalReviewTask = await (async (): Promise<TaskRun> => {
        try {
          return await waitForTask(finalReviewTask.id, (task) =>
            updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
              status: "running",
              detail: taskArtifact(task),
              taskId: finalReviewTask.id,
            }),
          );
        } finally {
          await cleanupWorkflowTask(finalReviewTask.id);
        }
      })();
      finalReport = taskArtifact(completedFinalReviewTask);
      finalRunContextDocument = [runContextDocument.trim(), ["# Workflow Final Report", "", finalReport].join("\n").trim()]
        .filter(Boolean)
        .join("\n\n");
      updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
        status: "completed",
        detail: "Main agent report ready",
      });
      clearWorkflowRunProgressTaskId(WORKFLOW_FINAL_REVIEW_NODE_ID);
      this.deps.finishWorkflowRun({
        workflowId: workflow.workflowId,
        runId,
        status: "completed",
        progress: latestRunProgress,
        appendEvents: [{ type: "node_completed", nodeId: WORKFLOW_FINAL_REVIEW_NODE_ID, at: Date.now(), detail: "Main agent report ready" }],
        contextDocument: finalRunContextDocument,
        finalReport,
      });
    } catch (error) {
      if (error instanceof WorkflowNodePausedError) return;
      const message = error instanceof Error ? error.message : String(error);
      latestRunProgress = workflowProgressAfterFailure(latestRunProgress, message);
      this.deps.finishWorkflowRun({
        workflowId: workflow.workflowId,
        runId,
        status: "failed",
        progress: latestRunProgress,
        contextDocument: finalRunContextDocument,
        ...(finalReport ? { finalReport } : {}),
        lastError: message,
      });
    }
  }
}
