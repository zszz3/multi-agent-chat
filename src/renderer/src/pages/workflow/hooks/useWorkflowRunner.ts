import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { MultiAgentChatApi } from "../../../../../preload";
import { validateWorkflowGraph, workflowGraphExecutionLevels } from "../../../../../shared/workflow-graph";
import type {
  AppSnapshot,
  TaskRun,
  WorkflowDraftState,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowRunProgressItem,
} from "../../../../../shared/types";
import { configuredAgentModelId, defaultConfiguredAgentId } from "../../../app/agents";
import {
  delay,
  taskArtifact,
  workflowArtifactSummary,
  workflowContextDocumentFromArtifacts,
  workflowTaskLiveDetail,
} from "../../../app/app-state";
import type { SnapshotService } from "../../../app/services/snapshot-service";
import type { WorkflowService } from "../../../app/services/workflow-service";
import {
  parseWorkflowJudgeResult,
  workflowFinalReviewPrompt,
  workflowJudgePrompt,
  workflowNodeRunPrompt,
  workflowProgressAfterFailure,
} from "../workflow-domain";
import {
  truncateWorkflowContext,
  WORKFLOW_THINKING_MESSAGE,
  workflowStoragePlanDocument,
  workflowStoragePlanFor,
} from "../workflow-utils";
import type { WorkflowDraftController } from "./useWorkflowDraft";

const WORKFLOW_TASK_POLL_MS = 1000;
const WORKFLOW_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const WORKFLOW_NODE_MAX_ATTEMPTS = 2;
const WORKFLOW_FINAL_REVIEW_NODE_ID = "__final_review__";

export interface RunWorkflowGraphResult {
  ok: boolean;
  workflowRunId?: string;
  error?: string;
}

interface UseWorkflowRunnerOptions {
  chatApi: Pick<MultiAgentChatApi, "runTask" | "deleteTask">;
  snapshots: SnapshotService;
  workflows: WorkflowService;
  snapshotRef: MutableRefObject<AppSnapshot>;
  setSnapshot: (snapshot: AppSnapshot) => void;
  workflowRunning: boolean;
  workflowId: string;
  workflowGraph: WorkflowGraph;
  workflowConfiguredAgentId: string;
  workflowModelId: string;
  workflowContextDocument: string;
  workflowAgentSessionId: string | undefined;
  workflowRunIds: string[];
  applyPersistedWorkflowDraft: WorkflowDraftController["applyPersistedWorkflowDraft"];
  askWorkflowAgentFor: WorkflowDraftController["askWorkflowAgentFor"];
  beginWorkflowAssistantRequest: WorkflowDraftController["beginWorkflowAssistantRequest"];
  hasWorkflowAssistantStreamed: WorkflowDraftController["hasWorkflowAssistantStreamed"];
  setWorkflowError: WorkflowDraftController["setWorkflowError"];
  setWorkflowRunning: WorkflowDraftController["setWorkflowRunning"];
  setWorkflowStatus: WorkflowDraftController["setWorkflowStatus"];
  setWorkflowFinalReport: WorkflowDraftController["setWorkflowFinalReport"];
  setWorkflowRunIds: WorkflowDraftController["setWorkflowRunIds"];
  setWorkflowRunProgress: WorkflowDraftController["setWorkflowRunProgress"];
  setWorkflowRunContextDocument: WorkflowDraftController["setWorkflowRunContextDocument"];
  setWorkflowMessages: WorkflowDraftController["setWorkflowMessages"];
  onEnterWorkflow?: () => void;
}

export interface WorkflowRunnerController {
  runWorkflowGraph: () => Promise<void>;
  runWorkflowGraphInternal: (targetWorkflow?: WorkflowDraftState) => Promise<RunWorkflowGraphResult>;
}

