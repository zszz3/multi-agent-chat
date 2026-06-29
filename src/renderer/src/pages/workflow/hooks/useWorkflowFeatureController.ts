import { useMemo } from "react";
import type { AppSnapshot } from "../../../../../shared/types";
import { configuredAgentModelId, defaultConfiguredAgentId } from "../../../app/agents";
import type { WorkflowController } from "../workflow-controller";
import type { WorkflowDraftController } from "./useWorkflowDraft";
import type { WorkflowRunnerController } from "./useWorkflowRunner";

interface UseWorkflowFeatureControllerOptions {
  snapshot: AppSnapshot;
  draft: WorkflowDraftController;
  runner: WorkflowRunnerController;
  language: "en" | "zh";
  onChooseWorkDir: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onReadOutputFile?: WorkflowController["onReadOutputFile"];
}

export function useWorkflowFeatureController({
  snapshot,
  draft,
  runner,
  language,
  onChooseWorkDir,
  onRefresh,
  onReadOutputFile,
}: UseWorkflowFeatureControllerOptions): WorkflowController {
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
      contextDocument: draft.workflowRunContextDocument,
      finalReport: draft.workflowFinalReport,
      onObjectiveChange: draft.setWorkflowObjective,
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
      language,
    }),
    [draft, language, onChooseWorkDir, onReadOutputFile, onRefresh, runner.runWorkflowGraph, snapshot.channels, snapshot.configuredAgents, snapshot.runtimes, snapshot.workDir],
  );
}
