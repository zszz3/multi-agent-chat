import type {
  AnswerWorkflowGateRequest,
  AppSnapshot,
  FinishWorkflowRunRequest,
  PauseWorkflowNodeRequest,
  RunTaskRequest,
  RunWorkflowGraphRequest,
  StartWorkflowNodeRequest,
  TaskRun,
  WorkflowDraftState,
  WorkflowEvent,
  WorkflowGraphNode,
  WorkflowOperationResult,
  WorkflowRunProgressItem,
} from "../shared/types";
import { DEFAULT_MODEL_ID } from "../shared/models";
import { validateWorkflowGraph, workflowGraphExecutionLevels } from "../shared/workflow-graph";
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
} from "../shared/workflow-run";

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

interface WorkflowRuntimeDependencies {
  snapshot: () => AppSnapshot;
  startWorkflowRun: (input: { workflowId: string; contextDocument?: string }) => WorkflowOperationResult;
  finishWorkflowRun: (input: FinishWorkflowRunRequest) => WorkflowOperationResult;
  updateWorkflowRunState: (input: WorkflowRunStateUpdate) => void;
  runTask: (input: RunTaskRequest) => Promise<AppSnapshot>;
  stopTask: (taskId: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<AppSnapshot>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configuredAgentModelId(workflow: WorkflowDraftState, snapshot: AppSnapshot): string {
  const agent = snapshot.configuredAgents.find((item) => item.id === workflow.configuredAgentId);
  return workflow.modelId || agent?.modelId || DEFAULT_MODEL_ID;
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
}

export class WorkflowRuntime {
  private activeRuns = new Map<string, ActiveWorkflowRun>();

  constructor(private readonly deps: WorkflowRuntimeDependencies) {}

  runWorkflowGraph(input: RunWorkflowGraphRequest): WorkflowOperationResult {
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (workflow.status === "running") return { ok: false, workflowId: workflow.workflowId, error: "Workflow is already running." };

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
    this.deps.updateWorkflowRunState({
      workflowId: input.workflowId,
      runId: input.runId,
      status: "running",
      progress: run.progress.map((item) =>
        item.nodeId === input.nodeId
          ? {
              ...item,
              status: "paused",
              detail: "Paused",
              ...(taskId ? { taskId } : {}),
            }
          : item,
      ),
      appendEvents: [{ type: "node_paused", nodeId: input.nodeId, at: Date.now(), ...(taskId ? { taskId } : {}) }],
      contextDocument: run.contextDocument,
      ...(run.finalReport ? { finalReport: run.finalReport } : {}),
    });

    if (taskId) await this.deps.stopTask(taskId);
    return { ok: true, workflowId: input.workflowId, runId: input.runId };
  }

  async startWorkflowNode(input: StartWorkflowNodeRequest): Promise<WorkflowOperationResult> {
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    const run = snapshot.workflowStore.runs.find((item) => item.runId === input.runId && item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run) return { ok: false, workflowId: input.workflowId, error: `Workflow run ${input.runId} was not found.` };
    if (run.status !== "running") return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow run is not running." };
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

  async answerWorkflowGate(input: AnswerWorkflowGateRequest): Promise<WorkflowOperationResult> {
    const snapshot = this.deps.snapshot();
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === input.workflowId);
    const run = snapshot.workflowStore.runs.find((item) => item.runId === input.runId && item.workflowId === input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run) return { ok: false, workflowId: input.workflowId, error: `Workflow run ${input.runId} was not found.` };
    if (run.status !== "running") return { ok: false, workflowId: input.workflowId, runId: input.runId, error: "Workflow run is not running." };
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
        const basePrompt = workflowNodeRunPrompt(runGraph, node, upstreamArtifactsForNode(node), contextDocument, storagePlan);
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
          workDir: latestSnapshot.workDir,
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
          workDir: latestSnapshot.workDir,
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
        workDir: latestSnapshot.workDir,
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
