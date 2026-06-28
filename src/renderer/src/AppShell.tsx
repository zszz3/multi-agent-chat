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
import {
  DEFAULT_SNAPSHOT as APP_STATE_DEFAULT_SNAPSHOT,
  applyProviderModelIdToAgentConfig as applyProviderModelIdToAgentConfigFromAppState,
  applyProviderPresetToConfiguredAgent as applyProviderPresetToConfiguredAgentFromAppState,
  shouldRefreshBalances as shouldRefreshBalancesFromAppState,
  workflowArtifactSummary as workflowArtifactSummaryFromAppState,
  workflowContextDocumentFromArtifacts as workflowContextDocumentFromArtifactsFromAppState,
} from "./app/app-state";
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
import {
  appShellClass,
  appContentClass,
  missingAppCapabilityMessage,
  scheduledWorkflowEventTarget,
  syncKeepAwakeIfAvailable,
  taskDetailIdFor,
  type ActiveFeature,
} from "./app/shell";
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
import {
  buildFindSkillAgentPrompt,
  findSkillFallbackMessage,
  findSkillImportRequest,
  findSkillImportSuccessMessage,
  parseFindSkillAgentToolCall,
  skillDisplayDescription,
  skillDisplayName,
} from "./pages/skills/find-skill";
import { ConfigPage } from "./pages/config/ConfigPage";
import { ChatPage } from "./pages/chat/ChatPage";
import { chatConfigLocked, SlashCommandSuggestions, slashCommandSuggestionsFor } from "./pages/chat/chat-utils";
export { chatConfigLocked, SlashCommandSuggestions, slashCommandSuggestionsFor } from "./pages/chat/chat-utils";
import { SkillsPage } from "./pages/skills/SkillsPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { RuntimePage } from "./pages/runtime/RuntimePage";
export { RuntimePage } from "./pages/runtime/RuntimePage";
import type { AgentTestTranscriptItem, AgentTestUiState } from "./pages/runtime/runtime-types";
export { applyProviderPresetToChannel, rememberProviderKeyFromChannel } from "./pages/runtime/runtime-utils";
import {
  TASK_STATUS_FILTERS,
  type TaskStatusFilterValue,
} from "./pages/tasks/task-status";
import { TaskPage } from "./pages/tasks/TaskPage";
import { TeamPage } from "./pages/teams/TeamPage";
export { reorderTeamMembers } from "./pages/teams/team-utils";
import { WorkflowPage } from "./pages/workflow/WorkflowPage";
import { useWorkflowDraft } from "./pages/workflow/hooks/useWorkflowDraft";
import { useWorkflowRunner } from "./pages/workflow/hooks/useWorkflowRunner";
import { useScheduledWorkflowRunner } from "./pages/workflow/hooks/useScheduledWorkflowRunner";
import { useWorkflowSidebarState } from "./pages/workflow/hooks/useWorkflowSidebarState";
import { workflowCanvasLayout, type WorkflowCanvasLayoutVariant } from "./pages/workflow/workflow-canvas-layout";
import {
  parseWorkflowJudgeResult as parseWorkflowJudgeResultFromDomain,
  workflowFinalReviewPrompt as workflowFinalReviewPromptFromDomain,
  workflowJudgePrompt as workflowJudgePromptFromDomain,
  workflowNodeRunPrompt as workflowNodeRunPromptFromDomain,
  workflowProgressAfterFailure as workflowProgressAfterFailureFromDomain,
  type WorkflowJudgeResult,
} from "./pages/workflow/workflow-domain";
import {
  WORKFLOW_THINKING_MESSAGE,
  workflowStoragePlanDocument,
  workflowStoragePlanFor,
  type WorkflowStoragePlan,
} from "./pages/workflow/workflow-utils";
import { ScheduledWorkflowPage } from "./pages/schedules/ScheduledWorkflowPage";
export { ScheduledWorkflowPage } from "./pages/schedules/ScheduledWorkflowPage";
import {
  defaultScheduledWorkflowDraft,
  intervalSecondsForFrequency,
  normalizeScheduleDayOfMonth,
  normalizeScheduleTimeOfDay,
  normalizeScheduleWeekdays,
  type ScheduledWorkflowDraft,
} from "./pages/schedules/schedule-utils";
export type { ScheduledWorkflowDraft } from "./pages/schedules/schedule-utils";
import { configChannelForSelection, selectConfigChannelsForDisplay } from "../../shared/config-channels";
import { DEFAULT_MODEL_ID, defaultChannelForAgent, modelsForChannel } from "../../shared/models";
import { AGENT_PROVIDER_PRESETS, type AgentProviderPreset } from "../../shared/provider-presets";
import { SKILL_TEMPLATES } from "../../shared/skill-templates";
import {
  fetchOnlineSkills,
  ONLINE_SKILL_SOURCES,
  onlineSkillTreeUrl,
  skillsShResultFromApiSkill,
  skillsShSearchUrl,
  parseSkillMarkdown,
  type OnlineSkillResult,
} from "../../shared/online-skills";
import {
  DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
} from "../../shared/types";
import { WORKFLOW_TOTAL_QUESTION_COUNT } from "../../shared/workflow-agent";
import {
  createWorkflowGraphFromObjective,
  validateWorkflowGraph,
  workflowGraphExecutionLevels,
} from "../../shared/workflow-graph";
import type {
  AgentChannel,
  AgentId,
  AgentModelOption,
  AgentRuntime,
  AgentTestEvent,
  SkillTemplate,
  AgentTeam,
  AgentTeamMember,
  AgentTeamMode,
  AppSnapshot,
  ChatEvent,
  ChatSession,
  CodexPluginCatalogItem,
  ConfiguredAgent,
  ImportedSkillResult,
  ImportOnlineSkillRequest,
  InstalledSkillResult,
  LocalFilePreview,
  ProviderBalanceResult,
  ScheduledWorkflowDueEvent,
  ScheduledWorkflowFrequency,
  ScheduledWorkflowRun,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  SkillInstallTarget,
  TeamRun,
  TaskProgress,
  TaskRun,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowDraftState,
  WorkflowGrillMessage,
  WorkflowRunNodeStatus,
  WorkflowRunProgressItem,
  WorkflowStatus,
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
  scheduledWorkflowEventTarget,
  syncKeepAwakeIfAvailable,
  taskDetailIdFor,
} from "./app/shell";
export type { ActiveFeature } from "./app/shell";
export { loadStoredTheme } from "./app/storage";
export { shouldSendComposerKey } from "./app/composer";
export { resolveConfiguredAgentChannel, resolveFindSkillConfiguredAgentId } from "./app/agents";
export { ConfigPage } from "./pages/config/ConfigPage";
export { ChatPage } from "./pages/chat/ChatPage";
export { ChatControls } from "./pages/chat/ChatControls";
export { ChatHistoryPanel } from "./pages/chat/ChatHistoryPanel";
export { SettingsPage } from "./pages/settings/SettingsPage";
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
  workflowStoragePlanDocument,
} from "./pages/workflow/workflow-utils";

