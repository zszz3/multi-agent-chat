import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import "@xyflow/react/dist/style.css";
import { CommandPalette, buildPaletteCommands, type Theme } from "./CommandPalette";
import { Markdown } from "./Markdown";
import { MarkdownDocument } from "./ui/MarkdownDocument";
import { FeatureRail } from "./app/FeatureRail";
import { ResourceSidebar } from "./app/ResourceSidebar";
import { AppProviders } from "./app/providers/AppProviders";
import { multiAgentChatService } from "./app/services/multi-agent-chat-service";
import { snapshotService } from "./app/services/snapshot-service";
import { workflowService } from "./app/services/workflow-service";
import { DEFAULT_SNAPSHOT as APP_STATE_DEFAULT_SNAPSHOT, activeChatFrom as activeChatFromAppState, activeTaskFrom as activeTaskFromAppState, activeTeamFrom as activeTeamFromAppState, activeTeamRunFrom as activeTeamRunFromAppState } from "./app/app-state";
import {
  agentAccent,
  agentLabel,
  configuredAgentById,
  configuredAgentModel,
  configuredAgentModelId,
  configuredAgentRuntimeId,
  defaultConfiguredAgentId,
  fallbackRuntime,
  resolveConfiguredAgentChannel,
  resolveFindSkillConfiguredAgentId,
  runtimeStatus,
} from "./app/agents";
import { formatDuration, formatTime } from "./app/format";
import type { Language } from "./app/language";
import { appShellClass, appContentClass, missingAppCapabilityMessage, refreshSnapshotForFeature, syncKeepAwakeIfAvailable, taskDetailIdFor, type ActiveFeature } from "./app/shell";
import {
  KEEP_AWAKE_STORAGE_KEY,
  LANGUAGE_STORAGE_KEY,
  PROVIDER_KEYS_STORAGE_KEY,
  THEME_STORAGE_KEY,
  loadStoredKeepAwake,
  loadStoredLanguage,
  loadStoredProviderKeys,
  loadStoredTheme,
} from "./app/storage";
import { UI_TEXT } from "./app/text";
import { useShellMenuCoordinator } from "./app/useShellMenuCoordinator";
import {
  buildFindSkillAgentPrompt,
  findSkillFallbackMessage,
  findSkillImportRequest,
  findSkillImportSuccessMessage,
  parseFindSkillAgentToolCall,
  skillDisplayDescription,
  skillDisplayName,
} from "./pages/skills/find-skill";
import { AgentPage } from "./pages/agent/AgentPage";
import { McpPage } from "./pages/mcp/McpPage";
import { EvaluationPage } from "./pages/evaluation/EvaluationPage";
import { useConfiguredAgentsManager } from "./pages/agent/hooks/useConfiguredAgentsManager";
import { ChatPage } from "./pages/chat/ChatPage";
import { chatConfigLocked, SlashCommandSuggestions, slashCommandSuggestionsFor } from "./pages/chat/chat-utils";
export { chatConfigLocked, SlashCommandSuggestions, slashCommandSuggestionsFor } from "./pages/chat/chat-utils";
import { SkillsPage } from "./pages/skills/SkillsPage";
import { RuntimePage } from "./pages/runtime/RuntimePage";
export { RuntimePage } from "./pages/runtime/RuntimePage";
import { useRuntimeConfigManager } from "./pages/runtime/hooks/useRuntimeConfigManager";
export { applyCodexDefaultConfigToChannel, applyProviderPresetToChannel, rememberProviderKeyFromChannel, resolveProviderPresetId } from "./pages/runtime/runtime-utils";
import {
  TASK_STATUS_FILTERS,
  type TaskStatusFilterValue,
} from "./pages/tasks/task-status";
import { TaskPage } from "./pages/tasks/TaskPage";
import { TeamPage } from "./pages/teams/TeamPage";
export { reorderTeamMembers } from "./pages/teams/team-utils";
import { WorkflowFeature } from "./pages/workflow/WorkflowFeature";
import { useWorkflowFeatureManager } from "./pages/workflow/hooks/useWorkflowFeatureManager";
import { workflowCanvasLayout } from "./pages/workflow/workflow-canvas-layout";
import { ScheduledWorkflowPage } from "./pages/schedules/ScheduledWorkflowPage";
export { ScheduledWorkflowPage } from "./pages/schedules/ScheduledWorkflowPage";
import { useScheduledWorkflowManager } from "./pages/schedules/hooks/useScheduledWorkflowManager";
import type { ScheduledWorkflowDraft } from "./pages/schedules/schedule-utils";
export type { ScheduledWorkflowDraft } from "./pages/schedules/schedule-utils";
import { selectConfigChannelsForDisplay } from "../../shared/config-channels";
import { DEFAULT_MODEL_ID, modelsForChannel } from "../../shared/models";
import { AGENT_PROVIDER_PRESETS } from "../../shared/provider-presets";
import {
  fetchOnlineSkills,
  ONLINE_SKILL_SOURCES,
  onlineSkillTreeUrl,
  skillsShResultFromApiSkill,
  skillsShSearchUrl,
  parseSkillMarkdown,
  type OnlineSkillResult,
} from "../../shared/online-skills";
import type {
  AgentChannel,
  AgentModelOption,
  AgentRuntime,
  AssignSkillCategoryRequest,
  SkillCategory,
  SkillTemplate,
  AgentTeam,
  AgentTeamMember,
  AgentTeamMode,
  AppSnapshot,
  ChatEvent,
  ChatSession,
  ConfiguredAgent,
  ImportedSkillResult,
  ImportOnlineSkillRequest,
  InstalledSkillResult,
  LocalFilePreview,
  SkillInstallTarget,
  TeamRun,
  TaskProgress,
  TaskRun,
  UninstalledSkillResult,
} from "../../shared/types";

