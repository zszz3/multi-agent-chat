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
  configuredAgents: ConfiguredAgent[];
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
  const [configuredAgents, setConfiguredAgents] = useState(snapshot.configuredAgents);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setConfiguredAgents(snapshot.configuredAgents);
  }, [dirty, snapshot.configuredAgents]);

  useEffect(() => {
    if (configuredAgents.length === 0) {
      setSelectedConfiguredAgentId("");
      return;
    }
    const firstAgent = configuredAgents[0];
    if (firstAgent && !configuredAgents.some((agent) => agent.id === selectedConfiguredAgentId)) {
      setSelectedConfiguredAgentId(firstAgent.id);
    }
  }, [configuredAgents, selectedConfiguredAgentId]);

  const saveConfiguredAgents = useCallback(async (
    agents: ConfiguredAgent[] = configuredAgents,
    options: SaveConfiguredAgentsOptions = {},
  ): Promise<void> => {
    const { successMessage = "Saved", clearStatusBefore = true } = options;
    if (clearStatusBefore) setConfiguredAgentStatus("");
    try {
      const composed = agents.find((agent) => agent.agentType === "composed" && agent.id === selectedConfiguredAgentId);
      const next = composed ? await chatApi.saveComposedAgent(composed) : await chatApi.saveConfiguredAgents(agents);
      setSnapshot(next);
      setConfiguredAgents(next.configuredAgents);
      setDirty(false);
      if (successMessage) setConfiguredAgentStatus(successMessage);
    } catch (error) {
      setConfiguredAgentStatus(error instanceof Error ? error.message : String(error));
    }
  }, [chatApi, configuredAgents, selectedConfiguredAgentId, setSnapshot]);

  const addConfiguredAgent = useCallback(async (): Promise<void> => {
    const nextAgent = { ...createConfiguredAgent(snapshot.channels, configuredAgents.map((agent) => agent.id)), agentType: "composed" as const };
    const nextAgents = [...configuredAgents, nextAgent];
    setSelectedConfiguredAgentId(nextAgent.id);
    setConfiguredAgents(nextAgents);
    setDirty(true);
  }, [configuredAgents, snapshot.channels]);

  const updateConfiguredAgent = useCallback((agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent): void => {
    const nextAgents = configuredAgents.map((agent) => {
      if (agent.id !== agentId) return agent;
      const { managed: _managed, ...editableAgent } = updater(agent);
      return { ...editableAgent, updatedAt: Date.now() };
    });
    setConfiguredAgents(nextAgents);
    setDirty(true);
    setConfiguredAgentStatus("");
  }, [configuredAgents]);

  return {
    configuredAgents,
    selectedConfiguredAgentId,
    configuredAgentStatus,
    setSelectedConfiguredAgentId,
    saveConfiguredAgents,
    addConfiguredAgent,
    updateConfiguredAgent,
  };
}
