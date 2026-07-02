import { useMemo } from "react";
import type { MultiAgentChatApi } from "../../../../../preload";
import { createWorkflowGraphFromObjective } from "../../../../../shared/workflow-graph";
import type { AppSnapshot, LocalFilePreview } from "../../../../../shared/types";
import type { SnapshotService } from "../../../app/services/snapshot-service";
import type { WorkflowService } from "../../../app/services/workflow-service";
import { missingAppCapabilityMessage } from "../../../app/shell";
import { buildWorkflowSidebarController, type WorkflowSidebarFeatureController, useWorkflowSidebarState } from "./useWorkflowSidebarState";
import { useWorkflowDraft, type WorkflowDraftController } from "./useWorkflowDraft";
import { useWorkflowFeatureController } from "./useWorkflowFeatureController";
import { useWorkflowRunner, type WorkflowRunnerController } from "./useWorkflowRunner";
import type { WorkflowController } from "../workflow-controller";

interface UseWorkflowFeatureManagerOptions {
  chatApi: Pick<MultiAgentChatApi, "runTask" | "deleteTask" | "renameWorkflow" | "deleteWorkflow">;
  snapshots: SnapshotService;
  workflows: WorkflowService;
  snapshot: AppSnapshot;
  snapshotRef: React.MutableRefObject<AppSnapshot>;
  setSnapshot: (snapshot: AppSnapshot) => void;
  language: "en" | "zh";
  onChooseWorkDir: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onReadOutputFile?: (filePath: string) => Promise<LocalFilePreview>;
  onEnterWorkflow?: () => void;
}

export interface WorkflowFeatureManager {
  draft: WorkflowDraftController;
  runner: WorkflowRunnerController;
  controller: WorkflowController;
  sidebarController: WorkflowSidebarFeatureController;
  closeSidebarContextMenu: () => void;
  runWorkflowGraphInternal: WorkflowRunnerController["runWorkflowGraphInternal"];
  resetWorkflowLocalDraft: WorkflowDraftController["resetWorkflowLocalDraft"];
}

