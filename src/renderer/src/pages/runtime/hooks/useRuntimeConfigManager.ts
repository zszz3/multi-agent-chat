import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { MultiAgentChatApi } from "../../../../../preload";
import { configChannelForSelection, selectConfigChannelsForDisplay } from "../../../../../shared/config-channels";
import { DEFAULT_MODEL_ID } from "../../../../../shared/models";
import type {
  AgentChannel,
  AgentTestEvent,
  AgentModelOption,
  AppSnapshot,
  CodexPluginCatalogItem,
  ProviderBalanceResult,
} from "../../../../../shared/types";
import { createChannel, createModel, shouldRefreshBalances } from "../../../app/app-state";
import { agentLabel } from "../../../app/agents";
import { missingAppCapabilityMessage } from "../../../app/shell";
import type { AgentTestTranscriptItem, AgentTestUiState } from "../runtime-types";

const BALANCE_REFRESH_INTERVAL_MS = 5 * 60_000;

interface UseRuntimeConfigManagerOptions {
  chatApi: MultiAgentChatApi;
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  runtimeViewActive?: boolean;
}

export interface RuntimeConfigManager {
  configChannels: AgentChannel[];
  selectedConfigChannelId: string;
  configStatus: string;
  codexPluginCatalog: CodexPluginCatalogItem[];
  pluginCatalogStatus: string;
  agentTestResults: Record<string, AgentTestUiState>;
  testingAgentId: string | undefined;
  agentTestTick: number;
  balanceResults: Record<string, ProviderBalanceResult>;
  balanceLoadingChannelId: string | undefined;
  configContextMenu: { channelId: string; x: number; y: number } | undefined;
  setSelectedConfigChannelId: React.Dispatch<React.SetStateAction<string>>;
  setConfigContextMenu: React.Dispatch<React.SetStateAction<{ channelId: string; x: number; y: number } | undefined>>;
  addConfigChannel: () => void;
  openConfigContextMenu: (event: MouseEvent, channelId: string, closeOtherMenus?: () => void) => void;
  deleteConfigChannel: (channelId: string) => void;
  saveChannelConfig: () => Promise<void>;
  updateConfigChannel: (channelId: string, updater: (channel: AgentChannel) => AgentChannel) => void;
  addConfigModel: (channelId: string) => void;
  updateConfigModel: (channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption) => void;
  removeConfigModel: (channelId: string, modelIndex: number) => void;
  updateProviderKey: (providerKeysStorageKey: string, setProviderKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>, presetId: string, value: string) => void;
  loadCodexPluginCatalog: () => Promise<void>;
  testRuntimeChannel: (channelId: string) => Promise<void>;
  queryRuntimeChannelBalance: (channelId: string, options?: { persistBeforeQuery?: boolean; quiet?: boolean }) => Promise<void>;
}

