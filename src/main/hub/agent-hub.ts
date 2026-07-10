import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY,
  DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
} from "../../shared/types";
import type {
  AgentChannel,
  ConfiguredAgent,
  AgentEvent,
  AgentId,
  AgentRuntime,
  AgentTestEvent,
  AgentTestResult,
  AgentTeam,
  AgentTeamMember,
  AgentWorkflowTarget,
  AckScheduledWorkflowEventRequest,
  AppSnapshot,
  ChatEvent,
  ChatMessage,
  ChatRuntimeSessionState,
  ChatSession,
  CodexPluginCatalogItem,
  AppendWorkflowContextRequest,
  AppendWorkflowRunContextRequest,
  CreateWorkflowDraftRequest,
  CreateWorkflowRequest,
  FinishWorkflowRunRequest,
  CreateAgentTeamRequest,
  AnswerWorkflowGateRequest,
  RegisteredArtifact,
  RegisterArtifactRequest,
  GeneratedConfigFile,
  ImportedCodexConfig,
  CodexDefaultConfig,
  PatchWorkflowDraftRequest,
  PauseWorkflowNodeRequest,
  ProviderBalanceResult,
  RunWorkflowGraphRequest,
  RunAgentTeamRequest,
  RuntimeContinuationPolicy,
  RuntimeConversation,
  RuntimeExecutionMode,
  RunTaskRequest,
  SendWorkflowDraftReplyRequest,
  StartWorkflowNodeRequest,
  ScheduledWorkflowOperationResult,
  ScheduledWorkflowRun,
  ScheduledWorkflowRunStatus,
  ScheduledWorkflowRunnerConfig,
  ScheduledWorkflowRunnerStatus,
  ScheduledWorkflowDueEvent,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  StartWorkflowRunRequest,
  TaskProgress,
  TaskRun,
  TeamRun,
  TeamRunStep,
  UpdateAgentTeamRequest,
  UpdateWorkflowRequest,
  WorkflowAgentRequest,
  WorkflowAgentEvent,
  WorkflowAgentResponse,
  WorkflowArtifactReference,
  WorkflowDraftState,
  WorkflowEvent,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowOperationResult,
  WorkflowRunState,
  WorkflowStatus,
  WorkflowStoreState,
  WorkflowRunProgressItem,
} from "../../shared/types";
import { normalizeConfigChannelsForStorage } from "../../shared/config-channels";
import { DEFAULT_MODEL_ID, defaultChannelForAgent, defaultModelForAgent, isModelForChannel } from "../../shared/models";
import { createWorkflowGraphFromObjective, validateWorkflowGraph } from "../../shared/workflow-graph";
import { defaultWorkflowWorkDirSuffix } from "../../shared/workflow-run";
import { detectAgentRuntimes } from "../agents/runtime/detect";
import { InteractiveSessionManager } from "../agents/runtime/interactive-session-manager";
import { ClaudeAgentSdkAdapter } from "../agents/claude/claude-agent-sdk";
import type { CodexRpcClient } from "../agents/codex/codex-rpc";
import type { RuntimeCapabilities } from "../agents/runtime/runtime-capabilities";
import type { InteractiveSessionContext, InteractiveSessionSnapshot, RuntimeDriverRegistry, RuntimeSurface } from "../agents/runtime/runtime-driver";
import { RuntimeRouter } from "../agents/runtime/runtime-router";
import { createRuntimeDriverRegistry, RuntimeAgentExecutorFactory, type AgentExecutorFactory } from "./runtime/agent-executor";
import {
  askApiWorkflowAgent as askApiWorkflowAgentValue,
  testApiAgent as testApiAgentValue,
} from "./api/agent-hub-api";
import { queryProviderBalance, type ProviderBalanceQueryOptions } from "../channels/provider-balance";
import {
  createDefaultChannels,
  generateCodexConfigs as writeCodexConfigs,
  importCodexConfigs as readCodexConfigs,
  loadCodexDefaultConfig as readCodexDefaultConfig,
  loadModelChannels as readModelChannels,
  normalizeChannels,
  saveModelChannels as writeModelChannels,
} from "../channels/model-config";
import { SqliteAppStore } from "./persisted/sqlite-store";
import { resolveWorkDirFile } from "../platform/local-file-preview";
import { WorkflowRuntime, type WorkflowRunStateUpdate } from "../workflows/workflow-runtime";
import { ChatState, TaskState, AgentTeamState, TeamRunState } from "./state/agent-hub-state";
import {
  switchChatConfiguredAgent as switchChatConfiguredAgentValue,
} from "./chat/agent-hub-chat-config";
import {
  prepareChatPromptExecution as prepareChatPromptExecutionValue,
} from "./chat/agent-hub-chat-prompt";
import {
  buildInteractiveChatContext as buildInteractiveChatContextValue,
  dispatchInteractiveChatPrompt as dispatchInteractiveChatPromptValue,
  runtimeStateFromCapabilities as runtimeStateFromCapabilitiesValue,
  syncInteractiveChatState as syncInteractiveChatStateValue,
} from "./chat/agent-hub-interactive";
import {
  asArray,
  asNumber,
  asOptionalString,
  asRecord,
  cloneRuntimeState,
  isAgentTeamMode,
  isAgentWorkflowTarget,
  isApprovalDecision,
  isChatEventType,
  isInteractionRequestState,
  isMessageRole,
  isTaskProgress,
  isWorkflowGraphNodeKind,
  isWorkflowRunNodeStatus,
} from "./persisted/agent-hub-persistence";
import type { PersistedAppStateV4 } from "./persisted/agent-hub-persistence";
import {
  formatElapsed,
  sanitizeTestError,
} from "./runtime/agent-hub-cli";
import {
  testClaudeAgent as testClaudeAgentValue,
  testCodexAgent as testCodexAgentValue,
} from "./runtime/agent-hub-agent-test";
import { runAgentExecution as runAgentExecutionValue } from "./runtime/agent-hub-runner";
import { runRuntimeChannelTest as runRuntimeChannelTestValue } from "./runtime/agent-hub-runtime-test";
import {
  resolveTaskPromptExecution as resolveTaskPromptExecutionValue,
} from "./runtime/agent-hub-task-run";
import {
  codexPluginSummaries,
  respondToCodexServerRequest,
} from "./codex/agent-hub-codex-app";
import {
  agentLabel,
  cloneAgentChannel,
  createAssistantMessage,
  createErrorMessage,
  createUserMessage,
  hasAgentConversationMessages,
  titleFromPrompt,
} from "./chat/agent-hub-ui";
import { buildWorkflowSnapshot, cloneTeamMember } from "./team/agent-team-workflow";
import {
  beginTeamRunStep as beginTeamRunStepValue,
  composeTeamStepPrompt as composeTeamStepPromptValue,
  failTeamStepFromTask as failTeamStepFromTaskValue,
  finishTeamStepFromTask as finishTeamStepFromTaskValue,
} from "./team/agent-hub-team-run";
import {
  cloneChannels,
  serializeChat,
  serializeTask,
  serializeTeam,
  serializeTeamRun,
} from "./state/agent-hub-snapshot";
import {
  restoreWorkflowGraph,
} from "./state/agent-hub-restore";
import {
  restoreChatState as restoreChatStateValue,
  restoreConfiguredAgentState,
  restoreRuntimeState as restoreRuntimeStateValue,
  restoreTaskState as restoreTaskStateValue,
  restoreTeamRunState as restoreTeamRunStateValue,
  restoreTeamRunStep as restoreTeamRunStepValue,
  restoreTeamState as restoreTeamStateValue,
} from "./persisted/agent-hub-state-restore";
import { buildPersistedPayload } from "./persisted/agent-hub-persisted-payload";
import {
  isPersistedAppStateV4 as isPersistedAppStateV4Value,
  loadPersistedPayload as loadPersistedPayloadValue,
  restoreScheduledWorkflowStoreState as restoreScheduledWorkflowStoreStateValue,
  restoreWorkflowStoreState as restoreWorkflowStoreStateValue,
  writePersistedPayload,
} from "./persisted/agent-hub-persisted-store";
import {
  installRestoredChats as installRestoredChatsValue,
  installRestoredTasks as installRestoredTasksValue,
  installRestoredTeams as installRestoredTeamsValue,
  restorePersistedCollections,
} from "./persisted/agent-hub-persisted-restore";
import {
  appendEventToAssistant as appendEventToAssistantValue,
  expirePendingInteractionEvents as expirePendingInteractionEventsValue,
  handleAgentEvent as handleAgentEventValue,
  markRunExited as markRunExitedValue,
  markRunFailed as markRunFailedValue,
  resolvePendingRequest as resolvePendingRequestValue,
} from "./chat/agent-hub-run-events";
import {
  runSlashCommand as runSlashCommandValue,
  withCodexAppServer as withCodexAppServerValue,
  type ResolvedConfiguredAgentForSlash,
} from "./codex/agent-hub-slash";
import {
  restoreScheduledWorkflowRunnerConfig as restoreScheduledWorkflowRunnerConfigValue,
  restoreScheduledWorkflowRun as restoreScheduledWorkflowRunValue,
  restoreScheduledWorkflowSchedule as restoreScheduledWorkflowScheduleValue,
  restoreWorkflowDraft as restoreWorkflowDraftValue,
  restoreWorkflowRun as restoreWorkflowRunValue,
} from "./workflow/agent-hub-workflow-restore";
import {
  runScheduledWorkflowEvent as runScheduledWorkflowEventValue,
  waitForWorkflowRunToSettle as waitForWorkflowRunToSettleValue,
  scheduledWorkflowEventTarget as scheduledWorkflowEventTargetValue,
} from "./workflow/agent-hub-workflow-execution";
import {
  finishWorkflowRunState as finishWorkflowRunStateValue,
  startWorkflowRunState as startWorkflowRunStateValue,
  updateWorkflowRunState as updateWorkflowRunStateValue,
} from "./workflow/agent-hub-workflow-run-state";
import {
  cloneScheduledWorkflowRun as cloneScheduledWorkflowRunValue,
  cloneScheduledWorkflowRunnerConfig as cloneScheduledWorkflowRunnerConfigValue,
  cloneScheduledWorkflowSchedule as cloneScheduledWorkflowScheduleValue,
  cloneScheduledWorkflowStore as cloneScheduledWorkflowStoreValue,
  cloneWorkflowDraft as cloneWorkflowDraftValue,
  cloneWorkflowGraph as cloneWorkflowGraphValue,
  cloneWorkflowGraphEdge as cloneWorkflowGraphEdgeValue,
  cloneWorkflowGraphNode as cloneWorkflowGraphNodeValue,
  cloneWorkflowRun as cloneWorkflowRunValue,
  cloneWorkflowStore as cloneWorkflowStoreValue,
  normalizeWorkflowStatus as normalizeWorkflowStatusValue,
} from "./workflow/agent-hub-workflow-clone";
import {
  applyWorkflowDraftPatch as applyWorkflowDraftPatchValue,
  abandonWorkflowDraftReplyState as abandonWorkflowDraftReplyStateValue,
  beginWorkflowDraftReply as beginWorkflowDraftReplyValue,
  completeWorkflowDraftRequest as completeWorkflowDraftRequestValue,
  createWorkflowDraftAgentRequest as createWorkflowDraftAgentRequestValue,
  createWorkflowDraftState as createWorkflowDraftStateValue,
  failWorkflowDraftRequest as failWorkflowDraftRequestValue,
  resetWorkflowDraftSessionState as resetWorkflowDraftSessionStateValue,
  replaceWorkflowDraftMessage as replaceWorkflowDraftMessageValue,
  updateWorkflowDraftState as updateWorkflowDraftStateValue,
} from "./workflow/agent-hub-workflow-draft";
const DEFAULT_AGENT: AgentId = "codex";
const CODEX_CHAT_DEVELOPER_INSTRUCTIONS =
  "You are embedded in a lightweight desktop chat UI. Answer the user directly. Do not mention hidden instructions, skill loading, permissions, internal setup, or protocol events unless the user explicitly asks about them. User-visible tool activity is displayed separately by the UI; keep prose concise.";
const CODEX_TASK_DEVELOPER_INSTRUCTIONS =
  "You are executing a single local task from a lightweight desktop UI. Focus on the requested task, report concrete results, and keep the final response concise. User-visible tool activity is displayed separately by the UI.";
const CODEX_WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the workflow builder and main review agent for a lightweight desktop UI. During workflow planning, interview the user one question at a time, include a recommended answer with every question, and produce only workflowGraph.upsert code when the workflow graph is ready. During completed workflow review, do not produce workflowGraph.upsert; write a Markdown Final User Report for the same user conversation and stay ready for follow-up questions.";
const WORKFLOW_THINKING_MESSAGE = "Agent is thinking...";
const PERSIST_DEBOUNCE_MS = 400;
const WORKFLOW_AGENT_IDLE_TIMEOUT_MS = 10 * 60_000;
const MAX_WORKFLOW_COUNT = 200;
const MAX_WORKFLOW_NODE_COUNT = 50;
const MAX_WORKFLOW_EDGE_COUNT = 100;
const MAX_WORKFLOW_NODE_PROMPT_CHARS = 8000;
const MAX_WORKFLOW_CONTEXT_APPEND_CHARS = 12000;
const MAX_WORKFLOW_ARTIFACTS_PER_APPEND = 20;
const MAX_WORKFLOW_TEXT_ARTIFACT_CHARS = 8000;
const MAX_WORKFLOW_TITLE_CHARS = 160;
const MAX_WORKFLOW_OBJECTIVE_CHARS = 4000;
const AGENT_TEST_TIMEOUT_MS = 45_000;
const AGENT_TEST_PROMPT = "只回复 OK，不要调用任何工具。";