const AGENTS: AgentId[] = ["codex", "claude", "api"];
const BALANCE_REFRESH_INTERVAL_MS = 5 * 60_000;


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
  const id = uniqueId(`${agentId}-config`, existingIds);
  return {
    id,
    agentId,
    label: agentId === "codex" ? "New Codex Config" : agentId === "claude" ? "New Claude Config" : "New API Config",
    models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
  };
}

export function applyProviderPresetToConfiguredAgent(agent: ConfiguredAgent, channel: AgentChannel, preset: AgentProviderPreset): ConfiguredAgent {
  return applyProviderPresetToConfiguredAgentFromAppState(agent, channel, preset);
}

export function applyProviderModelIdToAgentConfig(
  agent: ConfiguredAgent,
  channel: AgentChannel,
  rawModelId: string,
): { agent: ConfiguredAgent; channel: AgentChannel } {
  return applyProviderModelIdToAgentConfigFromAppState(agent, channel, rawModelId);
}

function createConfiguredAgent(channels: AgentChannel[], existingIds: string[]): ConfiguredAgent {
  const runtimeAgentId: AgentId = "codex";
  const id = uniqueId("agent", existingIds);
  const channelId = defaultChannelForAgent(runtimeAgentId, channels);
  return {
    id,
    name: "New Agent",
    description: "",
    runtimeAgentId,
    channelId,
    modelId: DEFAULT_MODEL_ID,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function applySkillTemplate(agent: ConfiguredAgent, template: SkillTemplate): ConfiguredAgent {
  return {
    ...agent,
    name: skillDisplayName(template),
    description: skillDisplayDescription(template),
    tags: [...template.tags],
  };
}

function createModel(existingModels: AgentModelOption[]): AgentModelOption {
  const id = uniqueId("model", existingModels.map((model) => model.id));
  return { id, label: id };
}

function initialWorkflowMessages(): WorkflowGrillMessage[] {
  return [];
}

function createWorkflowId(): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `wf_${randomPart}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function taskArtifact(task: TaskRun): string {
  const assistantMessage = [...task.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
  if (assistantMessage) return assistantMessage.content.trim();
  const errorMessage = [...task.messages].reverse().find((message) => message.role === "error" && message.content.trim());
  if (errorMessage) return errorMessage.content.trim();
  return `${task.title} completed without assistant output.`;
}

function compactWorkflowActivity(content: string, limit = 140): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function workflowToolResultDisplayContent(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^Chunk ID:/i.test(trimmed)) return false;
    if (/^Wall time:/i.test(trimmed)) return false;
    if (/^Process exited with code\b/i.test(trimmed)) return false;
    if (/^Original token count:/i.test(trimmed)) return false;
    if (/^Output:$/i.test(trimmed)) return false;
    return true;
  });
  return filtered.join("\n").trim() || content;
}

export function workflowTaskLiveDetail(task: TaskRun): string {
  const latestEvent = task.messages
    .flatMap((message) => message.events ?? [])
    .sort((left, right) => left.timestamp - right.timestamp)
    .at(-1);

  if (latestEvent) {
    const name = latestEvent.name ?? "tool";
    const eventContent = latestEvent.type === "tool_result" ? workflowToolResultDisplayContent(latestEvent.content) : latestEvent.content;
    const content = compactWorkflowActivity(eventContent);
    if (latestEvent.type === "tool_call") return content ? `Tool ${name}: ${content}` : `Tool ${name} started`;
    if (latestEvent.type === "tool_result") return content ? `Tool ${name} done: ${content}` : `Tool ${name} done`;
    if (latestEvent.type === "system") return content ? `System: ${content}` : "System event";
    if (latestEvent.type === "handoff") return content ? `Handoff: ${content}` : "Handoff received";
    if (latestEvent.type === "error") return content ? `Error: ${content}` : "Agent error";
    return content || "Agent event";
  }

  const latestAssistant = [...task.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
  if (latestAssistant) return `Output: ${compactWorkflowActivity(latestAssistant.content)}`;
  if (task.sessionId) return `Session ${task.sessionId}`;
  return "Starting agent...";
}

interface WorkflowDraftPersistInput {
  workflowId: string;
  activeWorkflowId?: string | undefined;
  workflowIds: string[];
  objective: string;
  messages: WorkflowGrillMessage[];
  graphReady: boolean;
  reply: string;
  error: string | undefined;
  runProgress: WorkflowRunProgressItem[];
  runContextDocument: string;
  contextDocument: string;
  finalReport: string;
  agentSessionId: string | undefined;
}

export function workflowDraftShouldPersist(input: WorkflowDraftPersistInput): boolean {
  const hasContent = Boolean(
    input.objective.trim() ||
      input.messages.length > 0 ||
      input.graphReady ||
      input.reply.trim() ||
      input.error ||
      input.runProgress.length > 0 ||
      input.runContextDocument.trim() ||
      input.contextDocument.trim() ||
      input.finalReport.trim() ||
      input.agentSessionId,
  );
  return hasContent || input.activeWorkflowId === input.workflowId || input.workflowIds.includes(input.workflowId);
}

interface BalanceRefreshInput {
  channels: AgentChannel[];
  configDirty: boolean;
  refreshInFlight: boolean;
  lastRefreshAt: number | undefined;
  now: number;
  intervalMs: number;
}

export function shouldRefreshBalances(input: BalanceRefreshInput): boolean {
  return shouldRefreshBalancesFromAppState(input);
}

export function workflowArtifactSummary(artifact: string): string {
  return workflowArtifactSummaryFromAppState(artifact);
}

export function workflowContextDocumentFromArtifacts(artifacts: Array<{ nodeId: string; title: string; summary: string }>): string {
  return workflowContextDocumentFromArtifactsFromAppState(artifacts);
}

export function workflowNodeRunPrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  upstreamArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument = "",
  storagePlan?: WorkflowStoragePlan,
): string {
  return workflowNodeRunPromptFromDomain(graph, node, upstreamArtifacts, contextDocument, storagePlan);
}

export function workflowJudgePrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  artifact: string,
  contextDocument: string,
  attempt: number,
  maxAttempts: number,
): string {
  return workflowJudgePromptFromDomain(graph, node, artifact, contextDocument, attempt, maxAttempts);
}

export function workflowFinalReviewPrompt(
  graph: WorkflowGraph,
  nodeArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument: string,
  progress: WorkflowRunProgressItem[],
  storagePlan?: WorkflowStoragePlan,
): string {
  return workflowFinalReviewPromptFromDomain(graph, nodeArtifacts, contextDocument, progress, storagePlan);
}

export function parseWorkflowJudgeResult(content: string): WorkflowJudgeResult | undefined {
  return parseWorkflowJudgeResultFromDomain(content);
}

export function workflowProgressAfterFailure(progress: WorkflowRunProgressItem[], errorMessage: string): WorkflowRunProgressItem[] {
  return workflowProgressAfterFailureFromDomain(progress, errorMessage);
}

export function AppShell() {
  const initialWorkflowGraph = useMemo(() => createWorkflowGraphFromObjective(""), []);
  const chatApi = useMemo(() => multiAgentChatService(), []);
  const snapshots = useMemo(() => snapshotService(), []);
  const workflows = useMemo(() => workflowService(), []);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(DEFAULT_SNAPSHOT);
  const [importedSkillTemplates, setImportedSkillTemplates] = useState<SkillTemplate[]>([]);
  const [prompt, setPrompt] = useState("");
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [teamPrompt, setTeamPrompt] = useState("");
  const [taskConfiguredAgentId, setTaskConfiguredAgentId] = useState("");
  const [taskModelId, setTaskModelId] = useState(DEFAULT_MODEL_ID);
  const [scheduledWorkflowDraft, setScheduledWorkflowDraft] = useState<ScheduledWorkflowDraft>(() =>
    defaultScheduledWorkflowDraft(DEFAULT_SNAPSHOT.workflowStore.workflows, DEFAULT_SNAPSHOT.workflowStore.activeWorkflowId),
  );
  const [scheduledWorkflowMode, setScheduledWorkflowMode] = useState<"detail" | "create">("detail");
  const snapshotRef = useRef(snapshot);
  const workflowRunningRef = useRef(false);
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilterValue>("all");
  const [selectedTaskDetailId, setSelectedTaskDetailId] = useState<string | undefined>();
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>("chat");
  const [configChannels, setConfigChannels] = useState<AgentChannel[]>([]);
  const [selectedConfigChannelId, setSelectedConfigChannelId] = useState("");
  const [selectedConfiguredAgentId, setSelectedConfiguredAgentId] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [codexPluginCatalog, setCodexPluginCatalog] = useState<CodexPluginCatalogItem[]>([]);
  const [pluginCatalogStatus, setPluginCatalogStatus] = useState("");
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme(window.localStorage));
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>(() => loadStoredProviderKeys(window.localStorage));
  const [language, setLanguage] = useState<Language>(() => loadStoredLanguage(window.localStorage));
  const [keepAwake, setKeepAwake] = useState(() => loadStoredKeepAwake(window.localStorage));
  const [agentTestResults, setAgentTestResults] = useState<Record<string, AgentTestUiState>>({});
  const [testingAgentId, setTestingAgentId] = useState<string | undefined>();
  const [agentTestTick, setAgentTestTick] = useState(0);
  const [balanceResults, setBalanceResults] = useState<Record<string, ProviderBalanceResult>>({});
  const [balanceLoadingChannelId, setBalanceLoadingChannelId] = useState<string | undefined>();
  const balanceRefreshInFlightRef = useRef(false);
  const lastBalanceRefreshAtRef = useRef<number | undefined>(undefined);
  const configChannelsRef = useRef<AgentChannel[]>([]);
  const configDirtyRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentContextMenu, setAgentContextMenu] = useState<{ agentId: string; x: number; y: number } | undefined>();
  const [chatContextMenu, setChatContextMenu] = useState<{ chatId: string; x: number; y: number } | undefined>();
  const [configContextMenu, setConfigContextMenu] = useState<{ channelId: string; x: number; y: number } | undefined>();
  const transcriptRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const gChordRef = useRef(0);
  const {
    workflowId,
    workflowTitle,
    workflowStatus,
    workflowRevision,
    workflowConfiguredAgentId,
    workflowModelId,
    workflowObjective,
    workflowGraph,
    workflowGraphReady,
    workflowMessages,
    workflowReply,
    workflowError,
    workflowRunning,
    workflowRunProgress,
    workflowRunContextDocument,
    workflowContextDocument,
    workflowFinalReport,
    workflowRunIds,
    workflowAgentSessionId,
    workflowCreatedAt,
    resetWorkflowLocalDraft,
    stopWorkflowGrill,
    createNewWorkflow,
    resetWorkflowSession,
    draftWorkflowGraph,
    sendWorkflowReply,
    updateWorkflowNode,
    selectWorkflow,
    applyPersistedWorkflowDraft,
    askWorkflowAgentFor,
    beginWorkflowAssistantRequest,
    hasWorkflowAssistantStreamed,
    setWorkflowStatus,
    setWorkflowConfiguredAgentId,
    setWorkflowModelId,
    setWorkflowObjective,
    setWorkflowMessages,
    setWorkflowReply,
    setWorkflowError,
    setWorkflowRunning,
    setWorkflowRunProgress,
    setWorkflowRunContextDocument,
    setWorkflowContextDocument,
    setWorkflowFinalReport,
    setWorkflowRunIds,
    setWorkflowAgentSessionId,
  } = useWorkflowDraft({
    snapshot,
    setSnapshot,
    snapshotRef,
    initialWorkflowGraph,
    workflows,
    configuredAgents: snapshot.configuredAgents,
    channels: snapshot.channels,
    onCreateNewWorkflow: () => setActiveFeature("workflow"),
  });
  const {
    workflowContextMenu,
    workflowRenameDraft,
    openWorkflowContextMenu: openWorkflowSidebarContextMenu,
    closeWorkflowContextMenu,
    startWorkflowRename,
    changeWorkflowRenameDraft,
    cancelWorkflowRename,
    confirmWorkflowRename,
    deleteWorkflow,
  } = useWorkflowSidebarState({
    workflows: snapshot.workflowStore.workflows,
    activeWorkflowId: workflowId,
    workflowRunning,
    setSnapshot,
    workflowsService: workflows,
    applyPersistedWorkflowDraft,
    resetWorkflowLocalDraft,
    canRenameWorkflow: typeof chatApi.renameWorkflow === "function",
    canDeleteWorkflow: typeof chatApi.deleteWorkflow === "function",
    missingCapabilityMessage: missingAppCapabilityMessage,
  });
  const { runWorkflowGraph, runWorkflowGraphInternal } = useWorkflowRunner({
    chatApi,
    snapshots,
    workflows,
    snapshotRef,
    setSnapshot,
    workflowRunning,
    workflowId,
    workflowGraph,
    workflowConfiguredAgentId,
    workflowModelId,
    workflowContextDocument,
    workflowAgentSessionId,
    workflowRunIds,
    applyPersistedWorkflowDraft,
    askWorkflowAgentFor,
    beginWorkflowAssistantRequest,
    hasWorkflowAssistantStreamed,
    setWorkflowError,
    setWorkflowRunning,
    setWorkflowStatus,
    setWorkflowFinalReport,
    setWorkflowRunIds,
    setWorkflowRunProgress,
    setWorkflowRunContextDocument,
    setWorkflowMessages,
    onEnterWorkflow: () => setActiveFeature("workflow"),
  });
  const { handleScheduledWorkflowEvent } = useScheduledWorkflowRunner({
    chatApi,
    snapshotRef,
    setSnapshot,
    runWorkflowGraphInternal,
  });

  configChannelsRef.current = configChannels;
  configDirtyRef.current = configDirty;

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
    if (!testingAgentId) return undefined;
    const timer = window.setInterval(() => setAgentTestTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [testingAgentId]);

  useEffect(() => {
    return chatApi.onAgentTestEvent((event) => {
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

  useEffect(() => {
    if (snapshot.configuredAgents.length === 0) {
      setSelectedConfiguredAgentId("");
      return;
    }
    const firstAgent = snapshot.configuredAgents[0];
    if (firstAgent && !snapshot.configuredAgents.some((agent) => agent.id === selectedConfiguredAgentId)) {
      setSelectedConfiguredAgentId(firstAgent.id);
    }
  }, [snapshot.configuredAgents, selectedConfiguredAgentId]);

  useEffect(() => {
    if (!agentContextMenu && !chatContextMenu && !workflowContextMenu && !configContextMenu) return;
    const close = (): void => {
      setAgentContextMenu(undefined);
      setChatContextMenu(undefined);
      closeWorkflowContextMenu();
      setConfigContextMenu(undefined);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [agentContextMenu, chatContextMenu, workflowContextMenu, configContextMenu, closeWorkflowContextMenu]);

  useEffect(() => {
    void snapshots.getSnapshot().then((value) => {
      setSnapshot(value);
    });
    return snapshots.subscribe((value) => {
      setSnapshot(value);
    });
  }, [snapshots]);

  useEffect(() => {
    const api = chatApi as typeof chatApi & {
      listImportedSkills?: () => Promise<SkillTemplate[]>;
    };
    if (!api.listImportedSkills) return;
    void api.listImportedSkills().then(setImportedSkillTemplates).catch(() => undefined);
  }, [chatApi]);

  useEffect(() => {
    if (configDirty) return;
    setConfigChannels(snapshot.channels);
    setSelectedConfigChannelId((current) => {
      return configChannelForSelection(snapshot.channels, current)?.id ?? "";
    });
  }, [configDirty, snapshot.channels]);

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
    workflowRunningRef.current = workflowRunning;
  }, [workflowRunning]);

  useEffect(() => {
    setScheduledWorkflowDraft((current) => {
      if (current.workflowId && snapshot.workflowStore.workflows.some((workflow) => workflow.workflowId === current.workflowId)) return current;
      return defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId);
    });
  }, [snapshot.workflowStore.activeWorkflowId, snapshot.workflowStore.workflows]);

  useEffect(() => {
    if (activeFeature !== "runtimes" || pluginCatalogStatus || codexPluginCatalog.length > 0) return;
    void loadCodexPluginCatalog();
  }, [activeFeature, codexPluginCatalog.length, pluginCatalogStatus]);

  useEffect(() => {
    void refreshRuntimeChannelBalancesIfDue();
  }, [configChannels, configDirty]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshRuntimeChannelBalancesIfDue();
    }, BALANCE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeFeature !== "tasks") setSelectedTaskDetailId(undefined);
  }, [activeFeature]);

  useEffect(() => {
    if (!selectedTaskDetailId) return;
    if (snapshot.tasks.some((task) => task.id === selectedTaskDetailId)) return;
    setSelectedTaskDetailId(undefined);
  }, [selectedTaskDetailId, snapshot.tasks]);

  useEffect(() => {
    return chatApi.onScheduledWorkflowEvent((event) => {
      void handleScheduledWorkflowEvent(event);
    });
  }, [chatApi]);

  const runtimeMap = useMemo(() => new Map(snapshot.runtimes.map((runtime) => [runtime.id, runtime])), [snapshot.runtimes]);
  const activeChat = useMemo(() => activeChatFrom(snapshot), [snapshot]);
  const activeTask = useMemo(() => activeTaskFrom(snapshot), [snapshot]);
  const activeTeam = useMemo(() => activeTeamFrom(snapshot), [snapshot]);
  const text = UI_TEXT[language];
  const activeTeamRun = useMemo(() => activeTeamRunFrom(snapshot, activeTeam?.id), [snapshot, activeTeam?.id]);
  const visibleTasks = useMemo(
    () => (taskStatusFilter === "all" ? snapshot.tasks : snapshot.tasks.filter((task) => task.progress === taskStatusFilter)),
    [snapshot.tasks, taskStatusFilter],
  );
  const skillTemplates = useMemo(() => {
    const importedIds = new Set(importedSkillTemplates.map((template) => template.id));
    return [...importedSkillTemplates, ...SKILL_TEMPLATES.filter((template) => !importedIds.has(template.id))];
  }, [importedSkillTemplates]);
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
      workflow: {
        workflows: snapshot.workflowStore.workflows,
        activeWorkflowId: snapshot.workflowStore.activeWorkflowId,
        running: workflowRunning,
        contextMenu: workflowContextMenu,
        renameDraft: workflowRenameDraft,
      },
      schedules: {
        schedules: snapshot.scheduledWorkflowStore.schedules,
        activeScheduleId: snapshot.scheduledWorkflowStore.activeScheduleId,
        mode: scheduledWorkflowMode,
      },
      skills: {
        skillTemplates,
      },
    }),
    [
      snapshot.chats,
      snapshot.configuredAgents,
      snapshot.channels,
      snapshot.tasks,
      snapshot.workflowStore.workflows,
      snapshot.workflowStore.activeWorkflowId,
      snapshot.scheduledWorkflowStore.schedules,
      snapshot.scheduledWorkflowStore.activeScheduleId,
      activeChat?.id,
      chatContextMenu,
      visibleTasks,
      activeTask,
      taskStatusFilter,
      workflowRunning,
      workflowContextMenu,
      workflowRenameDraft,
      scheduledWorkflowMode,
      skillTemplates,
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
        chats: snapshot.chats.map((chat) => {
          const agent = configuredAgentById(chat.configuredAgentId, snapshot.configuredAgents);
          const channel = resolveConfiguredAgentChannel(agent, snapshot.channels);
          return { id: chat.id, title: chat.title, agentId: configuredAgentRuntimeId(agent, channel) };
        }),
        theme,
        language,
        onNavigate: setActiveFeature,
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

  function setWorkflowConfiguredAgent(configuredAgentId: string): void {
    setWorkflowConfiguredAgentId(configuredAgentId);
    setWorkflowModelId(configuredAgentModelId(configuredAgentId, undefined, snapshot.configuredAgents, snapshot.channels));
  }

  function updateConfigChannels(next: AgentChannel[]): void {
    setConfigChannels(next);
    setConfigDirty(true);
    setConfigStatus("");
    setSelectedConfigChannelId((current) => {
      return configChannelForSelection(next, current)?.id ?? "";
    });
  }

  function addConfigChannel(): void {
    const next = [...configChannels, createChannel("codex", configChannels.map((channel) => channel.id))];
    updateConfigChannels(next);
    setSelectedConfigChannelId(next[next.length - 1]?.id ?? "");
  }

  function openConfigContextMenu(event: MouseEvent, channelId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAgentContextMenu(undefined);
    setChatContextMenu(undefined);
    closeWorkflowContextMenu();
    setSelectedConfigChannelId(channelId);
    setConfigContextMenu({ channelId, x: event.clientX, y: event.clientY });
  }

  function deleteConfigChannel(channelId: string): void {
    setConfigContextMenu(undefined);
    const referencedAgent = snapshot.configuredAgents.find((agent) => agent.channelId === channelId);
    if (referencedAgent) {
      setConfigStatus(`Config is used by ${referencedAgent.name || referencedAgent.id}`);
      return;
    }
    if (configChannels.length <= 1) {
      setConfigStatus("Keep at least one config");
      return;
    }
    const next = configChannels.filter((channel) => channel.id !== channelId);
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
  }

  async function persistChannelConfig(): Promise<AppSnapshot> {
    const next = await chatApi.saveModelChannels(configChannels);
    setConfigChannels(next.channels);
    setConfigDirty(false);
    setSelectedConfigChannelId((current) => {
      return configChannelForSelection(next.channels, current)?.id ?? "";
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

  async function saveConfiguredAgents(agents: ConfiguredAgent[]): Promise<void> {
    const next = await chatApi.saveConfiguredAgents(agents);
    setSnapshot(next);
  }

  function openChatContextMenu(event: MouseEvent, chatId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAgentContextMenu(undefined);
    closeWorkflowContextMenu();
    setConfigContextMenu(undefined);
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

  function openWorkflowContextMenu(event: MouseEvent, workflowId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAgentContextMenu(undefined);
    setChatContextMenu(undefined);
    setConfigContextMenu(undefined);
    openWorkflowSidebarContextMenu(workflowId, event.clientX, event.clientY);
  }

  async function testRuntimeChannel(channelId: string): Promise<void> {
    const channel = configChannels.find((item) => item.id === channelId);
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
  }

  async function queryRuntimeChannelBalance(channelId: string, options: { persistBeforeQuery?: boolean; quiet?: boolean } = {}): Promise<void> {
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
  }

  async function refreshRuntimeChannelBalances(channelIds: string[]): Promise<void> {
    for (const channelId of channelIds) {
      await queryRuntimeChannelBalance(channelId, { persistBeforeQuery: false, quiet: true });
    }
  }

  async function refreshRuntimeChannelBalancesIfDue(): Promise<void> {
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
      await refreshRuntimeChannelBalances(channels.map((channel) => channel.id));
      lastBalanceRefreshAtRef.current = Date.now();
    } finally {
      balanceRefreshInFlightRef.current = false;
    }
  }

  function updateProviderKey(presetId: string, value: string): void {
    setProviderKeys((current) => {
      const next = { ...current };
      if (value.trim()) next[presetId] = value;
      else delete next[presetId];
      window.localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function loadCodexPluginCatalog(): Promise<void> {
    setPluginCatalogStatus("Loading plugins...");
    try {
      const plugins = await chatApi.listCodexPlugins();
      setCodexPluginCatalog(plugins);
      setPluginCatalogStatus(`Loaded ${plugins.length} plugins`);
    } catch (error) {
      setPluginCatalogStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function updateConfigChannel(channelId: string, updater: (channel: AgentChannel) => AgentChannel): void {
    setBalanceResults((current) => {
      if (!(channelId in current)) return current;
      const next = { ...current };
      delete next[channelId];
      return next;
    });
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
    setImportedSkillTemplates(templates);
    return templates;
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

  async function installSkill(templateId: string, target: SkillInstallTarget): Promise<InstalledSkillResult> {
    const api = chatApi as typeof chatApi & {
      installSkill?: (request: { templateId: string; target: SkillInstallTarget }) => Promise<InstalledSkillResult>;
    };
    if (!api.installSkill) throw new Error("技能安装能力需要重启应用后生效。");
    return api.installSkill({ templateId, target });
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

  async function connectScheduledRunner(): Promise<void> {
    const next = await chatApi.connectScheduledWorkflowRunner();
    setSnapshot(next);
  }

  async function disconnectScheduledRunner(): Promise<void> {
    const next = await chatApi.disconnectScheduledWorkflowRunner();
    setSnapshot(next);
  }

  async function refreshScheduledWorkflows(): Promise<void> {
    const next = await chatApi.refreshScheduledWorkflowSchedules();
    setSnapshot(next);
  }

  async function selectScheduledWorkflowSchedule(scheduleId: string): Promise<void> {
    setScheduledWorkflowMode("detail");
    const next = await chatApi.selectScheduledWorkflowSchedule(scheduleId);
    setSnapshot(next);
  }

  function startCreatingScheduledWorkflow(): void {
    setActiveFeature("schedules");
    setScheduledWorkflowMode("create");
    setScheduledWorkflowDraft(defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId));
  }

  async function createScheduledWorkflow(): Promise<void> {
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === scheduledWorkflowDraft.workflowId);
    if (!workflow) return;
    const next = await chatApi.createScheduledWorkflowSchedule({
      workflowId: workflow.workflowId,
      title: scheduledWorkflowDraft.title.trim() || workflow.title,
      enabled: scheduledWorkflowDraft.enabled,
      intervalSeconds: intervalSecondsForFrequency(scheduledWorkflowDraft.frequency),
      frequency: scheduledWorkflowDraft.frequency,
      timeOfDay: normalizeScheduleTimeOfDay(scheduledWorkflowDraft.timeOfDay),
      timezone: scheduledWorkflowDraft.timezone || DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
      ...(scheduledWorkflowDraft.frequency === "weekly" ? { weekdays: normalizeScheduleWeekdays(scheduledWorkflowDraft.weekdays) } : {}),
      ...(scheduledWorkflowDraft.frequency === "monthly" ? { dayOfMonth: normalizeScheduleDayOfMonth(scheduledWorkflowDraft.dayOfMonth) } : {}),
    });
    setScheduledWorkflowMode("detail");
    setSnapshot(next);
  }

  async function updateScheduledWorkflow(
    schedule: ScheduledWorkflowSchedule,
    update: Partial<Pick<ScheduledWorkflowSchedule, "enabled" | "title" | "intervalSeconds" | "frequency" | "timeOfDay" | "timezone" | "weekdays" | "dayOfMonth">>,
  ): Promise<void> {
    const next = await chatApi.updateScheduledWorkflowSchedule(schedule.scheduleId, update);
    setSnapshot(next);
  }

  async function deleteScheduledWorkflow(scheduleId: string): Promise<void> {
    const next = await chatApi.deleteScheduledWorkflowSchedule(scheduleId);
    setSnapshot(next);
  }

  async function triggerScheduledWorkflow(scheduleId: string): Promise<void> {
    await chatApi.triggerScheduledWorkflowSchedule(scheduleId);
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
    setActiveFeature("workflow");
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
    () => ({ activeFeature, setActiveFeature, paletteOpen, setPaletteOpen }),
    [activeFeature, paletteOpen],
  );

  return (
    <AppProviders snapshot={providerSnapshot} preferences={providerPreferences} navigation={providerNavigation}>
      <div className={appShellClass(activeFeature)}>
        <FeatureRail activeFeature={activeFeature} theme={theme} text={text} onSelectFeature={setActiveFeature} onToggleTheme={toggleTheme} />

        <ResourceSidebar
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
          onNewWorkflow={createNewWorkflow}
          onSelectWorkflow={selectWorkflow}
          onOpenWorkflowContextMenu={openWorkflowContextMenu}
          onStartWorkflowRename={startWorkflowRename}
          onWorkflowRenameDraftChange={changeWorkflowRenameDraft}
          onConfirmWorkflowRename={confirmWorkflowRename}
          onCancelWorkflowRename={cancelWorkflowRename}
          onDeleteWorkflow={deleteWorkflow}
          onStartCreatingScheduledWorkflow={startCreatingScheduledWorkflow}
          onSelectScheduledWorkflowSchedule={selectScheduledWorkflowSchedule}
        />

        <main className={appContentClass(activeFeature)}>
        {activeFeature === "tasks" ? (
          <TaskPage
            prompt={taskPrompt}
            configuredAgentId={taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents)}
            modelId={taskModelId}
            configuredAgents={snapshot.configuredAgents}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            tasks={snapshot.tasks}
            activeTaskId={selectedTaskDetailActiveId}
            onPromptChange={setTaskPrompt}
            onSelectConfiguredAgent={setTaskConfiguredAgent}
            onSelectModel={setTaskModelId}
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
        ) : activeFeature === "workflow" ? (
          <WorkflowPage
            workflowId={workflowId}
            title={workflowTitle}
            status={workflowStatus}
            graph={workflowGraph}
            graphReady={workflowGraphReady}
            objective={workflowObjective}
            messages={workflowMessages}
            reply={workflowReply}
            error={workflowError}
            configuredAgentId={workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents)}
            modelId={workflowModelId}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            configuredAgents={snapshot.configuredAgents}
            workDir={snapshot.workDir}
            running={workflowRunning}
            runProgress={workflowRunProgress}
            contextDocument={workflowRunContextDocument}
            finalReport={workflowFinalReport}
            onObjectiveChange={setWorkflowObjective}
            onSelectConfiguredAgent={setWorkflowConfiguredAgent}
            onSelectModel={setWorkflowModelId}
            onDraftGraph={draftWorkflowGraph}
            onReplyChange={setWorkflowReply}
            onSendReply={sendWorkflowReply}
            onUpdateNode={updateWorkflowNode}
            onRunGraph={runWorkflowGraph}
            onResetSession={resetWorkflowSession}
            onStopGrill={stopWorkflowGrill}
            onChooseWorkDir={chooseWorkDir}
            onRefresh={refresh}
            onReadOutputFile={readLocalFile}
            language={language}
          />
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
            templates={skillTemplates}
            configuredAgents={snapshot.configuredAgents}
            onImportOnlineSkill={importOnlineSkill}
            onRevealSkillInFinder={revealSkillInFinder}
            onInstallSkill={installSkill}
            onUninstallSkill={uninstallSkill}
          />
        ) : activeFeature === "runtimes" ? (
          <RuntimePage
            language={language}
            channels={configChannels}
            selectedChannelId={selectedConfigChannelId}
            providerKeys={providerKeys}
            codexPluginCatalog={codexPluginCatalog}
            pluginCatalogStatus={pluginCatalogStatus}
            agentTestResults={agentTestResults}
            testingAgentId={testingAgentId}
            agentTestTick={agentTestTick}
            balanceResults={balanceResults}
            balanceLoadingChannelId={balanceLoadingChannelId}
            contextMenu={configContextMenu}
            onUpdateChannel={updateConfigChannel}
            onAddModel={addConfigModel}
            onUpdateModel={updateConfigModel}
            onRemoveModel={removeConfigModel}
            onSave={saveChannelConfig}
            onLoadCodexPluginCatalog={loadCodexPluginCatalog}
            onSelectChannel={setSelectedConfigChannelId}
            onAddConfig={addConfigChannel}
            onOpenContextMenu={openConfigContextMenu}
            onDeleteConfig={deleteConfigChannel}
            onTestChannel={testRuntimeChannel}
            onQueryBalance={queryRuntimeChannelBalance}
            onUpdateProviderKey={updateProviderKey}
          />
        ) : activeFeature === "configuration" ? (
          <ConfigPage
            language={language}
            channels={snapshot.channels}
            configuredAgents={snapshot.configuredAgents}
            selectedConfiguredAgentId={selectedConfiguredAgentId}
            status={configStatus}
            onSave={() => saveConfiguredAgents(snapshot.configuredAgents)}
            onAddConfiguredAgent={async () => {
              const nextAgent = createConfiguredAgent(snapshot.channels, snapshot.configuredAgents.map((agent) => agent.id));
              const nextAgents = [...snapshot.configuredAgents, nextAgent];
              setSelectedConfiguredAgentId(nextAgent.id);
              await saveConfiguredAgents(nextAgents);
            }}
            onSelectConfiguredAgent={setSelectedConfiguredAgentId}
            onUpdateConfiguredAgent={(agentId, updater) => {
              const nextAgents = snapshot.configuredAgents.map((agent) =>
                agent.id === agentId ? { ...updater(agent), updatedAt: Date.now() } : agent,
              );
              void saveConfiguredAgents(nextAgents);
            }}
          />
        ) : activeFeature === "settings" ? (
          <SettingsPage language={language} keepAwake={keepAwake} onLanguageChange={setLanguage} onKeepAwakeChange={setKeepAwake} />
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
            onRefresh={refresh}
          />
        )}
        </main>

        <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      </div>
    </AppProviders>
  );
}
