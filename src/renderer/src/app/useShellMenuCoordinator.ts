import { useCallback, useEffect } from "react";

interface UseShellMenuCoordinatorOptions {
  hasChatContextMenu: boolean;
  hasWorkflowContextMenu: boolean;
  hasConfigContextMenu: boolean;
  clearChatContextMenu: () => void;
  clearWorkflowContextMenu: () => void;
  clearConfigContextMenu: () => void;
}

export interface ShellMenuCoordinator {
  closeAllMenus: () => void;
  prepareChatContextMenuOpen: () => void;
  prepareWorkflowContextMenuOpen: () => void;
  prepareConfigContextMenuOpen: (closeOtherMenus?: () => void) => void;
}

export function useShellMenuCoordinator({
  hasChatContextMenu,
  hasWorkflowContextMenu,
  hasConfigContextMenu,
  clearChatContextMenu,
  clearWorkflowContextMenu,
  clearConfigContextMenu,
}: UseShellMenuCoordinatorOptions): ShellMenuCoordinator {
  const closeAllMenus = useCallback((): void => {
    clearChatContextMenu();
    clearWorkflowContextMenu();
    clearConfigContextMenu();
  }, [clearChatContextMenu, clearConfigContextMenu, clearWorkflowContextMenu]);

  const prepareChatContextMenuOpen = useCallback((): void => {
    clearWorkflowContextMenu();
    clearConfigContextMenu();
  }, [clearConfigContextMenu, clearWorkflowContextMenu]);

  const prepareWorkflowContextMenuOpen = useCallback((): void => {
    clearChatContextMenu();
    clearConfigContextMenu();
  }, [clearChatContextMenu, clearConfigContextMenu]);

  const prepareConfigContextMenuOpen = useCallback((closeOtherMenus?: () => void): void => {
    clearChatContextMenu();
    clearWorkflowContextMenu();
    closeOtherMenus?.();
  }, [clearChatContextMenu, clearWorkflowContextMenu]);

  useEffect(() => {
    if (!hasChatContextMenu && !hasWorkflowContextMenu && !hasConfigContextMenu) return;
    const handleClose = (): void => {
      closeAllMenus();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") closeAllMenus();
    };
    window.addEventListener("click", handleClose);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAllMenus, hasChatContextMenu, hasConfigContextMenu, hasWorkflowContextMenu]);

  return {
    closeAllMenus,
    prepareChatContextMenuOpen,
    prepareWorkflowContextMenuOpen,
    prepareConfigContextMenuOpen,
  };
}