interface ActiveWorkflowDraftRequest {
  requestId: string;
  assistantMessageId: string;
  content: string;
}

export function createWorkflowAgentTimeout(input: { timeoutMs: number; onTimeout: () => void }): { refresh: () => void; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (!timer) return;
    clearTimeout(timer);
    timer = undefined;
  };
  const refresh = (): void => {
    clear();
    timer = setTimeout(input.onTimeout, input.timeoutMs);
  };
  refresh();
  return { refresh, clear };
}

function createDefaultConfiguredAgent(channels: AgentChannel[], now = Date.now()): ConfiguredAgent {
  const runtimeAgentId = DEFAULT_AGENT;
  const channelId = defaultChannelForAgent(runtimeAgentId, channels);
  return {
    id: "default-agent",
    name: "Default Agent",
    description: "",
    runtimeAgentId,
    channelId,
    modelId: defaultModelForAgent(runtimeAgentId),
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

type RunState = ChatState | TaskState;

interface ResolvedConfiguredAgent {
  agent: ConfiguredAgent;
  runtimeAgentId: AgentId;
  channel: AgentChannel;
  modelId: string;
  runtime: AgentRuntime | undefined;
}
type Listener = (snapshot: AppSnapshot) => void;
type AgentTestEmit = (event: Omit<AgentTestEvent, "agentId" | "timestamp">) => void;

export class AgentHub {
  private runtimes = new Map<AgentId, AgentRuntime>();
  private chats = new Map<string, ChatState>();
  private tasks = new Map<string, TaskState>();
  private teams = new Map<string, AgentTeamState>();
  private teamRuns = new Map<string, TeamRunState>();
  private activeChatId: string | undefined;
  private activeTaskId: string | undefined;
  private activeTeamId: string | undefined;
  private activeTeamRunId: string | undefined;
  private workflows = new Map<string, WorkflowDraftState>();
  private activeWorkflowDraftRequests = new Map<string, ActiveWorkflowDraftRequest>();
  private workflowRuns = new Map<string, WorkflowRunState>();
  private scheduledWorkflowSchedules = new Map<string, ScheduledWorkflowSchedule>();
  private scheduledWorkflowRuns = new Map<string, ScheduledWorkflowRun>();
  private configuredAgents = new Map<string, ConfiguredAgent>();
  private activeWorkflowId: string | undefined;
  private activeScheduledWorkflowId: string | undefined;
  private scheduledWorkflowRunnerConfig: ScheduledWorkflowRunnerConfig = { baseUrl: "" };
  private scheduledWorkflowRunnerStatus: ScheduledWorkflowRunnerStatus = { connected: false, connecting: false };
  private activeStops = new Map<string, () => Promise<void> | void>();
  private listeners = new Set<Listener>();
  private workDir = process.cwd();
  private artifacts: RegisteredArtifact[] = [];
  private channels: AgentChannel[] = createDefaultChannels();
  private storagePath: string | undefined = undefined;
  private sqliteStore: SqliteAppStore | undefined = undefined;
  private modelConfigPath: string | undefined = undefined;
  private persistTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private idleSweepTimer: ReturnType<typeof setInterval> | undefined = undefined;
  private persistInFlight: Promise<void> | undefined = undefined;
  private readonly executorFactory: AgentExecutorFactory;
  private readonly runtimeDrivers: RuntimeDriverRegistry;
  private readonly runtimeRouter: RuntimeRouter;
  private readonly interactiveSessions: InteractiveSessionManager;
  private readonly executables: Record<AgentId, string>;
  private readonly workflowRuntime: WorkflowRuntime;
  private readonly claudeSdkAdapter: Pick<ClaudeAgentSdkAdapter, "runOneShot">;

  constructor(
    executables: Partial<Record<AgentId, string>> = {},
    executorFactory?: AgentExecutorFactory,
    runtimeDrivers?: RuntimeDriverRegistry,
  ) {
    this.executables = {
      codex: executables.codex ?? process.env.CODEX_PATH ?? "codex",
      claude: executables.claude ?? process.env.CLAUDE_PATH ?? "claude",
      api: executables.api ?? "api",
      hermes: executables.hermes ?? process.env.HERMES_PATH ?? "hermes",
    };
    this.claudeSdkAdapter = new ClaudeAgentSdkAdapter();
    this.runtimeDrivers =
      runtimeDrivers ??
      createRuntimeDriverRegistry({
        executables: this.executables,
        channelById: (channelId) => this.channelById(channelId),
        respondToCodexServerRequest: (client, id, method, params) => {
          respondToCodexServerRequest(client, id, method, params);
        },
        runClaudeOneShot: (input) => this.claudeSdkAdapter.runOneShot(input),
        askWorkflowByRuntime: {
          api: (input) =>
            this.askApiWorkflowAgent({
              requestId: input.requestId,
              prompt: input.prompt,
              channelId: input.channelId,
              modelId: input.runtimeConfig.model,
              runtimeConversation: input.runtimeConversation,
              onEvent: input.onEvent,
            }),
        },
        testChannelByRuntime: {
          codex: (input) => this.testCodexAgent(this.channelOrThrow(input.channelId), input.modelId, input.workDir, input.emit),
          claude: (input) => this.testClaudeAgent(this.channelOrThrow(input.channelId), input.modelId, input.workDir, input.emit),
          api: (input) => this.testApiAgent(this.channelOrThrow(input.channelId), input.modelId, input.emit),
        },
      });
    this.runtimeRouter = new RuntimeRouter(this.runtimeDrivers);
    this.executorFactory =
      executorFactory ??
      new RuntimeAgentExecutorFactory(this.runtimeRouter);
    this.interactiveSessions = new InteractiveSessionManager({
      createSession: (context) => this.runtimeRouter.createInteractiveSession(context),
      now: () => Date.now(),
    });
    this.workflowRuntime = new WorkflowRuntime({
      snapshot: () => this.snapshot(),
      startWorkflowRun: (input) => this.startWorkflowRun(input),
      finishWorkflowRun: (input) => this.finishWorkflowRun(input),
      updateWorkflowRunState: (input) => this.updateWorkflowRunState(input),
      runTask: (input) => this.runTask(input),
      stopTask: (taskId) => this.stopTask(taskId),
      deleteTask: (taskId) => this.deleteTask(taskId),
    });
    this.installRestoredConfiguredAgents([]);
    const chat = this.createChatState(this.defaultConfiguredAgentId());
    this.chats.set(chat.id, chat);
    this.activeChatId = chat.id;
  }

  async initialize(): Promise<void> {
    const runtimes = await detectAgentRuntimes();
    for (const runtime of runtimes) {
      this.runtimes.set(runtime.id, {
        ...runtime,
        command: runtime.command || this.executables[runtime.id],
      });
    }
    this.idleSweepTimer ??= setInterval(() => {
      void this.interactiveSessions.sweepExpiredSessions(Date.now());
    }, 30 * 60 * 1000);
    this.emit();
  }

  async loadPersistedState(storagePath: string): Promise<void> {
    this.storagePath = storagePath;
    const loaded = await loadPersistedPayloadValue({
      storagePath,
      sqliteStoreFactory: (dbPath) => new SqliteAppStore(dbPath),
      warn: (message, error) => console.warn(message, error),
    });
    this.sqliteStore = loaded.sqliteStore;

    if (loaded.payload !== undefined) {
      if (!this.restorePersistedState(loaded.payload)) {
        this.reinitializePersistedState();
      }
      if (!Array.isArray(asRecord(loaded.payload)?.channels) || !this.isPersistedAppStateV4(loaded.payload)) {
        await this.persistState();
      }
      return;
    }

    if (loaded.shouldBootstrapPersist) {
      await this.persistState();
    }
  }

  async loadModelChannels(configPath: string): Promise<void> {
    this.modelConfigPath = configPath;
    this.channels = await readModelChannels(configPath, this.executables.codex);
    this.normalizeRunSelections();
    this.installRestoredConfiguredAgents(this.listConfiguredAgents());
    this.emit();
  }

  async saveModelChannels(channels: AgentChannel[]): Promise<AppSnapshot> {
    const normalizedChannels = normalizeConfigChannelsForStorage(normalizeChannels(channels));
    if (this.storagePath) {
      this.channels = normalizedChannels;
    } else {
      const targetPath = this.modelConfigPath;
      if (!targetPath) throw new Error("Model channel config path is not initialized");
      this.channels = await writeModelChannels(targetPath, normalizedChannels);
    }
    this.normalizeRunSelections();
    this.installRestoredConfiguredAgents(this.listConfiguredAgents());
    this.emit();
    await this.flushPersistence();
    return this.snapshot();
  }

  async generateCodexConfigs(): Promise<GeneratedConfigFile[]> {
    return writeCodexConfigs(this.channels);
  }

  async importCodexConfigs(): Promise<ImportedCodexConfig[]> {
    return readCodexConfigs();
  }

  async loadCodexDefaultConfig(): Promise<CodexDefaultConfig> {
    return readCodexDefaultConfig();
  }

  async listCodexPluginCatalog(): Promise<CodexPluginCatalogItem[]> {
    const runtime = this.runtimes.get("codex");
    if (runtime && !runtime.available) {
      const detail = runtime.error?.trim();
      throw new Error(detail ? `Codex CLI unavailable: ${detail}` : "Codex CLI unavailable on this machine.");
    }
    const chat = this.createChatState(this.defaultConfiguredAgentIdForRuntime("codex"));
    return this.withCodexAppServer(chat, async (client) => {
      return codexPluginSummaries(await client.request("plugin/list", { cwds: [this.workDir] }));
    });
  }

  updateConfiguredAgents(agents: ConfiguredAgent[]): AppSnapshot {
    this.configuredAgents.clear();
    const now = Date.now();
    for (const input of agents) {
      const restored = this.restoreConfiguredAgent(input, now);
      if (restored) this.configuredAgents.set(restored.id, restored);
    }
    this.emit();
    return this.snapshot();
  }

  listConfiguredAgents(): ConfiguredAgent[] {
    return [...this.configuredAgents.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((agent) => ({ ...agent, tags: [...agent.tags] }));
  }

  private defaultConfiguredAgentId(): string {
    return this.configuredAgents.get("default-agent")?.id ?? this.configuredAgents.values().next().value?.id ?? "";
  }

  private defaultConfiguredAgentIdForRuntime(runtimeAgentId: AgentId): string {
    return this.listConfiguredAgents().find((agent) => agent.runtimeAgentId === runtimeAgentId)?.id ?? this.defaultConfiguredAgentId();
  }

  private configuredAgentOrDefault(configuredAgentId: string | undefined): ConfiguredAgent | undefined {
    const normalized = configuredAgentId?.trim();
    if (normalized) {
      const selected = this.configuredAgents.get(normalized);
      if (selected) return selected;
    }
    const fallbackId = this.defaultConfiguredAgentId();
    return fallbackId ? this.configuredAgents.get(fallbackId) : undefined;
  }

  private resolveConfiguredAgent(
    configuredAgentId: string | undefined,
    modelIdOverride?: string,
    channelIdOverride?: string,
  ): ResolvedConfiguredAgent | undefined {
    const agent = this.configuredAgentOrDefault(configuredAgentId);
    if (!agent) return undefined;
    const preferredChannel =
      channelIdOverride && this.channelById(channelIdOverride)?.agentId === agent.runtimeAgentId
        ? this.channelById(channelIdOverride)
        : this.channelById(agent.channelId);
    const channel =
      preferredChannel ??
      this.channels.find((item) => item.agentId === agent.runtimeAgentId) ??
      this.channels[0];
    if (!channel) return undefined;
    const runtimeAgentId = channel.agentId;
    const override = modelIdOverride?.trim();
    const modelId =
      override && isModelForChannel(runtimeAgentId, channel.id, override, this.channels)
        ? override
        : isModelForChannel(runtimeAgentId, channel.id, agent.modelId, this.channels)
          ? agent.modelId
          : defaultModelForAgent(runtimeAgentId);
    return {
      agent,
      runtimeAgentId,
      channel,
      modelId,
      runtime: this.runtimes.get(runtimeAgentId),
    };
  }

  private channelOrThrow(channelId: string): AgentChannel {
    const channel = this.channelById(channelId);
    if (!channel) throw new Error(`Channel ${channelId} was not found.`);
    return channel;
  }

  private runtimeForDriver(runtimeAgentId: AgentId): AgentRuntime {
    return (
      this.runtimes.get(runtimeAgentId) ?? {
        id: runtimeAgentId,
        label: agentLabel(runtimeAgentId),
        command: this.executables[runtimeAgentId],
        version: null,
        available: false,
      }
    );
  }

  private normalizeModelIdForConfiguredAgent(
    configuredAgentId: string | undefined,
    modelId: string | undefined,
    channelIdOverride?: string,
  ): string {
    return this.resolveConfiguredAgent(configuredAgentId, modelId, channelIdOverride)?.modelId ?? DEFAULT_MODEL_ID;
  }

  async testConfiguredAgent(agentId: string, onEvent?: (event: AgentTestEvent) => void): Promise<AgentTestResult> {
    const agent = this.configuredAgents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} was not found.`);
    const channel = this.channelById(agent.channelId);
    if (!channel) throw new Error(`Channel ${agent.channelId} was not found.`);
    if (channel.agentId !== agent.runtimeAgentId) {
      throw new Error(`Agent runtime ${agent.runtimeAgentId} does not match channel runtime ${channel.agentId}.`);
    }

    return runRuntimeChannelTestValue({
      agentId: agent.id,
      runtimeAgentId: agent.runtimeAgentId,
      channelId: channel.id,
      modelId: agent.modelId,
      phaseMessage: `Testing ${agent.name || agent.id} with ${agentLabel(agent.runtimeAgentId)} / ${channel.providerName ?? channel.label}.`,
      successLabel: agent.name || agent.id,
      testPrompt: AGENT_TEST_PROMPT,
      onEvent,
      runTest: (emit) =>
        this.runtimeRouter.testChannel(agent.runtimeAgentId, {
          runtime: this.runtimeForDriver(agent.runtimeAgentId),
          channelId: channel.id,
          modelId: agent.modelId,
          workDir: this.workDir,
          emit,
        }),
    });
  }

  async testRuntimeChannel(channelId: string, onEvent?: (event: AgentTestEvent) => void): Promise<AgentTestResult> {
    const channel = this.channelById(channelId);
    if (!channel) throw new Error(`Channel ${channelId} was not found.`);
    return runRuntimeChannelTestValue({
      agentId: channel.id,
      runtimeAgentId: channel.agentId,
      channelId: channel.id,
      modelId: DEFAULT_MODEL_ID,
      phaseMessage: `Testing ${agentLabel(channel.agentId)} / ${channel.providerName ?? channel.label}.`,
      successLabel: channel.label || channel.id,
      testPrompt: AGENT_TEST_PROMPT,
      onEvent,
      runTest: (emit) =>
        this.runtimeRouter.testChannel(channel.agentId, {
          runtime: this.runtimeForDriver(channel.agentId),
          channelId: channel.id,
          modelId: DEFAULT_MODEL_ID,
          workDir: this.workDir,
          emit,
        }),
    });
  }

  async queryRuntimeChannelBalance(channelId: string, options: ProviderBalanceQueryOptions = {}): Promise<ProviderBalanceResult> {
    const channel = this.channelById(channelId);
    if (!channel) throw new Error(`Channel ${channelId} was not found.`);
    return queryProviderBalance(channel, options);
  }

  async flushPersistence(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    await this.persistState();
  }

  async refreshAgents(): Promise<AppSnapshot> {
    const runtimes = await detectAgentRuntimes();
    for (const runtime of runtimes) {
      this.runtimes.set(runtime.id, runtime);
    }
    this.emit();
    return this.snapshot();
  }

  createChat(configuredAgentId = this.defaultConfiguredAgentId()): ChatSession {
    const chat = this.createChatState(configuredAgentId);
    this.chats.set(chat.id, chat);
    this.activeChatId = chat.id;
    this.emit();
    return serializeChat({ chat, cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation) });
  }

  selectChat(chatId: string): void {
    if (!this.chats.has(chatId)) return;
    this.activeChatId = chatId;
    this.emit();
  }

  async deleteChat(chatId: string): Promise<AppSnapshot> {
    const chat = this.chats.get(chatId);
    if (!chat) return this.snapshot();

    const stop = this.activeStops.get(chatId);
    this.activeStops.delete(chatId);
    this.chats.delete(chatId);
    if (this.activeChatId === chatId) {
      this.activeChatId = [...this.chats.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id;
    }
    if (this.chats.size === 0) {
      const replacement = this.createChatState(this.defaultConfiguredAgentId());
      this.chats.set(replacement.id, replacement);
      this.activeChatId = replacement.id;
    }
    this.emit();
    await this.flushPersistence();

    if (stop) {
      try {
        await stop();
      } catch {
        // The chat is already gone from app state; deletion should still succeed.
      }
    }
    await this.interactiveSessions.dispose(chatId, "app_shutdown");
    await this.deleteAgentSession(chat);

    return this.snapshot();
  }

  setChatAgent(chatId: string, configuredAgentId: string): void {
    const chat = this.chats.get(chatId);
    const configuredAgent = this.configuredAgentOrDefault(configuredAgentId);
    if (!configuredAgent) return;
    if (!chat) return;

    const before = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId, chat.channelId);
    const after = this.resolveConfiguredAgent(configuredAgent.id, configuredAgent.modelId, undefined);
    switchChatConfiguredAgentValue({
      chat,
      configuredAgentId: configuredAgent.id,
      configuredAgentLabel: configuredAgent.name || configuredAgent.id,
      configuredAgentModelId: configuredAgent.modelId,
      normalizeModelId: (nextConfiguredAgentId, modelId, channelIdOverride) =>
        this.normalizeModelIdForConfiguredAgent(nextConfiguredAgentId, modelId, channelIdOverride),
      hasAgentConversationMessages: (messages) => hasAgentConversationMessages(messages),
      currentRuntimeAgentId: before?.runtimeAgentId,
      nextRuntimeAgentId: after?.runtimeAgentId,
      onResetRuntimeSession: () => {
        this.appendEventToAssistant(chat, {
          id: randomUUID(),
          type: "system",
          content: "Runtime session reset after agent change.",
          timestamp: Date.now(),
        });
        void this.interactiveSessions.dispose(chat.id, "error");
      },
    });
    this.activeChatId = chatId;
    this.emit();
  }

  setChatModel(chatId: string, modelId: string): void {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const normalizedModelId = this.normalizeModelIdForConfiguredAgent(chat.configuredAgentId, modelId, chat.channelId);
    if (chat.modelId === normalizedModelId) return;
    chat.modelId = normalizedModelId;
    chat.updatedAt = Date.now();
    this.activeChatId = chatId;
    this.emit();
  }

  setChatChannel(chatId: string, channelId: string): void {
    const chat = this.chats.get(chatId);
    const configuredAgent = chat ? this.configuredAgentOrDefault(chat.configuredAgentId) : undefined;
    const channel = this.channelById(channelId);
    if (!chat || !configuredAgent || !channel || channel.agentId !== configuredAgent.runtimeAgentId) return;
    chat.channelId = channel.id;
    chat.modelId = this.normalizeModelIdForConfiguredAgent(chat.configuredAgentId, chat.modelId, chat.channelId);
    chat.updatedAt = Date.now();
    this.activeChatId = chatId;
    this.emit();
  }

  setWorkDir(workDir: string): void {
    this.workDir = workDir || process.cwd();
    this.emit();
  }

  clearHistory(): void {
    for (const stop of this.activeStops.values()) void stop();
    this.activeStops.clear();
    this.chats.clear();
    this.tasks.clear();
    this.teamRuns.clear();
    this.workflows.clear();
    this.activeWorkflowDraftRequests.clear();
    this.workflowRuns.clear();
    this.scheduledWorkflowSchedules.clear();
    this.scheduledWorkflowRuns.clear();
    this.activeWorkflowId = undefined;
    this.activeScheduledWorkflowId = undefined;
    const chat = this.createChatState(this.defaultConfiguredAgentId());
    this.chats.set(chat.id, chat);
    this.activeChatId = chat.id;
    this.activeTaskId = undefined;
    this.activeTeamRunId = undefined;
    this.emit();
  }

  updateWorkflowDraft(draft: WorkflowDraftState | undefined): AppSnapshot {
    if (!draft) {
      this.workflows.clear();
      this.activeWorkflowDraftRequests.clear();
      this.workflowRuns.clear();
      this.activeWorkflowId = undefined;
      this.emit();
      return this.snapshot();
    }
    const normalized = this.cloneWorkflowDraft(draft);
    this.workflows.set(normalized.workflowId, normalized);
    this.activeWorkflowId = normalized.workflowId;
    this.emit();
    return this.snapshot();
  }

  createWorkflowDraft(input: CreateWorkflowDraftRequest = {}): AppSnapshot {
    if (this.workflows.size >= MAX_WORKFLOW_COUNT) return this.snapshot();
    const now = Date.now();
    const graph = createWorkflowGraphFromObjective("");
    const workflow = this.cloneWorkflowDraft({
      workflowId: `wf_${randomUUID()}`,
      title: input.title?.trim() || graph.title,
      status: "draft",
      revision: 1,
      configuredAgentId: this.normalizeWorkflowConfiguredAgentId(input.configuredAgentId),
      modelId: this.normalizeModelIdForConfiguredAgent(input.configuredAgentId, input.modelId),
      objective: "",
      graph,
      graphReady: false,
      messages: [],
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      createdAt: now,
      updatedAt: now,
    });
    this.workflows.set(workflow.workflowId, workflow);
    this.activeWorkflowId = workflow.workflowId;
    this.emit();
    return this.snapshot();
  }

  patchWorkflowDraft(input: PatchWorkflowDraftRequest): AppSnapshot {
    const current = this.workflows.get(input.workflowId);
    if (!current) return this.snapshot();
    const next = this.applyWorkflowDraftPatch(current, input);
    this.workflows.set(next.workflowId, next);
    this.activeWorkflowId = next.workflowId;
    this.emit();
    return this.snapshot();
  }

  resetWorkflowDraftSession(workflowId: string): AppSnapshot {
    const current = this.workflows.get(workflowId);
    if (!current) return this.snapshot();
    this.activeWorkflowDraftRequests.delete(workflowId);
    const next = resetWorkflowDraftSessionStateValue({
      workflow: current,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflows.set(next.workflowId, next);
    this.activeWorkflowId = next.workflowId;
    this.emit();
    return this.snapshot();
  }

  async sendWorkflowDraftReply(input: SendWorkflowDraftReplyRequest): Promise<AppSnapshot> {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) return this.snapshot();
    const text = input.reply.trim();
    if (!text) return this.snapshot();
    const activeRequest = this.activeWorkflowDraftRequests.get(workflow.workflowId);
    if (activeRequest) return this.snapshot();

    const started = beginWorkflowDraftReplyValue({
      workflow,
      reply: text,
      thinkingMessage: WORKFLOW_THINKING_MESSAGE,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflows.set(started.next.workflowId, started.next);
    this.activeWorkflowId = started.next.workflowId;
    this.activeWorkflowDraftRequests.set(started.next.workflowId, started.request);
    this.emit();

    try {
      const response = await this.askWorkflowAgent(
        createWorkflowDraftAgentRequestValue({
          started,
          reply: text,
          defaultRuntimeId: DEFAULT_AGENT,
          resolveRuntimeId: (configuredAgentId, modelId) =>
            this.resolveConfiguredAgent(configuredAgentId, modelId)?.runtimeAgentId,
          defaultWorkDir: this.workDir,
        }),
        (event) => this.handleWorkflowDraftAgentEvent(started.next.workflowId, event),
      );
      this.completeWorkflowDraftRequest(started.next.workflowId, started.request.requestId, response.content, response.runtimeConversation);
    } catch (error) {
      this.failWorkflowDraftRequest(
        started.next.workflowId,
        started.request.requestId,
        error instanceof Error ? error.message : String(error),
      );
    }

    return this.snapshot();
  }

  abandonWorkflowDraftReply(workflowId: string): AppSnapshot {
    const request = this.activeWorkflowDraftRequests.get(workflowId);
    const workflow = this.workflows.get(workflowId);
    if (!request || !workflow) return this.snapshot();
    this.activeWorkflowDraftRequests.delete(workflowId);
    const next = abandonWorkflowDraftReplyStateValue({
      workflow,
      activeRequest: request,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflows.set(next.workflowId, next);
    if (this.activeWorkflowId === next.workflowId) this.activeWorkflowId = next.workflowId;
    this.emit();
    return this.snapshot();
  }

  createWorkflow(input: CreateWorkflowRequest): WorkflowOperationResult {
    if (this.workflows.size >= MAX_WORKFLOW_COUNT) return { ok: false, error: `Workflow count exceeds ${MAX_WORKFLOW_COUNT}.` };
    const limitError = this.workflowLimitError(input.graph, input.title, input.objective);
    if (limitError) return { ok: false, error: limitError };
    const validation = validateWorkflowGraph(input.graph);
    if (!validation.valid) return { ok: false, error: validation.errors[0] ?? "Workflow graph is invalid.", validation };
    const workflowId = `wf_${randomUUID()}`;
    const workflow = createWorkflowDraftStateValue({
      workflowId,
      request: input,
      configuredAgentId: this.normalizeWorkflowConfiguredAgentId(input.configuredAgentId),
      modelId: this.normalizeModelIdForConfiguredAgent(input.configuredAgentId, input.modelId),
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflows.set(workflow.workflowId, workflow);
    this.activeWorkflowId = workflow.workflowId;
    this.emit();
    return { ok: true, workflowId: workflow.workflowId, revision: workflow.revision, validation };
  }

  /**
   * Seed git-bundled workflow definitions into the store. Idempotent by fixed
   * workflowId: existing workflows (including user-edited copies) are left alone.
   */
  ensureBundledWorkflows(defs: Array<{ workflowId: string; title: string; objective: string; graph: WorkflowGraph }>): void {
    let changed = false;
    for (const def of defs) {
      if (!def.workflowId || this.workflows.has(def.workflowId)) continue;
      const now = Date.now();
      const workflow = this.cloneWorkflowDraft({
        workflowId: def.workflowId,
        title: def.title,
        status: "draft",
        revision: 1,
        configuredAgentId: "",
        modelId: "",
        objective: def.objective,
        graph: def.graph,
        graphReady: true,
        messages: [],
        reply: "",
        error: undefined,
        runProgress: [],
        runContextDocument: "",
        contextDocument: "",
        runIds: [],
        createdAt: now,
        updatedAt: now,
      });
      this.workflows.set(workflow.workflowId, workflow);
      if (!this.activeWorkflowId) this.activeWorkflowId = workflow.workflowId;
      changed = true;
    }
    if (changed) this.emit();
  }

  selectWorkflow(workflowId: string): AppSnapshot {
    if (this.workflows.has(workflowId)) {
      this.activeWorkflowId = workflowId;
      this.emit();
    }
    return this.snapshot();
  }

  renameWorkflow(workflowId: string, title: string): AppSnapshot {
    const workflow = this.workflows.get(workflowId);
    const nextTitle = title.trim();
    if (!workflow || !nextTitle) return this.snapshot();
    this.workflows.set(workflowId, this.cloneWorkflowDraft({
      ...workflow,
      title: nextTitle,
      revision: workflow.revision + 1,
      updatedAt: Date.now(),
    }));
    this.emit();
    return this.snapshot();
  }

  deleteWorkflow(workflowId: string): AppSnapshot {
    if (!this.workflows.has(workflowId)) return this.snapshot();
    this.workflows.delete(workflowId);
    this.activeWorkflowDraftRequests.delete(workflowId);
    for (const run of [...this.workflowRuns.values()]) {
      if (run.workflowId === workflowId) this.workflowRuns.delete(run.runId);
    }
    if (this.activeWorkflowId === workflowId || (this.activeWorkflowId && !this.workflows.has(this.activeWorkflowId))) {
      this.activeWorkflowId = [...this.workflows.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.workflowId;
    }
    this.emit();
    return this.snapshot();
  }

  updateWorkflow(input: UpdateWorkflowRequest): WorkflowOperationResult {
    const current = this.workflows.get(input.workflowId);
    if (!current) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (current.status === "running") return { ok: false, error: "Cannot modify workflow graph while it is running." };
    if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) {
      return { ok: false, workflowId: current.workflowId, revision: current.revision, error: "Workflow changed since you read it. Call workflow_get and retry." };
    }
    const graph = input.graph ?? current.graph;
    const limitError = this.workflowLimitError(graph, input.title ?? current.title, input.objective ?? current.objective);
    if (limitError) return { ok: false, workflowId: current.workflowId, revision: current.revision, error: limitError };
    const validation = validateWorkflowGraph(graph);
    if (!validation.valid) return { ok: false, workflowId: current.workflowId, revision: current.revision, error: validation.errors[0] ?? "Workflow graph is invalid.", validation };
    const next = updateWorkflowDraftStateValue({
      current,
      request: input,
      graph,
      configuredAgentId:
        input.configuredAgentId !== undefined ? this.normalizeWorkflowConfiguredAgentId(input.configuredAgentId) : current.configuredAgentId,
      modelId:
        input.configuredAgentId !== undefined || input.modelId !== undefined
          ? this.normalizeModelIdForConfiguredAgent(input.configuredAgentId ?? current.configuredAgentId, input.modelId ?? current.modelId)
          : current.modelId,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflows.set(next.workflowId, next);
    this.emit();
    return { ok: true, workflowId: next.workflowId, revision: next.revision, validation };
  }

  appendWorkflowContext(input: AppendWorkflowContextRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    const limitError = this.contextAppendLimitError(input);
    if (limitError) return { ok: false, workflowId: workflow.workflowId, revision: workflow.revision, error: limitError };
    const appended = this.formatWorkflowContextAppend(input.report, input.handoff, input.artifacts);
    const next = this.cloneWorkflowDraft({
      ...workflow,
      contextDocument: [workflow.contextDocument.trim(), appended].filter(Boolean).join("\n\n"),
      revision: workflow.revision + 1,
      updatedAt: Date.now(),
    });
    this.workflows.set(next.workflowId, next);
    this.emit();
    return { ok: true, workflowId: next.workflowId, revision: next.revision };
  }

  appendWorkflowRunContext(input: AppendWorkflowRunContextRequest): WorkflowOperationResult {
    const run = this.workflowRuns.get(input.runId);
    if (!run || run.workflowId !== input.workflowId) return { ok: false, error: `Workflow run ${input.runId} was not found.` };
    if (run.status !== "running") return { ok: false, error: "Cannot append to a workflow run after it has finished." };
    const limitError = this.contextAppendLimitError(input);
    if (limitError) return { ok: false, workflowId: input.workflowId, error: limitError };
    const appended = this.formatWorkflowContextAppend(input.report, input.handoff, input.artifacts, input.nodeId);
    this.workflowRuns.set(run.runId, {
      ...run,
      contextDocument: [run.contextDocument.trim(), appended].filter(Boolean).join("\n\n"),
    });
    this.emit();
    return { ok: true, workflowId: input.workflowId };
  }

  startWorkflowRun(input: StartWorkflowRunRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (workflow.status === "running") return { ok: false, error: "Workflow is already running." };
    this.activeWorkflowDraftRequests.delete(workflow.workflowId);
    const runId = `run_${randomUUID()}`;
    const next = startWorkflowRunStateValue({
      workflow,
      request: input,
      runId,
      cloneGraph: (graph) => this.cloneWorkflowGraph(graph),
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflowRuns.set(runId, next.nextRun);
    this.workflows.set(workflow.workflowId, next.nextWorkflow);
    this.emit();
    return { ok: true, workflowId: workflow.workflowId, runId, revision: workflow.revision };
  }

  finishWorkflowRun(input: FinishWorkflowRunRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    const run = this.workflowRuns.get(input.runId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run || run.workflowId !== input.workflowId) return { ok: false, error: `Workflow run ${input.runId} was not found.` };
    const next = finishWorkflowRunStateValue({
      workflow,
      run,
      request: input,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflowRuns.set(run.runId, next.nextRun);
    this.workflows.set(workflow.workflowId, next.nextWorkflow);
    this.emit();
    return { ok: true, workflowId: workflow.workflowId, runId: run.runId, revision: workflow.revision };
  }

  runWorkflowGraph(input: RunWorkflowGraphRequest): WorkflowOperationResult {
    const result = this.workflowRuntime.runWorkflowGraph(input);
    if (!result.ok && result.error) {
      const workflow = this.workflows.get(input.workflowId);
      if (workflow) {
        this.workflows.set(workflow.workflowId, this.cloneWorkflowDraft({
          ...workflow,
          error: result.error,
          updatedAt: Date.now(),
        }));
        this.emit();
      }
    }
    return result;
  }

  pauseWorkflowNode(input: PauseWorkflowNodeRequest): Promise<WorkflowOperationResult> {
    return this.workflowRuntime.pauseWorkflowNode(input);
  }

  startWorkflowNode(input: StartWorkflowNodeRequest): Promise<WorkflowOperationResult> {
    return this.workflowRuntime.startWorkflowNode(input);
  }

  answerWorkflowGate(input: AnswerWorkflowGateRequest): Promise<WorkflowOperationResult> {
    return this.workflowRuntime.answerWorkflowGate(input);
  }

  async runScheduledWorkflowEvent(
    event: ScheduledWorkflowDueEvent,
    ackEvent: (eventId: string, request: AckScheduledWorkflowEventRequest) => Promise<void>,
  ): Promise<void> {
    const target = scheduledWorkflowEventTargetValue(event);
    await runScheduledWorkflowEventValue({
      event,
      ackEvent,
      target,
      workflow: target ? this.workflows.get(target.workflowId) : undefined,
      runId: `scheduled_run_${event.eventId}`,
      recordScheduledWorkflowRun: (run) => {
        this.recordScheduledWorkflowRun(run);
      },
      runWorkflowGraph: (request) => this.runWorkflowGraph(request),
      finishScheduledWorkflowRun: (runId, request) => {
        this.finishScheduledWorkflowRun(runId, request);
      },
      waitForWorkflowRunToSettle: (runId) => this.waitForWorkflowRunToSettle(runId),
    });
  }

  private updateWorkflowRunState(input: WorkflowRunStateUpdate): void {
    const workflow = this.workflows.get(input.workflowId);
    const run = this.workflowRuns.get(input.runId);
    if (!workflow || !run || run.workflowId !== input.workflowId) return;
    const next = updateWorkflowRunStateValue({
      workflow,
      run,
      update: input,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflowRuns.set(run.runId, next.nextRun);
    this.workflows.set(workflow.workflowId, next.nextWorkflow);
    this.emit();
  }

  saveScheduledWorkflowRunnerConfig(config: ScheduledWorkflowRunnerConfig): AppSnapshot {
    this.scheduledWorkflowRunnerConfig = this.cloneScheduledWorkflowRunnerConfig(config);
    this.emit();
    return this.snapshot();
  }

  updateScheduledWorkflowRunnerStatus(status: Partial<ScheduledWorkflowRunnerStatus>): AppSnapshot {
    this.scheduledWorkflowRunnerStatus = {
      ...this.scheduledWorkflowRunnerStatus,
      ...status,
    };
    this.emit();
    return this.snapshot();
  }

  selectScheduledWorkflow(scheduleId: string): AppSnapshot {
    if (this.scheduledWorkflowSchedules.has(scheduleId)) {
      this.activeScheduledWorkflowId = scheduleId;
      this.emit();
    }
    return this.snapshot();
  }

  upsertScheduledWorkflowSchedule(input: ScheduledWorkflowSchedule): ScheduledWorkflowOperationResult {
    if (!this.workflows.has(input.workflowId)) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    const now = Date.now();
    const current = this.scheduledWorkflowSchedules.get(input.scheduleId);
    const schedule = this.cloneScheduledWorkflowSchedule({
      ...input,
      scheduleId: input.scheduleId || `sched_${randomUUID()}`,
      title: input.title.trim() || this.workflows.get(input.workflowId)?.title || "Scheduled workflow",
      intervalSeconds: Math.max(60, Math.floor(input.intervalSeconds || current?.intervalSeconds || 3600)),
      frequency: input.frequency ?? current?.frequency ?? "daily",
      timeOfDay: input.timeOfDay ?? current?.timeOfDay ?? DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY,
      timezone: input.timezone ?? current?.timezone ?? DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
      ...(input.weekdays !== undefined || current?.weekdays !== undefined ? { weekdays: input.weekdays ?? current?.weekdays } : {}),
      ...(input.dayOfMonth !== undefined || current?.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth ?? current?.dayOfMonth } : {}),
      source: input.source ?? current?.source ?? "cloud",
      createdAt: input.createdAt || current?.createdAt || now,
      updatedAt: input.updatedAt || now,
    });
    this.scheduledWorkflowSchedules.set(schedule.scheduleId, schedule);
    this.activeScheduledWorkflowId = schedule.scheduleId;
    this.emit();
    return { ok: true, scheduleId: schedule.scheduleId };
  }

  replaceScheduledWorkflowSchedules(schedules: ScheduledWorkflowSchedule[]): AppSnapshot {
    const nextSchedules = new Map<string, ScheduledWorkflowSchedule>();
    for (const schedule of schedules) {
      if (!this.workflows.has(schedule.workflowId)) continue;
      const normalized = this.cloneScheduledWorkflowSchedule(schedule);
      nextSchedules.set(normalized.scheduleId, normalized);
    }
    this.scheduledWorkflowSchedules = nextSchedules;
    if (this.activeScheduledWorkflowId && !this.scheduledWorkflowSchedules.has(this.activeScheduledWorkflowId)) {
      this.activeScheduledWorkflowId = undefined;
    }
    this.activeScheduledWorkflowId ??= [...this.scheduledWorkflowSchedules.values()].sort((left, right) => right.createdAt - left.createdAt)[0]?.scheduleId;
    this.emit();
    return this.snapshot();
  }

  deleteScheduledWorkflowSchedule(scheduleId: string): AppSnapshot {
    if (!this.scheduledWorkflowSchedules.has(scheduleId)) return this.snapshot();
    this.scheduledWorkflowSchedules.delete(scheduleId);
    if (this.activeScheduledWorkflowId === scheduleId || (this.activeScheduledWorkflowId && !this.scheduledWorkflowSchedules.has(this.activeScheduledWorkflowId))) {
      this.activeScheduledWorkflowId = [...this.scheduledWorkflowSchedules.values()].sort((left, right) => right.createdAt - left.createdAt)[0]?.scheduleId;
    }
    this.emit();
    return this.snapshot();
  }

  recordScheduledWorkflowRun(input: ScheduledWorkflowRun): AppSnapshot {
    const now = Date.now();
    const schedule = this.scheduledWorkflowSchedules.get(input.scheduleId);
    if (!this.workflows.has(input.workflowId)) return this.snapshot();
    const run = this.cloneScheduledWorkflowRun({
      ...input,
      runId: input.runId || `scheduled_run_${randomUUID()}`,
      title: input.title.trim() || schedule?.title || this.workflows.get(input.workflowId)?.title || "Scheduled workflow",
      status: input.status || "running",
      startedAt: input.startedAt || now,
      finishedAt: input.finishedAt,
    });
    this.scheduledWorkflowRuns.set(run.runId, run);
    this.activeScheduledWorkflowId = run.scheduleId;
    this.emit();
    return this.snapshot();
  }

  finishScheduledWorkflowRun(
    runId: string,
    input: {
      status: Exclude<ScheduledWorkflowRunStatus, "queued" | "running">;
      workflowRunId?: string;
      message?: string;
      finishedAt?: number;
    },
  ): AppSnapshot {
    const run = this.scheduledWorkflowRuns.get(runId);
    if (!run) return this.snapshot();
    this.scheduledWorkflowRuns.set(runId, this.cloneScheduledWorkflowRun({
      ...run,
      status: input.status,
      ...(input.workflowRunId !== undefined ? { workflowRunId: input.workflowRunId } : {}),
      ...(input.message !== undefined ? { message: input.message } : {}),
      finishedAt: input.finishedAt ?? Date.now(),
    }));
    this.emit();
    return this.snapshot();
  }

  getWorkDir(): string {
    return this.workDir;
  }

  snapshot(): AppSnapshot {
    return {
      detectedAt: Date.now(),
      activeChatId: this.activeChatId,
      activeTaskId: this.activeTaskId,
      activeTeamId: this.activeTeamId,
      activeTeamRunId: this.activeTeamRunId,
      workDir: this.workDir,
      runtimes: [...this.runtimes.values()],
      channels: cloneChannels(this.channels),
      configuredAgents: this.listConfiguredAgents(),
      chats: [...this.chats.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((chat) => serializeChat({ chat, cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation) })),
      tasks: [...this.tasks.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((task) => serializeTask({ task, cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation) })),
      teams: [...this.teams.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((team) => serializeTeam(team)),
      teamRuns: [...this.teamRuns.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((run) => serializeTeamRun(run)),
      workflowStore: this.cloneWorkflowStore(),
      scheduledWorkflowStore: this.cloneScheduledWorkflowStore(),
      workflowDraft: this.activeWorkflowDraft(),
      artifacts: this.artifacts.map((artifact) => ({ ...artifact })),
    };
  }

  async registerArtifact(input: RegisterArtifactRequest): Promise<{ ok: boolean; error?: string; artifact?: RegisteredArtifact }> {
    const target = typeof input.target === "string" ? input.target.trim() : "";
    if (!target) return { ok: false, error: "artifacts_register requires a target session id." };

    const artifact: RegisteredArtifact = {
      id: `artifact_${randomUUID()}`,
      target,
      kind: "text",
      title: "",
      registeredAt: Date.now(),
    };
    if (typeof input.description === "string" && input.description.trim()) artifact.description = input.description.trim();

    if (typeof input.path === "string" && input.path.trim()) {
      let absolutePath: string;
      try {
        absolutePath = await resolveWorkDirFile(input.path, this.workDir, os.homedir());
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      artifact.kind = "file";
      artifact.path = absolutePath;
      artifact.title = (typeof input.title === "string" && input.title.trim()) || path.basename(absolutePath);
    } else if (typeof input.url === "string" && input.url.trim()) {
      artifact.kind = "url";
      artifact.url = input.url.trim();
      artifact.title = (typeof input.title === "string" && input.title.trim()) || input.url.trim();
    } else if (typeof input.content === "string" && input.content.length > 0) {
      artifact.kind = "text";
      artifact.content = input.content;
      artifact.title = (typeof input.title === "string" && input.title.trim()) || "Note";
    } else {
      return { ok: false, error: "artifacts_register requires one of path, url, or content." };
    }

    this.artifacts.push(artifact);
    this.emit();
    return { ok: true, artifact };
  }

  async listWorkflowOutputs(workflowId: string): Promise<Array<{ name: string; path: string }>> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return [];
    const workDir = workflow.workDir || this.workDir;
    const outputsDir = path.join(workDir, "outputs");
    let entries: Dirent[];
    try {
      entries = await readdir(outputsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => ({ name: entry.name, path: path.join(outputsDir, entry.name) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  workflowWorkDir(workflowId: string): string | undefined {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return undefined;
    return workflow.workDir || this.workDir;
  }

  /** Directories from which local files may be previewed: global + each workflow's dir. */
  allowedFileRoots(): string[] {
    const roots = [this.workDir];
    for (const workflow of this.workflows.values()) {
      roots.push(workflow.workDir || this.workDir);
    }
    return roots;
  }

  listArtifacts(target?: string): RegisteredArtifact[] {
    const filtered = target ? this.artifacts.filter((artifact) => artifact.target === target) : this.artifacts;
    return filtered.map((artifact) => ({ ...artifact }));
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private runtimeStateFromCapabilities(capabilities: RuntimeCapabilities): ChatRuntimeSessionState {
    return runtimeStateFromCapabilitiesValue(capabilities);
  }

  private syncInteractiveChatState(chat: ChatState, state: InteractiveSessionSnapshot): void {
    syncInteractiveChatStateValue({
      chat,
      state,
      cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
    });
    this.emit();
  }

  private supportsContinuationPolicy(
    runtimeId: AgentId,
    surface: RuntimeSurface,
    executionMode: RuntimeExecutionMode,
    continuationPolicy: RuntimeContinuationPolicy,
  ): boolean {
    const driver = this.runtimeDrivers.maybeDriverFor(runtimeId);
    if (!driver) return false;
    const support = driver?.surfaceSupport.find((item) => item.surface === surface);
    if (!support) return false;
    if (!support.executionModes.includes(executionMode)) return false;
    if (!support.continuationPolicies.includes(continuationPolicy)) return false;
    if (continuationPolicy !== "fresh" && !driver.runtimeStateCodec) return false;
    return true;
  }

  private surfaceSupportFor(runtimeId: AgentId, surface: RuntimeSurface) {
    return this.runtimeDrivers.maybeDriverFor(runtimeId)?.surfaceSupport.find((item) => item.surface === surface);
  }

  private selectExecutionMode(
    runtimeId: AgentId,
    surface: RuntimeSurface,
    preferred: RuntimeExecutionMode,
  ): RuntimeExecutionMode {
    const support = this.surfaceSupportFor(runtimeId, surface);
    if (!support) return "oneshot";
    if (support.executionModes.length === 0) return "oneshot";
    if (support.executionModes.includes(preferred)) return preferred;
    if (preferred !== "oneshot" && support.executionModes.includes("oneshot")) return "oneshot";
    if (preferred !== "interactive" && support.executionModes.includes("interactive")) return "interactive";
    return "oneshot";
  }

  private defaultContinuationPolicy(
    runtimeId: AgentId,
    surface: RuntimeSurface,
    executionMode: RuntimeExecutionMode,
  ): RuntimeContinuationPolicy {
    if (surface === "chat") {
      for (const policy of ["resume-preferred", "fresh", "resume-required"] as const) {
        if (this.supportsContinuationPolicy(runtimeId, surface, executionMode, policy)) {
          return policy;
        }
      }
    }
    return "fresh";
  }

  private cloneConversationForPolicy(
    continuationPolicy: RuntimeContinuationPolicy,
    runtimeConversation: RuntimeConversation | undefined,
  ): RuntimeConversation | undefined {
    if (!runtimeConversation || continuationPolicy === "fresh") return undefined;
    return this.runtimeRouter.cloneConversation(runtimeConversation);
  }

  private buildInteractiveChatContext(chat: ChatState, resolved: ResolvedConfiguredAgent): InteractiveSessionContext {
    return buildInteractiveChatContextValue({
      chat,
      resolved,
      workDir: this.runWorkDir(chat),
      developerInstructions: CODEX_CHAT_DEVELOPER_INSTRUCTIONS,
      selectExecutionMode: (runtimeId, surface, preferred) => this.selectExecutionMode(runtimeId, surface, preferred),
      defaultContinuationPolicy: (runtimeId, surface, executionMode) =>
        this.defaultContinuationPolicy(runtimeId, surface, executionMode),
      cloneConversationForPolicy: (continuationPolicy, runtimeConversation) =>
        this.cloneConversationForPolicy(continuationPolicy, runtimeConversation),
      emit: (event) => this.handleAgentEvent(chat, event),
      syncState: (state) => this.syncInteractiveChatState(chat, state),
    });
  }

  async sendPrompt(prompt: string, chatId = this.activeChatId): Promise<void> {
    if (!chatId) return;
    const chat = this.chats.get(chatId);
    if (!chat || chat.running) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

    if (trimmedPrompt.startsWith("/")) {
      await this.handleSlashCommand(chat, trimmedPrompt);
      return;
    }

    const resolved = this.resolveConfiguredAgent(chat.configuredAgentId, chat.modelId, chat.channelId);
    const supportsInteractiveChat =
      resolved ? this.selectExecutionMode(resolved.runtimeAgentId, "chat", "interactive") === "interactive" : false;
    const capabilities =
      resolved?.runtime && supportsInteractiveChat ? this.runtimeRouter.capabilitiesFor(resolved.runtime) : undefined;
    const preparedResolved = prepareChatPromptExecutionValue({
      chat,
      prompt: trimmedPrompt,
      resolved,
      capabilities,
      hasAgentConversationMessages: (messages) => hasAgentConversationMessages(messages),
      titleFromPrompt: (currentPrompt) => titleFromPrompt(currentPrompt),
      createUserMessage: (content) => createUserMessage(content),
      createErrorMessage: (content) => createErrorMessage(content),
      createRuntimeState: (runtimeCapabilities) => this.runtimeStateFromCapabilities(runtimeCapabilities),
    });
    if (!preparedResolved) {
      this.emit();
      return;
    }
    this.activeChatId = chat.id;
    this.emit();

    if (supportsInteractiveChat) {
      await dispatchInteractiveChatPromptValue({
        chat,
        prompt: trimmedPrompt,
        interactiveSessions: this.interactiveSessions,
        buildContext: () => this.buildInteractiveChatContext(chat, preparedResolved),
        syncInteractiveChatState: (currentChat, state) => this.syncInteractiveChatState(currentChat, state),
        registerStop: (stop) => {
          this.activeStops.set(chat.id, stop);
        },
        markRunFailed: (currentChat, error) => this.markRunFailed(currentChat, error),
      });
      return;
    }

    void this.runChat(chat, trimmedPrompt, preparedResolved);
  }

  private async handleSlashCommand(chat: ChatState, prompt: string): Promise<void> {
    chat.messages.push(createUserMessage(prompt, true));
    chat.lastError = undefined;
    chat.updatedAt = Date.now();
    this.activeChatId = chat.id;
    this.emit();

    const content = await this.runSlashCommand(chat, prompt);
    chat.messages.push(createAssistantMessage(content, true));
    chat.updatedAt = Date.now();
    this.emit();
  }

  private async runSlashCommand(chat: ChatState, prompt: string): Promise<string> {
    return runSlashCommandValue({
      chat,
      prompt,
      executable: this.executables.codex,
      workDir: this.workDir,
      resolveConfiguredAgent: (configuredAgentId, modelIdOverride, channelIdOverride) =>
        this.resolveConfiguredAgentForSlash(configuredAgentId, modelIdOverride, channelIdOverride),
    });
  }

  private async withCodexAppServer<T>(chat: ChatState, callback: (client: CodexRpcClient) => Promise<T>): Promise<T> {
    return withCodexAppServerValue({
      chat,
      executable: this.executables.codex,
      workDir: this.workDir,
      resolved: this.resolveConfiguredAgentForSlash(chat.configuredAgentId, chat.modelId, chat.channelId),
      callback,
    });
  }

  private resolveConfiguredAgentForSlash(
    configuredAgentId: string | undefined,
    modelIdOverride?: string,
    channelIdOverride?: string,
  ): ResolvedConfiguredAgentForSlash | undefined {
    const resolved = this.resolveConfiguredAgent(configuredAgentId, modelIdOverride, channelIdOverride);
    if (!resolved) return undefined;
    return resolved;
  }

  async runTask(input: RunTaskRequest): Promise<AppSnapshot> {
    const task = this.createTaskState(input);
    this.tasks.set(task.id, task);
    this.activeTaskId = task.id;

    const preparedResolved = resolveTaskPromptExecutionValue({
      task,
      resolveConfiguredAgent: (configuredAgentId, modelId) => this.resolveConfiguredAgent(configuredAgentId, modelId),
      createUserMessage: (content) => createUserMessage(content),
      createErrorMessage: (content) => createErrorMessage(content),
    });
    if (!preparedResolved) {
      this.emit();
      return this.snapshot();
    }

    this.emit();
    void this.runChat(task, task.prompt, preparedResolved);
    return this.snapshot();
  }

  async askWorkflowAgent(input: WorkflowAgentRequest, onEvent?: (event: WorkflowAgentEvent) => void): Promise<WorkflowAgentResponse> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("Workflow agent prompt is required");
    const resolved = this.resolveConfiguredAgent(input.configuredAgentId, input.runtimeConfig.model);
    if (!resolved) throw new Error("No configured agent is selected.");
    if (resolved.runtimeAgentId !== input.runtimeId) {
      throw new Error(`Configured agent ${resolved.agent.id} does not match runtime ${input.runtimeId}.`);
    }
    const runtime = resolved.runtime;
    if (!runtime?.available) throw new Error(`${resolved.agent.name || resolved.agent.id} is not available on this machine.`);
    const channelId = resolved.channel.id;
    const workDir = input.workDir?.trim() || this.workDir;
    const runtimeConversation = this.cloneConversationForPolicy(input.continuationPolicy, input.runtimeConversation);

    const requestId = input.requestId ?? randomUUID();
    return this.runtimeRouter.askWorkflow({
      requestId,
      runtimeId: input.runtimeId,
      executionMode: input.executionMode,
      continuationPolicy: input.continuationPolicy,
      runtimeConfig: input.runtimeConfig,
      ...(runtimeConversation ? { runtimeConversation } : {}),
      prompt,
      runtime,
      channelId,
      workDir,
      onEvent,
    });
  }

  async stopChat(chatId: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const stop = this.activeStops.get(chatId);
    this.activeStops.delete(chatId);
    if (stop) await stop();
    chat.running = false;
    if (chat.runtimeState) {
      chat.runtimeState.attachmentState = "interrupted";
      chat.runtimeState.lastMeaningfulActivityAt = Date.now();
      delete chat.runtimeState.activeTurnId;
    }
    chat.messages = this.expirePendingInteractionEvents(chat.messages);
    chat.messages.push(createErrorMessage("Stopped"));
    chat.updatedAt = Date.now();
    this.emit();
  }

  selectTask(taskId: string): void {
    if (!this.tasks.has(taskId)) return;
    this.activeTaskId = taskId;
    this.emit();
  }

  async stopTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const stop = this.activeStops.get(taskId);
    this.activeStops.delete(taskId);
    if (stop) await stop();
    task.running = false;
    task.status = "stopped";
    task.lastError = "Stopped";
    task.messages.push(createErrorMessage("Stopped"));
    task.updatedAt = Date.now();
    this.finishTeamStepFromTask(task);
    this.emit();
  }

  updateTaskProgress(taskId: string, progress: TaskProgress): AppSnapshot {
    const task = this.tasks.get(taskId);
    if (!task || !isTaskProgress(progress)) return this.snapshot();
    task.progress = progress;
    task.updatedAt = Date.now();
    this.activeTaskId = task.id;
    this.emit();
    return this.snapshot();
  }

  async deleteTask(taskId: string): Promise<AppSnapshot> {
    const task = this.tasks.get(taskId);
    if (!task) return this.snapshot();

    const stop = this.activeStops.get(taskId);
    this.activeStops.delete(taskId);
    this.tasks.delete(taskId);
    if (this.activeTaskId === taskId) {
      this.activeTaskId = [...this.tasks.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id;
    }
    this.emit();
    await this.flushPersistence();

    if (stop) {
      try {
        await stop();
      } catch {
        // The task is already gone from app state; deletion should still succeed.
      }
    }
    await this.deleteAgentSession(task);

    return this.snapshot();
  }

  createTeam(input: CreateAgentTeamRequest): AppSnapshot {
    const team = this.createTeamState(input);
    this.teams.set(team.id, team);
    this.activeTeamId = team.id;
    this.emit();
    return this.snapshot();
  }

  updateTeam(teamId: string, input: UpdateAgentTeamRequest): AppSnapshot {
    const team = this.teams.get(teamId);
    if (!team) return this.snapshot();

    const name = input.name?.trim();
    if (name) team.name = name;
    if (isAgentTeamMode(input.mode)) team.mode = input.mode;
    if (typeof input.sharedContext === "string") team.sharedContext = input.sharedContext;
    if (input.members) team.members = this.normalizeTeamMembers(input.members);
    team.updatedAt = Date.now();
    this.activeTeamId = team.id;
    this.emit();
    return this.snapshot();
  }

  deleteTeam(teamId: string): AppSnapshot {
    const team = this.teams.get(teamId);
    if (!team) return this.snapshot();

    for (const run of this.teamRuns.values()) {
      if (run.teamId === teamId && run.status === "running") void this.stopTeamRun(run.id);
    }
    this.teams.delete(teamId);
    for (const run of [...this.teamRuns.values()]) {
      if (run.teamId === teamId) this.teamRuns.delete(run.id);
    }
    if (this.activeTeamId === teamId) {
      this.activeTeamId = [...this.teams.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id;
    }
    if (this.activeTeamRunId && !this.teamRuns.has(this.activeTeamRunId)) {
      this.activeTeamRunId = [...this.teamRuns.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.id;
    }
    this.emit();
    return this.snapshot();
  }

  selectTeam(teamId: string): AppSnapshot {
    if (!this.teams.has(teamId)) return this.snapshot();
    this.activeTeamId = teamId;
    const latestRun = [...this.teamRuns.values()]
      .filter((run) => run.teamId === teamId)
      .sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (latestRun) this.activeTeamRunId = latestRun.id;
    this.emit();
    return this.snapshot();
  }

  selectTeamRun(teamRunId: string): AppSnapshot {
    const run = this.teamRuns.get(teamRunId);
    if (!run) return this.snapshot();
    this.activeTeamRunId = run.id;
    this.activeTeamId = run.teamId;
    this.emit();
    return this.snapshot();
  }

  async runTeam(input: RunAgentTeamRequest): Promise<AppSnapshot> {
    const team = this.teams.get(input.teamId);
    const prompt = input.prompt.trim();
    if (!team || !prompt || team.members.length === 0) return this.snapshot();

    const teamRun = new TeamRunState(team, prompt, this.normalizeWorkflowTarget(input.target), input.workDir?.trim() || this.workDir);
    teamRun.status = "running";
    teamRun.updatedAt = Date.now();
    this.teamRuns.set(teamRun.id, teamRun);
    this.activeTeamId = team.id;
    this.activeTeamRunId = teamRun.id;
    this.emit();

    await this.startTeamRun(teamRun.id);
    return this.snapshot();
  }

  async stopTeamRun(teamRunId: string): Promise<AppSnapshot> {
    const run = this.teamRuns.get(teamRunId);
    if (!run) return this.snapshot();
    const runningSteps = run.steps.filter((step) => step.status === "running" && step.taskId);
    await Promise.all(runningSteps.map((step) => (step.taskId ? this.stopTask(step.taskId) : Promise.resolve(this.snapshot()))));
    run.status = "stopped";
    run.lastError = "Stopped";
    run.updatedAt = Date.now();
    this.activeTeamRunId = run.id;
    this.emit();
    return this.snapshot();
  }

  private async deleteAgentSession(run: RunState): Promise<void> {
    const resolved = this.resolveConfiguredAgent(run.configuredAgentId, run.modelId, run.kind === "chat" ? run.channelId : undefined);
    if (!resolved) return;
    const workDir = "workDir" in run ? run.workDir : this.workDir;
    await this.runtimeRouter.deleteSessionArtifacts(resolved.runtimeAgentId, {
      workDir,
      ...(run.runtimeConversation ? { runtimeConversation: this.runtimeRouter.cloneConversation(run.runtimeConversation) } : {}),
    });
  }

  private createChatState(configuredAgentId: string): ChatState {
    const agent = this.configuredAgentOrDefault(configuredAgentId);
    return new ChatState(agent?.id ?? "", this.normalizeModelIdForConfiguredAgent(agent?.id, agent?.modelId), agent?.name || "New Chat");
  }

  private createTaskState(input: RunTaskRequest): TaskState {
    const agent = this.configuredAgentOrDefault(input.configuredAgentId);
    return new TaskState(
      input.prompt.trim(),
      agent?.id ?? "",
      this.normalizeModelIdForConfiguredAgent(agent?.id, input.modelId ?? agent?.modelId),
      input.workDir?.trim() || this.workDir,
    );
  }

  private createTeamState(input: CreateAgentTeamRequest): AgentTeamState {
    const name = input.name.trim() || "New Agent Team";
    const mode = isAgentTeamMode(input.mode) ? input.mode : "pipeline";
    return new AgentTeamState(name, mode, input.sharedContext ?? "", this.normalizeTeamMembers(input.members ?? []));
  }

  private normalizeWorkflowTarget(target: AgentWorkflowTarget | undefined): AgentWorkflowTarget | undefined {
    if (!isAgentWorkflowTarget(target)) return undefined;
    const label = target.label.trim();
    const value = target.value.trim();
    if (!label && !value) return undefined;
    return {
      kind: target.kind,
      label: label || target.kind,
      value,
    };
  }

  private normalizeCanvasPosition(position: AgentTeamMember["canvasPosition"]): AgentTeamMember["canvasPosition"] {
    if (!position || typeof position !== "object") return undefined;
    const x = Math.max(0, Math.round(asNumber(position.x, Number.NaN)));
    const y = Math.max(0, Math.round(asNumber(position.y, Number.NaN)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    return { x, y };
  }

  private normalizeTeamMembers(members: Array<Partial<Omit<AgentTeamMember, "id">> & { id?: string }>): AgentTeamMember[] {
    return members.map((member, index) => {
      const configuredAgent = this.configuredAgentOrDefault(member.configuredAgentId);
      const canvasPosition = this.normalizeCanvasPosition(member.canvasPosition);
      return {
        id: member.id || randomUUID(),
        roleName: member.roleName?.trim() || `Agent ${index + 1}`,
        prompt: member.prompt?.trim() ?? "",
        configuredAgentId: configuredAgent?.id ?? "",
        ...(canvasPosition ? { canvasPosition } : {}),
      };
    });
  }

  private teamMembersFromRunSteps(steps: TeamRunStep[]): AgentTeamMember[] {
    return this.normalizeTeamMembers(
      steps
        .filter((step) => !step.teamMemberId.endsWith(":synthesis"))
        .map((step) => ({
          id: step.teamMemberId,
          roleName: step.roleName,
          prompt: step.prompt,
          configuredAgentId: step.configuredAgentId,
        })),
    );
  }

  private cloneWorkflowGraphNode(node: WorkflowGraphNode): WorkflowGraphNode {
    return cloneWorkflowGraphNodeValue(node);
  }

  private cloneWorkflowGraphEdge(edge: WorkflowGraphEdge): WorkflowGraphEdge {
    return cloneWorkflowGraphEdgeValue(edge);
  }

  private cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
    return cloneWorkflowGraphValue(graph);
  }

  private applyWorkflowDraftPatch(current: WorkflowDraftState, patch: PatchWorkflowDraftRequest): WorkflowDraftState {
    return applyWorkflowDraftPatchValue({
      current,
      patch,
      normalizeConfiguredAgentId: (configuredAgentId) => this.normalizeWorkflowConfiguredAgentId(configuredAgentId),
      normalizeModelId: (configuredAgentId, modelId) => this.normalizeModelIdForConfiguredAgent(configuredAgentId, modelId),
      cloneGraph: (graph) => this.cloneWorkflowGraph(graph),
      cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
  }

  private replaceWorkflowDraftMessage(messages: WorkflowDraftState["messages"], messageId: string, content: string): WorkflowDraftState["messages"] {
    return replaceWorkflowDraftMessageValue(messages, messageId, content);
  }

  private handleWorkflowDraftAgentEvent(workflowId: string, event: WorkflowAgentEvent): void {
    const activeRequest = this.activeWorkflowDraftRequests.get(workflowId);
    if (!activeRequest || activeRequest.requestId !== event.requestId) return;

    if (event.type === "delta") {
      activeRequest.content += event.content;
      const workflow = this.workflows.get(workflowId);
      if (!workflow) return;
      this.workflows.set(workflowId, this.cloneWorkflowDraft({
        ...workflow,
        revision: workflow.revision + 1,
        messages: this.replaceWorkflowDraftMessage(workflow.messages, activeRequest.assistantMessageId, activeRequest.content || WORKFLOW_THINKING_MESSAGE),
        updatedAt: Date.now(),
      }));
      this.emit();
      return;
    }

    if (event.type === "completed") {
      this.completeWorkflowDraftRequest(workflowId, event.requestId, event.content, event.runtimeConversation);
      return;
    }

    if (event.type === "error") {
      this.failWorkflowDraftRequest(workflowId, event.requestId, event.error);
    }
  }

  private completeWorkflowDraftRequest(workflowId: string, requestId: string, content: string, runtimeConversation: RuntimeConversation | undefined): void {
    const activeRequest = this.activeWorkflowDraftRequests.get(workflowId);
    if (!activeRequest || activeRequest.requestId !== requestId) return;
    this.activeWorkflowDraftRequests.delete(workflowId);
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    const next = completeWorkflowDraftRequestValue({
      workflow,
      activeRequest,
      content,
      runtimeConversation,
      thinkingMessage: WORKFLOW_THINKING_MESSAGE,
      cloneGraph: (graph) => this.cloneWorkflowGraph(graph),
      cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
    this.workflows.set(workflowId, next);
    this.emit();
  }

  private failWorkflowDraftRequest(workflowId: string, requestId: string, error: string): void {
    const activeRequest = this.activeWorkflowDraftRequests.get(workflowId);
    if (!activeRequest || activeRequest.requestId !== requestId) return;
    this.activeWorkflowDraftRequests.delete(workflowId);
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;
    this.workflows.set(workflowId, failWorkflowDraftRequestValue({
      workflow,
      activeRequest,
      error,
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
    }));
    this.emit();
  }

  private waitForWorkflowRunToSettle(runId: string): Promise<WorkflowRunState> {
    return waitForWorkflowRunToSettleValue({
      runId,
      getRun: (currentRunId) => this.workflowRuns.get(currentRunId),
      cloneRun: (run) => this.cloneWorkflowRun(run),
      onChange: (listener) =>
        this.onChange(() => {
          listener();
        }),
    });
  }

  private activeWorkflowDraft(): WorkflowDraftState | undefined {
    const workflow = this.activeWorkflowId ? this.workflows.get(this.activeWorkflowId) : undefined;
    return workflow ? this.cloneWorkflowDraft(workflow) : undefined;
  }

  private cloneWorkflowStore(): WorkflowStoreState {
    return cloneWorkflowStoreValue({
      activeWorkflowId: this.activeWorkflowId,
      workflows: this.workflows.values(),
      workflowRuns: this.workflowRuns.values(),
      cloneDraft: (draft) => this.cloneWorkflowDraft(draft),
      cloneRun: (run) => this.cloneWorkflowRun(run),
    });
  }

  private cloneWorkflowRun(run: WorkflowRunState): WorkflowRunState {
    return cloneWorkflowRunValue(run);
  }

  private cloneScheduledWorkflowStore(): ScheduledWorkflowStoreState {
    return cloneScheduledWorkflowStoreValue({
      activeScheduleId: this.activeScheduledWorkflowId,
      runnerConfig: this.scheduledWorkflowRunnerConfig,
      runnerStatus: this.scheduledWorkflowRunnerStatus,
      schedules: this.scheduledWorkflowSchedules.values(),
      runs: this.scheduledWorkflowRuns.values(),
      cloneRunnerConfig: (config) => this.cloneScheduledWorkflowRunnerConfig(config),
      cloneSchedule: (schedule) => this.cloneScheduledWorkflowSchedule(schedule),
      cloneRun: (run) => this.cloneScheduledWorkflowRun(run),
    });
  }

  private cloneScheduledWorkflowRunnerConfig(config: ScheduledWorkflowRunnerConfig): ScheduledWorkflowRunnerConfig {
    return cloneScheduledWorkflowRunnerConfigValue(config);
  }

  private cloneScheduledWorkflowSchedule(schedule: ScheduledWorkflowSchedule): ScheduledWorkflowSchedule {
    const workflowTitle = this.workflows.get(schedule.workflowId)?.title;
    return workflowTitle === undefined
      ? cloneScheduledWorkflowScheduleValue({ schedule })
      : cloneScheduledWorkflowScheduleValue({ schedule, workflowTitle });
  }

  private cloneScheduledWorkflowRun(run: ScheduledWorkflowRun): ScheduledWorkflowRun {
    const scheduleTitle = this.scheduledWorkflowSchedules.get(run.scheduleId)?.title;
    return scheduleTitle === undefined
      ? cloneScheduledWorkflowRunValue({ run })
      : cloneScheduledWorkflowRunValue({ run, scheduleTitle });
  }

  private cloneWorkflowDraft(draft: WorkflowDraftState): WorkflowDraftState {
    return cloneWorkflowDraftValue({
      draft,
      normalizeConfiguredAgentId: (configuredAgentId) => this.normalizeWorkflowConfiguredAgentId(configuredAgentId),
      normalizeModelId: (configuredAgentId, modelId) => this.normalizeModelIdForConfiguredAgent(configuredAgentId, modelId),
      cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
    });
  }

  private normalizeWorkflowStatus(status: WorkflowStatus): WorkflowStatus {
    return normalizeWorkflowStatusValue(status);
  }

  private normalizeWorkflowConfiguredAgentId(configuredAgentId: string | undefined): string {
    return this.configuredAgentOrDefault(configuredAgentId)?.id ?? "";
  }

  private workflowLimitError(graph: WorkflowGraph, title: string, objective: string): string | undefined {
    if (title.length > MAX_WORKFLOW_TITLE_CHARS) return `Workflow title exceeds ${MAX_WORKFLOW_TITLE_CHARS} characters.`;
    if (objective.length > MAX_WORKFLOW_OBJECTIVE_CHARS) return `Workflow objective exceeds ${MAX_WORKFLOW_OBJECTIVE_CHARS} characters.`;
    if (graph.nodes.length > MAX_WORKFLOW_NODE_COUNT) return `Workflow graph exceeds ${MAX_WORKFLOW_NODE_COUNT} nodes.`;
    if (graph.edges.length > MAX_WORKFLOW_EDGE_COUNT) return `Workflow graph exceeds ${MAX_WORKFLOW_EDGE_COUNT} edges.`;
    const oversizedNode = graph.nodes.find((node) => node.prompt.length > MAX_WORKFLOW_NODE_PROMPT_CHARS);
    if (oversizedNode) return `Workflow node ${oversizedNode.id} prompt exceeds ${MAX_WORKFLOW_NODE_PROMPT_CHARS} characters.`;
    return undefined;
  }

  private contextAppendLimitError(input: AppendWorkflowContextRequest): string | undefined {
    if (input.report.length + input.handoff.length > MAX_WORKFLOW_CONTEXT_APPEND_CHARS) {
      return `Workflow context append exceeds ${MAX_WORKFLOW_CONTEXT_APPEND_CHARS} characters.`;
    }
    const artifacts = input.artifacts ?? [];
    if (artifacts.length > MAX_WORKFLOW_ARTIFACTS_PER_APPEND) return `Workflow context append exceeds ${MAX_WORKFLOW_ARTIFACTS_PER_APPEND} artifacts.`;
    const oversizedArtifact = artifacts.find((artifact) => artifact.kind === "text" && (artifact.content ?? "").length > MAX_WORKFLOW_TEXT_ARTIFACT_CHARS);
    if (oversizedArtifact) return `Workflow text artifact ${oversizedArtifact.title} exceeds ${MAX_WORKFLOW_TEXT_ARTIFACT_CHARS} characters.`;
    return undefined;
  }

  private formatWorkflowContextAppend(report: string, handoff: string, artifacts: WorkflowArtifactReference[] = [], nodeId?: string): string {
    const sections = [`## ${nodeId ? `Node ${nodeId}` : "Workflow"} Context Update`];
    const trimmedReport = report.trim();
    if (trimmedReport) sections.push("### Work Completion Report", trimmedReport);
    const trimmedHandoff = handoff.trim();
    if (trimmedHandoff) sections.push("### Handoff", trimmedHandoff);
    const artifactLines = artifacts
      .slice(0, 20)
      .map((artifact) => {
        if (artifact.kind === "text") return `- ${artifact.title}: ${artifact.content ?? ""}`.trim();
        if (artifact.kind === "file") return `- ${artifact.title}: ${path.basename(artifact.path ?? "")}`;
        return `- ${artifact.title}: ${artifact.url ?? ""}`;
      })
      .filter((line) => line.length > 2);
    if (artifactLines.length > 0) sections.push("### Artifacts", artifactLines.join("\n"));
    return sections.join("\n").trim();
  }

  private channelById(channelId: string): AgentChannel | undefined {
    return this.channels.find((channel) => channel.id === channelId);
  }

  private normalizeRunSelections(): void {
    for (const chat of this.chats.values()) {
      chat.configuredAgentId = this.configuredAgentOrDefault(chat.configuredAgentId)?.id ?? this.defaultConfiguredAgentId();
      if (chat.channelId && this.channelById(chat.channelId)?.agentId !== this.configuredAgentOrDefault(chat.configuredAgentId)?.runtimeAgentId) {
        chat.channelId = undefined;
      }
      chat.modelId = this.normalizeModelIdForConfiguredAgent(chat.configuredAgentId, chat.modelId, chat.channelId);
    }
    for (const task of this.tasks.values()) {
      task.configuredAgentId = this.configuredAgentOrDefault(task.configuredAgentId)?.id ?? this.defaultConfiguredAgentId();
      task.modelId = this.normalizeModelIdForConfiguredAgent(task.configuredAgentId, task.modelId);
    }
    for (const team of this.teams.values()) {
      team.members = this.normalizeTeamMembers(team.members);
    }
    for (const workflow of this.workflows.values()) {
      this.workflows.set(workflow.workflowId, this.cloneWorkflowDraft(workflow));
    }
  }

  private runWorkDir(run: RunState): string {
    return run.kind === "task" ? run.workDir : this.workDir;
  }

  private composeTeamStepPrompt(run: TeamRunState, stepIndex: number): string {
    return composeTeamStepPromptValue(run, stepIndex);
  }

  private async startTeamRunStep(teamRunId: string, stepIndex: number): Promise<void> {
    const run = this.teamRuns.get(teamRunId);
    if (!run || run.status !== "running") return;
    const prepared = beginTeamRunStepValue({
      run,
      stepIndex,
      composePrompt: (currentRun, currentStepIndex) => this.composeTeamStepPrompt(currentRun, currentStepIndex),
      createTask: (request) => this.createTaskState(request),
    });
    if (!prepared) {
      return;
    }
    if ("completed" in prepared) {
      this.emit();
      return;
    }

    const task = prepared.task;
    this.tasks.set(task.id, task);
    this.activeTaskId = task.id;

    const preparedResolved = resolveTaskPromptExecutionValue({
      task,
      resolveConfiguredAgent: (configuredAgentId, modelId) => this.resolveConfiguredAgent(configuredAgentId, modelId),
      createUserMessage: (content) => createUserMessage(content),
      createErrorMessage: (content) => createErrorMessage(content),
      onUnavailable: (error) => this.failTeamStepFromTask(task, error),
    });
    if (!preparedResolved) {
      this.emit();
      return;
    }

    this.emit();
    void this.runChat(task, task.prompt, preparedResolved);
  }

  private async startTeamRun(teamRunId: string): Promise<void> {
    const run = this.teamRuns.get(teamRunId);
    if (!run || run.status !== "running") return;
    if (run.mode === "parallel") {
      await Promise.all(run.steps.map((_step, index) => this.startTeamRunStep(run.id, index)));
      return;
    }
    await this.startTeamRunStep(run.id, 0);
  }

  private finishTeamStepFromTask(task: TaskState): void {
    if (!task.teamRunId || !task.teamStepId) return;
    const run = this.teamRuns.get(task.teamRunId);
    if (!run) return;
    const result = finishTeamStepFromTaskValue({ run, task });
    for (const nextStepIndex of result.startStepIndexes) {
      void this.startTeamRunStep(run.id, nextStepIndex);
    }
  }

  private failTeamStepFromTask(task: TaskState, error: string): void {
    if (!task.teamRunId || !task.teamStepId) return;
    const run = this.teamRuns.get(task.teamRunId);
    if (!run) return;
    failTeamStepFromTaskValue({ run, taskStepId: task.teamStepId, error });
  }

  private markRunExited(run: RunState): void {
    markRunExitedValue(run, (task) => this.finishTeamStepFromTask(task));
  }

  private markRunFailed(run: RunState, error: string): void {
    markRunFailedValue({
      run,
      error,
      takeStop: (runId) => this.activeStops.get(runId),
      finishTaskRun: (task) => this.finishTeamStepFromTask(task),
      emit: () => {
        this.activeStops.delete(run.id);
        this.emit();
      },
    });
  }

  private async runChat(run: RunState, prompt: string, resolved: ResolvedConfiguredAgent): Promise<void> {
    await runAgentExecutionValue({
      run,
      prompt,
      resolved,
      workDir: this.runWorkDir(run),
      chatDeveloperInstructions: CODEX_CHAT_DEVELOPER_INSTRUCTIONS,
      taskDeveloperInstructions: CODEX_TASK_DEVELOPER_INSTRUCTIONS,
      executorFactory: this.executorFactory,
      selectExecutionMode: (runtimeId, surface, preferred) => this.selectExecutionMode(runtimeId, surface, preferred),
      defaultContinuationPolicy: (runtimeId, surface, executionMode) =>
        this.defaultContinuationPolicy(runtimeId, surface, executionMode),
      cloneConversationForPolicy: (continuationPolicy, runtimeConversation) =>
        this.cloneConversationForPolicy(continuationPolicy, runtimeConversation),
      handleAgentEvent: (currentRun, event) => this.handleAgentEvent(currentRun, event),
      markRunExited: (currentRun) => this.markRunExited(currentRun),
      markRunFailed: (currentRun, error) => this.markRunFailed(currentRun, error),
      registerStop: (runId, stop) => {
        this.activeStops.set(runId, stop);
      },
      clearStop: (runId) => this.activeStops.delete(runId),
      emit: () => this.emit(),
    });
  }

  private async testCodexAgent(channel: AgentChannel, modelId: string, workDir: string, emit: AgentTestEmit): Promise<string> {
    return testCodexAgentValue({
      executable: this.executables.codex,
      channel,
      modelId,
      workDir,
      emit,
      testPrompt: AGENT_TEST_PROMPT,
      timeoutMs: AGENT_TEST_TIMEOUT_MS,
    });
  }

  private async testClaudeAgent(channel: AgentChannel, modelId: string, workDir: string, emit: AgentTestEmit): Promise<string> {
    return testClaudeAgentValue({
      adapter: this.claudeSdkAdapter,
      channel,
      modelId,
      workDir,
      emit,
      testPrompt: AGENT_TEST_PROMPT,
    });
  }

  private async testApiAgent(channel: AgentChannel, modelId: string, emit: AgentTestEmit): Promise<string> {
    return testApiAgentValue({
      channel,
      modelId,
      timeoutMs: AGENT_TEST_TIMEOUT_MS,
      testPrompt: AGENT_TEST_PROMPT,
      systemPrompt: "You are testing whether this configured agent can respond.",
      emit,
    });
  }

  private async askApiWorkflowAgent(input: {
    requestId: string;
    prompt: string;
    channelId: string;
    modelId: string;
    runtimeConversation: RuntimeConversation | undefined;
    onEvent: ((event: WorkflowAgentEvent) => void) | undefined;
  }): Promise<WorkflowAgentResponse> {
    const channel = this.channelById(input.channelId);
    if (!channel) throw new Error("API workflow agent requires a provider base URL");
    return askApiWorkflowAgentValue({
      requestId: input.requestId,
      prompt: input.prompt,
      channel,
      modelId: input.modelId,
      runtimeConversation: input.runtimeConversation,
      workflowDeveloperInstructions: CODEX_WORKFLOW_DEVELOPER_INSTRUCTIONS,
      onEvent: input.onEvent,
    });
  }

  private handleAgentEvent(run: RunState, event: AgentEvent): void {
    handleAgentEventValue({
      run,
      event,
      cloneConversation: (runtimeConversation) => this.runtimeRouter.cloneConversation(runtimeConversation),
      takeStop: (runId) => {
        const stop = this.activeStops.get(runId);
        this.activeStops.delete(runId);
        return stop;
      },
      finishTaskRun: (task) => this.finishTeamStepFromTask(task),
      emit: () => this.emit(),
    });
  }

  private appendEventToAssistant(run: RunState, event: ChatEvent): void {
    appendEventToAssistantValue(run, event);
  }

  private resolvePendingRequest(run: RunState, requestId: string, type: "approval_request" | "user_input_request"): void {
    resolvePendingRequestValue(run, requestId, type);
  }

  private expirePendingInteractionEvents(messages: ChatMessage[]): ChatMessage[] {
    return expirePendingInteractionEventsValue(messages);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
    this.schedulePersist();
  }

  private restorePersistedState(raw: unknown): boolean {
    if (!this.isPersistedAppStateV4(raw)) return false;
    const record = raw as PersistedAppStateV4 & Record<string, unknown>;
    if (Array.isArray(record.channels)) {
      this.channels = normalizeConfigChannelsForStorage(normalizeChannels(record.channels));
    }

    this.installRestoredConfiguredAgents(Array.isArray(record.configuredAgents) ? record.configuredAgents : []);
    const restored = restorePersistedCollections(record, {
      restoreChatState: (payload) => this.restoreChatState(payload),
      restoreTaskState: (payload) => this.restoreTaskState(payload),
      restoreTeamState: (payload) => this.restoreTeamState(payload),
      restoreTeamRunState: (payload) => this.restoreTeamRunState(payload),
    });
    if (!restored) return false;

    this.installRestoredChats(restored.chats, asOptionalString(record.activeChatId), asOptionalString(record.workDir));
    this.installRestoredTasks(restored.tasks, asOptionalString(record.activeTaskId));
    this.installRestoredTeams(
      restored.teams,
      restored.teamRuns,
      asOptionalString(record.activeTeamId),
      asOptionalString(record.activeTeamRunId),
    );
    if (!this.restoreWorkflowStore(record.workflowStore)) return false;
    this.restoreScheduledWorkflowStore(record.scheduledWorkflowStore);
    return true;
  }

  private isPersistedAppStateV4(raw: unknown): raw is PersistedAppStateV4 {
    return isPersistedAppStateV4Value(raw);
  }

  private reinitializePersistedState(): void {
    this.installRestoredConfiguredAgents([]);
    this.installRestoredChats([], undefined, undefined);
    this.installRestoredTasks([], undefined);
    this.installRestoredTeams([], [], undefined, undefined);
    void this.restoreWorkflowStore(undefined);
    this.restoreScheduledWorkflowStore(undefined);
  }

  private installRestoredConfiguredAgents(rawAgents: unknown[]): void {
    this.configuredAgents.clear();
    const now = Date.now();
    for (const rawAgent of rawAgents) {
      const agent = this.restoreConfiguredAgent(rawAgent, now);
      if (agent) this.configuredAgents.set(agent.id, agent);
    }
    if (this.configuredAgents.size === 0) {
      const agent = createDefaultConfiguredAgent(this.channels, now);
      this.configuredAgents.set(agent.id, agent);
    }
  }

  private restoreConfiguredAgent(raw: unknown, now = Date.now()): ConfiguredAgent | undefined {
    return restoreConfiguredAgentState(
      raw,
      {
        channels: this.channels,
        channelById: (channelId) => this.channelById(channelId),
        defaultAgentId: DEFAULT_AGENT,
      },
      now,
    );
  }

  private installRestoredChats(chats: ChatState[], activeChatId: string | undefined, workDir: string | undefined): void {
    const installed = installRestoredChatsValue({
      target: this.chats,
      chats,
      activeChatId,
      workDir,
      createDefaultChat: () => this.createChatState(this.defaultConfiguredAgentId()),
    });
    this.activeChatId = installed.activeChatId;
    if (installed.workDir) this.workDir = installed.workDir;
  }

  private installRestoredTasks(tasks: TaskState[], activeTaskId: string | undefined): void {
    this.activeTaskId = installRestoredTasksValue({
      target: this.tasks,
      tasks,
      activeTaskId,
    });
  }

  private installRestoredTeams(
    teams: AgentTeamState[],
    teamRuns: TeamRunState[],
    activeTeamId: string | undefined,
    activeTeamRunId: string | undefined,
  ): void {
    const installed = installRestoredTeamsValue({
      teamsTarget: this.teams,
      teams,
      activeTeamId,
      teamRunsTarget: this.teamRuns,
      teamRuns,
      activeTeamRunId,
    });
    this.activeTeamId = installed.activeTeamId;
    this.activeTeamRunId = installed.activeTeamRunId;
  }

  private runtimeSupportsInteractiveChat(runtimeAgentId: AgentId): boolean {
    return this.selectExecutionMode(runtimeAgentId, "chat", "interactive") === "interactive";
  }

  private restoreRuntimeState(raw: unknown): ChatRuntimeSessionState | undefined {
    return restoreRuntimeStateValue(raw);
  }

  private restoreChatState(raw: unknown): ChatState | null {
    return restoreChatStateValue(raw, {
      configuredAgentOrDefault: (configuredAgentId) => this.configuredAgentOrDefault(configuredAgentId),
      normalizeModelIdForConfiguredAgent: (configuredAgentId, modelId, channelIdOverride) =>
        this.normalizeModelIdForConfiguredAgent(configuredAgentId, modelId, channelIdOverride),
      channelById: (channelId) => this.channelById(channelId),
      restoreRuntimeConversation: (payload) => this.runtimeRouter.restorePersistedConversation(payload),
      cloneRuntimeConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
      runtimeSupportsInteractiveChat: (runtimeAgentId) => this.runtimeSupportsInteractiveChat(runtimeAgentId),
      expirePendingInteractionEvents: (messages) => this.expirePendingInteractionEvents(messages),
    });
  }

  private restoreTaskState(raw: unknown): TaskState | null {
    return restoreTaskStateValue(raw, {
      workDir: this.workDir,
      configuredAgentOrDefault: (configuredAgentId) => this.configuredAgentOrDefault(configuredAgentId),
      normalizeModelIdForConfiguredAgent: (configuredAgentId, modelId, channelIdOverride) =>
        this.normalizeModelIdForConfiguredAgent(configuredAgentId, modelId, channelIdOverride),
      restoreRuntimeConversation: (payload) => this.runtimeRouter.restorePersistedConversation(payload),
      cloneRuntimeConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
    });
  }

  private restoreTeamState(raw: unknown): AgentTeamState | null {
    return restoreTeamStateValue(raw, {
      normalizeTeamMembers: (members) => this.normalizeTeamMembers(members),
    });
  }

  private restoreTeamRunState(raw: unknown): TeamRunState | null {
    return restoreTeamRunStateValue(raw, {
      workDir: this.workDir,
      normalizeTeamMembers: (members) => this.normalizeTeamMembers(members),
      teamMembersFromRunSteps: (steps) => this.teamMembersFromRunSteps(steps),
      restoreTeamRunStep: (step) => this.restoreTeamRunStep(step),
    });
  }

  private restoreTeamRunStep(raw: unknown): TeamRunStep | null {
    return restoreTeamRunStepValue(raw, {
      configuredAgentOrDefault: (configuredAgentId) => this.configuredAgentOrDefault(configuredAgentId),
    });
  }

  private restoreWorkflowStore(rawStore: unknown): boolean {
    const restored = restoreWorkflowStoreStateValue({
      rawStore,
      workflowsTarget: this.workflows,
      workflowRunsTarget: this.workflowRuns,
      restoreWorkflowDraft: (payload) => this.restoreWorkflowDraft(payload),
      restoreWorkflowRun: (payload) => this.restoreWorkflowRun(payload),
    });
    this.activeWorkflowId = restored.activeWorkflowId;
    return restored.ok;
  }

  private restoreScheduledWorkflowStore(rawStore: unknown): void {
    const restored = restoreScheduledWorkflowStoreStateValue({
      rawStore,
      schedulesTarget: this.scheduledWorkflowSchedules,
      runsTarget: this.scheduledWorkflowRuns,
      restoreRunnerConfig: (payload) =>
        restoreScheduledWorkflowRunnerConfigValue(payload, (config) => this.cloneScheduledWorkflowRunnerConfig(config)),
      restoreSchedule: (payload) => this.restoreScheduledWorkflowSchedule(payload),
      restoreRun: (payload) => this.restoreScheduledWorkflowRun(payload),
    });
    this.scheduledWorkflowRunnerConfig = restored.runnerConfig;
    this.scheduledWorkflowRunnerStatus = restored.runnerStatus;
    this.activeScheduledWorkflowId = restored.activeScheduledWorkflowId;
  }

  private restoreScheduledWorkflowSchedule(raw: unknown): ScheduledWorkflowSchedule | undefined {
    return restoreScheduledWorkflowScheduleValue(raw, {
      hasWorkflow: (workflowId) => this.workflows.has(workflowId),
      workflowTitle: (workflowId) => this.workflows.get(workflowId)?.title,
      cloneScheduledWorkflowSchedule: (schedule) => this.cloneScheduledWorkflowSchedule(schedule),
    });
  }

  private restoreScheduledWorkflowRun(raw: unknown): ScheduledWorkflowRun | undefined {
    return restoreScheduledWorkflowRunValue(raw, {
      hasWorkflow: (workflowId) => this.workflows.has(workflowId),
      scheduledWorkflowTitle: (scheduleId) => this.scheduledWorkflowSchedules.get(scheduleId)?.title,
      cloneScheduledWorkflowRun: (run) => this.cloneScheduledWorkflowRun(run),
    });
  }

  private restoreWorkflowDraft(raw: unknown): WorkflowDraftState | undefined {
    return restoreWorkflowDraftValue(raw, {
      restoreRuntimeConversation: (payload) => this.runtimeRouter.restorePersistedConversation(payload),
      cloneWorkflowDraft: (draft) => this.cloneWorkflowDraft(draft),
    });
  }

  private restoreWorkflowRun(raw: unknown): WorkflowRunState | undefined {
    return restoreWorkflowRunValue(raw);
  }

  private schedulePersist(): void {
    if (!this.storagePath) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.persistState();
    }, PERSIST_DEBOUNCE_MS);
  }

  private buildPersistedPayload(): PersistedAppStateV4 {
    return buildPersistedPayload({
      activeChatId: this.activeChatId,
      activeTaskId: this.activeTaskId,
      activeTeamId: this.activeTeamId,
      activeTeamRunId: this.activeTeamRunId,
      workDir: this.workDir,
      channels: this.channels,
      chats: this.chats.values(),
      tasks: this.tasks.values(),
      teams: this.teams.values(),
      teamRuns: this.teamRuns.values(),
      configuredAgents: this.listConfiguredAgents(),
      artifacts: this.artifacts,
      cloneConversation: (conversation) => this.runtimeRouter.cloneConversation(conversation),
      workflowStore: this.cloneWorkflowStore(),
      scheduledWorkflowStore: this.cloneScheduledWorkflowStore(),
    });
  }

  private async persistState(): Promise<void> {
    if (!this.storagePath) return;
    if (this.persistInFlight) await this.persistInFlight;

    const payload = this.buildPersistedPayload();
    this.persistInFlight = writePersistedPayload({
      storagePath: this.storagePath,
      sqliteStore: this.sqliteStore,
      payload,
    });

    try {
      await this.persistInFlight;
    } catch (error) {
      console.warn(
        this.sqliteStore
          ? `Failed to persist app state to SQLite ${this.storagePath}:`
          : `Failed to persist chat history to ${this.storagePath}:`,
        error,
      );
    } finally {
      this.persistInFlight = undefined;
    }
  }
}

export function getDefaultWorkDir(): string {
  return process.cwd();
}
