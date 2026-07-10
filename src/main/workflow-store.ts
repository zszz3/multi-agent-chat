import path from "node:path";
import { createWorkflowGraphFromObjective, validateWorkflowGraph } from "../shared/workflow-graph";
import type {
  AppendWorkflowContextRequest,
  AppendWorkflowRunContextRequest,
  CreateWorkflowDraftRequest,
  CreateWorkflowRequest,
  FinishWorkflowRunRequest,
  PatchWorkflowDraftRequest,
  StartWorkflowRunRequest,
  UpdateWorkflowRequest,
  WorkflowArtifactReference,
  WorkflowDraftState,
  WorkflowGraph,
  WorkflowOperationResult,
  WorkflowRunState,
  WorkflowStoreState,
} from "../shared/types";

const MAX_WORKFLOW_COUNT = 200;
const MAX_WORKFLOW_NODE_COUNT = 50;
const MAX_WORKFLOW_EDGE_COUNT = 100;
const MAX_WORKFLOW_NODE_PROMPT_CHARS = 8000;
const MAX_WORKFLOW_CONTEXT_APPEND_CHARS = 12000;
const MAX_WORKFLOW_ARTIFACTS_PER_APPEND = 20;
const MAX_WORKFLOW_TEXT_ARTIFACT_CHARS = 8000;
const MAX_WORKFLOW_TITLE_CHARS = 160;
const MAX_WORKFLOW_OBJECTIVE_CHARS = 4000;

export interface WorkflowRunStateUpdate {
  workflowId: string;
  runId: string;
  status?: "running";
  progress?: WorkflowRunState["progress"];
  appendEvents?: WorkflowRunState["events"];
  contextDocument?: string;
  finalReport?: string;
  lastError?: string;
}

export interface WorkflowStoreDependencies {
  normalizeDraft: (draft: WorkflowDraftState) => WorkflowDraftState;
  now: () => number;
  createWorkflowId: () => string;
  createRunId: () => string;
  onChange: () => void;
}

export class WorkflowStore {
  private readonly workflows = new Map<string, WorkflowDraftState>();
  private readonly runs = new Map<string, WorkflowRunState>();
  private activeWorkflowId: string | undefined;

  constructor(private readonly deps: WorkflowStoreDependencies) {}

  get activeId(): string | undefined {
    return this.activeWorkflowId;
  }

  set activeId(workflowId: string | undefined) {
    this.activeWorkflowId = workflowId;
  }

  workflowCount(): number {
    return this.workflows.size;
  }

  hasWorkflow(workflowId: string): boolean {
    return this.workflows.has(workflowId);
  }

  workflowValues(): WorkflowDraftState[] {
    return [...this.workflows.values()].map((workflow) => this.deps.normalizeDraft(workflow));
  }

  setWorkflow(_workflowId: string, workflow: WorkflowDraftState): void {
    const existing = this.workflows.get(workflow.workflowId);
    const guarded = existing?.topologyLocked
      ? {
          ...workflow,
          sourceType: "official" as const,
          topologyLocked: true,
          title: existing.title,
          objective: existing.objective,
          graph: isAllowedOfficialGraphUpdate(existing.graph, workflow.graph) ? workflow.graph : existing.graph,
        }
      : workflow;
    const normalized = this.deps.normalizeDraft(guarded);
    this.workflows.set(normalized.workflowId, normalized);
  }

  removeWorkflow(workflowId: string): boolean {
    return this.workflows.delete(workflowId);
  }

  clearWorkflows(): void {
    this.workflows.clear();
    this.activeWorkflowId = undefined;
  }

  runValues(): WorkflowRunState[] {
    return [...this.runs.values()].map((run) => structuredClone(run));
  }

  setRun(_runId: string, run: WorkflowRunState): void {
    this.runs.set(run.runId, structuredClone(run));
  }

  removeRun(runId: string): boolean {
    return this.runs.delete(runId);
  }