export {
  fetchOnlineSkills,
  onlineSkillTreeUrl,
  skillsShResultFromApiSkill,
  skillsShSearchUrl,
  parseSkillMarkdown,
};
export {
  buildFindSkillAgentPrompt,
  findSkillAgentPrompt,
  findSkillFallbackMessage,
  findSkillImportRequest,
  findSkillImportSelection,
  findSkillImportSuccessMessage,
  parseFindSkillAgentToolCall,
  skillPopularityLabel,
} from "./pages/skills/find-skill";
export type { Language } from "./app/language";
export {
  appShellClass,
  appContentClass,
  missingAppCapabilityMessage,
  syncKeepAwakeIfAvailable,
  taskDetailIdFor,
} from "./app/shell";
export type { ActiveFeature } from "./app/shell";
export { loadStoredTheme } from "./app/storage";
export { shouldSendComposerKey } from "./app/composer";
export { resolveConfiguredAgentChannel, resolveFindSkillConfiguredAgentId } from "./app/agents";
export { AgentPage } from "./pages/agent/AgentPage";
export { ChatPage } from "./pages/chat/ChatPage";
export { ChatControls } from "./pages/chat/ChatControls";
export { ChatHistoryPanel } from "./pages/chat/ChatHistoryPanel";
export { TaskStatusFilter } from "./pages/tasks/task-status";
export type { TaskStatusFilterValue } from "./pages/tasks/task-status";
export { TaskPage } from "./pages/tasks/TaskPage";
export { TeamPage } from "./pages/teams/TeamPage";
export { SkillsPage } from "./pages/skills/SkillsPage";
export { WorkflowHistoryPanel } from "./pages/workflow/WorkflowHistoryPanel";
export { WorkflowPage } from "./pages/workflow/WorkflowPage";
export { workflowCanvasLayout } from "./pages/workflow/workflow-canvas-layout";
export {
  extractWorkflowOutputDocuments,
  extractWorkflowOutputDocumentsForPlan,
  workflowAssistantDisplayContent,
  workflowRunProgressSummary,
} from "./pages/workflow/workflow-utils";

const SKILL_INSTALL_TARGETS: Array<{ id: SkillInstallTarget; label: string; path: string }> = [
  { id: "codex", label: "Codex", path: "~/.codex/skills" },
  { id: "claude", label: "Claude", path: "~/.claude/skills" },
  { id: "trae", label: "Trae", path: "~/.trae/skills" },
];

function sourceUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
      const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
      if (owner && repo) return `GitHub: ${owner}/${repo}`;
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function targetLabel(target: SkillInstallTarget): string {
  return SKILL_INSTALL_TARGETS.find((item) => item.id === target)?.label ?? target;
}

type MaybePromise = void | Promise<void>;

const DEFAULT_SNAPSHOT = APP_STATE_DEFAULT_SNAPSHOT;

export function applySkillTemplate(agent: ConfiguredAgent, template: SkillTemplate): ConfiguredAgent {
  return {
    ...agent,
    name: skillDisplayName(template),
    description: skillDisplayDescription(template),
    tags: [...template.tags],
  };
}

export async function navigateWithRuntimeSave(
  activeFeature: ActiveFeature,
  nextFeature: ActiveFeature,
  confirmSave: () => Promise<boolean>,
  navigate: (feature: ActiveFeature) => void,
): Promise<void> {
  if (activeFeature === nextFeature) return;
  if (activeFeature === "runtimes" && !(await confirmSave())) return;
  navigate(nextFeature);
}

