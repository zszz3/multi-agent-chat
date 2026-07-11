import { useCallback, useEffect, useState } from "react";
import type { MultiAgentChatApi } from "../../../../../preload";
import type { AppSnapshot, ConfiguredAgent } from "../../../../../shared/types";
import { createConfiguredAgent } from "../../../app/app-state";

interface UseConfiguredAgentsManagerOptions {
  chatApi: MultiAgentChatApi;
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
}

interface SaveConfiguredAgentsOptions {
  successMessage?: string | undefined;
  clearStatusBefore?: boolean;
}

export interface ConfiguredAgentsManager {
  selectedConfiguredAgentId: string;
  configuredAgentStatus: string;
  selectConfiguredAgent: (agentId: string) => void;
  saveConfiguredAgents: (agents?: ConfiguredAgent[]) => Promise<void>;
  addConfiguredAgent: () => Promise<void>;
  updateConfiguredAgent: (agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent) => void;
}

export function useConfiguredAgentsManager({
  chatApi,
  snapshot,
  setSnapshot,
}: UseConfiguredAgentsManagerOptions): ConfiguredAgentsManager {
  const [selectedConfiguredAgentId, setSelectedConfiguredAgentId] = useState("");
  const [configuredAgentStatus, setConfiguredAgentStatus] = useState("");
  const [dirtyAgentId, setDirtyAgentId] = useState<string | undefined>();

  useEffect(() => {
    if (snapshot.configuredAgents.length === 0) {
      setSelectedConfiguredAgentId("");
      return;
    }
    const firstAgent = snapshot.configuredAgents[0];
    if (firstAgent && !snapshot.configuredAgents.some((agent) => agent.id === selectedConfiguredAgentId)) {
      setSelectedConfiguredAgentId(firstAgent.id);
    }
  }, [selectedConfiguredAgentId, snapshot.configuredAgents]);

  const persistConfiguredAgents = useCallback(async (agents: ConfiguredAgent[]): Promise<void> => {
    const selected = agents.find((agent) => agent.id === selectedConfiguredAgentId);
    if (!selected || selected.agentType === "execution" || selected.managed) return;
    const next = await chatApi.saveComposedAgent(selected);
    setSnapshot(next);
    setDirtyAgentId(undefined);
  }, [chatApi, selectedConfiguredAgentId, setSnapshot]);

  const saveConfiguredAgents = useCallback(async (
    agents: ConfiguredAgent[] = snapshot.configuredAgents,
    options: SaveConfiguredAgentsOptions = {},
  ): Promise<void> => {
    const { successMessage = "Saved", clearStatusBefore = true } = options;
    if (clearStatusBefore) setConfiguredAgentStatus("");
    try {
      await persistConfiguredAgents(agents);
      if (successMessage) setConfiguredAgentStatus(successMessage);
    } catch (error) {
      setConfiguredAgentStatus(error instanceof Error ? error.message : String(error));
    }
  }, [persistConfiguredAgents, snapshot.configuredAgents]);

  const addConfiguredAgent = useCallback(async (): Promise<void> => {
    const nextAgent = createConfiguredAgent(snapshot.channels, snapshot.configuredAgents.map((agent) => agent.id));
    const nextAgents = [...snapshot.configuredAgents, nextAgent];
    setSnapshot({ ...snapshot, configuredAgents: nextAgents });
    setSelectedConfiguredAgentId(nextAgent.id);
    setDirtyAgentId(nextAgent.id);
    setConfiguredAgentStatus("Unsaved");
  }, [setSnapshot, snapshot]);

  const updateConfiguredAgent = useCallback((agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent): void => {
    const nextAgents = snapshot.configuredAgents.map((agent) => {
      if (agent.id !== agentId) return agent;
      if (agent.agentType === "execution" || agent.managed) return agent;
      return { ...updater(agent), agentType: "composed" as const, managed: false, updatedAt: Date.now() };
    });
    setSnapshot({ ...snapshot, configuredAgents: nextAgents });
    setDirtyAgentId(agentId);
    setConfiguredAgentStatus("Unsaved");
  }, [setSnapshot, snapshot]);

  const selectConfiguredAgent = useCallback((agentId: string): void => {
    if (dirtyAgentId && dirtyAgentId !== agentId) {
      const discard = window.confirm("当前 Agent 有未保存修改，放弃修改吗？");
      if (!discard) return;
      void chatApi.getSnapshot().then((next) => {
        setSnapshot(next);
        setDirtyAgentId(undefined);
        setConfiguredAgentStatus("");
        setSelectedConfiguredAgentId(agentId);
      });
      return;
    }
    setSelectedConfiguredAgentId(agentId);
  }, [chatApi, dirtyAgentId, setSnapshot]);

  useEffect(() => {
    if (!dirtyAgentId) return undefined;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyAgentId]);

  return {
    selectedConfiguredAgentId,
    configuredAgentStatus,
    selectConfiguredAgent,
    saveConfiguredAgents,
    addConfiguredAgent,
    updateConfiguredAgent,
  };
}