  clearRuns(): void {
    this.runs.clear();
  }

  createDraft(input: CreateWorkflowDraftRequest = {}): WorkflowDraftState | undefined {
    if (this.workflows.size >= MAX_WORKFLOW_COUNT) return undefined;
    const now = this.deps.now();
    const graph = createWorkflowGraphFromObjective("");
    const workflow = this.deps.normalizeDraft({
      workflowId: this.deps.createWorkflowId(),
      sourceType: "user",
      topologyLocked: false,
      title: input.title?.trim() || graph.title,
      status: "draft",
      revision: 1,
      configuredAgentId: input.configuredAgentId ?? "",
      modelId: input.modelId ?? "",
      objective: "",
      graph,
      graphReady: false,
      messages: [],
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      createdAt: now,
      updatedAt: now,
    });
    this.workflows.set(workflow.workflowId, workflow);
    this.activeWorkflowId = workflow.workflowId;
    this.deps.onChange();
    return this.deps.normalizeDraft(workflow);
  }

  getWorkflow(workflowId: string): WorkflowDraftState | undefined {
    const workflow = this.workflows.get(workflowId);
    return workflow ? this.deps.normalizeDraft(workflow) : undefined;
  }

  replaceDraft(draft: WorkflowDraftState | undefined): void {
    if (!draft) {
      this.clearWorkflows();
      this.clearRuns();
      this.deps.onChange();
      return;
    }
    const normalized = this.deps.normalizeDraft(draft);
    this.workflows.set(normalized.workflowId, normalized);
    this.activeWorkflowId = normalized.workflowId;
    this.deps.onChange();
  }

  patchDraft(input: PatchWorkflowDraftRequest): WorkflowDraftState | undefined {
    const current = this.workflows.get(input.workflowId);
    if (!current) return undefined;
    if (current.topologyLocked && input.graph && !isAllowedOfficialGraphUpdate(current.graph, input.graph)) return undefined;
    if (current.topologyLocked && (input.title !== undefined || input.objective !== undefined)) return undefined;
    const {
      finalReport: _currentFinalReport,
      runtimeConversation: _currentRuntimeConversation,
      ...currentWithoutOptionalRuntimeFields
    } = current;
    const next = this.deps.normalizeDraft({
      ...currentWithoutOptionalRuntimeFields,
      title: input.title ?? current.title,
      status: input.resetRunState ? "draft" : input.status ?? current.status,
      revision: current.revision + 1,
      configuredAgentId: input.configuredAgentId ?? current.configuredAgentId,
      modelId: input.modelId ?? current.modelId,
      objective: input.objective ?? current.objective,
      ...(input.workDir === null
        ? {}
        : input.workDir !== undefined
          ? { workDir: input.workDir }
          : current.workDir
            ? { workDir: current.workDir }
            : {}),
      graph: input.graph ?? current.graph,
      graphReady: input.graphReady ?? current.graphReady,
      messages: input.messages ?? current.messages,
      reply: input.reply ?? current.reply,
      error: input.error === null ? undefined : input.error ?? current.error,
      runProgress: input.resetRunState ? [] : input.runProgress ?? current.runProgress,
      runContextDocument: input.resetRunState ? "" : input.runContextDocument ?? current.runContextDocument,
      contextDocument: input.contextDocument ?? current.contextDocument,
      ...(input.finalReport === null
        ? {}
        : input.finalReport !== undefined
          ? { finalReport: input.finalReport }
          : input.resetRunState
            ? {}
            : current.finalReport !== undefined
              ? { finalReport: current.finalReport }
              : {}),
      runIds: input.resetRunState ? [] : [...current.runIds],
      ...(input.runtimeConversation === null
        ? {}
        : input.runtimeConversation !== undefined
          ? { runtimeConversation: input.runtimeConversation }
          : current.runtimeConversation !== undefined
            ? { runtimeConversation: current.runtimeConversation }
            : {}),
      createdAt: current.createdAt,
      updatedAt: this.deps.now(),
    });
    this.workflows.set(next.workflowId, next);
    this.activeWorkflowId = next.workflowId;
    this.deps.onChange();
    return this.deps.normalizeDraft(next);
  }

