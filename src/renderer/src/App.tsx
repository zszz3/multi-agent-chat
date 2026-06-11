import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  Bot,
  CircleStop,
  ClipboardList,
  FileInput,
  FolderOpen,
  GitBranch,
  GripVertical,
  MessageSquareText,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  SquarePen,
  Sun,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { CommandPalette, buildPaletteCommands, type Theme } from "./CommandPalette";
import { Markdown } from "./Markdown";
import { DEFAULT_MODEL_ID, defaultChannelForAgent, modelsForChannel } from "../../shared/models";
import type {
  AgentChannel,
  AgentId,
  AgentModelOption,
  AgentPluginConfig,
  AgentRuntime,
  AgentTeam,
  AgentTeamMember,
  AgentTeamMode,
  AgentWorkflowNode,
  AgentWorkflowNodeStatus,
  AppSnapshot,
  ChatMessage,
  ChatSession,
  CodexPluginCatalogItem,
  GeneratedConfigFile,
  ImportedCodexConfig,
  TeamRun,
  TaskProgress,
  TaskRun,
} from "../../shared/types";

const AGENTS: AgentId[] = ["codex", "claude"];
const THEME_STORAGE_KEY = "multi-agent-chat-theme";

export function loadStoredTheme(storage: Pick<Storage, "getItem">): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export type ActiveFeature = "chat" | "tasks" | "teams" | "configs";
type MaybePromise = void | Promise<void>;
export type TaskStatusFilterValue = "all" | TaskProgress;

const TASK_STATUS_FILTERS: Array<{ id: TaskStatusFilterValue; label: string }> = [
  { id: "all", label: "All" },
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "Working" },
  { id: "in_review", label: "Review" },
  { id: "done", label: "Done" },
];

const TEAM_MODE_OPTIONS: Array<{ id: AgentTeamMode; label: string; description: string }> = [
  { id: "pipeline", label: "Pipeline", description: "Run nodes one after another." },
  { id: "parallel", label: "Parallel", description: "Run all worker nodes at once." },
  { id: "supervisor", label: "Supervisor", description: "Lead plans, workers execute, lead synthesizes." },
];

function teamModeLabel(mode: AgentTeamMode): string {
  return TEAM_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "Pipeline";
}

interface SlashCommandSuggestion {
  command: string;
  description: string;
  agentIds?: AgentId[];
}

interface ComposerKeyState {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
}

const SLASH_COMMANDS: SlashCommandSuggestion[] = [
  { command: "/status", description: "Read Codex app-server config, models, plugins, and MCP status.", agentIds: ["codex"] },
  { command: "/models", description: "List models from Codex app-server.", agentIds: ["codex"] },
  { command: "/plugins", description: "List Codex plugins from all app-server marketplaces.", agentIds: ["codex"] },
  { command: "/help", description: "Show available slash commands." },
];

export function appShellClass(activeFeature: ActiveFeature): string {
  return activeFeature === "tasks" || activeFeature === "teams" ? `shell ${activeFeature}-shell` : "shell";
}

export function taskDetailIdFor(
  activeFeature: ActiveFeature,
  selectedTaskDetailId: string | undefined,
  persistedActiveTaskId: string | undefined,
): string | undefined {
  void persistedActiveTaskId;
  return activeFeature === "tasks" ? selectedTaskDetailId : undefined;
}

const DEFAULT_SNAPSHOT: AppSnapshot = {
  detectedAt: Date.now(),
  activeChatId: undefined,
  activeTaskId: undefined,
  activeTeamId: undefined,
  activeTeamRunId: undefined,
  workDir: "",
  runtimes: [],
  channels: [],
  chats: [],
  tasks: [],
  teams: [],
  teamRuns: [],
};

function agentLabel(agentId: AgentId): string {
  return agentId === "codex" ? "Codex" : "Claude Code";
}

function agentAccent(agentId: AgentId): string {
  return agentId === "codex" ? "agent-codex" : "agent-claude";
}

function fallbackRuntime(agentId: AgentId): AgentRuntime {
  return {
    id: agentId,
    label: agentLabel(agentId),
    command: agentId,
    version: null,
    available: false,
    error: "Detecting",
  };
}

function runtimeStatus(runtime: AgentRuntime): string {
  if (runtime.available) return runtime.version ?? "available";
  return runtime.error ?? "missing";
}