export function useWorkflowRunner({
  chatApi,
  snapshots,
  workflows,
  snapshotRef,
  setSnapshot,
  workflowRunning,
  workflowId,
  workflowGraph,
  workflowConfiguredAgentId,
  workflowModelId,
  workflowContextDocument,
  workflowAgentSessionId,
  workflowRunIds,
  applyPersistedWorkflowDraft,
  askWorkflowAgentFor,
  beginWorkflowAssistantRequest,
  hasWorkflowAssistantStreamed,
  setWorkflowError,
  setWorkflowRunning,
  setWorkflowStatus,
  setWorkflowFinalReport,
  setWorkflowRunIds,
  setWorkflowRunProgress,
  setWorkflowRunContextDocument,
  setWorkflowMessages,
  onEnterWorkflow,
}: UseWorkflowRunnerOptions): WorkflowRunnerController {
  const workflowRunningRef = useRef(workflowRunning);

  useEffect(() => {
    workflowRunningRef.current = workflowRunning;
  }, [workflowRunning]);

  const runWorkflowGraphInternal = useCallback(async (targetWorkflow?: WorkflowDraftState): Promise<RunWorkflowGraphResult> => {
    const runWorkflowId = targetWorkflow?.workflowId ?? workflowId;
    const runGraph = targetWorkflow?.graph ?? workflowGraph;
    const runConfiguredAgentId =
      targetWorkflow?.configuredAgentId ||
      workflowConfiguredAgentId ||
      defaultConfiguredAgentId(snapshotRef.current.configuredAgents);
    const runModelId = configuredAgentModelId(
      runConfiguredAgentId,
      targetWorkflow?.modelId || workflowModelId,
      snapshotRef.current.configuredAgents,
      snapshotRef.current.channels,
    );
    const initialWorkflowContextDocument = targetWorkflow?.contextDocument ?? workflowContextDocument;
    const runAgentSessionId = targetWorkflow?.agentSessionId ?? workflowAgentSessionId;

    if (targetWorkflow) {
      applyPersistedWorkflowDraft(targetWorkflow);
      onEnterWorkflow?.();
    }

    const validation = validateWorkflowGraph(runGraph);
    if (!validation.valid || workflowRunningRef.current) {
      const error = workflowRunningRef.current ? "Workflow is already running." : validation.errors.join(" ");
      setWorkflowError(error);
      return { ok: false, error };
    }
    const executionLevels = workflowGraphExecutionLevels(runGraph);
    if (executionLevels.length === 0) {
      const error = "Workflow graph has no executable agent nodes.";
      setWorkflowError(error);
      return { ok: false, error };
    }
    setWorkflowRunning(true);
    setWorkflowStatus("running");
    setWorkflowError(undefined);
    setWorkflowFinalReport("");
    let activeWorkflowRunId: string | undefined;
    let latestRunProgress: WorkflowRunProgressItem[] = [];
    let finalRunContextDocument = "";
    let finalReport = "";
    try {
      let latestSnapshot = snapshotRef.current;
      const storagePlan = workflowStoragePlanFor(runWorkflowId);
      const baseWorkflowContextDocument = [initialWorkflowContextDocument.trim(), workflowStoragePlanDocument(storagePlan)].filter(Boolean).join("\n\n");
      latestSnapshot = await workflows.startRun({
        workflowId: runWorkflowId,
        contextDocument: baseWorkflowContextDocument,
      });
      setSnapshot(latestSnapshot);
      const runningWorkflow = latestSnapshot.workflowStore.workflows.find((workflow) => workflow.workflowId === runWorkflowId);
      activeWorkflowRunId = runningWorkflow?.runIds.at(-1);
      if (!activeWorkflowRunId) throw new Error("Workflow run did not start.");
      setWorkflowRunIds(runningWorkflow?.runIds ?? workflowRunIds);
      const nodeById = new Map(runGraph.nodes.map((node) => [node.id, node]));
      latestRunProgress = executionLevels.flat().map((nodeId) => {
        const node = nodeById.get(nodeId);
        return {
          nodeId,
          title: node?.title ?? nodeId,
          status: "queued",
        };
      });
      setWorkflowRunProgress(latestRunProgress);
      const updateWorkflowRunProgress = (nodeId: string, update: Partial<WorkflowRunProgressItem>): void => {
        latestRunProgress = latestRunProgress.map((item) => (item.nodeId === nodeId ? { ...item, ...update } : item));
        setWorkflowRunProgress(latestRunProgress);
      };
      const clearWorkflowRunProgressTaskId = (nodeId: string): void => {
        latestRunProgress = latestRunProgress.map((item) => {
          if (item.nodeId !== nodeId || item.taskId === undefined) return item;
          const next = { ...item };
          delete next.taskId;
          return next;
        });
        setWorkflowRunProgress(latestRunProgress);
      };
      const cleanupWorkflowTask = async (taskId: string): Promise<void> => {
        try {
          latestSnapshot = await chatApi.deleteTask(taskId);
          setSnapshot(latestSnapshot);
        } catch (error) {
          console.warn("Failed to clean up workflow task", taskId, error);
        }
      };
      setWorkflowRunContextDocument(baseWorkflowContextDocument);
      const artifactsByNodeId = new Map<string, string>();
      const contextArtifacts: Array<{ nodeId: string; title: string; summary: string }> = [];
      let runContextDocument = baseWorkflowContextDocument;
      finalRunContextDocument = baseWorkflowContextDocument;
      const upstreamAgentNodeIdsByNodeId = new Map<string, string[]>();
      for (const nodeId of validation.executableNodeIds) upstreamAgentNodeIdsByNodeId.set(nodeId, []);
      for (const edge of runGraph.edges) {
        const fromNode = nodeById.get(edge.fromNodeId);
        if (fromNode?.kind !== "agent" || !upstreamAgentNodeIdsByNodeId.has(edge.toNodeId)) continue;
        upstreamAgentNodeIdsByNodeId.get(edge.toNodeId)?.push(edge.fromNodeId);
      }

      const startWorkflowTask = async (request: {
        prompt: string;
        configuredAgentId: string;
        modelId: string;
        workDir: string;
      }): Promise<TaskRun> => {
        const existingTaskIds = new Set(latestSnapshot.tasks.map((task) => task.id));
        latestSnapshot = await chatApi.runTask(request);
        setSnapshot(latestSnapshot);
        const task = latestSnapshot.tasks
          .filter((item) => !existingTaskIds.has(item.id))
          .sort((left, right) => right.createdAt - left.createdAt)
          .find((item) => item.prompt === request.prompt && item.configuredAgentId === request.configuredAgentId);
        if (task) return task;
        const fallbackTask = latestSnapshot.tasks
          .filter((item) => !existingTaskIds.has(item.id))
          .sort((left, right) => right.createdAt - left.createdAt)[0];
        if (!fallbackTask) throw new Error("Workflow task creation did not return a new task.");
        return fallbackTask;
      };

      const waitForTask = async (taskId: string, onTaskUpdate?: (task: TaskRun) => void): Promise<TaskRun> => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < WORKFLOW_TASK_TIMEOUT_MS) {
          const polledSnapshot = await snapshots.getSnapshot();
          latestSnapshot = polledSnapshot;
          setSnapshot(polledSnapshot);
          const task = polledSnapshot.tasks.find((item) => item.id === taskId);
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
        const prompt = nodeAttemptPrompt(node, attempt, retryPrompt, contextDocument);
        const task = await startWorkflowTask({
          prompt,
          configuredAgentId: runConfiguredAgentId,
          modelId: runModelId,
          workDir: latestSnapshot.workDir,
        });
        updateWorkflowRunProgress(node.id, {
          status: "running",
          detail: attempt === 1 ? "Task running" : `Retry ${attempt}/${WORKFLOW_NODE_MAX_ATTEMPTS} running`,
          taskId: task.id,
        });
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
                detail: workflowTaskLiveDetail(task),
                taskId: startedTask.taskId,
              }),
            ),
            attempt: startedTask.attempt,
          };
        } catch (error) {
          updateWorkflowRunProgress(startedTask.node.id, {
            status: "failed",
            detail: error instanceof Error ? error.message : String(error),
            taskId: startedTask.taskId,
          });
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
      ) => {
        updateWorkflowRunProgress(node.id, {
          status: "running",
          detail: `Evaluating attempt ${attempt}/${WORKFLOW_NODE_MAX_ATTEMPTS}`,
        });
        const judgeTask = await startWorkflowTask({
          prompt: workflowJudgePrompt(runGraph, node, artifact, contextDocument, attempt, WORKFLOW_NODE_MAX_ATTEMPTS),
          configuredAgentId: runConfiguredAgentId,
          modelId: runModelId,
          workDir: latestSnapshot.workDir,
        });
        const completedJudgeTask = await (async (): Promise<TaskRun> => {
          try {
            return await waitForTask(judgeTask.id, (task) =>
              updateWorkflowRunProgress(node.id, {
                status: "running",
                detail: `Judge: ${workflowTaskLiveDetail(task)}`,
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
        let pendingNodes = level.map((nodeId) => nodeById.get(nodeId)).filter((node): node is WorkflowGraphNode => Boolean(node && node.kind === "agent"));
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
            const judge = await (async () => {
              try {
                return await evaluateNodeAttempt(completedTask.node, artifact, completedTask.attempt, levelContextDocument);
              } finally {
                await cleanupWorkflowTask(completedTask.task.id);
              }
            })();
            if (judge.complete) {
              artifactsByNodeId.set(completedTask.node.id, artifact);
              contextArtifacts.push({
                nodeId: completedTask.node.id,
                title: completedTask.node.title,
                summary: workflowArtifactSummary(artifact),
              });
              runContextDocument = [baseWorkflowContextDocument.trim(), workflowContextDocumentFromArtifacts(contextArtifacts)].filter(Boolean).join("\n\n");
              finalRunContextDocument = runContextDocument;
              setWorkflowRunContextDocument(runContextDocument);
              updateWorkflowRunProgress(completedTask.node.id, {
                status: "completed",
                detail: `Approved: ${truncateWorkflowContext(judge.reason, 160)}`,
                taskId: completedTask.task.id,
              });
              clearWorkflowRunProgressTaskId(completedTask.node.id);
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

            updateWorkflowRunProgress(completedTask.node.id, {
              status: "failed",
              detail: `Judge rejected after ${WORKFLOW_NODE_MAX_ATTEMPTS} attempts: ${truncateWorkflowContext(judge.reason, 160)}`,
              taskId: completedTask.task.id,
            });
            clearWorkflowRunProgressTaskId(completedTask.node.id);
            throw new Error(`Workflow node ${completedTask.node.title} did not pass evaluation after ${WORKFLOW_NODE_MAX_ATTEMPTS} attempts: ${judge.reason}`);
          }
          pendingNodes = nextPendingNodes;
        }
      }

      const completedNodeProgress = latestRunProgress;
      const finalReviewProgress: WorkflowRunProgressItem = {
        nodeId: WORKFLOW_FINAL_REVIEW_NODE_ID,
        title: "Main agent review",
        status: "running",
        detail: "Main agent reviewing all node outputs",
      };
      latestRunProgress = [...completedNodeProgress, finalReviewProgress];
      setWorkflowRunProgress(latestRunProgress);
      const nodeArtifacts = validation.executableNodeIds
        .map((nodeId) => {
          const node = nodeById.get(nodeId);
          const artifact = artifactsByNodeId.get(nodeId);
          return node && artifact ? { node, artifact } : undefined;
        })
        .filter((item): item is { node: WorkflowGraphNode; artifact: string } => Boolean(item));
      const finalReviewPrompt = workflowFinalReviewPrompt(runGraph, nodeArtifacts, runContextDocument, completedNodeProgress, storagePlan);
      const finalReviewRequestId = `workflow-final-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const finalAssistantMessageId = `workflow-final-assistant-${Date.now()}`;
      beginWorkflowAssistantRequest(finalReviewRequestId, finalAssistantMessageId);
      setWorkflowMessages((current) => [...current, { id: finalAssistantMessageId, role: "assistant", content: WORKFLOW_THINKING_MESSAGE }]);
      updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
        status: "running",
        detail: "Main agent reviewing all node outputs",
      });
      try {
        finalReport = await askWorkflowAgentFor(finalReviewPrompt, runAgentSessionId, finalReviewRequestId, runConfiguredAgentId, runModelId);
        if (!hasWorkflowAssistantStreamed() && finalReport) {
          setWorkflowMessages((current) =>
            current.map((message) => (message.id === finalAssistantMessageId ? { ...message, content: finalReport } : message)),
          );
        }
      } catch (error) {
        updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
        setWorkflowMessages((current) =>
          current.map((message) =>
            message.id === finalAssistantMessageId
              ? { ...message, content: `Workflow agent error: ${error instanceof Error ? error.message : String(error)}` }
              : message,
          ),
        );
        throw error;
      }
      setWorkflowFinalReport(finalReport);
      finalRunContextDocument = [
        runContextDocument.trim(),
        ["# Workflow Final Report", "", finalReport].join("\n").trim(),
      ].filter(Boolean).join("\n\n");
      setWorkflowRunContextDocument(finalRunContextDocument);
      updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
        status: "completed",
        detail: "Main agent report ready",
      });
      latestSnapshot = await workflows.finishRun({
        workflowId: runWorkflowId,
        runId: activeWorkflowRunId,
        status: "completed",
        progress: latestRunProgress,
        contextDocument: finalRunContextDocument,
        finalReport,
      });
      setSnapshot(latestSnapshot);
      setWorkflowStatus("completed");
      return { ok: true, workflowRunId: activeWorkflowRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      latestRunProgress = workflowProgressAfterFailure(latestRunProgress, message);
      setWorkflowRunProgress(latestRunProgress);
      if (activeWorkflowRunId) {
        try {
          const failedSnapshot = await workflows.finishRun({
            workflowId: runWorkflowId,
            runId: activeWorkflowRunId,
            status: "failed",
            progress: latestRunProgress,
            contextDocument: finalRunContextDocument,
            ...(finalReport ? { finalReport } : {}),
            lastError: message,
          });
          setSnapshot(failedSnapshot);
          setWorkflowStatus("failed");
        } catch {
          setWorkflowStatus("failed");
        }
      } else {
        setWorkflowStatus("failed");
      }
      setWorkflowError(message);
      return {
        ok: false,
        ...(activeWorkflowRunId !== undefined ? { workflowRunId: activeWorkflowRunId } : {}),
        error: message,
      };
    } finally {
      setWorkflowRunning(false);
    }
  }, [
    applyPersistedWorkflowDraft,
    askWorkflowAgentFor,
    beginWorkflowAssistantRequest,
    chatApi,
    hasWorkflowAssistantStreamed,
    onEnterWorkflow,
    setSnapshot,
    setWorkflowError,
    setWorkflowFinalReport,
    setWorkflowMessages,
    setWorkflowRunContextDocument,
    setWorkflowRunIds,
    setWorkflowRunProgress,
    setWorkflowRunning,
    setWorkflowStatus,
    snapshotRef,
    snapshots,
    workflowAgentSessionId,
    workflowConfiguredAgentId,
    workflowContextDocument,
    workflowGraph,
    workflowId,
    workflowModelId,
    workflowRunIds,
    workflows,
  ]);

  const runWorkflowGraph = useCallback(async (): Promise<void> => {
    await runWorkflowGraphInternal();
  }, [runWorkflowGraphInternal]);

  return {
    runWorkflowGraph,
    runWorkflowGraphInternal,
  };
}
