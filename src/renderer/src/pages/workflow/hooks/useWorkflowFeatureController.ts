import { useMemo } from "react";
import type { AppSnapshot } from "../../../../../shared/types";
import { defaultConfiguredAgentId } from "../../../app/agents";
import type { WorkflowService } from "../../../app/services/workflow-service";
import type { WorkflowController } from "../workflow-controller";
import type { WorkflowDraftController } from "./useWorkflowDraft";
import type { WorkflowRunnerController } from "./useWorkflowRunner";

interface UseWorkflowFeatureControllerOptions {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  workflows: WorkflowService;
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
  workflows,
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
  const activeWorkflow = snapshot.workflowStore.workflows.find((workflow) => workflow.workflowId === draft.workflowId);

  return useMemo(
    () => ({
      ...(draft.workflowId ? { workflowId: draft.workflowId } : {}),
      sourceType: activeWorkflow?.sourceType ?? "user",
      topologyLocked: activeWorkflow?.topologyLocked === true,
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
        if (!draft.workflowId || !activeRunId) return;
        const result = await workflows.pauseNode({ workflowId: draft.workflowId, runId: activeRunId, nodeId });
        if (!result.ok && result.error) {
          const next = await workflows.patchDraft({ workflowId: draft.workflowId, error: result.error });
          setSnapshot(next);
        }
      },
      onStartNode: async (nodeId: string) => {
        if (!draft.workflowId || !activeRunId) return;
        const result = await workflows.startNode({ workflowId: draft.workflowId, runId: activeRunId, nodeId });
        if (!result.ok && result.error) {
          const next = await workflows.patchDraft({ workflowId: draft.workflowId, error: result.error });
          setSnapshot(next);
        }
      },
      onAnswerGate: async (nodeId: string, answer: string) => {
        if (!draft.workflowId || !activeRunId) return;
        const result = await workflows.answerGate({ workflowId: draft.workflowId, runId: activeRunId, nodeId, answer });
        if (!result.ok && result.error) {
          const next = await workflows.patchDraft({ workflowId: draft.workflowId, error: result.error });
          setSnapshot(next);
        }
      },
      onSelectConfiguredAgent: (configuredAgentId: string) => {
        void draft.selectConfiguredAgent(configuredAgentId);
      },
      onSelectModel: (modelId: string) => {
        void draft.selectModel(modelId);
      },
      onDraftGraph: () => {
        void draft.draftWorkflowGraph();
      },
      onReplyChange: draft.setWorkflowReply,
      onSendReply: () => {
        void draft.sendWorkflowReply();
      },
      onUpdateNode: (nodeId: string, update) => {
        void draft.updateWorkflowNode(nodeId, update);
      },
      onRunGraph: async () => {
        const result = await runner.runWorkflowGraphInternal();
        if (!result.ok && result.error && draft.workflowId) {
          const next = await workflows.patchDraft({ workflowId: draft.workflowId, error: result.error });
          setSnapshot(next);
        }
      },
      onResetSession: () => draft.resetWorkflowSession(),
      onStopGrill: () => draft.stopWorkflowGrill(),
      onChooseWorkDir,
      onRefresh,
      ...(onReadOutputFile ? { onReadOutputFile } : {}),
      ...(draft.workflowId
        ? {
            onListOutputs: () => workflows.listOutputs(draft.workflowId as string),
          }
        : {}),
      language,
    }),
    [
      activeRunId,
      activeWorkflow?.sourceType,
      activeWorkflow?.topologyLocked,
      artifacts,
      draft,
      language,
      onChooseWorkDir,
      onReadOutputFile,
      onRefresh,
      runner,
      setSnapshot,
      snapshot.channels,
      snapshot.configuredAgents,
      snapshot.runtimes,
      snapshot.workDir,
      workflows,
    ],
  );
}
