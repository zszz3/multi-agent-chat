import { useMemo } from "react";
import type { AppSnapshot } from "../../../../../shared/types";
import { configuredAgentModelId, defaultConfiguredAgentId } from "../../../app/agents";
import type { WorkflowController } from "../workflow-controller";
import type { WorkflowDraftController } from "./useWorkflowDraft";
import type { WorkflowRunnerController } from "./useWorkflowRunner";

interface UseWorkflowFeatureControllerOptions {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  draft: WorkflowDraftController;
  runner: WorkflowRunnerController;
  language: "en" | "zh";
  onChooseWorkDir: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onReadOutputFile?: WorkflowController["onReadOutputFile"];
}

export function useWorkflowFeatureController({
  snapshot,
  setSnapshot,
  draft,
  runner,
  language,
  onChooseWorkDir,
  onRefresh,
  onReadOutputFile,
}: UseWorkflowFeatureControllerOptions): WorkflowController {
  const activeRunId =
    snapshot.workflowStore.runs.find((run) => run.workflowId === draft.workflowId && run.status === "running")?.runId ??
    draft.workflowRunIds[draft.workflowRunIds.length - 1];
  const artifacts = (snapshot.artifacts ?? []).filter((artifact) => artifact.target === draft.workflowId || artifact.target === activeRunId);

  return useMemo(
    () => ({
      workflowId: draft.workflowId,
      title: draft.workflowTitle,
      status: draft.workflowStatus,
      graph: draft.workflowGraph,
      graphReady: draft.workflowGraphReady,
      objective: draft.workflowObjective,
      messages: draft.workflowMessages,
      reply: draft.workflowReply,
      error: draft.workflowError,
      configuredAgentId: draft.workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
      modelId: draft.workflowModelId,
      runtimes: snapshot.runtimes,
      channels: snapshot.channels,
      configuredAgents: snapshot.configuredAgents,
      workDir: snapshot.workDir,
      running: draft.workflowRunning,
      runProgress: draft.workflowRunProgress,
      ...(activeRunId ? { activeRunId } : {}),
      artifacts,
      contextDocument: draft.workflowRunContextDocument,
      finalReport: draft.workflowFinalReport,
      onObjectiveChange: draft.setWorkflowObjective,
      onPauseNode: async (nodeId: string) => {
        if (!activeRunId || typeof window.multiAgentChat.pauseWorkflowNode !== "function") return;
        const result = await window.multiAgentChat.pauseWorkflowNode({ workflowId: draft.workflowId, runId: activeRunId, nodeId });
        setSnapshot(await window.multiAgentChat.getSnapshot());
        if (!result.ok && result.error) draft.setWorkflowError(result.error);
      },
      onStartNode: async (nodeId: string) => {
        if (!activeRunId || typeof window.multiAgentChat.startWorkflowNode !== "function") return;
        draft.setWorkflowRunning(true);
        draft.setWorkflowStatus("running");
        const result = await window.multiAgentChat.startWorkflowNode({ workflowId: draft.workflowId, runId: activeRunId, nodeId });
        setSnapshot(await window.multiAgentChat.getSnapshot());
        if (!result.ok && result.error) draft.setWorkflowError(result.error);
      },
      onAnswerGate: async (nodeId: string, answer: string) => {
        if (!activeRunId || typeof window.multiAgentChat.answerWorkflowGate !== "function") return;
        draft.setWorkflowRunning(true);
        draft.setWorkflowStatus("running");
        const result = await window.multiAgentChat.answerWorkflowGate({ workflowId: draft.workflowId, runId: activeRunId, nodeId, answer });
        setSnapshot(await window.multiAgentChat.getSnapshot());
        if (!result.ok && result.error) draft.setWorkflowError(result.error);
      },
      onSelectConfiguredAgent: (configuredAgentId: string) => {
        draft.setWorkflowConfiguredAgentId(configuredAgentId);
        draft.setWorkflowModelId(configuredAgentModelId(configuredAgentId, undefined, snapshot.configuredAgents, snapshot.channels));
      },
      onSelectModel: draft.setWorkflowModelId,
      onDraftGraph: draft.draftWorkflowGraph,
      onReplyChange: draft.setWorkflowReply,
      onSendReply: draft.sendWorkflowReply,
      onUpdateNode: draft.updateWorkflowNode,
      onRunGraph: runner.runWorkflowGraph,
      onResetSession: draft.resetWorkflowSession,
      onStopGrill: draft.stopWorkflowGrill,
      onChooseWorkDir,
      onRefresh,
      ...(onReadOutputFile ? { onReadOutputFile } : {}),
      ...(typeof window.multiAgentChat.listWorkflowOutputs === "function"
        ? {
            onListOutputs: () => window.multiAgentChat.listWorkflowOutputs(draft.workflowId),
          }
        : {}),
      language,
    }),
    [
      activeRunId,
      artifacts,
      draft,
      language,
      onChooseWorkDir,
      onReadOutputFile,
      onRefresh,
      runner.runWorkflowGraph,
      setSnapshot,
      snapshot.channels,
      snapshot.configuredAgents,
      snapshot.runtimes,
      snapshot.workDir,
    ],
  );
}