export function useWorkflowFeatureManager({
  chatApi,
  snapshots,
  workflows,
  snapshot,
  snapshotRef,
  setSnapshot,
  language,
  onChooseWorkDir,
  onRefresh,
  onReadOutputFile,
  onEnterWorkflow,
}: UseWorkflowFeatureManagerOptions): WorkflowFeatureManager {
  const initialWorkflowGraph = useMemo(() => createWorkflowGraphFromObjective(""), []);
  const draft = useWorkflowDraft({
    snapshot,
    setSnapshot,
    snapshotRef,
    initialWorkflowGraph,
    workflows,
    configuredAgents: snapshot.configuredAgents,
    channels: snapshot.channels,
    ...(onEnterWorkflow ? { onCreateNewWorkflow: onEnterWorkflow } : {}),
  });
  const sidebarState = useWorkflowSidebarState({
    workflows: snapshot.workflowStore.workflows,
    activeWorkflowId: draft.workflowId,
    workflowRunning: draft.workflowRunning,
    setSnapshot,
    workflowsService: workflows,
    applyPersistedWorkflowDraft: draft.applyPersistedWorkflowDraft,
    resetWorkflowLocalDraft: draft.resetWorkflowLocalDraft,
    canRenameWorkflow: typeof chatApi.renameWorkflow === "function",
    canDeleteWorkflow: typeof chatApi.deleteWorkflow === "function",
    missingCapabilityMessage: missingAppCapabilityMessage,
  });
  const sidebarController = useMemo(() => {
    const options = {
      workflows: snapshot.workflowStore.workflows,
      running: draft.workflowRunning,
      state: sidebarState,
      onNewWorkflow: draft.createNewWorkflow,
      onSelectWorkflow: draft.selectWorkflow,
    };
    return snapshot.workflowStore.activeWorkflowId
      ? buildWorkflowSidebarController({ ...options, activeWorkflowId: snapshot.workflowStore.activeWorkflowId })
      : buildWorkflowSidebarController(options);
  }, [
    draft.createNewWorkflow,
    draft.selectWorkflow,
    draft.workflowRunning,
    sidebarState,
    snapshot.workflowStore.activeWorkflowId,
    snapshot.workflowStore.workflows,
  ]);
  const runner = useWorkflowRunner(
    onEnterWorkflow
      ? {
          chatApi,
          snapshots,
          workflows,
          snapshotRef,
          setSnapshot,
          workflowRunning: draft.workflowRunning,
          workflowId: draft.workflowId,
          workflowGraph: draft.workflowGraph,
          workflowConfiguredAgentId: draft.workflowConfiguredAgentId,
          workflowModelId: draft.workflowModelId,
          workflowContextDocument: draft.workflowContextDocument,
          workflowAgentSessionId: draft.workflowAgentSessionId,
          workflowRunIds: draft.workflowRunIds,
          applyPersistedWorkflowDraft: draft.applyPersistedWorkflowDraft,
          askWorkflowAgentFor: draft.askWorkflowAgentFor,
          beginWorkflowAssistantRequest: draft.beginWorkflowAssistantRequest,
          hasWorkflowAssistantStreamed: draft.hasWorkflowAssistantStreamed,
          setWorkflowError: draft.setWorkflowError,
          setWorkflowRunning: draft.setWorkflowRunning,
          setWorkflowStatus: draft.setWorkflowStatus,
          setWorkflowFinalReport: draft.setWorkflowFinalReport,
          setWorkflowRunIds: draft.setWorkflowRunIds,
          setWorkflowRunProgress: draft.setWorkflowRunProgress,
          setWorkflowRunContextDocument: draft.setWorkflowRunContextDocument,
          setWorkflowMessages: draft.setWorkflowMessages,
          onEnterWorkflow,
        }
      : {
          chatApi,
          snapshots,
          workflows,
          snapshotRef,
          setSnapshot,
          workflowRunning: draft.workflowRunning,
          workflowId: draft.workflowId,
          workflowGraph: draft.workflowGraph,
          workflowConfiguredAgentId: draft.workflowConfiguredAgentId,
          workflowModelId: draft.workflowModelId,
          workflowContextDocument: draft.workflowContextDocument,
          workflowAgentSessionId: draft.workflowAgentSessionId,
          workflowRunIds: draft.workflowRunIds,
          applyPersistedWorkflowDraft: draft.applyPersistedWorkflowDraft,
          askWorkflowAgentFor: draft.askWorkflowAgentFor,
          beginWorkflowAssistantRequest: draft.beginWorkflowAssistantRequest,
          hasWorkflowAssistantStreamed: draft.hasWorkflowAssistantStreamed,
          setWorkflowError: draft.setWorkflowError,
          setWorkflowRunning: draft.setWorkflowRunning,
          setWorkflowStatus: draft.setWorkflowStatus,
          setWorkflowFinalReport: draft.setWorkflowFinalReport,
          setWorkflowRunIds: draft.setWorkflowRunIds,
          setWorkflowRunProgress: draft.setWorkflowRunProgress,
          setWorkflowRunContextDocument: draft.setWorkflowRunContextDocument,
          setWorkflowMessages: draft.setWorkflowMessages,
        },
  );
  const controller = useWorkflowFeatureController({
    snapshot,
    setSnapshot,
    draft,
    runner,
    language,
    onChooseWorkDir,
    onRefresh,
    onReadOutputFile,
  });

  return {
    draft,
    runner,
    controller,
    sidebarController,
    closeSidebarContextMenu: sidebarState.closeWorkflowContextMenu,
    runWorkflowGraphInternal: runner.runWorkflowGraphInternal,
    resetWorkflowLocalDraft: draft.resetWorkflowLocalDraft,
  };
}
