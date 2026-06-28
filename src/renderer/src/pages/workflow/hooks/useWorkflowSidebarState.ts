import { useCallback, useEffect, useState } from "react";
import type { AppSnapshot, WorkflowDraftState } from "../../../../../shared/types";
import type { WorkflowService } from "../../../app/services/workflow-service";

interface WorkflowContextMenuState {
  workflowId: string;
  x: number;
  y: number;
}

interface WorkflowRenameDraftState {
  workflowId: string;
  title: string;
}

export interface WorkflowSidebarStateController {
  workflowContextMenu: WorkflowContextMenuState | undefined;
  workflowRenameDraft: WorkflowRenameDraftState | undefined;
  openWorkflowContextMenu: (workflowId: string, x: number, y: number) => void;
  closeWorkflowContextMenu: () => void;
  startWorkflowRename: (workflowId: string) => void;
  changeWorkflowRenameDraft: (title: string) => void;
  cancelWorkflowRename: () => void;
  confirmWorkflowRename: () => Promise<void>;
  deleteWorkflow: (workflowId: string) => Promise<void>;
}

interface UseWorkflowSidebarStateOptions {
  workflows: WorkflowDraftState[];
  activeWorkflowId?: string | undefined;
  workflowRunning: boolean;
  setSnapshot: (snapshot: AppSnapshot) => void;
  workflowsService: Pick<WorkflowService, "renameWorkflow" | "deleteWorkflow">;
  applyPersistedWorkflowDraft: (draft: WorkflowDraftState) => void;
  resetWorkflowLocalDraft: () => void;
  canRenameWorkflow: boolean;
  canDeleteWorkflow: boolean;
  missingCapabilityMessage: (feature: string) => string;
}

export function useWorkflowSidebarState({
  workflows,
  activeWorkflowId,
  workflowRunning,
  setSnapshot,
  workflowsService,
  applyPersistedWorkflowDraft,
  resetWorkflowLocalDraft,
  canRenameWorkflow,
  canDeleteWorkflow,
  missingCapabilityMessage,
}: UseWorkflowSidebarStateOptions): WorkflowSidebarStateController {
  const [workflowContextMenu, setWorkflowContextMenu] = useState<WorkflowContextMenuState | undefined>();
  const [workflowRenameDraft, setWorkflowRenameDraft] = useState<WorkflowRenameDraftState | undefined>();

  useEffect(() => {
    if (workflowContextMenu && !workflows.some((workflow) => workflow.workflowId === workflowContextMenu.workflowId)) {
      setWorkflowContextMenu(undefined);
    }
    if (workflowRenameDraft && !workflows.some((workflow) => workflow.workflowId === workflowRenameDraft.workflowId)) {
      setWorkflowRenameDraft(undefined);
    }
  }, [workflowContextMenu, workflowRenameDraft, workflows]);

  const openWorkflowContextMenu = useCallback((workflowId: string, x: number, y: number): void => {
    setWorkflowContextMenu({ workflowId, x, y });
  }, []);

  const closeWorkflowContextMenu = useCallback((): void => {
    setWorkflowContextMenu(undefined);
  }, []);

  const startWorkflowRename = useCallback((workflowId: string): void => {
    const workflow = workflows.find((item) => item.workflowId === workflowId);
    if (!workflow) return;
    setWorkflowContextMenu(undefined);
    setWorkflowRenameDraft({ workflowId, title: workflow.title });
  }, [workflows]);

  const changeWorkflowRenameDraft = useCallback((title: string): void => {
    setWorkflowRenameDraft((current) => (current ? { ...current, title } : current));
  }, []);

  const cancelWorkflowRename = useCallback((): void => {
    setWorkflowRenameDraft(undefined);
  }, []);

  const confirmWorkflowRename = useCallback(async (): Promise<void> => {
    if (!workflowRenameDraft) return;
    const title = workflowRenameDraft.title.trim();
    if (!title) return;
    if (!canRenameWorkflow) {
      window.alert?.(missingCapabilityMessage("Rename workflow"));
      return;
    }
    const next = await workflowsService.renameWorkflow(workflowRenameDraft.workflowId, title);
    setWorkflowRenameDraft(undefined);
    setSnapshot(next);
    if (next.workflowDraft) applyPersistedWorkflowDraft(next.workflowDraft);
  }, [
    applyPersistedWorkflowDraft,
    canRenameWorkflow,
    missingCapabilityMessage,
    setSnapshot,
    workflowRenameDraft,
    workflowsService,
  ]);

  const deleteWorkflow = useCallback(async (workflowId: string): Promise<void> => {
    setWorkflowContextMenu(undefined);
    if (workflowRunning && workflowId === activeWorkflowId) return;
    if (!canDeleteWorkflow) {
      window.alert?.(missingCapabilityMessage("Delete workflow"));
      return;
    }
    const workflow = workflows.find((item) => item.workflowId === workflowId);
    const confirmed =
      typeof window.confirm === "function" ? window.confirm(`Delete workflow "${workflow?.title ?? workflowId}" and its run data?`) : true;
    if (!confirmed) return;
    const next = await workflowsService.deleteWorkflow(workflowId);
    setSnapshot(next);
    if (next.workflowDraft) {
      applyPersistedWorkflowDraft(next.workflowDraft);
    } else if (workflowId === activeWorkflowId) {
      resetWorkflowLocalDraft();
    }
  }, [
    activeWorkflowId,
    applyPersistedWorkflowDraft,
    canDeleteWorkflow,
    missingCapabilityMessage,
    resetWorkflowLocalDraft,
    setSnapshot,
    workflowRunning,
    workflows,
    workflowsService,
  ]);

  return {
    workflowContextMenu,
    workflowRenameDraft,
    openWorkflowContextMenu,
    closeWorkflowContextMenu,
    startWorkflowRename,
    changeWorkflowRenameDraft,
    cancelWorkflowRename,
    confirmWorkflowRename,
    deleteWorkflow,
  };
}