  resetDraftSession(workflowId: string): WorkflowDraftState | undefined {
    const current = this.workflows.get(workflowId);
    if (!current || current.topologyLocked) return undefined;
    const graph = createWorkflowGraphFromObjective("");
    const {
      finalReport: _currentFinalReport,
      runtimeConversation: _currentRuntimeConversation,
      ...currentWithoutFinalReportOrConversation
    } = current;
    const next = this.deps.normalizeDraft({
      ...currentWithoutFinalReportOrConversation,
      title: graph.title,
      status: "draft",
      revision: current.revision + 1,
      objective: "",
      graph,
      graphReady: false,
      messages: [],
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      updatedAt: this.deps.now(),
    });
    this.workflows.set(next.workflowId, next);
    this.activeWorkflowId = next.workflowId;
    this.deps.onChange();
    return this.deps.normalizeDraft(next);
  }

  createWorkflow(input: CreateWorkflowRequest): WorkflowOperationResult {
    if (this.workflows.size >= MAX_WORKFLOW_COUNT) {
      return { ok: false, error: `Workflow count exceeds ${MAX_WORKFLOW_COUNT}.` };
    }
    const limitError = workflowLimitError(input.graph, input.title, input.objective);
    if (limitError) return { ok: false, error: limitError };
    const validation = validateWorkflowGraph(input.graph);
    if (!validation.valid) {
      return { ok: false, error: validation.errors[0] ?? "Workflow graph is invalid.", validation };
    }
    const now = this.deps.now();
    const workflowId = this.deps.createWorkflowId();
    const workflow = this.deps.normalizeDraft({
      workflowId,
      sourceType: "user",
      topologyLocked: false,
      title: input.title.trim() || input.graph.title,
      status: "draft",
      revision: 1,
      configuredAgentId: input.configuredAgentId ?? "",
      modelId: input.modelId ?? "",
      objective: input.objective.trim() || input.graph.objective,
      ...(input.workDir?.trim() ? { workDir: input.workDir.trim() } : {}),
      graph: input.graph,
      graphReady: input.graphReady ?? true,
      messages: input.messages ?? [],
      reply: input.reply ?? "",
      error: input.error,
      runProgress: input.runProgress ?? [],
      runContextDocument: input.runContextDocument ?? "",
      contextDocument: input.contextDocument ?? "",
      ...(input.finalReport !== undefined ? { finalReport: input.finalReport } : {}),
      runIds: input.runIds ?? [],
      ...(input.runtimeConversation ? { runtimeConversation: input.runtimeConversation } : {}),
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
    this.workflows.set(workflow.workflowId, workflow);
    this.activeWorkflowId = workflow.workflowId;
    this.deps.onChange();
    return { ok: true, workflowId: workflow.workflowId, revision: workflow.revision, validation };
  }

  ensureBundledWorkflows(defs: Array<{ workflowId: string; title: string; objective: string; graph: WorkflowGraph }>): boolean {
    let changed = false;
    for (const def of defs) {
      if (!def.workflowId) continue;
      const now = this.deps.now();
      const existing = this.workflows.get(def.workflowId);
      const existingNodes = new Map(existing?.graph.nodes.map((node) => [node.id, node]) ?? []);
      const graph: WorkflowGraph = {
        ...structuredClone(def.graph),
        nodes: def.graph.nodes.map((node) => {
          const override = existingNodes.get(node.id);
          if (node.kind !== "agent" || !override) return structuredClone(node);
          return {
            ...structuredClone(node),
            prompt: override.prompt,
            ...(override.configuredAgentId ? { configuredAgentId: override.configuredAgentId } : {}),
            ...(override.modelId ? { modelId: override.modelId } : {}),
          };
        }),
      };
      const workflow = this.deps.normalizeDraft({
        workflowId: def.workflowId,
        sourceType: "official",
        topologyLocked: true,
        title: def.title,
        status: existing?.status ?? "draft",
        revision: existing?.revision ?? 1,
        configuredAgentId: existing?.configuredAgentId ?? "",
        modelId: existing?.modelId ?? "",
        objective: def.objective,
        graph,
        graphReady: true,
        messages: existing?.messages ?? [],
        reply: existing?.reply ?? "",
        error: existing?.error,
        runProgress: existing?.runProgress ?? [],
        runContextDocument: existing?.runContextDocument ?? "",
        contextDocument: existing?.contextDocument ?? "",
        ...(existing?.finalReport !== undefined ? { finalReport: existing.finalReport } : {}),
        runIds: existing?.runIds ?? [],
        ...(existing?.runtimeConversation ? { runtimeConversation: existing.runtimeConversation } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      this.workflows.set(workflow.workflowId, workflow);
      if (!this.activeWorkflowId) this.activeWorkflowId = workflow.workflowId;
      changed = true;
    }
    if (changed) this.deps.onChange();
    return changed;
  }

  selectWorkflow(workflowId: string): boolean {
    if (!this.workflows.has(workflowId)) return false;
    this.activeWorkflowId = workflowId;
    this.deps.onChange();
    return true;
  }

  renameWorkflow(workflowId: string, title: string): boolean {
    const workflow = this.workflows.get(workflowId);
    const nextTitle = title.trim();
    if (!workflow || workflow.topologyLocked || !nextTitle) return false;
    this.workflows.set(workflowId, this.deps.normalizeDraft({
      ...workflow,
      title: nextTitle,
      revision: workflow.revision + 1,
      updatedAt: this.deps.now(),
    }));
    this.deps.onChange();
    return true;
  }

  deleteWorkflow(workflowId: string): boolean {
    if (this.workflows.get(workflowId)?.topologyLocked) return false;
    if (!this.workflows.delete(workflowId)) return false;
    for (const run of this.runs.values()) {
      if (run.workflowId === workflowId) this.runs.delete(run.runId);
    }
    if (this.activeWorkflowId === workflowId || (this.activeWorkflowId && !this.workflows.has(this.activeWorkflowId))) {
      this.activeWorkflowId = [...this.workflows.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.workflowId;
    }
    this.deps.onChange();
    return true;
  }

  updateWorkflow(input: UpdateWorkflowRequest): WorkflowOperationResult {
    const current = this.workflows.get(input.workflowId);
    if (!current) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (current.status === "running") return { ok: false, error: "Cannot modify workflow graph while it is running." };
    if (current.topologyLocked) {
      const changesIdentity =
        (input.title !== undefined && input.title !== current.title) ||
        (input.objective !== undefined && input.objective !== current.objective);
      if (changesIdentity || (input.graph && !isAllowedOfficialGraphUpdate(current.graph, input.graph))) {
        return { ok: false, error: "Official workflow topology is read-only." };
      }
    }
    if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) {
      return {
        ok: false,
        workflowId: current.workflowId,
        revision: current.revision,
        error: "Workflow changed since you read it. Call workflow_get and retry.",
      };
    }
    const graph = input.graph ?? current.graph;
    const limitError = workflowLimitError(graph, input.title ?? current.title, input.objective ?? current.objective);
    if (limitError) {
      return { ok: false, workflowId: current.workflowId, revision: current.revision, error: limitError };
    }
    const validation = validateWorkflowGraph(graph);
    if (!validation.valid) {
      return {
        ok: false,
        workflowId: current.workflowId,
        revision: current.revision,
        error: validation.errors[0] ?? "Workflow graph is invalid.",
        validation,
      };
    }
    const next = this.deps.normalizeDraft({
      ...current,
      title: input.title ?? current.title,
      objective: input.objective ?? current.objective,
      graph,
      configuredAgentId: input.configuredAgentId ?? current.configuredAgentId,
      modelId: input.modelId ?? current.modelId,
      graphReady: input.graphReady ?? current.graphReady,
      messages: input.messages ?? current.messages,
      reply: input.reply ?? current.reply,
      error: input.error ?? current.error,
      runProgress: input.runProgress ?? current.runProgress,
      runContextDocument: input.runContextDocument ?? current.runContextDocument,
      contextDocument: input.contextDocument ?? current.contextDocument,
      ...((input.finalReport ?? current.finalReport) !== undefined
        ? { finalReport: input.finalReport ?? current.finalReport }
        : {}),
      ...(input.runtimeConversation !== undefined
        ? { runtimeConversation: input.runtimeConversation }
        : current.runtimeConversation
          ? { runtimeConversation: current.runtimeConversation }
          : {}),
      revision: current.revision + 1,
      updatedAt: this.deps.now(),
    });
    this.workflows.set(next.workflowId, next);
    this.deps.onChange();
    return { ok: true, workflowId: next.workflowId, revision: next.revision, validation };
  }

  appendContext(input: AppendWorkflowContextRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    const limitError = contextAppendLimitError(input);
    if (limitError) {
      return { ok: false, workflowId: workflow.workflowId, revision: workflow.revision, error: limitError };
    }
    const appended = formatWorkflowContextAppend(input.report, input.handoff, input.artifacts);
    const next = this.deps.normalizeDraft({
      ...workflow,
      contextDocument: [workflow.contextDocument.trim(), appended].filter(Boolean).join("\n\n"),
      revision: workflow.revision + 1,
      updatedAt: this.deps.now(),
    });
    this.workflows.set(next.workflowId, next);
    this.deps.onChange();
    return { ok: true, workflowId: next.workflowId, revision: next.revision };
  }

  appendRunContext(input: AppendWorkflowRunContextRequest): WorkflowOperationResult {
    const run = this.runs.get(input.runId);
    if (!run || run.workflowId !== input.workflowId) {
      return { ok: false, error: `Workflow run ${input.runId} was not found.` };
    }
    if (run.status !== "running") return { ok: false, error: "Cannot append to a workflow run after it has finished." };
    const limitError = contextAppendLimitError(input);
    if (limitError) return { ok: false, workflowId: input.workflowId, error: limitError };
    const appended = formatWorkflowContextAppend(input.report, input.handoff, input.artifacts, input.nodeId);
    this.runs.set(run.runId, {
      ...run,
      contextDocument: [run.contextDocument.trim(), appended].filter(Boolean).join("\n\n"),
    });
    this.deps.onChange();
    return { ok: true, workflowId: input.workflowId };
  }

  startRun(input: StartWorkflowRunRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (workflow.status === "running") return { ok: false, error: "Workflow is already running." };
    const runId = this.deps.createRunId();
    const run: WorkflowRunState = {
      runId,
      workflowId: workflow.workflowId,
      status: "running",
      graphSnapshot: structuredClone(workflow.graph),
      progress: [],
      events: [],
      contextDocument: input.contextDocument ?? workflow.contextDocument,
      startedAt: this.deps.now(),
      finishedAt: undefined,
      lastError: undefined,
    };
    this.runs.set(runId, run);
    const { finalReport: _finalReport, ...workflowWithoutFinalReport } = workflow;
    const nextWorkflow = this.deps.normalizeDraft({
      ...workflowWithoutFinalReport,
      status: "running",
      runIds: [...workflow.runIds, runId],
      error: undefined,
      runProgress: [],
      runContextDocument: input.contextDocument ?? workflow.runContextDocument,
      updatedAt: this.deps.now(),
    });
    this.workflows.set(workflow.workflowId, nextWorkflow);
    this.deps.onChange();
    return { ok: true, workflowId: workflow.workflowId, runId, revision: workflow.revision };
  }

  finishRun(input: FinishWorkflowRunRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    const run = this.runs.get(input.runId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run || run.workflowId !== input.workflowId) {
      return { ok: false, error: `Workflow run ${input.runId} was not found.` };
    }
    const nextRun: WorkflowRunState = {
      ...run,
      status: input.status,
      progress: input.progress ?? run.progress,
      events: input.appendEvents && input.appendEvents.length > 0 ? [...run.events, ...input.appendEvents] : run.events,
      contextDocument: input.contextDocument ?? run.contextDocument,
      ...((input.finalReport ?? run.finalReport) !== undefined
        ? { finalReport: input.finalReport ?? run.finalReport }
        : {}),
      finishedAt: this.deps.now(),
      lastError: input.lastError,
    };
    this.runs.set(run.runId, nextRun);
    const nextWorkflow = this.deps.normalizeDraft({
      ...workflow,
      status: input.status,
      runProgress: input.progress ?? workflow.runProgress,
      runContextDocument: input.contextDocument ?? workflow.runContextDocument,
      ...((input.finalReport ?? workflow.finalReport) !== undefined
        ? { finalReport: input.finalReport ?? workflow.finalReport }
        : {}),
      error: input.lastError,
      updatedAt: this.deps.now(),
    });
    this.workflows.set(workflow.workflowId, nextWorkflow);
    this.deps.onChange();
    return { ok: true, workflowId: workflow.workflowId, runId: run.runId, revision: workflow.revision };
  }

  updateRun(input: WorkflowRunStateUpdate): void {
    const workflow = this.workflows.get(input.workflowId);
    const run = this.runs.get(input.runId);
    if (!workflow || !run || run.workflowId !== input.workflowId) return;
    const nextRun: WorkflowRunState = {
      ...run,
      status: input.status ?? run.status,
      progress: input.progress ?? run.progress,
      events: input.appendEvents && input.appendEvents.length > 0 ? [...run.events, ...input.appendEvents] : run.events,
      contextDocument: input.contextDocument ?? run.contextDocument,
      ...((input.finalReport ?? run.finalReport) !== undefined
        ? { finalReport: input.finalReport ?? run.finalReport }
        : {}),
      lastError: input.lastError ?? run.lastError,
    };
    this.runs.set(run.runId, nextRun);
    this.workflows.set(workflow.workflowId, this.deps.normalizeDraft({
      ...workflow,
      status: input.status ?? workflow.status,
      runProgress: input.progress ?? workflow.runProgress,
      runContextDocument: input.contextDocument ?? workflow.runContextDocument,
      ...((input.finalReport ?? workflow.finalReport) !== undefined
        ? { finalReport: input.finalReport ?? workflow.finalReport }
        : {}),
      error: input.lastError ?? workflow.error,
      updatedAt: this.deps.now(),
    }));
    this.deps.onChange();
  }

  getRun(runId: string): WorkflowRunState | undefined {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : undefined;
  }

  snapshot(): WorkflowStoreState {
    return {
      activeWorkflowId: this.activeWorkflowId,
      workflows: [...this.workflows.values()]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((workflow) => this.deps.normalizeDraft(workflow)),
      runs: [...this.runs.values()]
        .sort((left, right) => right.startedAt - left.startedAt)
        .map((run) => structuredClone(run)),
    };
  }
}

function workflowLimitError(graph: WorkflowGraph, title: string, objective: string): string | undefined {
  if (title.length > MAX_WORKFLOW_TITLE_CHARS) return `Workflow title exceeds ${MAX_WORKFLOW_TITLE_CHARS} characters.`;
  if (objective.length > MAX_WORKFLOW_OBJECTIVE_CHARS) return `Workflow objective exceeds ${MAX_WORKFLOW_OBJECTIVE_CHARS} characters.`;
  if (graph.nodes.length > MAX_WORKFLOW_NODE_COUNT) return `Workflow graph exceeds ${MAX_WORKFLOW_NODE_COUNT} nodes.`;
  if (graph.edges.length > MAX_WORKFLOW_EDGE_COUNT) return `Workflow graph exceeds ${MAX_WORKFLOW_EDGE_COUNT} edges.`;
  const oversizedNode = graph.nodes.find((node) => node.prompt.length > MAX_WORKFLOW_NODE_PROMPT_CHARS);
  if (oversizedNode) {
    return `Workflow node ${oversizedNode.id} prompt exceeds ${MAX_WORKFLOW_NODE_PROMPT_CHARS} characters.`;
  }
  return undefined;
}

function isAllowedOfficialGraphUpdate(current: WorkflowGraph, next: WorkflowGraph): boolean {
  if (current.title !== next.title || current.objective !== next.objective) return false;
  if (current.nodes.length !== next.nodes.length || current.edges.length !== next.edges.length) return false;
  for (let index = 0; index < current.nodes.length; index += 1) {
    const before = current.nodes[index];
    const after = next.nodes[index];
    if (!before || !after) return false;
    if (before.id !== after.id || before.kind !== after.kind || before.title !== after.title) return false;
    if (before.position?.x !== after.position?.x || before.position?.y !== after.position?.y) return false;
    if (before.kind !== "agent") {
      if (before.prompt !== after.prompt || before.configuredAgentId !== after.configuredAgentId || before.modelId !== after.modelId) return false;
    }
  }
  return current.edges.every((before, index) => {
    const after = next.edges[index];
    return Boolean(
      after &&
      before.id === after.id &&
      before.fromNodeId === after.fromNodeId &&
      before.toNodeId === after.toNodeId,
    );
  });
}

function contextAppendLimitError(input: AppendWorkflowContextRequest): string | undefined {
  if (input.report.length + input.handoff.length > MAX_WORKFLOW_CONTEXT_APPEND_CHARS) {
    return `Workflow context append exceeds ${MAX_WORKFLOW_CONTEXT_APPEND_CHARS} characters.`;
  }
  const artifacts = input.artifacts ?? [];
  if (artifacts.length > MAX_WORKFLOW_ARTIFACTS_PER_APPEND) {
    return `Workflow context append exceeds ${MAX_WORKFLOW_ARTIFACTS_PER_APPEND} artifacts.`;
  }
  const oversizedArtifact = artifacts.find(
    (artifact) => artifact.kind === "text" && (artifact.content ?? "").length > MAX_WORKFLOW_TEXT_ARTIFACT_CHARS,
  );
  if (oversizedArtifact) {
    return `Workflow text artifact ${oversizedArtifact.title} exceeds ${MAX_WORKFLOW_TEXT_ARTIFACT_CHARS} characters.`;
  }
  return undefined;
}

function formatWorkflowContextAppend(
  report: string,
  handoff: string,
  artifacts: WorkflowArtifactReference[] = [],
  nodeId?: string,
): string {
  const sections = [`## ${nodeId ? `Node ${nodeId}` : "Workflow"} Context Update`];
  const trimmedReport = report.trim();
  if (trimmedReport) sections.push("### Work Completion Report", trimmedReport);
  const trimmedHandoff = handoff.trim();
  if (trimmedHandoff) sections.push("### Handoff", trimmedHandoff);
  const artifactLines = artifacts
    .slice(0, MAX_WORKFLOW_ARTIFACTS_PER_APPEND)
    .map((artifact) => {
      if (artifact.kind === "text") return `- ${artifact.title}: ${artifact.content ?? ""}`.trim();
      if (artifact.kind === "file") return `- ${artifact.title}: ${path.basename(artifact.path ?? "")}`;
      return `- ${artifact.title}: ${artifact.url ?? ""}`;
    })
    .filter((line) => line.length > 2);
  if (artifactLines.length > 0) sections.push("### Artifacts", artifactLines.join("\n"));
  return sections.join("\n").trim();
}