export function AppShell() {
  const chatApi = useMemo(() => multiAgentChatService(), []);
  const snapshots = useMemo(() => snapshotService(), []);
  const workflows = useMemo(() => workflowService(), []);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(DEFAULT_SNAPSHOT);
  const [officialSkillTemplates, setOfficialSkillTemplates] = useState<SkillTemplate[]>([]);
  const [userSkillTemplates, setUserSkillTemplates] = useState<SkillTemplate[]>([]);
  const [skillCategories, setSkillCategories] = useState<SkillCategory[]>([]);
  const [prompt, setPrompt] = useState("");
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [teamPrompt, setTeamPrompt] = useState("");
  const [taskConfiguredAgentId, setTaskConfiguredAgentId] = useState("");
  const [taskModelId, setTaskModelId] = useState(DEFAULT_MODEL_ID);
  const snapshotRef = useRef(snapshot);
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilterValue>("all");
  const [selectedTaskDetailId, setSelectedTaskDetailId] = useState<string | undefined>();
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>("chat");
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme(window.localStorage));
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>(() => loadStoredProviderKeys(window.localStorage));
  const [language, setLanguage] = useState<Language>(() => loadStoredLanguage(window.localStorage));
  const [keepAwake, setKeepAwake] = useState(() => loadStoredKeepAwake(window.localStorage));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chatContextMenu, setChatContextMenu] = useState<{ chatId: string; x: number; y: number } | undefined>();
  const transcriptRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const gChordRef = useRef(0);
  const {
    configChannels,
    selectedConfigChannelId,
    selectedRuntimeId,
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
    selectConfigChannel,
    selectRuntime,
    setConfigContextMenu,
    addConfigChannel,
    openConfigContextMenu,
    deleteConfigChannel,
    saveChannelConfig,
    updateConfigChannel,
    addConfigModel,
    updateConfigModel,
    removeConfigModel,
    updateProviderKey: updateProviderKeyInHook,
    setConfigStatus,
    replaceConfigChannelAndPersist,
    loadCodexPluginCatalog,
    testRuntimeChannel,
    queryRuntimeChannelBalance,
    refreshModelCatalog,
    importLocalConfig,
    confirmSaveBeforeSwitch,
  } = useRuntimeConfigManager({
    chatApi,
    snapshot,
    setSnapshot,
    runtimeViewActive: activeFeature === "runtimes",
  });
  const navigateToFeature = useCallback((feature: ActiveFeature): void => {
    void navigateWithRuntimeSave(
      activeFeature,
      feature,
      () => confirmSaveBeforeSwitch(
        language === "zh"
          ? "当前 Runtime 配置尚未保存，离开前保存吗？"
          : "This Runtime config has unsaved changes. Save before leaving?",
      ),
      (nextFeature) => {
        void refreshSnapshotForFeature(nextFeature, snapshots.getSnapshot, setSnapshot)
          .catch((error) => console.warn("Failed to refresh workflow history", error))
          .finally(() => setActiveFeature(nextFeature));
      },
    );
  }, [activeFeature, confirmSaveBeforeSwitch, language, snapshots]);
  const {
    configuredAgents: editableConfiguredAgents,
    selectedConfiguredAgentId,
    configuredAgentStatus,
    setSelectedConfiguredAgentId,
    saveConfiguredAgents,
    addConfiguredAgent,
    updateConfiguredAgent,
  } = useConfiguredAgentsManager({
    chatApi,
    snapshot,
    setSnapshot,
  });
  const {
    controller: workflowController,
    sidebarController: workflowSidebarController,
    closeSidebarContextMenu: closeWorkflowContextMenu,
    resetWorkflowLocalDraft,
  } = useWorkflowFeatureManager({
    workflows,
    snapshot,
    snapshotRef,
    setSnapshot,
    language,
    onChooseWorkDir: chooseWorkDir,
    onRefresh: refresh,
    onReadOutputFile: readLocalFile,
    onEnterWorkflow: () => navigateToFeature("workflow"),
  });
  const menuCoordinator = useShellMenuCoordinator({
    hasChatContextMenu: chatContextMenu !== undefined,
    hasWorkflowContextMenu: workflowSidebarController.contextMenu !== undefined,
    hasConfigContextMenu: configContextMenu !== undefined,
    clearChatContextMenu: () => setChatContextMenu(undefined),
    clearWorkflowContextMenu: closeWorkflowContextMenu,
    clearConfigContextMenu: () => setConfigContextMenu(undefined),
  });
  const coordinatedWorkflowSidebarController = useMemo(
    () => ({
      ...workflowSidebarController,
      onOpenContextMenu: (workflowId: string, x: number, y: number) => {
        menuCoordinator.prepareWorkflowContextMenuOpen();
        workflowSidebarController.onOpenContextMenu(workflowId, x, y);
      },
    }),
    [menuCoordinator, workflowSidebarController],
  );
  const {
    scheduledWorkflowDraft,
    scheduledWorkflowMode,
    setScheduledWorkflowDraft,
    connectScheduledRunner,
    disconnectScheduledRunner,
    refreshScheduledWorkflows,
    selectScheduledWorkflowSchedule,
    startCreatingScheduledWorkflow,
    createScheduledWorkflow,
    updateScheduledWorkflow,
    deleteScheduledWorkflow,
    triggerScheduledWorkflow,
  } = useScheduledWorkflowManager({
    chatApi,
    snapshot,
    setSnapshot,
    onEnterSchedules: () => navigateToFeature("schedules"),
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(KEEP_AWAKE_STORAGE_KEY, String(keepAwake));
    void syncKeepAwakeIfAvailable(chatApi, keepAwake).catch((error) => {
      console.warn("Failed to update keep-awake state", error);
    });
  }, [chatApi, keepAwake]);

  useEffect(() => {
    void snapshots.getSnapshot().then((value) => {
      setSnapshot(value);
    });
    return snapshots.subscribe((value) => {
      setSnapshot(value);
    });
  }, [snapshots]);

  useEffect(() => {
    void refreshSkillLibrary().catch(() => undefined);
  }, [chatApi]);

  useEffect(() => {
    const fallbackId = defaultConfiguredAgentId(snapshot.configuredAgents);
    if (!fallbackId) return;
    const nextTaskAgentId = snapshot.configuredAgents.some((agent) => agent.id === taskConfiguredAgentId) ? taskConfiguredAgentId : fallbackId;
    if (nextTaskAgentId !== taskConfiguredAgentId) setTaskConfiguredAgentId(nextTaskAgentId);
    setTaskModelId((current) => configuredAgentModelId(nextTaskAgentId, current, snapshot.configuredAgents, snapshot.channels));
  }, [snapshot.configuredAgents, snapshot.channels, taskConfiguredAgentId]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (activeFeature !== "tasks") setSelectedTaskDetailId(undefined);
  }, [activeFeature]);

  useEffect(() => {
    if (!selectedTaskDetailId) return;
    if (snapshot.tasks.some((task) => task.id === selectedTaskDetailId)) return;
    setSelectedTaskDetailId(undefined);
  }, [selectedTaskDetailId, snapshot.tasks]);

  const runtimeMap = useMemo(() => new Map(snapshot.runtimes.map((runtime) => [runtime.id, runtime])), [snapshot.runtimes]);
  const activeChat = useMemo(() => activeChatFromAppState(snapshot), [snapshot]);
  const activeTask = useMemo(() => activeTaskFromAppState(snapshot), [snapshot]);
  const activeTeam = useMemo(() => activeTeamFromAppState(snapshot), [snapshot]);
  const text = UI_TEXT[language];
  const activeTeamRun = useMemo(() => activeTeamRunFromAppState(snapshot, activeTeam?.id), [snapshot, activeTeam?.id]);
  const visibleTasks = useMemo(
    () => (taskStatusFilter === "all" ? snapshot.tasks : snapshot.tasks.filter((task) => task.progress === taskStatusFilter)),
    [snapshot.tasks, taskStatusFilter],
  );
  const activeChatConfiguredAgent = activeChat ? configuredAgentById(activeChat.configuredAgentId, snapshot.configuredAgents) : undefined;
  const activeChatChannel = resolveConfiguredAgentChannel(activeChatConfiguredAgent, snapshot.channels);
  const activeChatRuntimeId = configuredAgentRuntimeId(activeChatConfiguredAgent, activeChatChannel);
  const activeRuntime = activeChat ? runtimeMap.get(activeChatRuntimeId) ?? fallbackRuntime(activeChatRuntimeId) : undefined;
  const activeModel = configuredAgentModel(activeChatConfiguredAgent, activeChatChannel, activeChat?.modelId);
  const activeChatConfigTitle = [
    activeChatConfiguredAgent?.name,
    activeChatChannel?.label,
    activeModel?.label ?? activeChatConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID,
    activeRuntime ? runtimeStatus(activeRuntime) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const slashCommandSuggestions = useMemo(
    () => (activeChat ? slashCommandSuggestionsFor(prompt, activeChatRuntimeId) : []),
    [activeChat, activeChatRuntimeId, prompt],
  );
  const promptIsSlashCommand = prompt.trimStart().startsWith("/");
  const canSend = !!activeChat && !activeChat.running && !!prompt.trim() && (promptIsSlashCommand || !!activeRuntime?.available);
  const activeChatLocked = activeChat ? chatConfigLocked(activeChat) : true;
  const selectedTaskDetailActiveId = taskDetailIdFor(activeFeature, selectedTaskDetailId, snapshot.activeTaskId);
  const sidebarModel = useMemo(
    () => ({
      chat: {
        chats: snapshot.chats,
        configuredAgents: snapshot.configuredAgents,
        channels: snapshot.channels,
        activeChatId: activeChat?.id,
        contextMenu: chatContextMenu,
      },
      tasks: {
        tasks: snapshot.tasks,
        visibleTasks,
        activeTask,
        taskStatusFilter,
        configuredAgents: snapshot.configuredAgents,
        channels: snapshot.channels,
      },
      workflow: coordinatedWorkflowSidebarController,
      schedules: {
        schedules: snapshot.scheduledWorkflowStore.schedules,
        activeScheduleId: snapshot.scheduledWorkflowStore.activeScheduleId,
        mode: scheduledWorkflowMode,
      },
      skills: {
        officialSkills: officialSkillTemplates,
        userSkills: userSkillTemplates,
      },
    }),
    [
      snapshot.chats,
      snapshot.configuredAgents,
      snapshot.channels,
      snapshot.tasks,
      snapshot.scheduledWorkflowStore.schedules,
      snapshot.scheduledWorkflowStore.activeScheduleId,
      activeChat?.id,
      chatContextMenu,
      visibleTasks,
      activeTask,
      taskStatusFilter,
      coordinatedWorkflowSidebarController,
      scheduledWorkflowMode,
      officialSkillTemplates,
      userSkillTemplates,
    ],
  );

  useEffect(() => {
    setSlashCommandIndex((current) => Math.min(current, Math.max(0, slashCommandSuggestions.length - 1)));
  }, [slashCommandSuggestions.length]);

  function toggleTheme(): void {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (!paletteOpen) void createChat();
        return;
      }
      if (paletteOpen || isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "g") {
        gChordRef.current = Date.now();
        return;
      }
      if (Date.now() - gChordRef.current < 900) {
        const navMap: Record<string, ActiveFeature> = { c: "chat", t: "tasks", w: "workflow", f: "workflow", r: "runtimes", s: "runtimes" };
        const feature = navMap[event.key.toLowerCase()];
        if (feature) {
          event.preventDefault();
          navigateToFeature(feature);
        }
        gChordRef.current = 0;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !stickToBottomRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [activeChat?.messages, activeChat?.running]);

  function handleTranscriptScroll(): void {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    stickToBottomRef.current = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
  }

  const paletteCommands = useMemo(
    () =>
      buildPaletteCommands({
        chats: snapshot.chats.map((chat) => {
          const agent = configuredAgentById(chat.configuredAgentId, snapshot.configuredAgents);
          const channel = resolveConfiguredAgentChannel(agent, snapshot.channels);
          return { id: chat.id, title: chat.title, agentId: configuredAgentRuntimeId(agent, channel) };
        }),
        theme,
        language,
        onNavigate: navigateToFeature,
        onSelectChat: (chatId) => void selectChat(chatId),
        onNewChat: () => void createChat(),
        onToggleTheme: toggleTheme,
        onChooseWorkDir: () => void chooseWorkDir(),
        onRefreshAgents: () => void refresh(),
      }),
    [snapshot.chats, snapshot.configuredAgents, snapshot.channels, theme, language],
  );

  async function refresh(): Promise<void> {
    const next = await chatApi.refreshAgents();
    setSnapshot(next);
  }

  async function createChat(configuredAgentId = activeChat?.configuredAgentId ?? defaultConfiguredAgentId(snapshot.configuredAgents)): Promise<void> {
    const next = await chatApi.createChat(configuredAgentId);
    setSnapshot(next);
    setPrompt("");
  }

  async function selectChat(chatId: string): Promise<void> {
    const next = await chatApi.selectChat(chatId);
    setSnapshot(next);
    setPrompt("");
  }

  async function setActiveChatConfiguredAgent(configuredAgentId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.configuredAgentId === configuredAgentId) return;
    const next = await chatApi.setChatAgent(activeChat.id, configuredAgentId);
    setSnapshot(next);
  }

  async function setActiveChatModel(modelId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.modelId === modelId) return;
    const next = await chatApi.setChatModel(activeChat.id, modelId);
    setSnapshot(next);
  }

  function setTaskConfiguredAgent(configuredAgentId: string): void {
    setTaskConfiguredAgentId(configuredAgentId);
    setTaskModelId(configuredAgentModelId(configuredAgentId, undefined, snapshot.configuredAgents, snapshot.channels));
  }

  function openChatContextMenu(event: MouseEvent, chatId: string): void {
    event.preventDefault();
    event.stopPropagation();
    menuCoordinator.prepareChatContextMenuOpen();
    setChatContextMenu({ chatId, x: event.clientX, y: event.clientY });
  }

  async function deleteChat(chatId: string): Promise<void> {
    setChatContextMenu(undefined);
    if (typeof chatApi.deleteChat !== "function") {
      window.alert?.(missingAppCapabilityMessage("Delete chat"));
      return;
    }
    const next = await chatApi.deleteChat(chatId);
    setSnapshot(next);
    if (activeChat?.id === chatId) setPrompt("");
  }

  function openRuntimeConfigContextMenu(event: MouseEvent, channelId: string): void {
    menuCoordinator.prepareConfigContextMenuOpen();
    openConfigContextMenu(event, channelId);
  }

  function updateProviderKey(presetId: string, value: string): void {
    updateProviderKeyInHook(PROVIDER_KEYS_STORAGE_KEY, setProviderKeys, presetId, value);
  }

  async function chooseWorkDir(): Promise<void> {
    const next = await chatApi.chooseWorkDir();
    setSnapshot(next);
  }

  async function readLocalFile(filePath: string): Promise<LocalFilePreview> {
    const api = chatApi as typeof chatApi & {
      readLocalFile?: (path: string) => Promise<LocalFilePreview>;
    };
    if (!api.readLocalFile) throw new Error("文件预览能力需要重启应用后生效。");
    return api.readLocalFile(filePath);
  }

  async function revealSkillInFinder(filePath: string): Promise<void> {
    const api = chatApi as typeof chatApi & {
      revealPathInFinder?: (path: string) => Promise<string>;
    };
    if (!api.revealPathInFinder) throw new Error("Finder 打开能力需要重启应用后生效。");
    await api.revealPathInFinder(filePath);
  }

  async function refreshImportedSkills(): Promise<SkillTemplate[]> {
    const api = chatApi as typeof chatApi & {
      listImportedSkills?: () => Promise<SkillTemplate[]>;
    };
    if (!api.listImportedSkills) return [];
    const templates = await api.listImportedSkills();
    setUserSkillTemplates(templates);
    return templates;
  }

  async function refreshSkillLibrary(): Promise<void> {
    const api = chatApi as typeof chatApi & {
      listOfficialSkills?: () => Promise<SkillTemplate[]>;
      listImportedSkills?: () => Promise<SkillTemplate[]>;
      listSkillCategories?: () => Promise<SkillCategory[]>;
    };
    const [official, user, categories] = await Promise.all([
      api.listOfficialSkills?.() ?? Promise.resolve([]),
      api.listImportedSkills?.() ?? Promise.resolve([]),
      api.listSkillCategories?.() ?? Promise.resolve([]),
    ]);
    setOfficialSkillTemplates(official);
    setUserSkillTemplates(user);
    setSkillCategories(categories);
  }

  async function createSkillCategory(name: string): Promise<SkillCategory> {
    const api = chatApi as typeof chatApi & { createSkillCategory?: (input: string) => Promise<SkillCategory> };
    if (!api.createSkillCategory) throw new Error("技能分类能力需要重启应用后生效。");
    const category = await api.createSkillCategory(name);
    await refreshSkillLibrary();
    return category;
  }

  async function assignSkillCategory(request: AssignSkillCategoryRequest): Promise<void> {
    const api = chatApi as typeof chatApi & {
      assignSkillCategory?: (input: AssignSkillCategoryRequest) => Promise<AssignSkillCategoryRequest>;
    };
    if (!api.assignSkillCategory) throw new Error("技能分类能力需要重启应用后生效。");
    await api.assignSkillCategory(request);
    await refreshSkillLibrary();
  }

  async function importOnlineSkill(skill: OnlineSkillResult): Promise<ImportedSkillResult> {
    const api = chatApi as typeof chatApi & {
      importOnlineSkill?: (request: ImportOnlineSkillRequest) => Promise<ImportedSkillResult>;
    };
    if (!api.importOnlineSkill) throw new Error("技能导入能力需要重启应用后生效。");
    const result = await api.importOnlineSkill(findSkillImportRequest(skill));
    await refreshImportedSkills();
    return result;
  }

  async function deleteUserSkill(templateId: string): Promise<void> {
    const api = chatApi as typeof chatApi & {
      deleteUserSkill?: (id: string) => Promise<{ removed: boolean }>;
    };
    if (!api.deleteUserSkill) throw new Error("技能删除能力需要重启应用后生效。");
    await api.deleteUserSkill(templateId);
    await refreshImportedSkills();
  }

  async function installSkill(templateId: string, target: SkillInstallTarget, sourceType: "official" | "user"): Promise<InstalledSkillResult> {
    const api = chatApi as typeof chatApi & {
      installSkill?: (request: { templateId: string; target: SkillInstallTarget }) => Promise<InstalledSkillResult>;
    };
    if (!api.installSkill) throw new Error("技能安装能力需要重启应用后生效。");
    return api.installSkill({ templateId, target, sourceType });
  }

  async function uninstallSkill(templateId: string, target: SkillInstallTarget): Promise<UninstalledSkillResult> {
    const api = chatApi as typeof chatApi & {
      uninstallSkill?: (request: { templateId: string; target: SkillInstallTarget }) => Promise<UninstalledSkillResult>;
    };
    if (!api.uninstallSkill) throw new Error("技能卸载能力需要重启应用后生效。");
    return api.uninstallSkill({ templateId, target });
  }

  async function clearHistory(): Promise<void> {
    const next = await chatApi.clearHistory();
    setSnapshot(next);
    setPrompt("");
    setTaskPrompt("");
    setTeamPrompt("");
    resetWorkflowLocalDraft();
  }

  async function send(): Promise<void> {
    if (!activeChat || !canSend) return;
    const text = prompt.trim();
    setPrompt("");
    const next = await chatApi.sendPrompt(text, activeChat.id);
    setSnapshot(next);
  }

  function completeSlashCommand(command: string): void {
    setPrompt(`${command} `);
    setSlashCommandIndex(0);
  }

  async function stopActiveChat(): Promise<void> {
    if (!activeChat) return;
    const next = await chatApi.stopChat(activeChat.id);
    setSnapshot(next);
  }

  async function runTask(): Promise<void> {
    const text = taskPrompt.trim();
    if (!text) return;
    const next = await chatApi.runTask({
      prompt: text,
      configuredAgentId: taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
      modelId: configuredAgentModelId(
        taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
        taskModelId,
        snapshot.configuredAgents,
        snapshot.channels,
      ),
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTaskPrompt("");
  }

  async function rerunTask(task: TaskRun): Promise<void> {
    if (task.running) return;
    const next = await chatApi.runTask({
      prompt: task.prompt,
      configuredAgentId: task.configuredAgentId,
      modelId: task.modelId,
      workDir: task.workDir || snapshot.workDir,
    });
    setSnapshot(next);
  }

  async function selectTask(taskId: string): Promise<void> {
    const next = await chatApi.selectTask(taskId);
    setSnapshot(next);
  }

  async function openTaskDetail(taskId: string): Promise<void> {
    setSelectedTaskDetailId(taskId);
    await selectTask(taskId);
  }

  async function stopTask(taskId: string): Promise<void> {
    const next = await chatApi.stopTask(taskId);
    setSnapshot(next);
  }

  async function updateTaskProgress(taskId: string, progress: TaskProgress): Promise<void> {
    const next = await chatApi.updateTaskProgress(taskId, progress);
    setSnapshot(next);
  }

  async function deleteTask(taskId: string): Promise<void> {
    const next = await chatApi.deleteTask(taskId);
    setSnapshot(next);
  }

  async function createTeam(): Promise<void> {
    const configuredAgentId = defaultConfiguredAgentId(snapshot.configuredAgents);
    const next = await chatApi.createTeam({
      name: `Agent Team ${snapshot.teams.length + 1}`,
      mode: "pipeline",
      sharedContext: "",
      members: [
        {
          roleName: "Planner",
          prompt: "Plan the work and identify the main risks.",
          configuredAgentId,
        },
        {
          roleName: "Checker",
          prompt: "Use the previous artifact to verify correctness and missing tests.",
          configuredAgentId,
        },
      ],
    });
    setSnapshot(next);
    navigateToFeature("workflow");
  }

  async function updateTeam(
    teamId: string,
    update: { name?: string; mode?: AgentTeamMode; sharedContext?: string; members?: AgentTeamMember[] },
  ): Promise<void> {
    const next = await chatApi.updateTeam(teamId, update);
    setSnapshot(next);
  }

  async function deleteTeam(teamId: string): Promise<void> {
    const next = await chatApi.deleteTeam(teamId);
    setSnapshot(next);
  }

  async function selectTeam(teamId: string): Promise<void> {
    const next = await chatApi.selectTeam(teamId);
    setSnapshot(next);
  }

  async function selectTeamRun(teamRunId: string): Promise<void> {
    const next = await chatApi.selectTeamRun(teamRunId);
    setSnapshot(next);
  }

  async function runTeam(teamId: string): Promise<void> {
    const text = teamPrompt.trim();
    if (!text) return;
    const next = await chatApi.runTeam({
      teamId,
      prompt: text,
      target: { kind: "workspace", label: "Workspace", value: snapshot.workDir },
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTeamPrompt("");
  }

  async function stopTeamRun(teamRunId: string): Promise<void> {
    const next = await chatApi.stopTeamRun(teamRunId);
    setSnapshot(next);
  }

  const providerSnapshot = useMemo(() => ({ snapshot, setSnapshot }), [snapshot]);
  const providerPreferences = useMemo(
    () => ({ theme, setTheme, language, setLanguage, keepAwake, setKeepAwake, providerKeys, setProviderKeys }),
    [theme, language, keepAwake, providerKeys],
  );
  const providerNavigation = useMemo(
    () => ({ activeFeature, setActiveFeature: navigateToFeature, paletteOpen, setPaletteOpen }),
    [activeFeature, navigateToFeature, paletteOpen],
  );

  return (
    <AppProviders snapshot={providerSnapshot} preferences={providerPreferences} navigation={providerNavigation}>
      <div className={appShellClass(activeFeature)}>
        <FeatureRail activeFeature={activeFeature} theme={theme} text={text} onSelectFeature={navigateToFeature} onToggleTheme={toggleTheme} />

        {activeFeature !== "mcp" && activeFeature !== "evaluation" ? <ResourceSidebar
          activeFeature={activeFeature}
          language={language}
          text={text}
          model={sidebarModel}
          onOpenPalette={() => setPaletteOpen(true)}
          onCreateChat={createChat}
          onSelectChat={selectChat}
          onOpenChatContextMenu={openChatContextMenu}
          onDeleteChat={deleteChat}
          onTaskStatusFilterChange={setTaskStatusFilter}
          onSelectTask={selectTask}
          onStartCreatingScheduledWorkflow={startCreatingScheduledWorkflow}
          onSelectScheduledWorkflowSchedule={selectScheduledWorkflowSchedule}
        /> : null}

        <main className={appContentClass(activeFeature)}>
        {activeFeature === "tasks" ? (
          <TaskPage
            prompt={taskPrompt}
            configuredAgentId={taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents)}
            modelId={taskModelId}
            configuredAgents={editableConfiguredAgents}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            tasks={snapshot.tasks}
            activeTaskId={selectedTaskDetailActiveId}
            onPromptChange={setTaskPrompt}
            onSelectConfiguredAgent={setTaskConfiguredAgent}
            onSelectModel={setTaskModelId}
            onChooseWorkDir={chooseWorkDir}
            onRunTask={runTask}
            onRerunTask={rerunTask}
            onSelectTask={openTaskDetail}
            onCloseTaskDetail={() => setSelectedTaskDetailId(undefined)}
            onStopTask={stopTask}
            onDeleteTask={deleteTask}
            onUpdateTaskProgress={updateTaskProgress}
          />
        ) : activeFeature === "workflow" ? (
          <WorkflowFeature controller={workflowController} />
        ) : activeFeature === "schedules" ? (
          <ScheduledWorkflowPage
            language={language}
            workflows={snapshot.workflowStore.workflows}
            store={snapshot.scheduledWorkflowStore}
            draft={scheduledWorkflowDraft}
            mode={scheduledWorkflowMode}
            onDraftChange={setScheduledWorkflowDraft}
            onConnectRunner={connectScheduledRunner}
            onDisconnectRunner={disconnectScheduledRunner}
            onRefreshSchedules={refreshScheduledWorkflows}
            onCreateSchedule={createScheduledWorkflow}
            onUpdateSchedule={updateScheduledWorkflow}
            onDeleteSchedule={deleteScheduledWorkflow}
            onTriggerSchedule={triggerScheduledWorkflow}
          />
        ) : activeFeature === "skills" ? (
          <SkillsPage
            language={language}
            officialSkills={officialSkillTemplates}
            userSkills={userSkillTemplates}
            categories={skillCategories}
            configuredAgents={snapshot.configuredAgents}
            onImportOnlineSkill={importOnlineSkill}
            onRevealSkillInFinder={revealSkillInFinder}
            onInstallSkill={installSkill}
            onUninstallSkill={uninstallSkill}
            onDeleteUserSkill={deleteUserSkill}
            onCreateCategory={createSkillCategory}
            onAssignCategory={assignSkillCategory}
          />
        ) : activeFeature === "runtimes" ? (
          <RuntimePage
            language={language}
            channels={configChannels}
            selectedChannelId={selectedConfigChannelId}
            selectedRuntimeId={selectedRuntimeId}
            providerKeys={providerKeys}
            codexPluginCatalog={codexPluginCatalog}
            pluginCatalogStatus={pluginCatalogStatus}
            agentTestResults={agentTestResults}
            testingAgentId={testingAgentId}
            agentTestTick={agentTestTick}
            balanceResults={balanceResults}
            balanceLoadingChannelId={balanceLoadingChannelId}
            contextMenu={configContextMenu}
            status={configStatus}
            onUpdateChannel={updateConfigChannel}
            onAddModel={addConfigModel}
            onUpdateModel={updateConfigModel}
            onRemoveModel={removeConfigModel}
            onSave={saveChannelConfig}
            onLoadCodexPluginCatalog={loadCodexPluginCatalog}
            onSelectChannel={selectConfigChannel}
            onSelectRuntime={selectRuntime}
            onAddConfig={addConfigChannel}
            onImportLocalConfig={importLocalConfig}
            onOpenContextMenu={openRuntimeConfigContextMenu}
            onDeleteConfig={deleteConfigChannel}
            onTestChannel={testRuntimeChannel}
            onQueryBalance={queryRuntimeChannelBalance}
            onRefreshModels={refreshModelCatalog}
            onUpdateProviderKey={updateProviderKey}
            onLoadCodexDefaultConfig={() => window.multiAgentChat.loadCodexDefaultConfig()}
            onReplaceChannelAndPersist={replaceConfigChannelAndPersist}
            onStatusChange={setConfigStatus}
          />
        ) : activeFeature === "mcp" ? (
          <McpPage language={language} agents={snapshot.configuredAgents} />
        ) : activeFeature === "evaluation" ? (
          <EvaluationPage language={language} agents={snapshot.configuredAgents} channels={snapshot.channels} />
        ) : activeFeature === "agent" ? (
          <AgentPage
            language={language}
            channels={snapshot.channels}
            configuredAgents={snapshot.configuredAgents}
            selectedConfiguredAgentId={selectedConfiguredAgentId}
            status={configuredAgentStatus}
            onSave={() => saveConfiguredAgents(editableConfiguredAgents)}
            onAddConfiguredAgent={addConfiguredAgent}
            onSelectConfiguredAgent={setSelectedConfiguredAgentId}
            onUpdateConfiguredAgent={updateConfiguredAgent}
          />
        ) : (
          <ChatPage
            activeChat={activeChat}
            activeChatRuntimeId={activeChatRuntimeId}
            activeChatConfiguredAgent={activeChatConfiguredAgent}
            activeChatConfigTitle={activeChatConfigTitle}
            prompt={prompt}
            slashCommandSuggestions={slashCommandSuggestions}
            slashCommandIndex={slashCommandIndex}
            canSend={canSend}
            activeChatLocked={activeChatLocked}
            transcriptRef={transcriptRef}
            configuredAgents={snapshot.configuredAgents}
            channels={snapshot.channels}
            runtimes={snapshot.runtimes}
            workDir={snapshot.workDir}
            onTranscriptScroll={handleTranscriptScroll}
            onPromptChange={setPrompt}
            onSlashCommandIndexChange={setSlashCommandIndex}
            onCompleteSlashCommand={completeSlashCommand}
            onSend={send}
            onStopActiveChat={stopActiveChat}
            onSelectConfiguredAgent={setActiveChatConfiguredAgent}
            onSelectModel={setActiveChatModel}
            onChooseWorkDir={chooseWorkDir}
          />
        )}
        </main>

        <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      </div>
    </AppProviders>
  );
}
