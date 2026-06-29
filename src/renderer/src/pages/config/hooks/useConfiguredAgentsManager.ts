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
  setSelectedConfiguredAgentId: React.Dispatch<React.SetStateAction<string>>;
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
    const next = await chatApi.saveConfiguredAgents(agents);
    setSnapshot(next);
  }, [chatApi, setSnapshot]);

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
    setSelectedConfiguredAgentId(nextAgent.id);
    await saveConfiguredAgents(nextAgents);
  }, [saveConfiguredAgents, snapshot.channels, snapshot.configuredAgents]);

  const updateConfiguredAgent = useCallback((agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent): void => {
    const nextAgents = snapshot.configuredAgents.map((agent) =>
      agent.id === agentId ? { ...updater(agent), updatedAt: Date.now() } : agent,
    );
    setConfiguredAgentStatus("");
    void saveConfiguredAgents(nextAgents, { successMessage: undefined, clearStatusBefore: false });
  }, [saveConfiguredAgents, snapshot.configuredAgents]);

  return {
    selectedConfiguredAgentId,
    configuredAgentStatus,
    setSelectedConfiguredAgentId,
    saveConfiguredAgents,
    addConfiguredAgent,
    updateConfiguredAgent,
  };
}