export function useRuntimeConfigManager({
  chatApi,
  snapshot,
  setSnapshot,
  runtimeViewActive = false,
}: UseRuntimeConfigManagerOptions): RuntimeConfigManager {
  const [configChannels, setConfigChannels] = useState<AgentChannel[]>([]);
  const [selectedConfigChannelId, setSelectedConfigChannelId] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [codexPluginCatalog, setCodexPluginCatalog] = useState<CodexPluginCatalogItem[]>([]);
  const [pluginCatalogStatus, setPluginCatalogStatus] = useState("");
  const [agentTestResults, setAgentTestResults] = useState<Record<string, AgentTestUiState>>({});
  const [testingAgentId, setTestingAgentId] = useState<string | undefined>();
  const [agentTestTick, setAgentTestTick] = useState(0);
  const [balanceResults, setBalanceResults] = useState<Record<string, ProviderBalanceResult>>({});
  const [balanceLoadingChannelId, setBalanceLoadingChannelId] = useState<string | undefined>();
  const [configContextMenu, setConfigContextMenu] = useState<{ channelId: string; x: number; y: number } | undefined>();
  const balanceRefreshInFlightRef = useRef(false);
  const lastBalanceRefreshAtRef = useRef<number | undefined>(undefined);
  const configChannelsRef = useRef<AgentChannel[]>([]);
  const configDirtyRef = useRef(false);

  useEffect(() => {
    configChannelsRef.current = configChannels;
  }, [configChannels]);

  useEffect(() => {
    configDirtyRef.current = configDirty;
  }, [configDirty]);

  useEffect(() => {
    if (!testingAgentId) return undefined;
    const timer = window.setInterval(() => setAgentTestTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [testingAgentId]);

  useEffect(() => {
    return chatApi.onAgentTestEvent((event: AgentTestEvent) => {
      setAgentTestResults((current) => {
        const existing = current[event.agentId];
        if (!existing) return current;
        const transcriptItem: AgentTestTranscriptItem = {
          id: `${event.timestamp}:${existing.transcript.length}:${event.type}`,
          type: event.type,
          content: event.content,
          timestamp: event.timestamp,
        };
        return {
          ...current,
          [event.agentId]: {
            ...existing,
            phase: event.type === "phase" ? event.content : existing.phase,
            message: event.type === "phase" ? event.content : existing.message,
            transcript: [...existing.transcript, transcriptItem].slice(-80),
          },
        };
      });
    });
  }, [chatApi]);

  const syncChannelsFromSnapshot = useCallback((channels: AgentChannel[]) => {
    setConfigChannels(channels);
    setSelectedConfigChannelId((current) => configChannelForSelection(channels, current)?.id ?? "");
  }, []);

  const updateConfigChannels = useCallback((next: AgentChannel[]) => {
    setConfigChannels(next);
    setConfigDirty(true);
    setConfigStatus("");
    setSelectedConfigChannelId((current) => configChannelForSelection(next, current)?.id ?? "");
  }, []);

  const addConfigChannel = useCallback(() => {
    const next = [...configChannels, createChannel("codex", configChannels.map((channel) => channel.id))];
    updateConfigChannels(next);
    setSelectedConfigChannelId(next[next.length - 1]?.id ?? "");
  }, [configChannels, updateConfigChannels]);

  const openConfigContextMenu = useCallback((event: MouseEvent, channelId: string, closeOtherMenus?: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    closeOtherMenus?.();
    setSelectedConfigChannelId(channelId);
    setConfigContextMenu({ channelId, x: event.clientX, y: event.clientY });
  }, []);

  const deleteConfigChannel = useCallback((channelId: string) => {
    setConfigContextMenu(undefined);
    const referencedAgent = snapshot.configuredAgents.find((agent) => agent.channelId === channelId);
    if (referencedAgent) {
      setConfigStatus(`Config is used by ${referencedAgent.name || referencedAgent.id}`);
      return;
    }
    if (configChannelsRef.current.length <= 1) {
      setConfigStatus("Keep at least one config");
      return;
    }
    const next = configChannelsRef.current.filter((channel) => channel.id !== channelId);
    setConfigChannels(next);
    setConfigDirty(true);
    setConfigStatus("");
    setBalanceResults((current) => {
      if (!(channelId in current)) return current;
      const nextResults = { ...current };
      delete nextResults[channelId];
      return nextResults;
    });
    setSelectedConfigChannelId((current) => (current === channelId ? (next[0]?.id ?? "") : (configChannelForSelection(next, current)?.id ?? next[0]?.id ?? "")));
  }, [snapshot.configuredAgents]);

  const persistChannelConfig = useCallback(async (): Promise<AppSnapshot> => {
    const next = await chatApi.saveModelChannels(configChannelsRef.current);
    setConfigChannels(next.channels);
    setConfigDirty(false);
    setSelectedConfigChannelId((current) => configChannelForSelection(next.channels, current)?.id ?? "");
    setSnapshot(next);
    return next;
  }, [chatApi, setSnapshot]);

  const saveChannelConfig = useCallback(async (): Promise<void> => {
    try {
      await persistChannelConfig();
      setConfigStatus("Saved");
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : String(error));
    }
  }, [persistChannelConfig]);

  const updateConfigChannel = useCallback((channelId: string, updater: (channel: AgentChannel) => AgentChannel) => {
    setBalanceResults((current) => {
      if (!(channelId in current)) return current;
      const next = { ...current };
      delete next[channelId];
      return next;
    });
    updateConfigChannels(configChannelsRef.current.map((channel) => (channel.id === channelId ? updater(channel) : channel)));
  }, [updateConfigChannels]);

  const addConfigModel = useCallback((channelId: string) => {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: [...channel.models, createModel(channel.models)],
    }));
  }, [updateConfigChannel]);

  const updateConfigModel = useCallback((channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption) => {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: channel.models.map((model, index) => (index === modelIndex ? updater(model) : model)),
    }));
  }, [updateConfigChannel]);

  const removeConfigModel = useCallback((channelId: string, modelIndex: number) => {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: channel.models.filter((_model, index) => index !== modelIndex),
    }));
  }, [updateConfigChannel]);

  const updateProviderKey = useCallback((
    providerKeysStorageKey: string,
    setProviderKeys: React.Dispatch<React.SetStateAction<Record<string, string>>>,
    presetId: string,
    value: string,
  ) => {
    setProviderKeys((current) => {
      const next = { ...current };
      if (value.trim()) next[presetId] = value;
      else delete next[presetId];
      window.localStorage.setItem(providerKeysStorageKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const loadCodexPluginCatalog = useCallback(async () => {
    setPluginCatalogStatus("Loading plugins...");
    try {
      const plugins = await chatApi.listCodexPlugins();
      setCodexPluginCatalog(plugins);
      setPluginCatalogStatus(`Loaded ${plugins.length} plugins`);
    } catch (error) {
      setPluginCatalogStatus(error instanceof Error ? error.message : String(error));
    }
  }, [chatApi]);

  const testRuntimeChannel = useCallback(async (channelId: string): Promise<void> => {
    const channel = configChannelsRef.current.find((item) => item.id === channelId);
    const startedAt = Date.now();
    const baseState: AgentTestUiState = {
      agentId: channelId,
      state: "running",
      phase: "Preparing",
      message: "Preparing execution config test...",
      startedAt,
      testedAt: startedAt,
      elapsedMs: 0,
      runtimeAgentId: channel?.agentId ?? "codex",
      channelId,
      modelId: DEFAULT_MODEL_ID,
      providerLabel: channel?.providerName ?? channel?.label ?? "Provider",
      transcript: [],
    };
    setTestingAgentId(channelId);
    setAgentTestTick((value) => value + 1);
    setAgentTestResults((current) => ({ ...current, [channelId]: baseState }));
    setConfigStatus("");
    try {
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          phase: "Saving config",
          message: "Saving current provider, model, plugin, and credential settings before testing.",
        },
      }));
      await persistChannelConfig();
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          phase: "Running test",
          message: `Starting ${agentLabel(channel?.agentId ?? "codex")} with ${baseState.providerLabel}.`,
        },
      }));
      const result = await chatApi.testRuntimeChannel(channelId);
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          agentId: result.agentId,
          state: result.ok ? "passed" : "failed",
          phase: result.ok ? "Completed" : "Failed",
          message: result.message,
          startedAt,
          testedAt: result.testedAt,
          elapsedMs: result.elapsedMs,
          runtimeAgentId: result.runtimeAgentId,
          channelId: result.channelId,
          modelId: result.modelId,
          providerLabel: baseState.providerLabel,
          ...(result.output ? { output: result.output } : {}),
        },
      }));
      setConfigStatus(result.ok ? "Config test passed" : "Config test failed");
    } catch (error) {
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          state: "failed",
          phase: "Failed",
          message: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - startedAt,
        },
      }));
      setConfigStatus("Config test failed");
    } finally {
      setTestingAgentId(undefined);
    }
  }, [chatApi, persistChannelConfig]);

  const queryRuntimeChannelBalance = useCallback(async (channelId: string, options: { persistBeforeQuery?: boolean; quiet?: boolean } = {}): Promise<void> => {
    const api = chatApi as typeof chatApi & {
      queryRuntimeChannelBalance?: (targetChannelId: string) => Promise<ProviderBalanceResult>;
    };
    if (typeof api.queryRuntimeChannelBalance !== "function") {
      setConfigStatus(missingAppCapabilityMessage("Provider balance query"));
      return;
    }
    setBalanceLoadingChannelId(channelId);
    if (!options.quiet) setConfigStatus("");
    try {
      if (options.persistBeforeQuery !== false) await persistChannelConfig();
      const result = await api.queryRuntimeChannelBalance(channelId);
      setBalanceResults((current) => ({ ...current, [channelId]: result }));
      if (!options.quiet) setConfigStatus(result.status === "success" ? "Balance updated" : result.message);
    } catch (error) {
      if (!options.quiet) setConfigStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBalanceLoadingChannelId(undefined);
    }
  }, [chatApi, persistChannelConfig]);

  const refreshRuntimeChannelBalancesIfDue = useCallback(async (): Promise<void> => {
    const channels = selectConfigChannelsForDisplay(configChannelsRef.current);
    if (
      !shouldRefreshBalances({
        channels,
        configDirty: configDirtyRef.current,
        refreshInFlight: balanceRefreshInFlightRef.current,
        lastRefreshAt: lastBalanceRefreshAtRef.current,
        now: Date.now(),
        intervalMs: BALANCE_REFRESH_INTERVAL_MS,
      })
    ) {
      return;
    }

    balanceRefreshInFlightRef.current = true;
    try {
      for (const channel of channels) {
        await queryRuntimeChannelBalance(channel.id, { persistBeforeQuery: false, quiet: true });
      }
      lastBalanceRefreshAtRef.current = Date.now();
    } finally {
      balanceRefreshInFlightRef.current = false;
    }
  }, [queryRuntimeChannelBalance]);

  useEffect(() => {
    if (configDirty) return;
    syncChannelsFromSnapshot(snapshot.channels);
  }, [configDirty, snapshot.channels, syncChannelsFromSnapshot]);

  useEffect(() => {
    if (!runtimeViewActive || pluginCatalogStatus || codexPluginCatalog.length > 0) return;
    void loadCodexPluginCatalog();
  }, [codexPluginCatalog.length, loadCodexPluginCatalog, pluginCatalogStatus, runtimeViewActive]);

  useEffect(() => {
    void refreshRuntimeChannelBalancesIfDue();
  }, [configChannels, configDirty, refreshRuntimeChannelBalancesIfDue]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshRuntimeChannelBalancesIfDue();
    }, BALANCE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshRuntimeChannelBalancesIfDue]);

  useEffect(() => {
    setBalanceResults((current) => {
      const nextEntries = Object.entries(current).filter(([channelId]) => snapshot.channels.some((channel) => channel.id === channelId));
      if (nextEntries.length === Object.keys(current).length) return current;
      return Object.fromEntries(nextEntries);
    });
    if (configContextMenu && !snapshot.channels.some((channel) => channel.id === configContextMenu.channelId)) {
      setConfigContextMenu(undefined);
    }
  }, [configContextMenu, snapshot.channels]);

  return {
    configChannels,
    selectedConfigChannelId,
    configStatus,
    codexPluginCatalog,
    pluginCatalogStatus,
    agentTestResults,
    testingAgentId,
    agentTestTick,
    balanceResults,
    balanceLoadingChannelId,
    configContextMenu,
    setSelectedConfigChannelId,
    setConfigContextMenu,
    addConfigChannel,
    openConfigContextMenu,
    deleteConfigChannel,
    saveChannelConfig,
    updateConfigChannel,
    addConfigModel,
    updateConfigModel,
    removeConfigModel,
    updateProviderKey,
    loadCodexPluginCatalog,
    testRuntimeChannel,
    queryRuntimeChannelBalance,
  };
}
