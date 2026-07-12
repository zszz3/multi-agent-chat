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
  const activeRun = snapshot.workflowStore.runs.find((run) =>
    run.workflowId === draft.workflowId && (run.status === "running" || run.status === "waiting_for_user"));
  const activeRunId = activeRun?.runId;
  const nodeConversations = activeRunId
    ? snapshot.workflowNodeConversations.filter((conversation) => conversation.workflowId === draft.workflowId && conversation.runId === activeRunId)
    : [];
  const artifacts = activeRunId ? (snapshot.artifacts ?? []).filter((artifact) => artifact.target === activeRunId) : [];
  const activeWorkflow = snapshot.workflowStore.workflows.find((workflow) => workflow.workflowId === draft.workflowId);

  return useMemo(
    () => ({
      ...(draft.workflowId ? { workflowId: draft.workflowId } : {}),
      sourceType: activeWorkflow?.sourceType ?? "user",
      topologyLocked: activeWorkflow?.topologyLocked === true,
      title: draft.workflowTitle,
      status: draft.workflowStatus,
      definition: draft.workflowDefinition,
      definitionReady: draft.workflowDefinitionReady,
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
      ...(activeWorkflow?.workflowV2Plan ? { workflowV2Plan: activeWorkflow.workflowV2Plan } : {}),
      nodeTasks: snapshot.tasks.filter((task) => draft.workflowRunProgress.some((item) => item.taskId === task.id)),
      nodeConversations,
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
      onStopRun: async () => {
        if (!draft.workflowId || !activeRunId) return;
        const result = await workflows.stopRun({ workflowId: draft.workflowId, runId: activeRunId });
        if (!result.ok && result.error) setSnapshot(await workflows.patchDraft({ workflowId: draft.workflowId, error: result.error }));
      },
      onSendNodeMessage: async (conversationId, message) => setSnapshot(await workflows.sendNodeMessage({ conversationId, message })),
      onCompleteNodeConversation: async (conversationId) => {
        const result = await workflows.completeNodeConversation({ conversationId });
        if (!result.ok) {
          const error = result.error ?? "Workflow node completion could not be confirmed.";
          if (draft.workflowId) setSnapshot(await workflows.patchDraft({ workflowId: draft.workflowId, error }));
          throw new Error(error);
        }
      },
      onRejectNodeCompletion: async (conversationId, instruction) => setSnapshot(await workflows.rejectNodeCompletion({ conversationId, instruction })),
      onInterruptNodeConversation: async (conversationId) => setSnapshot(await workflows.interruptNodeConversation({ conversationId })),
      onSelectConfiguredAgent: (configuredAgentId: string) => {
        void draft.selectConfiguredAgent(configuredAgentId);
      },
      onSelectModel: (modelId: string) => {
        void draft.selectModel(modelId);
      },
      onBuildDefinition: () => {
        void draft.buildWorkflowDefinition();
      },
      onReplyChange: draft.setWorkflowReply,
      onSendReply: () => {
        void draft.sendWorkflowReply();
      },
      onUpdateNode: (nodeId: string, update) => {
        void draft.updateWorkflowNode(nodeId, update);
      },
      onRunWorkflow: async () => {
        const result = await runner.runWorkflowInternal();
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
            onListOutputs: () => activeRunId ? workflows.listOutputs({ workflowId: draft.workflowId as string, runId: activeRunId }) : Promise.resolve([]),
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
      nodeConversations,
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
