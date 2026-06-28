import { useCallback, useEffect, useState } from "react";
import type { WorkflowDraftState } from "../../../../../shared/types";

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
}

interface UseWorkflowSidebarStateOptions {
  workflows: WorkflowDraftState[];
}

export function useWorkflowSidebarState({ workflows }: UseWorkflowSidebarStateOptions): WorkflowSidebarStateController {
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

  return {
    workflowContextMenu,
    workflowRenameDraft,
    openWorkflowContextMenu,
    closeWorkflowContextMenu,
    startWorkflowRename,
    changeWorkflowRenameDraft,
    cancelWorkflowRename,
  };
}