function formatTime(value: number): string {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function activeChatFrom(snapshot: AppSnapshot): ChatSession | undefined {
  return snapshot.chats.find((chat) => chat.id === snapshot.activeChatId) ?? snapshot.chats[0];
}

function activeTaskFrom(snapshot: AppSnapshot): TaskRun | undefined {
  return snapshot.tasks.find((task) => task.id === snapshot.activeTaskId) ?? snapshot.tasks[0];
}

function activeTeamFrom(snapshot: AppSnapshot): AgentTeam | undefined {
  return snapshot.teams.find((team) => team.id === snapshot.activeTeamId) ?? snapshot.teams[0];
}

function activeTeamRunFrom(snapshot: AppSnapshot, teamId: string | undefined): TeamRun | undefined {
  const run = snapshot.teamRuns.find((item) => item.id === snapshot.activeTeamRunId);
  if (run && (!teamId || run.teamId === teamId)) return run;
  return snapshot.teamRuns.find((item) => !teamId || item.teamId === teamId);
}

export function workflowStatusForTeamMember(run: TeamRun | undefined, teamMemberId: string): AgentWorkflowNodeStatus {
  const workflowNode = run?.workflow?.nodes.find((node) => node.teamMemberId === teamMemberId);
  if (workflowNode) return workflowNode.status;
  const step = run?.steps.find((item) => item.teamMemberId === teamMemberId);
  return step?.status ?? "idle";
}

function workflowStatusClass(status: AgentWorkflowNodeStatus): string {
  return status === "idle" ? "" : `is-${status}`;
}

function workflowTraceNodesForRun(run: TeamRun): AgentWorkflowNode[] {
  const workflowNodes = run.workflow?.nodes.filter((node) => node.kind === "agent" || node.kind === "synthesis") ?? [];
  if (workflowNodes.length > 0) return workflowNodes;
  return run.steps.map((step): AgentWorkflowNode => ({
    id: step.id,
    kind: "agent",
    label: step.roleName,
    status: step.status,
    teamMemberId: step.teamMemberId,
    stepId: step.id,
  }));
}

export function reorderTeamMembers(
  members: AgentTeamMember[],
  draggedMemberId: string,
  targetMemberId: string | undefined,
): AgentTeamMember[] {
  if (draggedMemberId === targetMemberId) return members;
  const draggedIndex = members.findIndex((member) => member.id === draggedMemberId);
  if (draggedIndex < 0) return members;

  const draggedMember = members[draggedIndex];
  if (!draggedMember) return members;
  if (!targetMemberId) {
    const withoutDragged = members.filter((member) => member.id !== draggedMemberId);
    return [...withoutDragged, draggedMember];
  }

  const targetIndex = members.findIndex((member) => member.id === targetMemberId);
  if (targetIndex < 0) return members;
  const next = [...members];
  next[draggedIndex] = members[targetIndex]!;
  next[targetIndex] = draggedMember;
  return next;
}

function draftWorkflowMembers(mode: AgentTeamMode, channels: AgentChannel[]): AgentTeamMember[] {
  const agentId: AgentId = "codex";
  const channelId = defaultChannelForAgent(agentId, channels);
  const templates: Array<[string, string]> =
    mode === "parallel"
      ? [
          ["Research", "Inspect the target and collect relevant facts, files, and constraints."],
          ["Risk Review", "Review correctness, security, edge cases, and operational risks."],
          ["Verification", "Design or run verification steps and call out missing coverage."],
        ]
      : mode === "supervisor"
        ? [
            ["Lead", "Plan the work, assign focus areas, and reconcile the final answer."],
            ["Implementation Review", "Work from the lead plan and inspect implementation details."],
            ["Test Review", "Work from the lead plan and inspect verification gaps."],
          ]
        : [
            ["Planner", "Break down the target and produce a concise execution plan."],
            ["Worker", "Execute the plan and produce concrete findings or changes."],
            ["Reviewer", "Review the previous artifact and identify risks, gaps, and next steps."],
          ];

  return templates.map(([roleName, prompt], index) => ({
    id: `draft-${Date.now()}-${index}`,
    roleName,
    prompt,
    agentId,
    channelId,
    modelId: DEFAULT_MODEL_ID,
  }));
}

function taskStatusCount(tasks: TaskRun[], status: TaskStatusFilterValue): number {
  if (status === "all") return tasks.length;
  return tasks.filter((task) => task.progress === status).length;
}

function taskProgressLabel(progress: TaskProgress): string {
  return TASK_STATUS_FILTERS.find((item) => item.id === progress)?.label ?? progress;
}

export function slashCommandSuggestionsFor(value: string, agentId: AgentId): SlashCommandSuggestion[] {
  const input = value.trimStart();
  if (!input.startsWith("/") || input.includes("\n")) return [];
  if (/\s/.test(input)) return [];
  const query = input.toLowerCase();
  return SLASH_COMMANDS.filter((item) => {
    if (item.agentIds && !item.agentIds.includes(agentId)) return false;
    return item.command.toLowerCase().startsWith(query);
  });
}

export function shouldSendComposerKey(event: ComposerKeyState): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

export function SlashCommandSuggestions({
  suggestions,
  activeIndex,
  onSelect,
}: {
  suggestions: SlashCommandSuggestion[];
  activeIndex: number;
  onSelect: (suggestion: SlashCommandSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="slash-command-menu" role="listbox" aria-label="Slash commands">
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.command}
          type="button"
          className={`slash-command-option ${index === activeIndex ? "is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
          role="option"
          aria-selected={index === activeIndex}
        >
          <span>{suggestion.command}</span>
          <small>{suggestion.description}</small>
        </button>
      ))}
    </div>
  );
}

export function TaskStatusFilter({
  tasks,
  value,
  onChange,
}: {
  tasks: TaskRun[];
  value: TaskStatusFilterValue;
  onChange: (value: TaskStatusFilterValue) => void;
}) {
  return (
    <div className="task-progress-filter" aria-label="Task progress">
      {TASK_STATUS_FILTERS.map((filter) => {
        const count = taskStatusCount(tasks, filter.id);
        return (
          <button
            key={filter.id}
            className={`task-progress-option ${value === filter.id ? "is-active" : ""}`}
            onClick={() => onChange(filter.id)}
          >
            <span>{filter.label}</span>
            <strong>{count}</strong>
          </button>
        );
      })}
    </div>
  );
}

function hasAgentConversationMessages(messages: ChatSession["messages"]): boolean {
  return messages.some((message) => !message.local);
}

export function chatConfigLocked(chat: ChatSession): boolean {
  return chat.running || Boolean(chat.sessionId) || hasAgentConversationMessages(chat.messages);
}

function uniqueId(base: string, existingIds: string[]): string {
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "channel";
  if (!existingIds.includes(normalized)) return normalized;
  let suffix = 2;
  while (existingIds.includes(`${normalized}-${suffix}`)) suffix += 1;
  return `${normalized}-${suffix}`;
}

function createChannel(agentId: AgentId, existingIds: string[]): AgentChannel {
  const id = uniqueId(`${agentId}-channel`, existingIds);
  return {
    id,
    agentId,
    label: agentId === "codex" ? "New Codex Channel" : "New Claude Channel",
    models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
  };
}

function createModel(existingModels: AgentModelOption[]): AgentModelOption {
  const id = uniqueId("model", existingModels.map((model) => model.id));
  return { id, label: id };
}

function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function headersFromText(value: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const headerValue = trimmed.slice(separator + 1).trim();
    if (key) headers[key] = headerValue;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function withOptionalString(channel: AgentChannel, key: keyof AgentChannel, value: string): AgentChannel {
  const next: AgentChannel = { ...channel, models: channel.models.map((model) => ({ ...model })) };
  const trimmed = value.trim();
  if (trimmed) {
    (next as unknown as Record<string, unknown>)[key] = trimmed;
  } else {
    delete (next as unknown as Record<string, unknown>)[key];
  }
  return next;
}

function withOptionalHeaders(channel: AgentChannel, value: string): AgentChannel {
  const next: AgentChannel = { ...channel, models: channel.models.map((model) => ({ ...model })) };
  const headers = headersFromText(value);
  if (headers) next.httpHeaders = headers;
  else delete (next as unknown as Record<string, unknown>).httpHeaders;
  return next;
}

function updatePluginAt(channel: AgentChannel, index: number, updater: (plugin: AgentPluginConfig) => AgentPluginConfig): AgentChannel {
  const plugins = [...(channel.plugins ?? [])];
  const current = plugins[index];
  if (!current) return channel;
  plugins[index] = updater(current);
  return { ...channel, plugins };
}

function removePluginAt(channel: AgentChannel, index: number): AgentChannel {
  const plugins = (channel.plugins ?? []).filter((_, itemIndex) => itemIndex !== index);
  const next = { ...channel };
  if (plugins.length > 0) next.plugins = plugins;
  else delete next.plugins;
  return next;
}

function addPluginToChannel(channel: AgentChannel, pluginId: string): AgentChannel {
  const id = pluginId.trim();
  if (!id) return channel;
  const plugins = [...(channel.plugins ?? [])];
  const existingIndex = plugins.findIndex((plugin) => plugin.id === id);
  if (existingIndex >= 0) {
    const existingPlugin = plugins[existingIndex];
    if (!existingPlugin) return channel;
    plugins[existingIndex] = { ...existingPlugin, enabled: true };
    return { ...channel, plugins };
  }
  return { ...channel, plugins: [...plugins, { id, enabled: true }] };
}

function mergeImportedChannels(channels: AgentChannel[], imported: ImportedCodexConfig[]): AgentChannel[] {
  const merged = new Map(channels.map((channel) => [channel.id, channel]));
  for (const item of imported) merged.set(item.channel.id, item.channel);
  return [...merged.values()];
}

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(DEFAULT_SNAPSHOT);
  const [prompt, setPrompt] = useState("");
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [teamPrompt, setTeamPrompt] = useState("");
  const [taskAgentId, setTaskAgentId] = useState<AgentId>("codex");
  const [taskChannelId, setTaskChannelId] = useState("");
  const [taskModelId, setTaskModelId] = useState(DEFAULT_MODEL_ID);
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilterValue>("all");
  const [selectedTaskDetailId, setSelectedTaskDetailId] = useState<string | undefined>();
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>("chat");
  const [configChannels, setConfigChannels] = useState<AgentChannel[]>([]);
  const [selectedConfigChannelId, setSelectedConfigChannelId] = useState("");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [configDraft, setConfigDraft] = useState("[]");
  const [configDirty, setConfigDirty] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [generatedConfigs, setGeneratedConfigs] = useState<GeneratedConfigFile[]>([]);
  const [importedConfigs, setImportedConfigs] = useState<ImportedCodexConfig[]>([]);
  const [codexPluginCatalog, setCodexPluginCatalog] = useState<CodexPluginCatalogItem[]>([]);
  const [pluginCatalogStatus, setPluginCatalogStatus] = useState("");
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme(window.localStorage));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const transcriptRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const gChordRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    void window.multiAgentChat.getSnapshot().then((value) => {
      setSnapshot(value);
    });
    return window.multiAgentChat.onSnapshot((value) => {
      setSnapshot(value);
    });
  }, []);

  useEffect(() => {
    if (configDirty) return;
    setConfigChannels(snapshot.channels);
    setConfigDraft(JSON.stringify(snapshot.channels, null, 2));
    setSelectedConfigChannelId((current) => {
      if (current && snapshot.channels.some((channel) => channel.id === current)) return current;
      return snapshot.channels[0]?.id ?? "";
    });
  }, [configDirty, snapshot.channels]);

  useEffect(() => {
    setTaskChannelId((current) => {
      if (current && snapshot.channels.some((channel) => channel.id === current && channel.agentId === taskAgentId)) return current;
      return defaultChannelForAgent(taskAgentId, snapshot.channels);
    });
  }, [snapshot.channels, taskAgentId]);

  useEffect(() => {
    setTaskModelId((current) => {
      const channelId =
        taskChannelId && snapshot.channels.some((channel) => channel.id === taskChannelId && channel.agentId === taskAgentId)
          ? taskChannelId
          : defaultChannelForAgent(taskAgentId, snapshot.channels);
      const models = modelsForChannel(taskAgentId, channelId, snapshot.channels);
      return models.some((model) => model.id === current) ? current : DEFAULT_MODEL_ID;
    });
  }, [snapshot.channels, taskAgentId, taskChannelId]);

  useEffect(() => {
    if (activeFeature !== "configs" || pluginCatalogStatus || codexPluginCatalog.length > 0) return;
    void loadCodexPluginCatalog();
  }, [activeFeature, codexPluginCatalog.length, pluginCatalogStatus]);

  useEffect(() => {
    if (activeFeature !== "tasks") setSelectedTaskDetailId(undefined);
  }, [activeFeature]);

  useEffect(() => {
    if (!selectedTaskDetailId) return;
    if (snapshot.tasks.some((task) => task.id === selectedTaskDetailId)) return;
    setSelectedTaskDetailId(undefined);
  }, [selectedTaskDetailId, snapshot.tasks]);

  const runtimeMap = useMemo(() => new Map(snapshot.runtimes.map((runtime) => [runtime.id, runtime])), [snapshot.runtimes]);
  const activeChat = useMemo(() => activeChatFrom(snapshot), [snapshot]);
  const activeTask = useMemo(() => activeTaskFrom(snapshot), [snapshot]);
  const activeTeam = useMemo(() => activeTeamFrom(snapshot), [snapshot]);
  const activeTeamRun = useMemo(() => activeTeamRunFrom(snapshot, activeTeam?.id), [snapshot, activeTeam?.id]);
  const visibleTasks = useMemo(
    () => (taskStatusFilter === "all" ? snapshot.tasks : snapshot.tasks.filter((task) => task.progress === taskStatusFilter)),
    [snapshot.tasks, taskStatusFilter],
  );
  const activeRuntime = activeChat ? runtimeMap.get(activeChat.agentId) ?? fallbackRuntime(activeChat.agentId) : undefined;
  const activeChannel = activeChat ? snapshot.channels.find((channel) => channel.id === activeChat.channelId) : undefined;
  const activeModel = activeChat
    ? modelsForChannel(activeChat.agentId, activeChat.channelId, snapshot.channels).find((model) => model.id === activeChat.modelId)
    : undefined;
  const slashCommandSuggestions = useMemo(
    () => (activeChat ? slashCommandSuggestionsFor(prompt, activeChat.agentId) : []),
    [activeChat?.agentId, prompt],
  );
  const promptIsSlashCommand = prompt.trimStart().startsWith("/");
  const canSend = !!activeChat && !activeChat.running && !!prompt.trim() && (promptIsSlashCommand || !!activeRuntime?.available);
  const activeChatLocked = activeChat ? chatConfigLocked(activeChat) : true;
  const selectedTaskDetailActiveId = taskDetailIdFor(activeFeature, selectedTaskDetailId, snapshot.activeTaskId);

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
        const navMap: Record<string, ActiveFeature> = { c: "chat", t: "tasks", w: "teams", s: "configs" };
        const feature = navMap[event.key.toLowerCase()];
        if (feature) {
          event.preventDefault();
          setActiveFeature(feature);
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
        chats: snapshot.chats.map((chat) => ({ id: chat.id, title: chat.title, agentId: chat.agentId })),
        theme,
        onNavigate: setActiveFeature,
        onSelectChat: (chatId) => void selectChat(chatId),
        onNewChat: () => void createChat(),
        onToggleTheme: toggleTheme,
        onChooseWorkDir: () => void chooseWorkDir(),
        onRefreshAgents: () => void refresh(),
      }),
    [snapshot.chats, theme],
  );

  async function refresh(): Promise<void> {
    const next = await window.multiAgentChat.refreshAgents();
    setSnapshot(next);
  }

  async function createChat(agentId: AgentId = activeChat?.agentId ?? "codex"): Promise<void> {
    const next = await window.multiAgentChat.createChat(agentId);
    setSnapshot(next);
    setPrompt("");
  }

  async function selectChat(chatId: string): Promise<void> {
    const next = await window.multiAgentChat.selectChat(chatId);
    setSnapshot(next);
    setPrompt("");
  }

  async function setActiveChatAgent(agentId: AgentId): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.agentId === agentId) return;
    const next = await window.multiAgentChat.setChatAgent(activeChat.id, agentId);
    setSnapshot(next);
  }

  async function setActiveChatChannel(channelId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.channelId === channelId) return;
    const next = await window.multiAgentChat.setChatChannel(activeChat.id, channelId);
    setSnapshot(next);
  }

  async function setActiveChatModel(modelId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.modelId === modelId) return;
    const next = await window.multiAgentChat.setChatModel(activeChat.id, modelId);
    setSnapshot(next);
  }

  function setTaskAgent(agentId: AgentId): void {
    setTaskAgentId(agentId);
    setTaskChannelId(defaultChannelForAgent(agentId, snapshot.channels));
    setTaskModelId(DEFAULT_MODEL_ID);
  }

  function setTaskChannel(channelId: string): void {
    setTaskChannelId(channelId);
    setTaskModelId(DEFAULT_MODEL_ID);
  }

  function setTaskModel(modelId: string): void {
    setTaskModelId(modelId);
  }

  function updateConfigDraft(value: string): void {
    setConfigDraft(value);
    setConfigDirty(true);
    setConfigStatus("");
  }

  function updateConfigChannels(next: AgentChannel[]): void {
    setConfigChannels(next);
    setConfigDraft(JSON.stringify(next, null, 2));
    setConfigDirty(true);
    setConfigStatus("");
    setSelectedConfigChannelId((current) => {
      if (current && next.some((channel) => channel.id === current)) return current;
      return next[0]?.id ?? "";
    });
  }

  function parseConfigDraft(): AgentChannel[] {
    const parsed = JSON.parse(configDraft) as unknown;
    if (Array.isArray(parsed)) return parsed as AgentChannel[];
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { channels?: unknown }).channels)) {
      return (parsed as { channels: AgentChannel[] }).channels;
    }
    throw new Error("Config must be a channel array or an object with channels");
  }

  async function persistChannelConfig(): Promise<AppSnapshot> {
    const channels = advancedMode ? parseConfigDraft() : configChannels;
    const next = await window.multiAgentChat.saveModelChannels(channels);
    setConfigChannels(next.channels);
    setConfigDraft(JSON.stringify(next.channels, null, 2));
    setConfigDirty(false);
    setSelectedConfigChannelId((current) => {
      if (current && next.channels.some((channel) => channel.id === current)) return current;
      return next.channels[0]?.id ?? "";
    });
    setSnapshot(next);
    return next;
  }

  async function saveChannelConfig(): Promise<void> {
    try {
      await persistChannelConfig();
      setConfigStatus("Saved");
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function importCodexConfigs(): Promise<void> {
    try {
      const imported = await window.multiAgentChat.importCodexConfigs();
      setImportedConfigs(imported);
      if (imported.length === 0) {
        setConfigStatus("No Codex profiles found");
        return;
      }
      const merged = mergeImportedChannels(configChannels, imported);
      updateConfigChannels(merged);
      setSelectedConfigChannelId(imported[0]?.channel.id ?? merged[0]?.id ?? "");
      setConfigStatus(`Imported ${imported.length} Codex profiles`);
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadCodexPluginCatalog(): Promise<void> {
    setPluginCatalogStatus("Loading plugins...");
    try {
      const plugins = await window.multiAgentChat.listCodexPlugins();
      setCodexPluginCatalog(plugins);
      setPluginCatalogStatus(`Loaded ${plugins.length} plugins`);
    } catch (error) {
      setPluginCatalogStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function addConfigChannel(agentId: AgentId): void {
    const next = [...configChannels, createChannel(agentId, configChannels.map((channel) => channel.id))];
    updateConfigChannels(next);
    setSelectedConfigChannelId(next[next.length - 1]?.id ?? "");
  }

  function removeConfigChannel(channelId: string): void {
    updateConfigChannels(configChannels.filter((channel) => channel.id !== channelId));
  }

  function updateConfigChannel(channelId: string, updater: (channel: AgentChannel) => AgentChannel): void {
    updateConfigChannels(configChannels.map((channel) => (channel.id === channelId ? updater(channel) : channel)));
  }

  function addConfigModel(channelId: string): void {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: [...channel.models, createModel(channel.models)],
    }));
  }

  function updateConfigModel(channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption): void {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: channel.models.map((model, index) => (index === modelIndex ? updater(model) : model)),
    }));
  }

  function removeConfigModel(channelId: string, modelIndex: number): void {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: channel.models.filter((_model, index) => index !== modelIndex),
    }));
  }

  async function generateChannelConfigs(): Promise<void> {
    try {
      if (configDirty) {
        await persistChannelConfig();
      }
      const generated = await window.multiAgentChat.generateCodexConfigs();
      setGeneratedConfigs(generated);
      setConfigStatus(`Generated ${generated.length} Codex profiles`);
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function chooseWorkDir(): Promise<void> {
    const next = await window.multiAgentChat.chooseWorkDir();
    setSnapshot(next);
  }

  async function clearHistory(): Promise<void> {
    const next = await window.multiAgentChat.clearHistory();
    setSnapshot(next);
    setPrompt("");
    setTaskPrompt("");
    setTeamPrompt("");
  }

  async function send(): Promise<void> {
    if (!activeChat || !canSend) return;
    const text = prompt.trim();
    setPrompt("");
    const next = await window.multiAgentChat.sendPrompt(text, activeChat.id);
    setSnapshot(next);
  }

  function completeSlashCommand(command: string): void {
    setPrompt(`${command} `);
    setSlashCommandIndex(0);
  }

  async function stopActiveChat(): Promise<void> {
    if (!activeChat) return;
    const next = await window.multiAgentChat.stopChat(activeChat.id);
    setSnapshot(next);
  }

  async function runTask(): Promise<void> {
    const text = taskPrompt.trim();
    if (!text) return;
    const channelId = taskChannelId || defaultChannelForAgent(taskAgentId, snapshot.channels);
    const next = await window.multiAgentChat.runTask({
      prompt: text,
      agentId: taskAgentId,
      channelId,
      modelId: taskModelId || DEFAULT_MODEL_ID,
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTaskPrompt("");
  }

  async function rerunTask(task: TaskRun): Promise<void> {
    if (task.running) return;
    const next = await window.multiAgentChat.runTask({
      prompt: task.prompt,
      agentId: task.agentId,
      channelId: task.channelId,
      modelId: task.modelId,
      workDir: task.workDir || snapshot.workDir,
    });
    setSnapshot(next);
  }

  async function selectTask(taskId: string): Promise<void> {
    const next = await window.multiAgentChat.selectTask(taskId);
    setSnapshot(next);
  }

  async function openTaskDetail(taskId: string): Promise<void> {
    setSelectedTaskDetailId(taskId);
    await selectTask(taskId);
  }

  async function stopTask(taskId: string): Promise<void> {
    const next = await window.multiAgentChat.stopTask(taskId);
    setSnapshot(next);
  }

  async function updateTaskProgress(taskId: string, progress: TaskProgress): Promise<void> {
    const next = await window.multiAgentChat.updateTaskProgress(taskId, progress);
    setSnapshot(next);
  }

  async function deleteTask(taskId: string): Promise<void> {
    const next = await window.multiAgentChat.deleteTask(taskId);
    setSnapshot(next);
  }

  async function createTeam(): Promise<void> {
    const next = await window.multiAgentChat.createTeam({
      name: `Agent Team ${snapshot.teams.length + 1}`,
      mode: "pipeline",
      sharedContext: "",
      members: [
        {
          roleName: "Planner",
          prompt: "Plan the work and identify the main risks.",
          agentId: "codex",
          channelId: defaultChannelForAgent("codex", snapshot.channels),
          modelId: DEFAULT_MODEL_ID,
        },
        {
          roleName: "Checker",
          prompt: "Use the previous artifact to verify correctness and missing tests.",
          agentId: "codex",
          channelId: defaultChannelForAgent("codex", snapshot.channels),
          modelId: DEFAULT_MODEL_ID,
        },
      ],
    });
    setSnapshot(next);
    setActiveFeature("teams");
  }

  async function updateTeam(
    teamId: string,
    update: { name?: string; mode?: AgentTeamMode; sharedContext?: string; members?: AgentTeamMember[] },
  ): Promise<void> {
    const next = await window.multiAgentChat.updateTeam(teamId, update);
    setSnapshot(next);
  }

  async function deleteTeam(teamId: string): Promise<void> {
    const next = await window.multiAgentChat.deleteTeam(teamId);
    setSnapshot(next);
  }

  async function selectTeam(teamId: string): Promise<void> {
    const next = await window.multiAgentChat.selectTeam(teamId);
    setSnapshot(next);
  }

  async function selectTeamRun(teamRunId: string): Promise<void> {
    const next = await window.multiAgentChat.selectTeamRun(teamRunId);
    setSnapshot(next);
  }

  async function runTeam(teamId: string): Promise<void> {
    const text = teamPrompt.trim();
    if (!text) return;
    const next = await window.multiAgentChat.runTeam({
      teamId,
      prompt: text,
      target: { kind: "workspace", label: "Workspace", value: snapshot.workDir },
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTeamPrompt("");
  }

  async function stopTeamRun(teamRunId: string): Promise<void> {
    const next = await window.multiAgentChat.stopTeamRun(teamRunId);
    setSnapshot(next);
  }

  return (
    <div className={appShellClass(activeFeature)}>
      <aside className="feature-rail">
        <div className="rail-brand" title="Multi Agent Chat">
          <Bot size={18} />
        </div>
        <nav className="feature-nav" aria-label="Feature navigation">
          <button
            className={`feature-nav-item ${activeFeature === "chat" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("chat")}
           
          >
            <MessageSquareText size={15} />
            <span>Chat</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "tasks" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("tasks")}
           
          >
            <ClipboardList size={15} />
            <span>Tasks</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "teams" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("teams")}
           
          >
            <Users size={15} />
            <span>Teams</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "configs" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("configs")}
           
          >
            <Settings size={15} />
            <span>Configs</span>
          </button>
        </nav>
        <div className="rail-footer">
          <button
            className="icon-btn"
            onClick={toggleTheme}
            data-tip={theme === "dark" ? "浅色主题" : "深色主题"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="icon-btn danger" onClick={() => void clearHistory()} data-tip="清除全部历史">
            <Trash2 size={14} />
          </button>
        </div>
      </aside>

      <aside className="resource-sidebar">
        <div className="brand resource-brand">
          <div>
            <h1>Multi Agent Chat</h1>
            <p>{activeFeature === "chat" ? "Chats" : activeFeature === "tasks" ? "Tasks" : activeFeature === "teams" ? "Teams" : "Configuration"}</p>
          </div>
        </div>

        <button className="sidebar-search-btn" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
          <Search size={13} />
          <span>搜索或执行命令…</span>
          <kbd>⌘K</kbd>
        </button>

        {activeFeature === "chat" ? (
          <section className="resource-panel chat-list-panel">
            <div className="panel-header">
              <span>Chats</span>
              <SquarePen size={14} />
            </div>
            <div className="new-chat-menu-wrap">
              <button className="new-chat-compact-btn" onClick={() => void createChat()}>
                <Plus size={13} />
                <span>New chat</span>
              </button>
            </div>
            <div className="chat-list">
              {snapshot.chats.map((chat) => (
                <button
                  key={chat.id}
                  className={`chat-row ${chat.id === activeChat?.id ? "is-active" : ""}`}
                  onClick={() => void selectChat(chat.id)}
                  title={chat.title}
                >
                  <span className={`runtime-dot ${agentAccent(chat.agentId)} ${chat.running ? "is-pulsing" : ""}`} />
                  <strong>{chat.title}</strong>
                  <span>{chat.running ? "运行中" : formatTime(chat.updatedAt)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : activeFeature === "tasks" ? (
          <section className="resource-panel task-list-panel">
            <div className="panel-header">
              <span>Tasks</span>
              <ClipboardList size={14} />
            </div>
            <TaskStatusFilter tasks={snapshot.tasks} value={taskStatusFilter} onChange={setTaskStatusFilter} />
            <div className="task-card-stack">
              {visibleTasks.length === 0 ? (
                <div className="empty-state config-empty">{snapshot.tasks.length === 0 ? "No tasks" : "No tasks in this progress"}</div>
              ) : (
                visibleTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`task-nav-card ${task.id === activeTask?.id ? "is-active" : ""}`}
                    onClick={() => void selectTask(task.id)}
                  >
                    <div className="task-nav-card-head">
                      <span className={`agent-badge mini ${agentAccent(task.agentId)}`}>{agentLabel(task.agentId)}</span>
                      <TaskStatusChip label={task.running ? "Running" : taskProgressLabel(task.progress)} tone={task.running ? "running" : task.progress} />
                    </div>
                    <strong>{task.title}</strong>
                    <span>{`${task.status} · ${formatTime(task.updatedAt)}`}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="resource-panel config-nav-panel">
            <div className="panel-header">
              <span>Channels</span>
              <Settings size={14} />
            </div>
            <div className="config-nav-list">
              {snapshot.channels.map((channel) => (
                <div key={channel.id} className="config-nav-row">
                  <span className={`agent-badge mini ${agentAccent(channel.agentId)}`}>{agentLabel(channel.agentId)}</span>
                  <strong>{channel.label}</strong>
                  <span>{channel.models.length} models</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>

      <main
        className={`content ${
          activeFeature === "chat"
            ? "chat-content"
            : activeFeature === "tasks"
              ? "tasks-content"
              : activeFeature === "teams"
                ? "teams-content"
                : "config-content"
        }`}
      >
        {activeFeature === "tasks" ? (
          <TaskPage
            prompt={taskPrompt}
            agentId={taskAgentId}
            channelId={taskChannelId || defaultChannelForAgent(taskAgentId, snapshot.channels)}
            modelId={taskModelId}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            tasks={snapshot.tasks}
            activeTaskId={selectedTaskDetailActiveId}
            onPromptChange={setTaskPrompt}
            onSelectAgent={setTaskAgent}
            onSelectChannel={setTaskChannel}
            onSelectModel={setTaskModel}
            onChooseWorkDir={chooseWorkDir}
            onRefresh={refresh}
            onRunTask={runTask}
            onRerunTask={rerunTask}
            onSelectTask={openTaskDetail}
            onCloseTaskDetail={() => setSelectedTaskDetailId(undefined)}
            onStopTask={stopTask}
            onDeleteTask={deleteTask}
            onUpdateTaskProgress={updateTaskProgress}
          />
        ) : activeFeature === "teams" ? (
          <TeamPage
            teams={snapshot.teams}
            teamRuns={snapshot.teamRuns}
            activeTeamId={activeTeam?.id}
            activeTeamRunId={activeTeamRun?.id}
            prompt={teamPrompt}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            onPromptChange={setTeamPrompt}
            onCreateTeam={createTeam}
            onUpdateTeam={updateTeam}
            onDeleteTeam={deleteTeam}
            onSelectTeam={selectTeam}
            onSelectTeamRun={selectTeamRun}
            onRunTeam={runTeam}
            onStopTeamRun={stopTeamRun}
            onChooseWorkDir={chooseWorkDir}
            onRefresh={refresh}
          />
        ) : activeFeature === "configs" ? (
          <ConfigPage
            channels={configChannels}
            selectedChannelId={selectedConfigChannelId}
            advancedMode={advancedMode}
            draft={configDraft}
            status={configStatus}
            codexPluginCatalog={codexPluginCatalog}
            pluginCatalogStatus={pluginCatalogStatus}
            generatedConfigs={generatedConfigs}
            importedConfigs={importedConfigs}
            onSelectChannel={setSelectedConfigChannelId}
            onAddChannel={addConfigChannel}
            onRemoveChannel={removeConfigChannel}
            onUpdateChannel={updateConfigChannel}
            onAddModel={addConfigModel}
            onUpdateModel={updateConfigModel}
            onRemoveModel={removeConfigModel}
            onDraftChange={updateConfigDraft}
            onToggleAdvanced={setAdvancedMode}
            onSave={saveChannelConfig}
            onGenerate={generateChannelConfigs}
            onImportCodex={importCodexConfigs}
            onLoadCodexPluginCatalog={loadCodexPluginCatalog}
          />
        ) : activeChat ? (
          <>
            <header className="chat-header">
              <div className="chat-title-block">
                <h2>{activeChat.title}</h2>
                <div className="chat-subtitle">
                  <span className={`agent-badge mini ${agentAccent(activeChat.agentId)}`}>{agentLabel(activeChat.agentId)}</span>
                  <span>{activeChannel?.label ?? activeChat.channelId}</span>
                  <span>{activeModel?.label ?? activeChat.modelId}</span>
                  <span>{activeChat.sessionId ? `session ${activeChat.sessionId}` : "No provider session yet"}</span>
                </div>
              </div>
              <div className="chat-header-actions">
                {activeChat.running ? (
                  <button className="icon-btn" onClick={() => void stopActiveChat()} title="Stop">
                    <CircleStop size={14} />
                  </button>
                ) : null}
              </div>
            </header>

            <section className="cli-transcript" ref={transcriptRef} onScroll={handleTranscriptScroll}>
              {activeChat.messages.length === 0 ? (
                <div className="empty-state terminal-empty">
                  <Wand2 size={17} />
                  <span>Start this {agentLabel(activeChat.agentId)} chat.</span>
                </div>
              ) : (
                activeChat.messages.map((message) => (
                  <CliMessage
                    key={message.id}
                    message={message}
                    agentId={activeChat.agentId}
                    streaming={activeChat.running && message.id === activeChat.pendingAssistantMessageId}
                  />
                ))
              )}
              {activeChat.running ? (
                <div className="cli-status-line">
                  <span className={`runtime-dot ${agentAccent(activeChat.agentId)}`} />
                  <span>{agentLabel(activeChat.agentId)} is thinking</span>
                  <span className="stream-cursor" aria-hidden="true" />
                </div>
              ) : null}
            </section>

            <section className="composer">
              <SlashCommandSuggestions
                suggestions={slashCommandSuggestions}
                activeIndex={slashCommandIndex}
                onSelect={(suggestion) => completeSlashCommand(suggestion.command)}
              />
              <div className="composer-box">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (slashCommandSuggestions.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSlashCommandIndex((current) => (current + 1) % slashCommandSuggestions.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSlashCommandIndex((current) => (current - 1 + slashCommandSuggestions.length) % slashCommandSuggestions.length);
                      return;
                    }
                    if (event.key === "Tab") {
                      event.preventDefault();
                      completeSlashCommand(slashCommandSuggestions[slashCommandIndex]?.command ?? slashCommandSuggestions[0]!.command);
                      return;
                    }
                  }
                  if (shouldSendComposerKey({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                    isComposing: event.nativeEvent.isComposing,
                  })) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={`Message ${agentLabel(activeChat.agentId)} or type /help...`}
                rows={4}
              />
              <div className="composer-footer">
                <ChatControls
                  agentId={activeChat.agentId}
                  channelId={activeChat.channelId}
                  modelId={activeChat.modelId || DEFAULT_MODEL_ID}
                  channels={snapshot.channels}
                  locked={activeChatLocked}
                  running={activeChat.running}
                  workDir={snapshot.workDir}
                  runtimes={snapshot.runtimes}
                  onSelectAgent={setActiveChatAgent}
                  onSelectChannel={setActiveChatChannel}
                  onSelectModel={setActiveChatModel}
                  onChooseWorkDir={chooseWorkDir}
                  onRefresh={refresh}
                />
                <button className="send-btn" onClick={() => void send()} disabled={!canSend}>
                  <Send size={14} />
                  <span>{activeChat.running ? "Running" : "Send"}</span>
                </button>
              </div>
              </div>
              <div className="composer-hint">
                <kbd>↵</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · <kbd>⌘K</kbd> 命令面板
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state page-empty">
            <Plus size={18} />
            <span>Create a chat to start.</span>
          </div>
        )}
      </main>

      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

interface ChatControlsProps {
  agentId: AgentId;
  channelId: string;
  modelId: string;
  channels: AgentChannel[];
  locked: boolean;
  running: boolean;
  workDir: string;
  runtimes: AgentRuntime[];
  onSelectAgent: (agentId: AgentId) => MaybePromise;
  onSelectChannel: (channelId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
}

export function ChatControls({
  agentId,
  channelId,
  modelId,
  channels,
  locked,
  running,
  workDir,
  runtimes,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
  onChooseWorkDir,
  onRefresh,
}: ChatControlsProps) {
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const channelOptions = channels.filter((channel) => channel.agentId === agentId);
  const fallbackChannelId = defaultChannelForAgent(agentId, channels);
  const effectiveChannels =
    channelOptions.length > 0
      ? channelOptions
      : [{ id: fallbackChannelId, agentId, label: "Default", models: modelsForChannel(agentId, fallbackChannelId, channels) }];
  const selectedChannelId = effectiveChannels.some((channel) => channel.id === channelId) ? channelId : (effectiveChannels[0]?.id ?? fallbackChannelId);
  const modelOptions = modelsForChannel(agentId, selectedChannelId, channels);
  const selectedModelId = modelOptions.some((model) => model.id === modelId) ? modelId : DEFAULT_MODEL_ID;
  const selectsDisabled = locked || running;

  return (
    <div className="composer-controls">
      <label className="composer-select-wrap" title={runtimeStatus(runtimeMap.get(agentId) ?? fallbackRuntime(agentId))}>
        <span className={`runtime-dot ${agentAccent(agentId)}`} />
        <select
          className="composer-select"
          aria-label="Agent"
          value={agentId}
          disabled={selectsDisabled}
          onChange={(event) => void onSelectAgent(event.currentTarget.value as AgentId)}
        >
          {AGENTS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {agentLabel(candidate)}
            </option>
          ))}
        </select>
      </label>
      <label className="composer-select-wrap">
        <select
          className="composer-select"
          aria-label="Channel"
          value={selectedChannelId}
          disabled={selectsDisabled}
          onChange={(event) => void onSelectChannel(event.currentTarget.value)}
        >
          {effectiveChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}
            </option>
          ))}
        </select>
      </label>
      <label className="composer-select-wrap">
        <select
          className="composer-select"
          aria-label="Model"
          value={selectedModelId}
          disabled={selectsDisabled}
          onChange={(event) => void onSelectModel(event.currentTarget.value)}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>
      </label>
      <button
        className="workdir-picker composer-workdir-picker"
        onClick={() => void onChooseWorkDir()}
        title={workDir || "Choose workdir"}
        aria-label="Choose work directory"
      >
        <FolderOpen size={14} />
        <span>{workDir || "Choose workdir"}</span>
      </button>
      <button className="icon-btn flat composer-refresh-btn" onClick={() => void onRefresh()} title="Refresh agents">
        <RefreshCw size={13} />
      </button>
    </div>
  );
}

interface TeamPageProps {
  teams: AgentTeam[];
  teamRuns: TeamRun[];
  activeTeamId: string | undefined;
  activeTeamRunId: string | undefined;
  prompt: string;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  defaultEditingMemberId?: string;
  onPromptChange: (value: string) => void;
  onCreateTeam: () => MaybePromise;
  onUpdateTeam: (teamId: string, update: { name?: string; mode?: AgentTeamMode; sharedContext?: string; members?: AgentTeamMember[] }) => MaybePromise;
  onDeleteTeam: (teamId: string) => MaybePromise;
  onSelectTeam: (teamId: string) => MaybePromise;
  onSelectTeamRun: (teamRunId: string) => MaybePromise;
  onRunTeam: (teamId: string) => MaybePromise;
  onStopTeamRun: (teamRunId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
}

export function TeamPage({
  teams,
  teamRuns,
  activeTeamId,
  activeTeamRunId,
  prompt,
  workDir,
  runtimes,
  channels,
  defaultEditingMemberId,
  onPromptChange,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
  onSelectTeam,
  onSelectTeamRun,
  onRunTeam,
  onStopTeamRun,
  onChooseWorkDir,
  onRefresh,
}: TeamPageProps) {
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const activeTeamRuns = activeTeam ? teamRuns.filter((run) => run.teamId === activeTeam.id) : [];
  const activeRun = activeTeamRuns.find((run) => run.id === activeTeamRunId) ?? activeTeamRuns[0];
  const canRun = Boolean(activeTeam && activeTeam.members.length > 0 && prompt.trim());
  const [editingMemberId, setEditingMemberId] = useState<string | undefined>(defaultEditingMemberId);
  const [draggingMemberId, setDraggingMemberId] = useState<string | undefined>();
  const [dragOverMemberId, setDragOverMemberId] = useState<string | undefined>();
  const [draftingWorkflow, setDraftingWorkflow] = useState(false);

  useEffect(() => {
    if (!editingMemberId || activeTeam?.members.some((member) => member.id === editingMemberId)) return;
    setEditingMemberId(undefined);
  }, [activeTeam?.id, activeTeam?.members, editingMemberId]);

  function updateMembers(members: AgentTeamMember[]): void {
    if (!activeTeam) return;
    void onUpdateTeam(activeTeam.id, { members });
  }

  function updateMode(mode: AgentTeamMode): void {
    if (!activeTeam || activeTeam.mode === mode) return;
    void onUpdateTeam(activeTeam.id, { mode });
  }

  function updateMember(index: number, update: Partial<AgentTeamMember>): void {
    if (!activeTeam) return;
    const members = activeTeam.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...update } : member));
    updateMembers(members);
  }

  function updateMemberAgent(index: number, agentId: AgentId): void {
    const channelId = defaultChannelForAgent(agentId, channels);
    updateMember(index, { agentId, channelId, modelId: DEFAULT_MODEL_ID });
  }

  function updateMemberChannel(index: number, agentId: AgentId, channelId: string): void {
    updateMember(index, { channelId, modelId: DEFAULT_MODEL_ID });
  }

  function addMember(): void {
    if (!activeTeam) return;
    const agentId: AgentId = "codex";
    updateMembers([
      ...activeTeam.members,
      {
        id: `draft-${Date.now()}`,
        roleName: `Agent ${activeTeam.members.length + 1}`,
        prompt: "",
        agentId,
        channelId: defaultChannelForAgent(agentId, channels),
        modelId: DEFAULT_MODEL_ID,
      },
    ]);
  }

  async function buildDraftWorkflow(): Promise<void> {
    if (!activeTeam || draftingWorkflow) return;
    setDraftingWorkflow(true);
    try {
      await onUpdateTeam(activeTeam.id, { members: draftWorkflowMembers(activeTeam.mode, channels) });
    } finally {
      setDraftingWorkflow(false);
    }
  }

  function removeMember(index: number): void {
    if (!activeTeam) return;
    updateMembers(activeTeam.members.filter((_member, memberIndex) => memberIndex !== index));
  }

  function startMemberDrag(event: DragEvent<HTMLElement>, memberId: string): void {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multi-agent-team-member", memberId);
    event.dataTransfer.setData("text/plain", memberId);
    setDraggingMemberId(memberId);
    setDragOverMemberId(undefined);
  }

  function endMemberDrag(): void {
    setDraggingMemberId(undefined);
    setDragOverMemberId(undefined);
  }

  function dropMemberBefore(event: DragEvent<HTMLElement>, targetMemberId: string | undefined): void {
    event.preventDefault();
    event.stopPropagation();
    if (!activeTeam) return;
    const draggedMemberId =
      event.dataTransfer.getData("application/x-multi-agent-team-member") || event.dataTransfer.getData("text/plain") || draggingMemberId;
    endMemberDrag();
    if (!draggedMemberId) return;
    const reordered = reorderTeamMembers(activeTeam.members, draggedMemberId, targetMemberId);
    if (reordered === activeTeam.members) return;
    updateMembers(reordered);
  }

  function shouldSuppressMemberClick(): boolean {
    return false;
  }

  function renderWorkflowModeControls() {
    if (!activeTeam) return null;
    return (
      <div className="workflow-mode-row" role="group" aria-label="Workflow mode">
        {TEAM_MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`workflow-mode-toggle ${activeTeam.mode === option.id ? "is-active" : ""}`}
            onClick={() => updateMode(option.id)}
            title={option.description}
            aria-label={`${option.label}: ${option.description}`}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderWorkflowNode(member: AgentTeamMember, index: number, className = "") {
    const workflowStatus = workflowStatusForTeamMember(activeRun, member.id);
    return (
      <div className={`workflow-node-slot ${className}`} key={member.id}>
        <TeamMemberRow
          member={member}
          index={index}
          runtimes={runtimes}
          channels={channels}
          editing={editingMemberId === member.id}
          dragging={draggingMemberId === member.id}
          dropTarget={Boolean(draggingMemberId && draggingMemberId !== member.id && dragOverMemberId === member.id)}
          freeNode={false}
          workflowStatus={workflowStatus}
          onEdit={() => setEditingMemberId(member.id)}
          onDone={() => setEditingMemberId(undefined)}
          onDragStart={startMemberDrag}
          onDragEnd={endMemberDrag}
          onDragOverMember={() => setDragOverMemberId(member.id)}
          shouldSuppressClick={shouldSuppressMemberClick}
          onDropBefore={dropMemberBefore}
          onUpdateRole={(roleName) => updateMember(index, { roleName })}
          onUpdatePrompt={(memberPrompt) => updateMember(index, { prompt: memberPrompt })}
          onUpdateAgent={(agentId) => updateMemberAgent(index, agentId)}
          onUpdateChannel={(channelId) => updateMemberChannel(index, member.agentId, channelId)}
          onUpdateModel={(modelId) => updateMember(index, { modelId })}
          onRemove={() => removeMember(index)}
        />
      </div>
    );
  }

  function renderWorkflowTopology() {
    if (!activeTeam) return null;
    return (
      <div
        className={`workflow-topology-board workflow-canvas workflow-canvas-${activeTeam.mode} ${draggingMemberId ? "is-dragging" : ""}`}
        aria-label="Workflow topology"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (event.target instanceof HTMLElement && !event.target.closest(".workflow-node-card")) {
            setDragOverMemberId(undefined);
          }
        }}
        onDrop={(event) => dropMemberBefore(event, undefined)}
      >
        <div className="workflow-topology-stage">
          {activeTeam.members.length === 0 ? (
            <div className="workflow-empty-canvas">No nodes</div>
          ) : activeTeam.mode === "parallel" ? (
            <div className="workflow-parallel-layout">
              <div className="workflow-terminal workflow-terminal-start">Start</div>
              <span className="workflow-edge" />
              <div className="workflow-parallel-workers">{activeTeam.members.map((member, index) => renderWorkflowNode(member, index))}</div>
              <span className="workflow-edge" />
              <div className="workflow-join-node">Join</div>
            </div>
          ) : activeTeam.mode === "supervisor" ? (
            <div className="workflow-supervisor-layout">
              <div className="workflow-supervisor-region workflow-supervisor-lead">
                <span className="workflow-region-label">Lead</span>
                {activeTeam.members[0] ? renderWorkflowNode(activeTeam.members[0], 0, "is-lead") : null}
              </div>
              <div className="workflow-supervisor-region workflow-supervisor-workers">
                <span className="workflow-region-label">Workers</span>
                <div className="workflow-worker-grid">
                  {activeTeam.members.slice(1).map((member, workerIndex) => renderWorkflowNode(member, workerIndex + 1))}
                </div>
              </div>
              <div className="workflow-supervisor-region workflow-supervisor-synthesis">
                <span className="workflow-region-label">Synthesis</span>
                <div className="workflow-synthesis-card">
                  <GitBranch size={14} />
                  <span>{`${activeTeam.members[0]?.roleName ?? "Lead"} summarizes worker artifacts`}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="workflow-pipeline-row">
              <div className="workflow-terminal workflow-terminal-start">Start</div>
              {activeTeam.members.map((member, index) => (
                <div className="workflow-pipeline-segment" key={member.id}>
                  <span className="workflow-edge" />
                  {renderWorkflowNode(member, index)}
                </div>
              ))}
              <span className="workflow-edge" />
              <div className="workflow-terminal workflow-terminal-end">Done</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderWorkflowBuilder() {
    if (!activeTeam) return null;
    return (
      <section className="team-section workflow-builder-shell">
        <div className="workflow-builder-head">
          <div className="workflow-builder-title">
            <strong>Workflow Builder</strong>
            <span>{`${activeTeam.members.length} nodes · ${teamModeLabel(activeTeam.mode)}`}</span>
          </div>
          <div className="workflow-studio-toolbar">
            {renderWorkflowModeControls()}
            <div className="workflow-builder-toolbar">
              <button
                type="button"
                className="control-btn compact secondary"
                aria-label="Draft workflow"
                onClick={() => void buildDraftWorkflow()}
                disabled={draftingWorkflow}
              >
                <Wand2 size={14} />
                <span>{draftingWorkflow ? "Drafting..." : "Draft workflow"}</span>
              </button>
              <button type="button" className="control-btn compact secondary" aria-label="Add node" onClick={addMember}>
                <UserPlus size={14} />
                <span>Add node</span>
              </button>
            </div>
          </div>
        </div>
        {renderWorkflowTopology()}
      </section>
    );
  }

  return (
    <section className="agent-teams-page">
      <header className="teams-header">
        <div>
          <h2>Agent Workflow</h2>
          <p>Pick an execution mode, wire agent nodes, then run the team.</p>
        </div>
        <button className="control-btn compact" onClick={() => void onCreateTeam()}>
          <Plus size={14} />
          <span>New team</span>
        </button>
      </header>

      {activeTeam ? (
        <div className="teams-workspace is-workflow-ide">
          <aside className="team-list-pane team-resource-pane" aria-label="Agent teams">
            <div className="team-resource-head">
              <span>Teams</span>
              <strong>{teams.length}</strong>
            </div>
            {teams.map((team) => (
              <article
                key={team.id}
                className={`team-list-card ${team.id === activeTeam.id ? "is-active" : ""}`}
                onClick={() => void onSelectTeam(team.id)}
              >
                <div>
                  <input
                    className="team-list-name-input"
                    aria-label="Team name in sidebar"
                    value={team.name}
                    onClick={(event) => event.stopPropagation()}
                    onFocus={() => void onSelectTeam(team.id)}
                    onChange={(event) => void onUpdateTeam(team.id, { name: event.currentTarget.value })}
                  />
                  <span>{`${team.members.length} nodes`}</span>
                </div>
                <div className="team-list-card-actions">
                  <TaskStatusChip label={teamModeLabel(team.mode)} tone="todo" />
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteTeam(team.id);
                    }}
                    title="Delete team"
                    aria-label={`Delete ${team.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </aside>

          <section className="team-config-pane workflow-studio-pane">
            {renderWorkflowBuilder()}

            <section className="team-section workflow-context-section">
              <div className="task-section-divider">
                <span>Shared Context</span>
                <i />
              </div>
              <textarea
                className="team-shared-context"
                aria-label="Shared Context"
                value={activeTeam.sharedContext}
                onChange={(event) => void onUpdateTeam(activeTeam.id, { sharedContext: event.currentTarget.value })}
                placeholder="Project background, constraints, paths, review standards..."
                rows={5}
              />
            </section>

            <section className="team-run-composer workflow-task-composer">
              <textarea
                aria-label="Team prompt"
                value={prompt}
                onChange={(event) => onPromptChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (shouldSendComposerKey({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                    isComposing: event.nativeEvent.isComposing,
                  })) {
                    event.preventDefault();
                    void onRunTeam(activeTeam.id);
                  }
                }}
                placeholder="Describe the workflow task..."
                rows={4}
              />
              <div className="team-run-footer">
                <button
                  className="workdir-picker composer-workdir-picker"
                  onClick={() => void onChooseWorkDir()}
                  title={workDir || "Choose workdir"}
                  aria-label="Choose work directory"
                >
                  <FolderOpen size={14} />
                  <span>{workDir || "Choose workdir"}</span>
                </button>
                <button className="icon-btn flat composer-refresh-btn" onClick={() => void onRefresh()} title="Refresh agents">
                  <RefreshCw size={13} />
                </button>
                <button className="send-btn" onClick={() => void onRunTeam(activeTeam.id)} disabled={!canRun}>
                  <Play size={14} />
                  <span>Run Workflow</span>
                </button>
              </div>
            </section>
          </section>

          <section className="team-run-pane run-inspector-pane">
            <div className="run-inspector-head">
              <div>
                <strong>Run Inspector</strong>
                <span>{activeRun ? `${activeRun.status} · ${activeRun.steps.length} steps` : "No active run"}</span>
              </div>
              {activeRun ? <TaskStatusChip label={activeRun.status} tone={activeRun.status} /> : null}
            </div>
            <div className="team-run-list">
              <div className="task-section-divider">
                <span>Runs</span>
                <i />
              </div>
              {activeTeamRuns.length === 0 ? (
                <div className="empty-state config-empty">No team runs</div>
              ) : (
                activeTeamRuns.map((run) => (
                  <button
                    key={run.id}
                    className={`team-run-card ${run.id === activeRun?.id ? "is-active" : ""}`}
                    onClick={() => void onSelectTeamRun(run.id)}
                  >
                    <strong>{run.title}</strong>
                    <span>{`${run.status} · ${run.steps.length} steps`}</span>
                  </button>
                ))
              )}
            </div>

            {activeRun ? (
              <TeamRunDetail run={activeRun} channels={channels} onStopTeamRun={onStopTeamRun} />
            ) : (
              <div className="empty-state page-empty">
                <GitBranch size={18} />
                <span>Run this team to create artifacts.</span>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="teams-empty-state">
          <Users size={22} />
          <strong>No teams yet</strong>
          <button className="control-btn compact" onClick={() => void onCreateTeam()}>
            <Plus size={14} />
            <span>New team</span>
          </button>
        </div>
      )}
    </section>
  );
}

function TeamMemberRow({
  member,
  index,
  runtimes,
  channels,
  editing,
  dragging,
  dropTarget,
  freeNode,
  workflowStatus,
  onEdit,
  onDone,
  onDragStart,
  onDragEnd,
  onDragOverMember,
  shouldSuppressClick,
  onDropBefore,
  onUpdateRole,
  onUpdatePrompt,
  onUpdateAgent,
  onUpdateChannel,
  onUpdateModel,
  onRemove,
}: {
  member: AgentTeamMember;
  index: number;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  editing: boolean;
  dragging: boolean;
  dropTarget: boolean;
  freeNode: boolean;
  workflowStatus: AgentWorkflowNodeStatus;
  onEdit: () => void;
  onDone: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, memberId: string) => void;
  onDragEnd: () => void;
  onDragOverMember: () => void;
  shouldSuppressClick: () => boolean;
  onDropBefore: (event: DragEvent<HTMLElement>, targetMemberId: string | undefined) => void;
  onUpdateRole: (roleName: string) => void;
  onUpdatePrompt: (prompt: string) => void;
  onUpdateAgent: (agentId: AgentId) => void;
  onUpdateChannel: (channelId: string) => void;
  onUpdateModel: (modelId: string) => void;
  onRemove: () => void;
}) {
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const channelOptions = channels.filter((channel) => channel.agentId === member.agentId);
  const selectedChannelId = channelOptions.some((channel) => channel.id === member.channelId)
    ? member.channelId
    : defaultChannelForAgent(member.agentId, channels);
  const modelOptions = modelsForChannel(member.agentId, selectedChannelId, channels);
  const selectedModelId = modelOptions.some((model) => model.id === member.modelId) ? member.modelId : DEFAULT_MODEL_ID;
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
  const selectedModel = modelOptions.find((model) => model.id === selectedModelId);
  const suppressClickRef = useRef(false);
  const nodeStatusClass = workflowStatusClass(workflowStatus);

  function openMemberEditor(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
    if (suppressClickRef.current || shouldSuppressClick()) {
      suppressClickRef.current = false;
      return;
    }
    onEdit();
  }

  return (
    <>
      <article
        className={`team-member-card workflow-node-card ${nodeStatusClass} ${editing ? "is-selected" : ""} ${dragging ? "is-dragging" : ""} ${
          dropTarget ? "is-drop-target" : ""
        }`}
        role="button"
        tabIndex={0}
        draggable={!freeNode}
        data-member-id={member.id}
        data-free-node={freeNode ? "true" : undefined}
        data-workflow-node-status={workflowStatus}
        title="Click to edit member"
        aria-label={`Edit ${member.roleName}`}
        onClick={openMemberEditor}
        onDragStart={(event) => {
          suppressClickRef.current = true;
          onDragStart(event, member.id);
        }}
        onDragEnd={() => {
          onDragEnd();
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }}
        onDragOver={(event) => {
          if (freeNode) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDragOverMember();
        }}
        onDrop={freeNode ? undefined : (event) => onDropBefore(event, member.id)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onEdit();
        }}
      >
        <div className="workflow-node-drag" aria-hidden="true">
          <GripVertical size={13} />
        </div>
        <div className="team-member-card-index">{index + 1}</div>
        <div className="team-member-card-main">
          <div className="team-member-card-head">
            <strong>{member.roleName}</strong>
            <span className={`agent-badge mini ${agentAccent(member.agentId)}`}>{agentLabel(member.agentId)}</span>
            {workflowStatus !== "idle" ? <span className={`workflow-node-status-pill ${nodeStatusClass}`}>{workflowStatus}</span> : null}
          </div>
          <p>{member.prompt || "No member prompt."}</p>
          <div className="team-member-card-meta">
            <span>{selectedChannel?.label ?? member.channelId}</span>
            <span>{selectedModel?.label ?? member.modelId}</span>
          </div>
        </div>
      </article>

      {editing ? (
        <section className="team-member-edit-overlay" role="dialog" aria-modal="true" aria-label="Edit team member" onClick={onDone}>
          <article className="team-member-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="team-member-edit-head">
              <div>
                <h3>Edit member</h3>
                <span>{`Node ${index + 1} in this workflow`}</span>
              </div>
              <button className="icon-btn flat" onClick={onDone} title="Close member editor" aria-label="Close member editor">
                <X size={14} />
              </button>
            </div>

            <section className="team-member-editor-identity">
              <div className="team-member-card-index">{index + 1}</div>
              <label className="team-member-edit-field">
                <span>Role</span>
                <input aria-label={`Member ${index + 1} role`} value={member.roleName} onChange={(event) => onUpdateRole(event.currentTarget.value)} />
              </label>
              <div className="team-member-editor-summary">
                <span className={`agent-badge mini ${agentAccent(member.agentId)}`}>{agentLabel(member.agentId)}</span>
                <strong>{selectedModel?.label ?? member.modelId}</strong>
                <small>{selectedChannel?.label ?? member.channelId}</small>
              </div>
            </section>

            <section className="team-member-editor-prompt-panel">
              <div className="task-section-divider">
                <span>Instructions</span>
                <i />
              </div>
              <label className="team-member-edit-field">
                <textarea
                  className="team-member-prompt"
                  aria-label={`Member ${index + 1} prompt`}
                  value={member.prompt}
                  onChange={(event) => onUpdatePrompt(event.currentTarget.value)}
                  placeholder="Member-specific instructions..."
                  rows={5}
                />
              </label>
            </section>

            <section className="team-member-editor-routing">
              <div className="task-section-divider">
                <span>Routing</span>
                <i />
              </div>
              <div className="team-member-edit-grid">
                <label className="team-member-edit-field">
                  <span>Agent</span>
                  <select
                    className="composer-select"
                    aria-label={`Member ${index + 1} agent`}
                    value={member.agentId}
                    onChange={(event) => onUpdateAgent(event.currentTarget.value as AgentId)}
                  >
                    {AGENTS.map((agentId) => (
                      <option key={agentId} value={agentId}>
                        {agentLabel(agentId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="team-member-edit-field">
                  <span>Channel</span>
                  <select
                    className="composer-select"
                    aria-label={`Member ${index + 1} channel`}
                    value={selectedChannelId}
                    onChange={(event) => onUpdateChannel(event.currentTarget.value)}
                  >
                    {channelOptions.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="team-member-edit-field">
                  <span>Model</span>
                  <select
                    className="composer-select"
                    aria-label={`Member ${index + 1} model`}
                    value={selectedModelId}
                    onChange={(event) => onUpdateModel(event.currentTarget.value)}
                  >
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <div className="team-member-edit-actions">
              <button
                className="control-btn compact secondary danger"
                onClick={() => {
                  onRemove();
                  onDone();
                }}
              >
                <Trash2 size={14} />
                <span>Remove</span>
              </button>
              <button className="control-btn compact" onClick={onDone}>
                <Save size={14} />
                <span>Done</span>
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}

function TeamRunDetail({
  run,
  channels,
  onStopTeamRun,
}: {
  run: TeamRun;
  channels: AgentChannel[];
  onStopTeamRun: (teamRunId: string) => MaybePromise;
}) {
  return (
    <article className="team-run-detail">
      <div className="team-run-detail-head">
        <div>
          <h3>{run.title}</h3>
          <span>{run.teamName}</span>
        </div>
        <div className="team-config-actions">
          <TaskStatusChip label={run.status} tone={run.status} />
          {run.status === "running" ? (
            <button className="control-btn compact secondary" onClick={() => void onStopTeamRun(run.id)}>
              <CircleStop size={14} />
              <span>Stop</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="task-section-divider">
        <span>Prompt</span>
        <i />
      </div>
      <pre className="team-run-prompt">{run.prompt}</pre>

      <div className="task-section-divider">
        <span>Target</span>
        <i />
      </div>
      <pre className="team-run-context">{run.target ? `${run.target.label}: ${run.target.value}` : run.workDir}</pre>

      <div className="task-section-divider">
        <span>Shared Context Snapshot</span>
        <i />
      </div>
      <pre className="team-run-context">{run.sharedContextSnapshot || "No shared context snapshot."}</pre>

      <div className="task-section-divider">
        <span>Workflow Trace</span>
        <i />
      </div>
      <div className="workflow-trace-list">
        {workflowTraceNodesForRun(run).map((node) => {
          const step = run.steps.find((item) => item.id === node.stepId || item.teamMemberId === node.teamMemberId);
          const time = step?.completedAt ?? step?.startedAt;
          const glyph = node.status === "completed" ? "✓" : node.status === "running" ? "●" : node.status === "failed" ? "✕" : "○";
          const detail =
            node.status === "running"
              ? "正在执行…"
              : node.status === "completed"
                ? (step?.artifact?.split("\n")[0]?.slice(0, 96) ?? node.description)
                : node.status === "failed"
                  ? step?.lastError ?? "执行失败"
                  : "等待上游产物";
          return (
            <article key={node.id} className={`workflow-trace-item ${workflowStatusClass(node.status)}`}>
              <span className="trace-time">{time ? formatTime(time) : "—"}</span>
              <span className="trace-glyph">{glyph}</span>
              <strong>{`${node.label} ${node.status}`}</strong>
              {detail ? <p>{detail}</p> : null}
            </article>
          );
        })}
      </div>

      <div className="task-section-divider">
        <span>Steps</span>
        <i />
      </div>
      <div className="team-run-steps">
        {run.steps.map((step, index) => {
          const channel = channels.find((item) => item.id === step.channelId);
          const model = modelsForChannel(step.agentId, step.channelId, channels).find((item) => item.id === step.modelId);
          return (
            <article key={step.id} className="team-run-step">
              <div className="team-run-step-head">
                <div>
                  <span>{`Step ${index + 1}`}</span>
                  <strong>{step.roleName}</strong>
                </div>
                <TaskStatusChip label={step.status} tone={step.status} />
              </div>
              <div className="team-run-step-meta">
                <span className={`agent-badge mini ${agentAccent(step.agentId)}`}>{agentLabel(step.agentId)}</span>
                <span>{channel?.label ?? step.channelId}</span>
                <span>{model?.label ?? step.modelId}</span>
              </div>
              {step.artifact ? <pre>{step.artifact}</pre> : <p>{step.lastError ?? "Waiting for artifact."}</p>}
            </article>
          );
        })}
      </div>
    </article>
  );
}

interface TaskPageProps {
  prompt: string;
  agentId: AgentId;
  channelId: string;
  modelId: string;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  tasks: TaskRun[];
  activeTaskId: string | undefined;
  onPromptChange: (value: string) => void;
  onSelectAgent: (agentId: AgentId) => MaybePromise;
  onSelectChannel: (channelId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
  onRunTask: () => MaybePromise;
  onRerunTask: (task: TaskRun) => MaybePromise;
  onSelectTask: (taskId: string) => MaybePromise;
  onCloseTaskDetail: () => void;
  onStopTask: (taskId: string) => MaybePromise;
  onDeleteTask: (taskId: string) => MaybePromise;
  onUpdateTaskProgress: (taskId: string, progress: TaskProgress) => MaybePromise;
}

export function TaskPage({
  prompt,
  agentId,
  channelId,
  modelId,
  workDir,
  runtimes,
  channels,
  tasks,
  activeTaskId,
  onPromptChange,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
  onChooseWorkDir,
  onRefresh,
  onRunTask,
  onRerunTask,
  onSelectTask,
  onCloseTaskDetail,
  onStopTask,
  onDeleteTask,
  onUpdateTaskProgress,
}: TaskPageProps) {
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const activeChannel = activeTask ? channels.find((channel) => channel.id === activeTask.channelId) : undefined;
  const activeModel = activeTask
    ? modelsForChannel(activeTask.agentId, activeTask.channelId, channels).find((model) => model.id === activeTask.modelId)
    : undefined;
  const canRun = Boolean(prompt.trim());
  const [draggingTaskId, setDraggingTaskId] = useState<string | undefined>();
  const kanbanColumns = TASK_STATUS_FILTERS.filter((filter): filter is { id: TaskProgress; label: string } => filter.id !== "all");

  function startTaskDrag(event: DragEvent<HTMLElement>, taskId: string): void {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multi-agent-task", taskId);
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  }

  function dropTaskOnProgress(event: DragEvent<HTMLElement>, progress: TaskProgress): void {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("application/x-multi-agent-task") || event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === taskId);
    setDraggingTaskId(undefined);
    if (!task || task.progress === progress) return;
    void onUpdateTaskProgress(task.id, progress);
  }

  return (
    <section className="tasks-page">
      <section className="task-board-shell">
        <section className="task-kanban-board" aria-label="Task board">
          {kanbanColumns.map((column) => {
            const columnTasks = tasks.filter((task) => task.progress === column.id);
            return (
              <section
                key={column.id}
                className={`task-kanban-column ${draggingTaskId ? "is-drop-ready" : ""}`}
                data-progress={column.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => dropTaskOnProgress(event, column.id)}
              >
                <div className="task-kanban-column-head">
                  <span>{column.label}</span>
                  <strong>{columnTasks.length}</strong>
                </div>
                <div className="task-kanban-stack">
                  {column.id === "backlog" ? (
                    <TaskInlineCreateCard
                      prompt={prompt}
                      agentId={agentId}
                      channelId={channelId}
                      modelId={modelId}
                      workDir={workDir}
                      runtimes={runtimes}
                      channels={channels}
                      canRun={canRun}
                      onPromptChange={onPromptChange}
                      onSelectAgent={onSelectAgent}
                      onSelectChannel={onSelectChannel}
                      onSelectModel={onSelectModel}
                      onChooseWorkDir={onChooseWorkDir}
                      onRefresh={onRefresh}
                      onRunTask={onRunTask}
                    />
                  ) : null}
                  {columnTasks.length === 0 && column.id !== "backlog" ? (
                    <div className="task-kanban-empty">Drop tasks here</div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskKanbanCard
                        key={task.id}
                        task={task}
                        active={task.id === activeTask?.id}
                        onSelect={onSelectTask}
                        onDragStart={startTaskDrag}
                        onDragEnd={() => setDraggingTaskId(undefined)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </section>

      </section>

      {activeTask ? (
        <section className="task-detail-overlay" role="dialog" aria-modal="true" aria-label="Task detail" onClick={onCloseTaskDetail}>
          <article className="task-detail-page task-surface-card" onClick={(event) => event.stopPropagation()}>
            <div className="task-section-heading">
              <div>
                <h2>Task detail</h2>
                <span>{formatTime(activeTask.updatedAt)}</span>
              </div>
              <div className="task-detail-page-actions">
                <TaskStatusChip label={taskProgressLabel(activeTask.progress)} tone={activeTask.progress} />
                <button className="icon-btn flat" onClick={onCloseTaskDetail} title="Close task detail" aria-label="Close task detail">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="task-detail-title">
              <h3>{activeTask.title}</h3>
              <span>{activeTask.id}</span>
            </div>
            <div className="task-detail-status-row">
              <span className={`agent-badge mini ${agentAccent(activeTask.agentId)}`}>{agentLabel(activeTask.agentId)}</span>
              <TaskStatusChip label={activeTask.running ? "Running" : activeTask.status} tone={activeTask.running ? "running" : activeTask.status} />
              <TaskStatusChip label={activeTask.sessionId ? "Session linked" : "No session"} tone={activeTask.sessionId ? "done" : "backlog"} />
            </div>
            <div className="task-section-divider">
              <span>Metadata</span>
              <i />
            </div>
            <div className="task-detail-meta task-meta-grid">
              <TaskMeta label="Agent" value={agentLabel(activeTask.agentId)} />
              <TaskMeta label="Channel" value={activeChannel?.label ?? activeTask.channelId} />
              <TaskMeta label="Model" value={activeModel?.label ?? activeTask.modelId} />
              <TaskMeta label="Run status" value={activeTask.status} />
              <TaskMeta label="Progress" value={taskProgressLabel(activeTask.progress)} />
              <TaskMeta label="Work dir" value={activeTask.workDir} />
              <TaskMeta label="Session" value={activeTask.sessionId ?? "not started"} />
            </div>
            <div className="task-section-divider">
              <span>Full prompt</span>
              <i />
            </div>
            <div className="task-prompt-block">
              <pre>{activeTask.prompt}</pre>
            </div>
            <div className="task-detail-actions">
              <label className="task-progress-select-wrap">
                <span>Progress</span>
                <select
                  className="composer-select task-progress-select"
                  aria-label="Task progress"
                  value={activeTask.progress}
                  onChange={(event) => void onUpdateTaskProgress(activeTask.id, event.currentTarget.value as TaskProgress)}
                >
                  {TASK_STATUS_FILTERS.filter((filter): filter is { id: TaskProgress; label: string } => filter.id !== "all").map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeTask.running ? (
                <button className="control-btn compact secondary" onClick={() => void onStopTask(activeTask.id)}>
                  <CircleStop size={14} />
                  <span>Stop</span>
                </button>
              ) : (
                <button className="control-btn compact" onClick={() => void onRerunTask(activeTask)}>
                  <Play size={14} />
                  <span>Run Agent</span>
                </button>
              )}
              <button className="icon-btn danger" onClick={() => void onDeleteTask(activeTask.id)} title="Delete task">
                <Trash2 size={14} />
              </button>
            </div>

            <section className="task-run-timeline" aria-label="Execution timeline">
              <div className="task-section-divider">
                <span>Execution timeline</span>
                <i />
              </div>
              <div className="task-log-stream">
                {activeTask.messages.length === 0 ? (
                  <div className="empty-state terminal-empty">
                    <Wand2 size={17} />
                    <span>Waiting for task output.</span>
                  </div>
                ) : (
                  activeTask.messages.map((message) => (
                    <TaskTimelineMessage key={message.id} message={message} agentId={activeTask.agentId} />
                  ))
                )}
                {activeTask.running ? (
                  <div className="task-log-running">
                    <span className={`runtime-dot ${agentAccent(activeTask.agentId)}`} />
                    <span>{agentLabel(activeTask.agentId)} is running this task</span>
                  </div>
                ) : null}
              </div>
            </section>
          </article>
        </section>
      ) : null}
    </section>
  );
}

function TaskKanbanCard({
  task,
  active,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRun;
  active: boolean;
  onSelect: (taskId: string) => MaybePromise;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd: () => void;
}) {
  function selectTask(): void {
    void onSelect(task.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectTask();
  }

  return (
    <article
      className={`task-kanban-card ${active ? "is-active" : ""}`}
      role="button"
      tabIndex={0}
      draggable
      data-task-id={task.id}
      onClick={selectTask}
      onKeyDown={handleKeyDown}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="task-kanban-card-head">
        <span className={`agent-badge mini ${agentAccent(task.agentId)}`}>{agentLabel(task.agentId)}</span>
        <TaskStatusChip label={task.running ? "Running" : task.status} tone={task.running ? "running" : task.status} />
      </div>
      <strong>{task.title}</strong>
      <p>{task.prompt}</p>
      <div className="task-kanban-card-meta">
        <span>{task.messages.length} messages</span>
        <span>{formatTime(task.updatedAt)}</span>
      </div>
    </article>
  );
}

function TaskInlineCreateCard({
  prompt,
  agentId,
  channelId,
  modelId,
  workDir,
  runtimes,
  channels,
  canRun,
  onPromptChange,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
  onChooseWorkDir,
  onRefresh,
  onRunTask,
}: {
  prompt: string;
  agentId: AgentId;
  channelId: string;
  modelId: string;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  canRun: boolean;
  onPromptChange: (value: string) => void;
  onSelectAgent: (agentId: AgentId) => MaybePromise;
  onSelectChannel: (channelId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
  onRunTask: () => MaybePromise;
}) {
  return (
    <article className="task-inline-create-card task-surface-card">
      <div className="task-section-heading">
        <div>
          <h2>New task</h2>
          <span>{workDir || "No work directory selected"}</span>
        </div>
        <TaskStatusChip label={canRun ? "Ready" : "Draft"} tone={canRun ? "todo" : "backlog"} />
      </div>
      <textarea
        aria-label="Task prompt"
        className="task-create-input"
        value={prompt}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (shouldSendComposerKey({
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            isComposing: event.nativeEvent.isComposing,
          })) {
            event.preventDefault();
            void onRunTask();
          }
        }}
        placeholder="Describe a task..."
        rows={3}
      />
      <div className="task-create-chipbar">
        <ChatControls
          agentId={agentId}
          channelId={channelId}
          modelId={modelId || DEFAULT_MODEL_ID}
          channels={channels}
          locked={false}
          running={false}
          workDir={workDir}
          runtimes={runtimes}
          onSelectAgent={onSelectAgent}
          onSelectChannel={onSelectChannel}
          onSelectModel={onSelectModel}
          onChooseWorkDir={onChooseWorkDir}
          onRefresh={onRefresh}
        />
      </div>
      <button className="send-btn task-run-btn" onClick={() => void onRunTask()} disabled={!canRun}>
        <Play size={14} />
        <span>Run Agent</span>
      </button>
    </article>
  );
}

function TaskMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="task-meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskStatusChip({ label, tone }: { label: string; tone: string }) {
  return <span className={`task-status-chip task-status-${tone}`}>{label}</span>;
}

function TaskTimelineMessage({ message, agentId }: { message: ChatMessage; agentId: AgentId }) {
  const label =
    message.role === "user"
      ? "Prompt"
      : message.role === "assistant"
        ? agentLabel(agentId)
        : message.role === "error"
          ? "Error"
          : "Event";

  return (
    <article className={`task-log-entry ${message.role}`}>
      <div className="task-log-marker" />
      <div className="task-log-body">
        <div className="task-log-meta">
          <span>{label}</span>
          <time>{formatTime(message.timestamp)}</time>
        </div>
        {message.events && message.events.length > 0 ? (
          <div className="task-log-events">
            {message.events.map((event) => (
              <MetaMessage key={event.id} content={event.content} />
            ))}
          </div>
        ) : null}
        {message.content ? (
          message.role === "assistant" ? (
            <div className="cli-markdown">
              <Markdown text={message.content} />
            </div>
          ) : (
            <pre>{message.content}</pre>
          )
        ) : null}
      </div>
    </article>
  );
}

interface ConfigPageProps {
  channels: AgentChannel[];
  selectedChannelId: string;
  advancedMode: boolean;
  draft: string;
  status: string;
  codexPluginCatalog: CodexPluginCatalogItem[];
  pluginCatalogStatus: string;
  generatedConfigs: GeneratedConfigFile[];
  importedConfigs: ImportedCodexConfig[];
  onSelectChannel: (channelId: string) => void;
  onAddChannel: (agentId: AgentId) => void;
  onRemoveChannel: (channelId: string) => void;
  onUpdateChannel: (channelId: string, updater: (channel: AgentChannel) => AgentChannel) => void;
  onAddModel: (channelId: string) => void;
  onUpdateModel: (channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption) => void;
  onRemoveModel: (channelId: string, modelIndex: number) => void;
  onDraftChange: (value: string) => void;
  onToggleAdvanced: (enabled: boolean) => void;
  onSave: () => Promise<void>;
  onGenerate: () => Promise<void>;
  onImportCodex: () => Promise<void>;
  onLoadCodexPluginCatalog: () => Promise<void>;
}

export function ConfigPage({
  channels,
  selectedChannelId,
  advancedMode,
  draft,
  status,
  codexPluginCatalog,
  pluginCatalogStatus,
  generatedConfigs,
  importedConfigs,
  onSelectChannel,
  onAddChannel,
  onRemoveChannel,
  onUpdateChannel,
  onAddModel,
  onUpdateModel,
  onRemoveModel,
  onDraftChange,
  onToggleAdvanced,
  onSave,
  onGenerate,
  onImportCodex,
  onLoadCodexPluginCatalog,
}: ConfigPageProps) {
  const activeChannel = channels.find((channel) => channel.id === selectedChannelId) ?? channels[0];
  const configuredPluginIds = new Set((activeChannel?.plugins ?? []).map((plugin) => plugin.id));
  const availableCodexPlugins = codexPluginCatalog.filter((plugin) => !configuredPluginIds.has(plugin.id));

  return (
    <section className="config-page">
      <header className="config-header">
        <div>
          <h2>Channels & Models</h2>
          <p>model-channels.json</p>
        </div>
        <div className="config-actions">
          <button className="control-btn compact secondary" onClick={() => void onImportCodex()} aria-label="Import Codex profiles">
            <FileInput size={14} />
            <span>Import Codex</span>
          </button>
          <button
            className={`control-btn compact secondary ${advancedMode ? "is-active" : ""}`}
            onClick={() => onToggleAdvanced(!advancedMode)}
            aria-pressed={advancedMode}
          >
            <Settings size={14} />
            <span>Advanced JSON</span>
          </button>
          <button className="control-btn compact" onClick={() => void onSave()}>
            <Save size={14} />
            <span>Save</span>
          </button>
          <button className="control-btn compact secondary" onClick={() => void onGenerate()}>
            <Wand2 size={14} />
            <span>Generate</span>
          </button>
        </div>
      </header>

      <div className="config-grid">
        {advancedMode ? (
          <section className="config-editor-panel">
            <textarea
              className="config-editor"
              spellCheck={false}
              value={draft}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
            />
            {status ? <div className="config-status">{status}</div> : null}
          </section>
        ) : (
          <section className="config-form">
            <aside className="config-channel-browser">
              <div className="config-channel-browser-actions">
                <button className="control-btn compact secondary" onClick={() => onAddChannel("codex")}>
                  <Plus size={13} />
                  <span>Codex</span>
                </button>
                <button className="control-btn compact secondary" onClick={() => onAddChannel("claude")}>
                  <Plus size={13} />
                  <span>Claude</span>
                </button>
              </div>
              <div className="config-channel-picker">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    className={`config-channel-pick ${channel.id === activeChannel?.id ? "is-active" : ""}`}
                    onClick={() => onSelectChannel(channel.id)}
                  >
                    <span className={`agent-badge mini ${agentAccent(channel.agentId)}`}>{agentLabel(channel.agentId)}</span>
                    <strong>{channel.label}</strong>
                    <span>{channel.id}</span>
                  </button>
                ))}
              </div>
            </aside>

            {activeChannel ? (
              <section className="config-form-fields">
                <div className="config-form-title">
                  <div>
                    <h3>{activeChannel.label}</h3>
                    <span>{activeChannel.id}</span>
                  </div>
                  <button className="icon-btn danger" onClick={() => onRemoveChannel(activeChannel.id)} title="Remove channel">
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="config-field-grid">
                  <label className="config-field">
                    <span>Agent</span>
                    <select
                      value={activeChannel.agentId}
                      onChange={(event) =>
                        onUpdateChannel(activeChannel.id, (channel) => ({
                          ...channel,
                          agentId: event.currentTarget.value as AgentId,
                        }))
                      }
                    >
                      {AGENTS.map((agentId) => (
                        <option key={agentId} value={agentId}>
                          {agentLabel(agentId)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="config-field">
                    <span>Label</span>
                    <input
                      aria-label="Channel label"
                      value={activeChannel.label}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => ({ ...channel, label: event.currentTarget.value }))}
                    />
                  </label>
                  <label className="config-field">
                    <span>ID</span>
                    <input
                      aria-label="Channel id"
                      value={activeChannel.id}
                      onChange={(event) => {
                        const nextId = event.currentTarget.value;
                        onUpdateChannel(activeChannel.id, (channel) => ({ ...channel, id: nextId }));
                        onSelectChannel(nextId);
                      }}
                    />
                  </label>
                  <label className="config-field">
                    <span>Profile</span>
                    <input
                      value={activeChannel.profileName ?? ""}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "profileName", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Model Provider</span>
                    <input
                      value={activeChannel.modelProvider ?? ""}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "modelProvider", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Provider Name</span>
                    <input
                      value={activeChannel.providerName ?? ""}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "providerName", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Base URL</span>
                    <input
                      value={activeChannel.baseUrl ?? ""}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "baseUrl", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Wire API</span>
                    <input
                      value={activeChannel.wireApi ?? ""}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "wireApi", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Reasoning</span>
                    <input
                      value={activeChannel.modelReasoningEffort ?? ""}
                      onChange={(event) =>
                        onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "modelReasoningEffort", event.currentTarget.value))
                      }
                    />
                  </label>
                  <label className="config-field">
                    <span>Catalog JSON</span>
                    <input
                      value={activeChannel.modelCatalogJson ?? ""}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalString(channel, "modelCatalogJson", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field config-field-wide">
                    <span>Headers</span>
                    <textarea
                      value={headersToText(activeChannel.httpHeaders)}
                      onChange={(event) => onUpdateChannel(activeChannel.id, (channel) => withOptionalHeaders(channel, event.currentTarget.value))}
                    />
                  </label>
                </div>

                {activeChannel.agentId === "codex" ? (
                  <>
                    <div className="config-models-header">
                      <h3>Plugins</h3>
                      <div className="config-plugin-actions">
                        <button
                          className="control-btn compact secondary"
                          onClick={() => void onLoadCodexPluginCatalog()}
                          aria-label="Load Codex plugin catalog"
                        >
                          <RefreshCw size={13} />
                          <span>Load catalog</span>
                        </button>
                        <button
                          className="control-btn compact secondary"
                          onClick={() =>
                            onUpdateChannel(activeChannel.id, (channel) => ({
                              ...channel,
                              plugins: [...(channel.plugins ?? []), { id: "plugin@marketplace", enabled: true }],
                            }))
                          }
                          aria-label="Add manual plugin"
                        >
                          <Plus size={13} />
                          <span>Manual</span>
                        </button>
                      </div>
                    </div>
                    <label className="config-field config-plugin-catalog">
                      <span>Catalog</span>
                      <select
                        aria-label="Codex plugin catalog"
                        value=""
                        onChange={(event) => {
                          const pluginId = event.currentTarget.value;
                          if (!pluginId) return;
                          onUpdateChannel(activeChannel.id, (channel) => addPluginToChannel(channel, pluginId));
                        }}
                        disabled={availableCodexPlugins.length === 0}
                      >
                        <option value="">{availableCodexPlugins.length > 0 ? "Select plugin..." : "No plugins available"}</option>
                        {availableCodexPlugins.map((plugin) => {
                          const state = plugin.enabled ? "enabled" : plugin.installed ? "installed" : "available";
                          return (
                            <option key={plugin.id} value={plugin.id}>
                              {`${plugin.id} (${state})`}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    {pluginCatalogStatus ? <div className="config-plugin-catalog-status">{pluginCatalogStatus}</div> : null}
                    <div className="config-plugin-list">
                      {(activeChannel.plugins ?? []).length === 0 ? (
                        <div className="empty-state config-empty">No plugins configured</div>
                      ) : (
                        (activeChannel.plugins ?? []).map((plugin, index) => (
                          <div key={`${plugin.id}:${index}`} className="config-plugin-row">
                            <input
                              aria-label="Plugin id"
                              value={plugin.id}
                              onChange={(event) =>
                                onUpdateChannel(activeChannel.id, (channel) =>
                                  updatePluginAt(channel, index, (item) => ({ ...item, id: event.currentTarget.value })),
                                )
                              }
                            />
                            <label className="config-plugin-toggle">
                              <input
                                type="checkbox"
                                checked={plugin.enabled}
                                onChange={(event) =>
                                  onUpdateChannel(activeChannel.id, (channel) =>
                                    updatePluginAt(channel, index, (item) => ({ ...item, enabled: event.currentTarget.checked })),
                                  )
                                }
                              />
                              <span>Enabled</span>
                            </label>
                            <button className="icon-btn danger" onClick={() => onUpdateChannel(activeChannel.id, (channel) => removePluginAt(channel, index))}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : null}

                <div className="config-models-header">
                  <h3>Models</h3>
                  <button className="control-btn compact secondary" onClick={() => onAddModel(activeChannel.id)}>
                    <Plus size={13} />
                    <span>Add model</span>
                  </button>
                </div>
                <div className="config-model-list">
                  {activeChannel.models.map((model, index) => (
                    <div key={`${model.id}:${index}`} className="config-model-row">
                      <input
                        aria-label="Model id"
                        value={model.id}
                        onChange={(event) => onUpdateModel(activeChannel.id, index, (item) => ({ ...item, id: event.currentTarget.value }))}
                      />
                      <input
                        aria-label="Model label"
                        value={model.label}
                        onChange={(event) => onUpdateModel(activeChannel.id, index, (item) => ({ ...item, label: event.currentTarget.value }))}
                      />
                      <button className="icon-btn danger" onClick={() => onRemoveModel(activeChannel.id, index)} disabled={model.id === DEFAULT_MODEL_ID}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                {status ? <div className="config-status">{status}</div> : null}
              </section>
            ) : (
              <div className="empty-state config-empty">No channels</div>
            )}
          </section>
        )}

        <section className="config-summary-panel">
          <div className="config-summary-block">
            <h3>Channels</h3>
            <div className="config-channel-list">
              {channels.map((channel) => (
                <div key={channel.id} className="config-channel-row">
                  <span className={`agent-badge mini ${agentAccent(channel.agentId)}`}>{agentLabel(channel.agentId)}</span>
                  <strong>{channel.label}</strong>
                  <span>{channel.models.map((model) => model.label).join(", ")}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="config-summary-block">
            <h3>Imported Profiles</h3>
            {importedConfigs.length > 0 ? (
              <div className="generated-config-list">
                {importedConfigs.map((config) => (
                  <div key={config.sourcePath} className="generated-config-row">
                    <strong>{config.channel.label}</strong>
                    <span>{config.sourcePath}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state config-empty">No imported profiles</div>
            )}
          </div>

          <div className="config-summary-block">
            <h3>Generated Profiles</h3>
            {generatedConfigs.length > 0 ? (
              <div className="generated-config-list">
                {generatedConfigs.map((config) => (
                  <div key={`${config.channelId}:${config.modelId}`} className="generated-config-row">
                    <strong>{config.profileName}</strong>
                    <span>{config.path}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state config-empty">No generated profiles</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function CliMessage({ message, agentId, streaming = false }: { message: ChatMessage; agentId: AgentId; streaming?: boolean }) {
  if (message.role === "user") {
    return (
      <div className="cli-message user">
        <div className="cli-prompt-mark">›</div>
        <div className="cli-agent-line">
          <span>{`You · ${formatTime(message.timestamp)}`}</span>
        </div>
        <pre>{message.content}</pre>
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="cli-message assistant">
        <div className="cli-agent-line">
          <span className={`runtime-dot ${agentAccent(agentId)}`} />
          <span>{`${agentLabel(agentId)} · ${formatTime(message.timestamp)}`}</span>
        </div>
        {message.events && message.events.length > 0 ? (
          <div className="cli-message-events">
            {message.events.map((event) => (
              <MetaMessage key={event.id} content={event.content} />
            ))}
          </div>
        ) : null}
        {message.content ? (
          <div className={`cli-markdown ${streaming ? "is-streaming" : ""}`}>
            <Markdown text={message.content} />
            {streaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
          </div>
        ) : streaming ? (
          <div className="cli-markdown is-streaming">
            <span className="stream-cursor" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="cli-message error">
        <div className="cli-agent-line">error</div>
        <pre>{message.content}</pre>
      </div>
    );
  }

  return (
    <div className="cli-message meta">
      <MetaMessage content={message.content} />
    </div>
  );
}

function MetaMessage({ content }: { content: string }) {
  const [summary, ...bodyLines] = content.split("\n");
  const body = bodyLines.join("\n").trim();

  if (!body) {
    return <pre>{summary}</pre>;
  }

  return (
    <details className="cli-meta-details">
      <summary>{summary}</summary>
      <pre>{body}</pre>
    </details>
  );
}
