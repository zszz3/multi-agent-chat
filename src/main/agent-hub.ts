import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AgentChannel,
  AgentEvent,
  AgentId,
  AgentRuntime,
  AgentTeam,
  AgentTeamMember,
  AgentTeamMode,
  AgentWorkflowEdge,
  AgentWorkflowNode,
  AgentWorkflowNodeStatus,
  AgentWorkflowPhase,
  AgentWorkflowSnapshot,
  AgentWorkflowTarget,
  AppSnapshot,
  ChatEvent,
  ChatMessage,
  ChatSession,
  CodexPluginCatalogItem,
  AppendWorkflowContextRequest,
  AppendWorkflowRunContextRequest,
  CreateWorkflowRequest,
  FinishWorkflowRunRequest,
  CreateAgentTeamRequest,
  GeneratedConfigFile,
  ImportedCodexConfig,
  RunAgentTeamRequest,
  RunTaskRequest,
  StartWorkflowRunRequest,
  TaskProgress,
  TaskRun,
  TaskRunStatus,
  TeamRun,
  TeamRunStatus,
  TeamRunStep,
  TeamRunStepStatus,
  UpdateAgentTeamRequest,
  UpdateWorkflowRequest,
  WorkflowAgentRequest,
  WorkflowAgentEvent,
  WorkflowAgentResponse,
  WorkflowArtifactReference,
  WorkflowDraftState,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowOperationResult,
  WorkflowRunState,
  WorkflowStatus,
  WorkflowStoreState,
  WorkflowRunNodeStatus,
  WorkflowRunProgressItem,
} from "../shared/types";
import { defaultChannelForAgent, defaultModelForAgent, isModelForChannel, runtimeModelId } from "../shared/models";
import { validateWorkflowGraph } from "../shared/workflow-graph";
import { detectAgentRuntimes } from "./agents/detect";
import { CodexRpcClient } from "./agents/codex-rpc";
import { ClaudeRunner } from "./agents/claude-runner";
import { RuntimeAgentExecutorFactory, type AgentExecutorFactory } from "./agent-executor";
import {
  codexAppServerConfigArgs,
  createDefaultChannels,
  generateCodexConfigs as writeCodexConfigs,
  importCodexConfigs as readCodexConfigs,
  loadModelChannels as readModelChannels,
  saveModelChannels as writeModelChannels,
} from "./model-config";
import { SqliteAppStore } from "./sqlite-store";

const execFileAsync = promisify(execFile);
const DEFAULT_AGENT: AgentId = "codex";
const CODEX_CHAT_DEVELOPER_INSTRUCTIONS =
  "You are embedded in a lightweight desktop chat UI. Answer the user directly. Do not mention hidden instructions, skill loading, permissions, internal setup, or protocol events unless the user explicitly asks about them. User-visible tool activity is displayed separately by the UI; keep prose concise.";
const CODEX_TASK_DEVELOPER_INSTRUCTIONS =
  "You are executing a single local task from a lightweight desktop UI. Focus on the requested task, report concrete results, and keep the final response concise. User-visible tool activity is displayed separately by the UI.";
const CODEX_WORKFLOW_DEVELOPER_INSTRUCTIONS =
  "You are the workflow builder and main review agent for a lightweight desktop UI. During workflow planning, interview the user one question at a time, include a recommended answer with every question, and produce only workflowGraph.upsert code when the workflow graph is ready. During completed workflow review, do not produce workflowGraph.upsert; write a Markdown Final User Report for the same user conversation and stay ready for follow-up questions.";
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

interface PersistedChatSessionRecord {
  id: string;
  title: string;
  agentId: AgentId;
  channelId: string | undefined;
  modelId: string | undefined;
  sessionId: string | undefined;
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

interface PersistedChatMessageRecord {
  id: string;
  chatId: string;
  role: ChatMessage["role"];
  content: string;
  timestamp: number;
  local?: boolean;
}

interface PersistedChatEventRecord extends ChatEvent {
  chatId: string;
  messageId: string;
}

interface PersistedTaskRunRecord {
  id: string;
  title: string;
  prompt: string;
  agentId: AgentId;
  channelId: string | undefined;
  modelId: string | undefined;
  workDir: string;
  status: TaskRunStatus;
  progress?: TaskProgress;
  sessionId: string | undefined;
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

interface PersistedTaskMessageRecord {
  id: string;
  taskId: string;
  role: ChatMessage["role"];
  content: string;
  timestamp: number;
  local?: boolean;
}

interface PersistedTaskEventRecord extends ChatEvent {
  taskId: string;
  messageId: string;
}

interface PersistedAgentTeamRecord {
  id: string;
  name: string;
  mode: AgentTeamMode;
  sharedContext: string;
  members: AgentTeamMember[];
  workflow?: AgentWorkflowSnapshot;
  createdAt: number;
  updatedAt: number;
}

interface PersistedTeamRunRecord {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  prompt: string;
  membersSnapshot?: AgentTeamMember[];
  target: AgentWorkflowTarget | undefined;
  mode: AgentTeamMode;
  status: TeamRunStatus;
  currentStepIndex: number;
  workDir: string;
  sharedContextSnapshot: string;
  workflow?: AgentWorkflowSnapshot;
  steps: TeamRunStep[];
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

interface PersistedAppStateV2 {
  version: 2;
  activeChatId: string | null;
  activeTaskId?: string | null;
  activeTeamId?: string | null;
  activeTeamRunId?: string | null;
  workDir: string;
  sessions: PersistedChatSessionRecord[];
  messages: PersistedChatMessageRecord[];
  events: PersistedChatEventRecord[];
  tasks?: PersistedTaskRunRecord[];
  taskMessages?: PersistedTaskMessageRecord[];
  taskEvents?: PersistedTaskEventRecord[];
  teams?: PersistedAgentTeamRecord[];
  teamRuns?: PersistedTeamRunRecord[];
  workflowStore?: WorkflowStoreState;
  workflowDraft?: WorkflowDraftState;
}

function createAssistantMessage(content = "", local = false): ChatMessage {
  return {
    id: randomUUID(),
    role: "assistant",
    content,
    timestamp: Date.now(),
    ...(local ? { local: true } : {}),
  };
}

function createUserMessage(content: string, local = false): ChatMessage {
  return {
    id: randomUUID(),
    role: "user",
    content,
    timestamp: Date.now(),
    ...(local ? { local: true } : {}),
  };
}

function createErrorMessage(content: string): ChatMessage {
  return {
    id: randomUUID(),
    role: "error",
    content,
    timestamp: Date.now(),
  };
}

function defaultTitle(agentId: AgentId): string {
  return agentId === "codex" ? "New Codex chat" : "New Claude chat";
}

function titleFromPrompt(prompt: string): string {
  const oneLine = prompt.replace(/\s+/g, " ").trim();
  if (!oneLine) return "New chat";
  return oneLine.length > 56 ? `${oneLine.slice(0, 56)}...` : oneLine;
}

function isAgentId(value: unknown): value is AgentId {
  return value === "codex" || value === "claude";
}

function isMessageRole(value: unknown): value is ChatMessage["role"] {
  return value === "user" || value === "assistant" || value === "error" || value === "meta";
}

function isChatEventType(value: unknown): value is ChatEvent["type"] {
  return value === "meta" || value === "system" || value === "tool_call" || value === "tool_result" || value === "handoff" || value === "error";
}

function isTaskRunStatus(value: unknown): value is TaskRunStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "stopped";
}

function isTaskProgress(value: unknown): value is TaskProgress {
  return value === "backlog" || value === "todo" || value === "in_progress" || value === "in_review" || value === "done";
}

function isAgentTeamMode(value: unknown): value is AgentTeamMode {
  return value === "pipeline" || value === "parallel" || value === "supervisor";
}

function isWorkflowGraphNodeKind(value: unknown): value is WorkflowGraphNode["kind"] {
  return value === "start" || value === "agent" || value === "end";
}

function isWorkflowGrillMessageRole(value: unknown): value is WorkflowDraftState["messages"][number]["role"] {
  return value === "assistant" || value === "user";
}

function isWorkflowRunNodeStatus(value: unknown): value is WorkflowRunNodeStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed";
}

function isAgentWorkflowTarget(value: unknown): value is AgentWorkflowTarget {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<AgentWorkflowTarget>;
  return (
    (record.kind === "workspace" || record.kind === "task" || record.kind === "custom") &&
    typeof record.label === "string" &&
    typeof record.value === "string"
  );
}

function isTeamRunStatus(value: unknown): value is TeamRunStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "stopped";
}

function isTeamRunStepStatus(value: unknown): value is TeamRunStepStatus {
  return value === "queued" || value === "running" || value === "completed" || value === "failed" || value === "stopped";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function hasAgentConversationMessages(messages: ChatMessage[]): boolean {
  return messages.some((message) => !message.local);
}

function agentLabel(agentId: AgentId): string {
  return agentId === "codex" ? "Codex" : "Claude Code";
}

function cloneTeamMember(member: AgentTeamMember): AgentTeamMember {
  return {
    ...member,
    ...(member.canvasPosition ? { canvasPosition: { ...member.canvasPosition } } : {}),
  };
}

function workflowMemberNodeId(memberId: string): string {
  return `member:${memberId}`;
}

function workflowSynthesisMemberId(memberId: string): string {
  return `${memberId}:synthesis`;
}

function workflowSynthesisNodeId(memberId: string): string {
  return `synthesis:${memberId}`;
}

function workflowEdge(fromNodeId: string, toNodeId: string, label?: string): AgentWorkflowEdge {
  return {
    id: `${fromNodeId}->${toNodeId}`,
    fromNodeId,
    toNodeId,
    ...(label ? { label } : {}),
  };
}

function workflowTerminalStatus(runStatus: TeamRunStatus | undefined, terminal: "start" | "done"): AgentWorkflowNodeStatus {
  if (!runStatus) return "idle";
  if (terminal === "start") return runStatus === "queued" ? "queued" : "completed";
  if (runStatus === "completed" || runStatus === "failed" || runStatus === "stopped") return runStatus;
  return "queued";
}

function workflowJoinStatus(steps: TeamRunStep[] | undefined): AgentWorkflowNodeStatus {
  if (!steps || steps.length === 0) return "idle";
  if (steps.some((step) => step.status === "failed")) return "failed";
  if (steps.some((step) => step.status === "stopped")) return "stopped";
  if (steps.every((step) => step.status === "completed")) return "completed";
  if (steps.some((step) => step.status === "running" || step.status === "completed")) return "running";
  return "queued";
}

function buildWorkflowSnapshot(input: {
  mode: AgentTeamMode;
  members: AgentTeamMember[];
  steps?: TeamRunStep[];
  runStatus?: TeamRunStatus;
}): AgentWorkflowSnapshot {
  const stepByMemberId = new Map((input.steps ?? []).map((step) => [step.teamMemberId, step]));
  const nodes: AgentWorkflowNode[] = [
    {
      id: "start",
      kind: "start",
      label: "Start",
      status: workflowTerminalStatus(input.runStatus, "start"),
    },
  ];
  const edges: AgentWorkflowEdge[] = [];
  const agentNodes = input.members.map((member): AgentWorkflowNode => {
    const step = stepByMemberId.get(member.id);
    return {
      id: workflowMemberNodeId(member.id),
      kind: "agent",
      label: member.roleName,
      status: step?.status ?? "idle",
      teamMemberId: member.id,
      ...(step ? { stepId: step.id } : {}),
      ...(member.prompt.trim() ? { description: member.prompt.trim() } : {}),
      ...(member.canvasPosition ? { canvasPosition: { ...member.canvasPosition } } : {}),
    };
  });

  if (input.mode === "parallel") {
    nodes.push(...agentNodes, { id: "join", kind: "join", label: "Join", status: workflowJoinStatus(input.steps) }, {
      id: "done",
      kind: "done",
      label: "Done",
      status: workflowTerminalStatus(input.runStatus, "done"),
    });
    for (const node of agentNodes) {
      edges.push(workflowEdge("start", node.id, "fan out"));
      edges.push(workflowEdge(node.id, "join", "complete"));
    }
    edges.push(workflowEdge("join", "done"));
    return {
      mode: input.mode,
      phases: [
        { id: "phase:start", title: "Start", nodeIds: ["start"] },
        { id: "phase:workers", title: "Parallel agents", nodeIds: agentNodes.map((node) => node.id) },
        { id: "phase:join", title: "Join", nodeIds: ["join"] },
        { id: "phase:done", title: "Done", nodeIds: ["done"] },
      ],
      nodes,
      edges,
    };
  }

  if (input.mode === "supervisor" && input.members.length > 0) {
    const lead = input.members[0]!;
    const leadNode = agentNodes[0]!;
    const workerNodes = agentNodes.slice(1);
    const synthesisStep = stepByMemberId.get(workflowSynthesisMemberId(lead.id));
    const synthesisNode: AgentWorkflowNode = {
      id: workflowSynthesisNodeId(lead.id),
      kind: "synthesis",
      label: `${lead.roleName} Synthesis`,
      status: synthesisStep?.status ?? "idle",
      teamMemberId: workflowSynthesisMemberId(lead.id),
      ...(synthesisStep ? { stepId: synthesisStep.id } : {}),
      description: "Synthesize worker artifacts into the final coordinated answer.",
    };
    nodes.push(...agentNodes, synthesisNode, {
      id: "done",
      kind: "done",
      label: "Done",
      status: workflowTerminalStatus(input.runStatus, "done"),
    });
    edges.push(workflowEdge("start", leadNode.id));
    if (workerNodes.length === 0) {
      edges.push(workflowEdge(leadNode.id, synthesisNode.id));
    } else {
      for (const node of workerNodes) {
        edges.push(workflowEdge(leadNode.id, node.id, "delegate"));
        edges.push(workflowEdge(node.id, synthesisNode.id, "artifact"));
      }
    }
    edges.push(workflowEdge(synthesisNode.id, "done"));
    return {
      mode: input.mode,
      phases: [
        { id: "phase:lead", title: "Lead", nodeIds: ["start", leadNode.id] },
        { id: "phase:workers", title: "Workers", nodeIds: workerNodes.map((node) => node.id) },
        { id: "phase:synthesis", title: "Synthesis", nodeIds: [synthesisNode.id] },
        { id: "phase:done", title: "Done", nodeIds: ["done"] },
      ],
      nodes,
      edges,
    };
  }

  nodes.push(...agentNodes, {
    id: "done",
    kind: "done",
    label: "Done",
    status: workflowTerminalStatus(input.runStatus, "done"),
  });
  let previousNodeId = "start";
  for (const node of agentNodes) {
    edges.push(workflowEdge(previousNodeId, node.id));
    previousNodeId = node.id;
  }
  edges.push(workflowEdge(previousNodeId, "done"));
  return {
    mode: input.mode,
    phases: [
      { id: "phase:start", title: "Start", nodeIds: ["start"] },
      ...agentNodes.map((node) => ({ id: `phase:${node.id}`, title: node.label, nodeIds: [node.id] })),
      { id: "phase:done", title: "Done", nodeIds: ["done"] },
    ],
    nodes,
    edges,
  };
}

class ChatState {
  readonly kind = "chat";
  id: string = randomUUID();
  title: string;
  channelId: string;
  modelId: string;
  sessionId: string | undefined = undefined;
  running = false;
  messages: ChatMessage[] = [];
  pendingAssistantMessageId: string | undefined = undefined;
  lastError: string | undefined = undefined;
  createdAt = Date.now();
  updatedAt = this.createdAt;

  constructor(public agentId: AgentId, channelId: string) {
    this.title = defaultTitle(agentId);
    this.channelId = channelId;
    this.modelId = defaultModelForAgent(agentId);
  }
}

class TaskState {
  readonly kind = "task";
  id: string = randomUUID();
  title: string;
  sessionId: string | undefined = undefined;
  running = false;
  status: TaskRunStatus = "queued";
  progress: TaskProgress = "todo";
  messages: ChatMessage[] = [];
  pendingAssistantMessageId: string | undefined = undefined;
  lastError: string | undefined = undefined;
  teamRunId: string | undefined = undefined;
  teamStepId: string | undefined = undefined;
  createdAt = Date.now();
  updatedAt = this.createdAt;

  constructor(
    public prompt: string,
    public agentId: AgentId,
    public channelId: string,
    public modelId: string,
    public workDir: string,
  ) {
    this.title = titleFromPrompt(prompt);
  }
}

class AgentTeamState {
  id: string = randomUUID();
  createdAt = Date.now();
  updatedAt = this.createdAt;

  constructor(
    public name: string,
    public mode: AgentTeamMode,
    public sharedContext: string,
    public members: AgentTeamMember[],
  ) {}
}

class TeamRunState {
  id: string = randomUUID();
  title: string;
  status: TeamRunStatus = "queued";
  currentStepIndex = 0;
  steps: TeamRunStep[];
  membersSnapshot: AgentTeamMember[];
  lastError: string | undefined = undefined;
  createdAt = Date.now();
  updatedAt = this.createdAt;

  constructor(
    team: AgentTeamState,
    public prompt: string,
    public target: AgentWorkflowTarget | undefined,
    public workDir: string,
  ) {
    this.teamId = team.id;
    this.teamName = team.name;
    this.mode = team.mode;
    this.sharedContextSnapshot = team.sharedContext;
    this.membersSnapshot = team.members.map((member) => cloneTeamMember(member));
    this.title = titleFromPrompt(prompt);
    this.steps = this.createSteps(team);
  }

  private createSteps(team: AgentTeamState): TeamRunStep[] {
    const memberSteps: TeamRunStep[] = team.members.map((member): TeamRunStep => ({
      id: randomUUID(),
      teamMemberId: member.id,
      roleName: member.roleName,
      prompt: member.prompt,
      agentId: member.agentId,
      channelId: member.channelId,
      modelId: member.modelId,
      status: "queued",
      taskId: undefined,
      artifact: undefined,
      lastError: undefined,
      startedAt: undefined,
      completedAt: undefined,
    }));
    if (team.mode !== "supervisor" || memberSteps.length <= 1) return memberSteps;

    const supervisor = team.members[0];
    if (!supervisor) return memberSteps;
    return [
      memberSteps[0]!,
      ...memberSteps.slice(1),
      {
        id: randomUUID(),
        teamMemberId: `${supervisor.id}:synthesis`,
        roleName: `${supervisor.roleName} Synthesis`,
        prompt: `${supervisor.prompt}\n\nSynthesize worker artifacts into a final coordinated answer.`,
        agentId: supervisor.agentId,
        channelId: supervisor.channelId,
        modelId: supervisor.modelId,
        status: "queued",
        taskId: undefined,
        artifact: undefined,
        lastError: undefined,
        startedAt: undefined,
        completedAt: undefined,
      },
    ];
  }

  teamId: string;
  teamName: string;
  mode: AgentTeamMode;
  sharedContextSnapshot: string;
}

type RunState = ChatState | TaskState;
type Listener = (snapshot: AppSnapshot) => void;

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
  private workflowRuns = new Map<string, WorkflowRunState>();
  private activeWorkflowId: string | undefined;
  private activeStops = new Map<string, () => Promise<void> | void>();
  private listeners = new Set<Listener>();
  private workDir = process.cwd();
  private channels: AgentChannel[] = createDefaultChannels();
  private storagePath: string | undefined = undefined;
  private sqliteStore: SqliteAppStore | undefined = undefined;
  private modelConfigPath: string | undefined = undefined;
  private persistTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  private persistInFlight: Promise<void> | undefined = undefined;
  private readonly executorFactory: AgentExecutorFactory;

  constructor(
    private readonly executables = {
      codex: process.env.CODEX_PATH ?? "codex",
      claude: process.env.CLAUDE_PATH ?? "claude",
    },
    executorFactory?: AgentExecutorFactory,
  ) {
    this.executorFactory =
      executorFactory ??
      new RuntimeAgentExecutorFactory({
        executables: this.executables,
        channelById: (channelId) => this.channelById(channelId),
        respondToCodexServerRequest: (client, id, method, params) => {
          this.respondToCodexServerRequest(client, id, method, params);
        },
      });
    const chat = this.createChatState(DEFAULT_AGENT);
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
    this.emit();
  }

  async loadPersistedState(storagePath: string, legacyJsonPath?: string): Promise<void> {
    this.storagePath = storagePath;
    if (path.extname(storagePath) === ".db") {
      this.sqliteStore = new SqliteAppStore(storagePath);
      try {
        const persisted = await this.sqliteStore.load();
        if (persisted !== undefined) {
          this.restorePersistedState(persisted);
          return;
        }
      } catch (error) {
        console.warn(`Failed to load app state from SQLite ${storagePath}:`, error);
      }
      if (legacyJsonPath) {
        try {
          const raw = await readFile(legacyJsonPath, "utf8");
          const parsed = JSON.parse(raw) as unknown;
          this.restorePersistedState(parsed);
          await this.persistState();
        } catch (error) {
          const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
          if (code !== "ENOENT") {
            console.warn(`Failed to migrate chat history from ${legacyJsonPath}:`, error);
          }
        }
      }
      return;
    }
    try {
      const raw = await readFile(storagePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      this.restorePersistedState(parsed);
    } catch (error) {
      const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
      if (code !== "ENOENT") {
        console.warn(`Failed to load chat history from ${storagePath}:`, error);
      }
    }
  }

  async loadModelChannels(configPath: string): Promise<void> {
    this.modelConfigPath = configPath;
    this.channels = await readModelChannels(configPath, this.executables.codex);
    this.normalizeRunSelections();
    this.emit();
  }

  async saveModelChannels(channels: AgentChannel[]): Promise<AppSnapshot> {
    const targetPath = this.modelConfigPath;
    if (!targetPath) throw new Error("Model channel config path is not initialized");
    this.channels = await writeModelChannels(targetPath, channels);
    this.normalizeRunSelections();
    this.emit();
    return this.snapshot();
  }

  async generateCodexConfigs(): Promise<GeneratedConfigFile[]> {
    return writeCodexConfigs(this.channels);
  }

  async importCodexConfigs(): Promise<ImportedCodexConfig[]> {
    return readCodexConfigs();
  }

  async listCodexPluginCatalog(): Promise<CodexPluginCatalogItem[]> {
    const chat = this.createChatState("codex");
    return this.withCodexAppServer(chat, async (client) => {
      return this.codexPluginSummaries(await client.request("plugin/list", { cwds: [this.workDir] }));
    });
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

  createChat(agentId: AgentId = DEFAULT_AGENT): ChatSession {
    const chat = this.createChatState(agentId);
    this.chats.set(chat.id, chat);
    this.activeChatId = chat.id;
    this.emit();
    return this.serializeChat(chat);
  }

  selectChat(chatId: string): void {
    if (!this.chats.has(chatId)) return;
    this.activeChatId = chatId;
    this.emit();
  }

  setChatAgent(chatId: string, agentId: AgentId): void {
    const chat = this.chats.get(chatId);
    if (!chat || !this.canConfigureChat(chat)) return;
    chat.agentId = agentId;
    chat.channelId = defaultChannelForAgent(agentId, this.channels);
    chat.modelId = defaultModelForAgent(agentId);
    if (!hasAgentConversationMessages(chat.messages)) chat.title = defaultTitle(agentId);
    chat.updatedAt = Date.now();
    this.activeChatId = chatId;
    this.emit();
  }

  setChatModel(chatId: string, modelId: string): void {
    const chat = this.chats.get(chatId);
    if (!chat || !this.canConfigureChat(chat) || !isModelForChannel(chat.agentId, chat.channelId, modelId, this.channels)) return;
    chat.modelId = modelId;
    chat.updatedAt = Date.now();
    this.activeChatId = chatId;
    this.emit();
  }

  setChatChannel(chatId: string, channelId: string): void {
    const chat = this.chats.get(chatId);
    const channel = this.channelById(channelId);
    if (!chat || !channel || !this.canConfigureChat(chat) || channel.agentId !== chat.agentId) return;
    chat.channelId = channelId;
    chat.modelId = defaultModelForAgent(chat.agentId);
    chat.updatedAt = Date.now();
    this.activeChatId = chatId;
    this.emit();
  }

  private canConfigureChat(chat: ChatState): boolean {
    return !chat.running && !chat.sessionId && !hasAgentConversationMessages(chat.messages);
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
    this.workflowRuns.clear();
    this.activeWorkflowId = undefined;
    const chat = this.createChatState(DEFAULT_AGENT);
    this.chats.set(chat.id, chat);
    this.activeChatId = chat.id;
    this.activeTaskId = undefined;
    this.activeTeamRunId = undefined;
    this.emit();
  }

  updateWorkflowDraft(draft: WorkflowDraftState | undefined): AppSnapshot {
    if (!draft) {
      this.workflows.clear();
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

  createWorkflow(input: CreateWorkflowRequest): WorkflowOperationResult {
    if (this.workflows.size >= MAX_WORKFLOW_COUNT) return { ok: false, error: `Workflow count exceeds ${MAX_WORKFLOW_COUNT}.` };
    const limitError = this.workflowLimitError(input.graph, input.title, input.objective);
    if (limitError) return { ok: false, error: limitError };
    const validation = validateWorkflowGraph(input.graph);
    if (!validation.valid) return { ok: false, error: validation.errors[0] ?? "Workflow graph is invalid.", validation };
    const now = Date.now();
    const workflow = this.cloneWorkflowDraft({
      workflowId: `wf_${randomUUID()}`,
      title: input.title.trim() || input.graph.title,
      status: "draft",
      revision: 1,
      agentId: input.agentId ?? DEFAULT_AGENT,
      channelId: input.channelId ?? defaultChannelForAgent(input.agentId ?? DEFAULT_AGENT, this.channels),
      modelId: input.modelId ?? defaultModelForAgent(input.agentId ?? DEFAULT_AGENT),
      objective: input.objective.trim() || input.graph.objective,
      graph: input.graph,
      graphReady: input.graphReady ?? true,
      messages: input.messages ?? [],
      reply: input.reply ?? "",
      error: input.error,
      runProgress: input.runProgress ?? [],
      runContextDocument: input.runContextDocument ?? "",
      contextDocument: input.contextDocument ?? "",
      ...(input.finalReport !== undefined ? { finalReport: input.finalReport } : {}),
      runIds: input.runIds ?? [],
      agentSessionId: input.agentSessionId,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    });
    this.workflows.set(workflow.workflowId, workflow);
    this.activeWorkflowId = workflow.workflowId;
    this.emit();
    return { ok: true, workflowId: workflow.workflowId, revision: workflow.revision, validation };
  }

  selectWorkflow(workflowId: string): AppSnapshot {
    if (this.workflows.has(workflowId)) {
      this.activeWorkflowId = workflowId;
      this.emit();
    }
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
    const next = this.cloneWorkflowDraft({
      ...current,
      title: input.title ?? current.title,
      objective: input.objective ?? current.objective,
      graph,
      agentId: input.agentId ?? current.agentId,
      channelId: input.channelId ?? current.channelId,
      modelId: input.modelId ?? current.modelId,
      graphReady: input.graphReady ?? current.graphReady,
      messages: input.messages ?? current.messages,
      reply: input.reply ?? current.reply,
      error: input.error ?? current.error,
      runProgress: input.runProgress ?? current.runProgress,
      runContextDocument: input.runContextDocument ?? current.runContextDocument,
      contextDocument: input.contextDocument ?? current.contextDocument,
      ...((input.finalReport ?? current.finalReport) !== undefined ? { finalReport: input.finalReport ?? current.finalReport } : {}),
      agentSessionId: input.agentSessionId ?? current.agentSessionId,
      revision: current.revision + 1,
      updatedAt: Date.now(),
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
    const runId = `run_${randomUUID()}`;
    const run: WorkflowRunState = {
      runId,
      workflowId: workflow.workflowId,
      status: "running",
      graphSnapshot: this.cloneWorkflowGraph(workflow.graph),
      progress: [],
      contextDocument: input.contextDocument ?? workflow.contextDocument,
      startedAt: Date.now(),
      finishedAt: undefined,
      lastError: undefined,
    };
    this.workflowRuns.set(runId, run);
    this.workflows.set(workflow.workflowId, this.cloneWorkflowDraft({
      ...workflow,
      status: "running",
      runIds: [...workflow.runIds, runId],
      updatedAt: Date.now(),
    }));
    this.emit();
    return { ok: true, workflowId: workflow.workflowId, runId, revision: workflow.revision };
  }

  finishWorkflowRun(input: FinishWorkflowRunRequest): WorkflowOperationResult {
    const workflow = this.workflows.get(input.workflowId);
    const run = this.workflowRuns.get(input.runId);
    if (!workflow) return { ok: false, error: `Workflow ${input.workflowId} was not found.` };
    if (!run || run.workflowId !== input.workflowId) return { ok: false, error: `Workflow run ${input.runId} was not found.` };
    const nextRun: WorkflowRunState = {
      ...run,
      status: input.status,
      progress: input.progress ?? run.progress,
      contextDocument: input.contextDocument ?? run.contextDocument,
      ...((input.finalReport ?? run.finalReport) !== undefined ? { finalReport: input.finalReport ?? run.finalReport } : {}),
      finishedAt: Date.now(),
      lastError: input.lastError,
    };
    this.workflowRuns.set(run.runId, nextRun);
    this.workflows.set(workflow.workflowId, this.cloneWorkflowDraft({
      ...workflow,
      status: input.status,
      runProgress: input.progress ?? workflow.runProgress,
      runContextDocument: input.contextDocument ?? workflow.runContextDocument,
      ...((input.finalReport ?? workflow.finalReport) !== undefined ? { finalReport: input.finalReport ?? workflow.finalReport } : {}),
      updatedAt: Date.now(),
    }));
    this.emit();
    return { ok: true, workflowId: workflow.workflowId, runId: run.runId, revision: workflow.revision };
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
      channels: this.channels.map((channel) => ({ ...channel, models: channel.models.map((model) => ({ ...model })) })),
      chats: [...this.chats.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((chat) => this.serializeChat(chat)),
      tasks: [...this.tasks.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((task) => this.serializeTask(task)),
      teams: [...this.teams.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((team) => this.serializeTeam(team)),
      teamRuns: [...this.teamRuns.values()]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map((run) => this.serializeTeamRun(run)),
      workflowStore: this.cloneWorkflowStore(),
      workflowDraft: this.activeWorkflowDraft(),
    };
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
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

    const runtime = this.runtimes.get(chat.agentId);
    if (!runtime?.available) {
      chat.messages.push(createErrorMessage(`${chat.agentId} is not available on this machine.`));
      chat.lastError = `${chat.agentId} unavailable`;
      chat.updatedAt = Date.now();
      this.emit();
      return;
    }

    if (!hasAgentConversationMessages(chat.messages)) chat.title = titleFromPrompt(trimmedPrompt);
    chat.messages.push(createUserMessage(trimmedPrompt));
    chat.running = true;
    chat.lastError = undefined;
    chat.pendingAssistantMessageId = undefined;
    chat.updatedAt = Date.now();
    this.activeChatId = chat.id;
    this.emit();
    void this.runChat(chat, trimmedPrompt, runtime);
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
    const [command = "", ...args] = prompt.slice(1).trim().split(/\s+/).filter(Boolean);
    switch (command.toLowerCase()) {
      case "":
      case "help":
      case "h":
      case "?":
        return this.slashHelp();
      case "status":
        return this.slashStatus(chat);
      case "model":
      case "models":
        return this.slashModels(chat);
      case "plugin":
      case "plugins":
        return this.slashPlugins(chat, args);
      default:
        return `Unknown command: /${command}\nType /help to see available commands.`;
    }
  }

  private slashHelp(): string {
    return [
      "Slash commands",
      "/status - read Codex app-server config, model, plugin, and MCP status.",
      "/models - list models from Codex app-server.",
      "/plugins - list Codex plugins from app-server marketplaces.",
      "/help - show this command list.",
    ].join("\n");
  }

  private async slashStatus(chat: ChatState): Promise<string> {
    if (chat.agentId !== "codex") return "Codex app-server status\nThis status command is only available for Codex chats.";

    try {
      return await this.withCodexAppServer(chat, async (client) => {
        const configResult = asRecord(await client.request("config/read", { includeLayers: true, cwd: this.workDir })) ?? {};
        const config = asRecord(configResult.config) ?? {};
        const models = await this.readCodexModels(client);
        const pluginResult = await client.request("plugin/list", { cwds: [this.workDir] });
        const plugins = this.codexPluginSummaries(pluginResult);
        const mcpServers = await this.readCodexMcpServers(client, chat.sessionId);

        const model = asOptionalString(config.model) ?? "default";
        const provider = asOptionalString(config.model_provider) ?? "default";
        const approval = asOptionalString(config.approval_policy) ?? "default";
        const sandbox = asOptionalString(config.sandbox_mode) ?? "default";
        const reasoning = asOptionalString(config.model_reasoning_effort) ?? "default";
        const webSearch = asOptionalString(config.web_search) ?? "default";
        const enabledPlugins = plugins.filter((plugin) => plugin.enabled).length;
        const installedPlugins = plugins.filter((plugin) => plugin.installed).length;
        const visibleModels = models.filter((modelItem) => !asBoolean(asRecord(modelItem)?.hidden)).length;

        return [
          "Codex app-server status",
          `Model: ${model}`,
          `Provider: ${provider}`,
          `Approval: ${approval}`,
          `Sandbox: ${sandbox}`,
          `Reasoning: ${reasoning}`,
          `Web search: ${webSearch}`,
          `Models: ${visibleModels} visible, ${models.length} total`,
          `Plugins: ${plugins.length} total, ${enabledPlugins} enabled, ${installedPlugins} installed`,
          `MCP servers: ${mcpServers.length}`,
          `CWD: ${this.workDir}`,
        ].join("\n");
      });
    } catch (error) {
      return `Codex app-server status\nUnable to read Codex app-server status: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async slashModels(chat: ChatState): Promise<string> {
    if (chat.agentId !== "codex") return "Codex models\nModel catalog is only available for Codex chats.";

    try {
      return await this.withCodexAppServer(chat, async (client) => {
        const configResult = asRecord(await client.request("config/read", { includeLayers: true, cwd: this.workDir })) ?? {};
        const config = asRecord(configResult.config) ?? {};
        const currentModel = asOptionalString(config.model);
        const models = await this.readCodexModels(client);
        const visibleModels = models.filter((item) => !asBoolean(asRecord(item)?.hidden));
        const lines = visibleModels.map((item) => {
          const model = asRecord(item) ?? {};
          const id = asOptionalString(model.id) ?? asOptionalString(model.model) ?? "unknown";
          const displayName = asOptionalString(model.displayName) ?? id;
          const marker = id === currentModel || model.model === currentModel || model.isDefault === true ? "*" : "-";
          return `${marker} ${displayName} (${id})`;
        });
        return ["Codex models", ...lines].join("\n");
      });
    } catch (error) {
      return `Codex models\nUnable to read Codex model catalog: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async slashPlugins(chat: ChatState, args: string[]): Promise<string> {
    if (args.length > 0 && args[0] !== "list") {
      return "Plugins\nOnly /plugins and /plugin list are supported here for now.";
    }
    if (chat.agentId !== "codex") return "Plugins\nPlugins are currently Codex-specific in this app.";

    try {
      return await this.withCodexAppServer(chat, async (client) => {
        const plugins = this.codexPluginSummaries(await client.request("plugin/list", { cwds: [this.workDir] }));
        const enabledPlugins = plugins.filter((plugin) => plugin.enabled).length;
        const installedPlugins = plugins.filter((plugin) => plugin.installed).length;
        const grouped = new Map<string, CodexPluginCatalogItem[]>();
        for (const plugin of plugins) {
          const items = grouped.get(plugin.marketplace) ?? [];
          items.push(plugin);
          grouped.set(plugin.marketplace, items);
        }

        const lines = [`Codex plugins`, `${plugins.length} total, ${enabledPlugins} enabled, ${installedPlugins} installed`];
        for (const [marketplace, items] of grouped) {
          lines.push("", `Marketplace: ${marketplace}`);
          for (const plugin of items) {
            const state = plugin.enabled ? "enabled" : plugin.installed ? "installed" : "available";
            lines.push(`- ${plugin.id} [${state}]${plugin.version ? ` ${plugin.version}` : ""}`);
          }
        }
        return lines.join("\n");
      });
    } catch (error) {
      return `Codex plugins\nUnable to read Codex plugins: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async withCodexAppServer<T>(chat: ChatState, callback: (client: CodexRpcClient) => Promise<T>): Promise<T> {
    const executable = this.executables.codex;
    const channel = this.channelById(chat.channelId);
    const client = new CodexRpcClient({
      executable,
      cwd: this.workDir,
      extraArgs: codexAppServerConfigArgs(channel, chat.modelId),
      env: process.env as Record<string, string>,
      onEvent: () => undefined,
      onRequest: (id, method, params) => {
        this.respondToCodexServerRequest(client, id, method, params);
      },
    });

    await client.start();
    try {
      return await callback(client);
    } finally {
      await client.shutdown();
    }
  }

  private async readCodexModels(client: CodexRpcClient): Promise<unknown[]> {
    const models: unknown[] = [];
    let cursor: string | null = null;
    do {
      const result: Record<string, unknown> = asRecord(await client.request("model/list", { cursor, limit: 200, includeHidden: false })) ?? {};
      models.push(...asArray(result.data));
      cursor = asOptionalString(result.nextCursor) ?? null;
    } while (cursor);
    return models;
  }

  private async readCodexMcpServers(client: CodexRpcClient, threadId: string | undefined): Promise<unknown[]> {
    const servers: unknown[] = [];
    let cursor: string | null = null;
    do {
      const result: Record<string, unknown> =
        asRecord(
          await client.request("mcpServerStatus/list", {
            cursor,
            limit: 200,
            detail: "toolsAndAuthOnly",
            threadId: threadId ?? null,
          }),
        ) ?? {};
      servers.push(...asArray(result.data));
      cursor = asOptionalString(result.nextCursor) ?? null;
    } while (cursor);
    return servers;
  }

  private codexPluginSummaries(result: unknown): CodexPluginCatalogItem[] {
    const summaries: CodexPluginCatalogItem[] = [];
    const response = asRecord(result) ?? {};
    for (const marketplaceItem of asArray(response.marketplaces)) {
      const marketplace = asRecord(marketplaceItem) ?? {};
      const marketplaceName = asOptionalString(marketplace.name) ?? "unknown";
      for (const pluginItem of asArray(marketplace.plugins)) {
        const plugin = asRecord(pluginItem) ?? {};
        const id = asOptionalString(plugin.id);
        if (!id) continue;
        const summary: CodexPluginCatalogItem = {
          id,
          name: asOptionalString(plugin.name) ?? id,
          marketplace: marketplaceName,
          installed: asBoolean(plugin.installed),
          enabled: asBoolean(plugin.enabled),
        };
        const version = asOptionalString(plugin.localVersion);
        if (version) summary.version = version;
        summaries.push(summary);
      }
    }
    return summaries;
  }

  private respondToCodexServerRequest(client: CodexRpcClient, id: number, method: string, params: Record<string, unknown>): void {
    if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
      client.respond(id, { decision: "accept" });
      return;
    }
    if (method === "item/tool/requestUserInput") {
      client.respond(id, { answers: {} });
      return;
    }
    if (method === "mcpServer/elicitation/request") {
      client.respond(id, { action: "decline", content: null, _meta: null });
      return;
    }
    if (method === "item/permissions/requestApproval") {
      client.respond(id, { permissions: params.permissions ?? {}, scope: "turn" });
      return;
    }
    if (method === "item/tool/call" || method === "mcp/dynamicToolCall") {
      client.respond(id, {
        contentItems: [{ type: "inputText", text: "Multi Agent Chat does not handle Codex tool calls in the demo." }],
        success: false,
      });
      return;
    }
    client.respond(id, {});
  }

  async runTask(input: RunTaskRequest): Promise<AppSnapshot> {
    const task = this.createTaskState(input);
    this.tasks.set(task.id, task);
    this.activeTaskId = task.id;

    const runtime = this.runtimes.get(task.agentId);
    task.messages.push(createUserMessage(task.prompt));

    if (!runtime?.available) {
      task.status = "failed";
      task.running = false;
      task.lastError = `${task.agentId} unavailable`;
      task.messages.push(createErrorMessage(`${task.agentId} is not available on this machine.`));
      task.updatedAt = Date.now();
      this.emit();
      return this.snapshot();
    }

    task.status = "running";
    task.progress = "in_progress";
    task.running = true;
    task.lastError = undefined;
    task.pendingAssistantMessageId = undefined;
    task.updatedAt = Date.now();
    this.emit();
    void this.runChat(task, task.prompt, runtime);
    return this.snapshot();
  }

  async askWorkflowAgent(input: WorkflowAgentRequest, onEvent?: (event: WorkflowAgentEvent) => void): Promise<WorkflowAgentResponse> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("Workflow agent prompt is required");
    const runtime = this.runtimes.get(input.agentId);
    if (!runtime?.available) throw new Error(`${input.agentId} is not available on this machine.`);
    const channelId =
      input.channelId && this.channelById(input.channelId)?.agentId === input.agentId
        ? input.channelId
        : defaultChannelForAgent(input.agentId, this.channels);
    const modelId = input.modelId && isModelForChannel(input.agentId, channelId, input.modelId, this.channels) ? input.modelId : defaultModelForAgent(input.agentId);
    const workDir = input.workDir?.trim() || this.workDir;

    const requestId = input.requestId ?? randomUUID();
    if (input.agentId === "codex") {
      return this.askCodexWorkflowAgent({ requestId, prompt, runtime, channelId, modelId, workDir, sessionId: input.sessionId, onEvent });
    }
    return this.askClaudeWorkflowAgent({ requestId, prompt, runtime, modelId, workDir, sessionId: input.sessionId, onEvent });
  }

  async stopChat(chatId: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const stop = this.activeStops.get(chatId);
    this.activeStops.delete(chatId);
    if (stop) await stop();
    chat.running = false;
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

  private async deleteAgentSession(task: TaskState): Promise<void> {
    if (!task.sessionId || task.agentId !== "codex") return;
    const executable = this.executables.codex;
    try {
      await execFileAsync(executable, ["archive", task.sessionId], {
        cwd: process.cwd(),
        env: process.env,
        timeout: 10_000,
        windowsHide: true,
        maxBuffer: 1024 * 64,
      });
    } catch (error) {
      console.warn(`Failed to archive Codex session ${task.sessionId}:`, error);
    }
  }

  private createChatState(agentId: AgentId): ChatState {
    return new ChatState(agentId, defaultChannelForAgent(agentId, this.channels));
  }

  private createTaskState(input: RunTaskRequest): TaskState {
    const agentId = input.agentId;
    const channelId =
      input.channelId && this.channelById(input.channelId)?.agentId === agentId
        ? input.channelId
        : defaultChannelForAgent(agentId, this.channels);
    const modelId = input.modelId && isModelForChannel(agentId, channelId, input.modelId, this.channels) ? input.modelId : defaultModelForAgent(agentId);
    return new TaskState(input.prompt.trim(), agentId, channelId, modelId, input.workDir?.trim() || this.workDir);
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
      const agentId = isAgentId(member.agentId) ? member.agentId : DEFAULT_AGENT;
      const channelId =
        member.channelId && this.channelById(member.channelId)?.agentId === agentId ? member.channelId : defaultChannelForAgent(agentId, this.channels);
      const modelId = member.modelId && isModelForChannel(agentId, channelId, member.modelId, this.channels) ? member.modelId : defaultModelForAgent(agentId);
      const canvasPosition = this.normalizeCanvasPosition(member.canvasPosition);
      return {
        id: member.id || randomUUID(),
        roleName: member.roleName?.trim() || `Agent ${index + 1}`,
        prompt: member.prompt?.trim() ?? "",
        agentId,
        channelId,
        modelId,
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
          agentId: step.agentId,
          channelId: step.channelId,
          modelId: step.modelId,
        })),
    );
  }

  private cloneWorkflowGraphNode(node: WorkflowGraphNode): WorkflowGraphNode {
    const cloned: WorkflowGraphNode = {
      id: node.id,
      kind: node.kind,
      title: node.title,
      prompt: node.prompt,
    };
    if (isAgentId(node.agentId)) cloned.agentId = node.agentId;
    if (node.channelId !== undefined) cloned.channelId = node.channelId;
    if (node.modelId !== undefined) cloned.modelId = node.modelId;
    return cloned;
  }

  private cloneWorkflowGraphEdge(edge: WorkflowGraphEdge): WorkflowGraphEdge {
    return {
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
    };
  }

  private cloneWorkflowGraph(graph: WorkflowGraph): WorkflowGraph {
    return {
      title: graph.title,
      objective: graph.objective,
      nodes: graph.nodes.map((node) => this.cloneWorkflowGraphNode(node)),
      edges: graph.edges.map((edge) => this.cloneWorkflowGraphEdge(edge)),
    };
  }

  private activeWorkflowDraft(): WorkflowDraftState | undefined {
    const workflow = this.activeWorkflowId ? this.workflows.get(this.activeWorkflowId) : undefined;
    return workflow ? this.cloneWorkflowDraft(workflow) : undefined;
  }

  private cloneWorkflowStore(): WorkflowStoreState {
    return {
      activeWorkflowId: this.activeWorkflowId,
      workflows: [...this.workflows.values()]
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((workflow) => this.cloneWorkflowDraft(workflow)),
      runs: [...this.workflowRuns.values()]
        .sort((left, right) => right.startedAt - left.startedAt)
        .map((run) => this.cloneWorkflowRun(run)),
    };
  }

  private cloneWorkflowRun(run: WorkflowRunState): WorkflowRunState {
    return {
      runId: run.runId,
      workflowId: run.workflowId,
      status: run.status,
      graphSnapshot: this.cloneWorkflowGraph(run.graphSnapshot),
      progress: run.progress.map((item) => ({
        nodeId: item.nodeId,
        title: item.title,
        status: item.status,
        ...(item.detail !== undefined ? { detail: item.detail } : {}),
        ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
      })),
      contextDocument: run.contextDocument,
      ...(run.finalReport !== undefined ? { finalReport: run.finalReport } : {}),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      lastError: run.lastError,
    };
  }

  private cloneWorkflowDraft(draft: WorkflowDraftState): WorkflowDraftState {
    const agentId = isAgentId(draft.agentId) ? draft.agentId : DEFAULT_AGENT;
    const channelId = draft.channelId && this.channelById(draft.channelId)?.agentId === agentId ? draft.channelId : defaultChannelForAgent(agentId, this.channels);
    const modelId = isModelForChannel(agentId, channelId, draft.modelId, this.channels) ? draft.modelId : defaultModelForAgent(agentId);
    const now = Date.now();
    return {
      workflowId: draft.workflowId || `wf_${randomUUID()}`,
      title: draft.title || draft.graph.title || draft.objective || "Untitled workflow",
      status: this.normalizeWorkflowStatus(draft.status),
      revision: Number.isFinite(draft.revision) && draft.revision > 0 ? Math.floor(draft.revision) : 1,
      agentId,
      channelId,
      modelId,
      objective: draft.objective,
      graph: this.cloneWorkflowGraph(draft.graph),
      graphReady: draft.graphReady,
      messages: draft.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
      reply: draft.reply,
      error: draft.error,
      runProgress: draft.runProgress.map((item) => ({
        nodeId: item.nodeId,
        title: item.title,
        status: item.status,
        ...(item.detail !== undefined ? { detail: item.detail } : {}),
        ...(item.taskId !== undefined ? { taskId: item.taskId } : {}),
      })),
      runContextDocument: draft.runContextDocument,
      contextDocument: draft.contextDocument,
      ...(draft.finalReport !== undefined ? { finalReport: draft.finalReport } : {}),
      runIds: draft.runIds.map((runId) => runId),
      agentSessionId: draft.agentSessionId,
      createdAt: draft.createdAt || draft.updatedAt || now,
      updatedAt: draft.updatedAt,
    };
  }

  private normalizeWorkflowStatus(status: WorkflowStatus): WorkflowStatus {
    return status === "running" || status === "completed" || status === "failed" || status === "stopped" ? status : "draft";
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
      const channel = this.channelById(chat.channelId);
      if (!channel || channel.agentId !== chat.agentId) {
        chat.channelId = defaultChannelForAgent(chat.agentId, this.channels);
      }
      if (!isModelForChannel(chat.agentId, chat.channelId, chat.modelId, this.channels)) {
        chat.modelId = defaultModelForAgent(chat.agentId);
      }
    }
    for (const task of this.tasks.values()) {
      const channel = this.channelById(task.channelId);
      if (!channel || channel.agentId !== task.agentId) {
        task.channelId = defaultChannelForAgent(task.agentId, this.channels);
      }
      if (!isModelForChannel(task.agentId, task.channelId, task.modelId, this.channels)) {
        task.modelId = defaultModelForAgent(task.agentId);
      }
    }
    for (const team of this.teams.values()) {
      team.members = this.normalizeTeamMembers(team.members);
    }
    for (const workflow of this.workflows.values()) {
      this.workflows.set(workflow.workflowId, this.cloneWorkflowDraft(workflow));
    }
  }

  private serializeChat(chat: ChatState): ChatSession {
    return {
      id: chat.id,
      title: chat.title,
      agentId: chat.agentId,
      channelId: chat.channelId,
      modelId: chat.modelId,
      sessionId: chat.sessionId,
      running: chat.running,
      messages: chat.messages.map((message) => this.serializeMessage(message)),
      pendingAssistantMessageId: chat.pendingAssistantMessageId,
      lastError: chat.lastError,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }

  private serializeTask(task: TaskState): TaskRun {
    return {
      id: task.id,
      title: task.title,
      prompt: task.prompt,
      agentId: task.agentId,
      channelId: task.channelId,
      modelId: task.modelId,
      workDir: task.workDir,
      status: task.status,
      progress: task.progress,
      running: task.running,
      sessionId: task.sessionId,
      messages: task.messages.map((message) => this.serializeMessage(message)),
      pendingAssistantMessageId: task.pendingAssistantMessageId,
      lastError: task.lastError,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }

  private serializeTeam(team: AgentTeamState): AgentTeam {
    return {
      id: team.id,
      name: team.name,
      mode: team.mode,
      sharedContext: team.sharedContext,
      members: team.members.map((member) => cloneTeamMember(member)),
      workflow: buildWorkflowSnapshot({ mode: team.mode, members: team.members }),
      createdAt: team.createdAt,
      updatedAt: team.updatedAt,
    };
  }

  private serializeTeamRun(run: TeamRunState): TeamRun {
    return {
      id: run.id,
      teamId: run.teamId,
      teamName: run.teamName,
      title: run.title,
      prompt: run.prompt,
      target: run.target ? { ...run.target } : undefined,
      mode: run.mode,
      status: run.status,
      currentStepIndex: run.currentStepIndex,
      workDir: run.workDir,
      sharedContextSnapshot: run.sharedContextSnapshot,
      workflow: buildWorkflowSnapshot({
        mode: run.mode,
        members: run.membersSnapshot,
        steps: run.steps,
        runStatus: run.status,
      }),
      steps: run.steps.map((step) => ({ ...step })),
      lastError: run.lastError,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    };
  }

  private serializeMessage(message: ChatMessage): ChatMessage {
    const copy: ChatMessage = {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    };
    if (message.events && message.events.length > 0) {
      copy.events = message.events.map((event) => ({ ...event }));
    }
    if (message.local) copy.local = true;
    return copy;
  }

  private runWorkDir(run: RunState): string {
    return run.kind === "task" ? run.workDir : this.workDir;
  }

  private composeTeamStepPrompt(run: TeamRunState, stepIndex: number): string {
    const step = run.steps[stepIndex];
    const previousArtifacts = run.steps
      .slice(0, stepIndex)
      .filter((item) => item.artifact?.trim())
      .map((item, index) => [`### ${index + 1}. ${item.roleName}`, item.artifact].join("\n"))
      .join("\n\n");

    return [
      `You are running step ${stepIndex + 1} of ${run.steps.length} in the agent team "${run.teamName}".`,
      step ? `Role: ${step.roleName}` : "",
      "",
      "## Member Prompt",
      step?.prompt.trim() || "No member-specific prompt provided.",
      "",
      "## Original Task",
      run.prompt,
      "",
      "## Target",
      run.target ? `${run.target.label}: ${run.target.value}` : run.workDir,
      "",
      "## Shared Context",
      run.sharedContextSnapshot.trim() || "No shared context provided.",
      "",
      "## Previous Agent Artifacts",
      previousArtifacts || "No previous artifacts. You are the first step.",
      "",
      "## Instructions",
      "Produce a concise artifact for the next agent in this pipeline. Include decisions, risks, and concrete next steps when relevant.",
    ]
      .filter((part) => part !== "")
      .join("\n");
  }

  private async startTeamRunStep(teamRunId: string, stepIndex: number): Promise<void> {
    const run = this.teamRuns.get(teamRunId);
    if (!run || run.status !== "running") return;
    const step = run.steps[stepIndex];
    if (!step) {
      run.status = "completed";
      run.updatedAt = Date.now();
      this.emit();
      return;
    }
    if (step.status !== "queued") return;

    const prompt = this.composeTeamStepPrompt(run, stepIndex);
    const task = this.createTaskState({
      prompt,
      agentId: step.agentId,
      channelId: step.channelId,
      modelId: step.modelId,
      workDir: run.workDir,
    });
    task.title = `${run.teamName}: ${step.roleName}`;
    task.teamRunId = run.id;
    task.teamStepId = step.id;
    this.tasks.set(task.id, task);
    this.activeTaskId = task.id;

    step.status = "running";
    step.taskId = task.id;
    step.startedAt = Date.now();
    step.lastError = undefined;
    run.currentStepIndex = stepIndex;
    run.updatedAt = Date.now();

    const runtime = this.runtimes.get(task.agentId);
    task.messages.push(createUserMessage(task.prompt));

    if (!runtime?.available) {
      const error = `${task.agentId} is not available on this machine.`;
      task.status = "failed";
      task.running = false;
      task.lastError = `${task.agentId} unavailable`;
      task.messages.push(createErrorMessage(error));
      task.updatedAt = Date.now();
      this.failTeamStepFromTask(task, error);
      this.emit();
      return;
    }

    task.status = "running";
    task.progress = "in_progress";
    task.running = true;
    task.lastError = undefined;
    task.pendingAssistantMessageId = undefined;
    task.updatedAt = Date.now();
    this.emit();
    void this.runChat(task, task.prompt, runtime);
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

  private extractTaskArtifact(task: TaskState): string {
    return task.messages
      .filter((message) => message.role === "assistant" && message.content.trim())
      .map((message) => message.content.trim())
      .join("\n\n")
      .trim();
  }

  private finishTeamStepFromTask(task: TaskState): void {
    if (!task.teamRunId || !task.teamStepId) return;
    const run = this.teamRuns.get(task.teamRunId);
    const stepIndex = run?.steps.findIndex((step) => step.id === task.teamStepId) ?? -1;
    const step = stepIndex >= 0 ? run?.steps[stepIndex] : undefined;
    if (!run || !step || step.status !== "running") return;

    if (task.status === "completed") {
      step.status = "completed";
      step.artifact = this.extractTaskArtifact(task);
      step.lastError = undefined;
      step.completedAt = Date.now();
      run.updatedAt = step.completedAt;

      if (run.mode === "parallel") {
        if (run.steps.every((item) => item.status === "completed")) {
          run.status = "completed";
          run.currentStepIndex = stepIndex;
        }
        return;
      }

      if (run.mode === "supervisor" && this.advanceSupervisorRun(run, stepIndex)) {
        return;
      }

      const nextStep = run.steps[stepIndex + 1];
      if (nextStep) {
        run.currentStepIndex = stepIndex + 1;
        void this.startTeamRunStep(run.id, stepIndex + 1);
      } else {
        run.status = "completed";
        run.currentStepIndex = stepIndex;
      }
      return;
    }

    if (task.status === "stopped") {
      step.status = "stopped";
      step.lastError = task.lastError ?? "Stopped";
      step.completedAt = Date.now();
      run.status = "stopped";
      run.lastError = step.lastError;
      run.updatedAt = step.completedAt;
      return;
    }

    if (task.status === "failed") {
      this.failTeamStepFromTask(task, task.lastError ?? "Agent step failed");
    }
  }

  private advanceSupervisorRun(run: TeamRunState, completedStepIndex: number): boolean {
    if (run.steps.length <= 1) return false;
    const synthesisIndex = run.steps.length - 1;
    if (completedStepIndex === 0) {
      const workerIndexes = run.steps.slice(1, synthesisIndex).map((_step, offset) => offset + 1);
      if (workerIndexes.length === 0) {
        run.currentStepIndex = synthesisIndex;
        void this.startTeamRunStep(run.id, synthesisIndex);
        return true;
      }
      run.currentStepIndex = workerIndexes[0] ?? 0;
      for (const workerIndex of workerIndexes) {
        void this.startTeamRunStep(run.id, workerIndex);
      }
      return true;
    }

    if (completedStepIndex > 0 && completedStepIndex < synthesisIndex) {
      const workersComplete = run.steps.slice(1, synthesisIndex).every((item) => item.status === "completed");
      if (workersComplete) {
        run.currentStepIndex = synthesisIndex;
        void this.startTeamRunStep(run.id, synthesisIndex);
      }
      return true;
    }

    if (completedStepIndex === synthesisIndex) {
      run.status = "completed";
      run.currentStepIndex = synthesisIndex;
      return true;
    }

    return false;
  }

  private failTeamStepFromTask(task: TaskState, error: string): void {
    if (!task.teamRunId || !task.teamStepId) return;
    const run = this.teamRuns.get(task.teamRunId);
    const step = run?.steps.find((item) => item.id === task.teamStepId);
    if (!run || !step || step.status !== "running") return;
    step.status = "failed";
    step.lastError = error;
    step.completedAt = Date.now();
    run.status = "failed";
    run.lastError = error;
    run.updatedAt = step.completedAt;
  }

  private markRunExited(run: RunState): void {
    run.running = false;
    if (run.kind === "task" && run.status === "running") {
      run.status = run.lastError ? "failed" : "completed";
      if (!run.lastError) run.progress = "in_review";
    }
    if (run.kind === "task") this.finishTeamStepFromTask(run);
  }

  private markRunFailed(run: RunState, error: string): void {
    run.running = false;
    run.lastError = error;
    if (run.kind === "task") run.status = "failed";
    run.messages.push(createErrorMessage(error));
    run.updatedAt = Date.now();
    this.activeStops.delete(run.id);
    if (run.kind === "task") this.finishTeamStepFromTask(run);
    this.emit();
  }

  private async runChat(run: RunState, prompt: string, runtime: AgentRuntime): Promise<void> {
    const developerInstructions = run.kind === "task" ? CODEX_TASK_DEVELOPER_INSTRUCTIONS : CODEX_CHAT_DEVELOPER_INSTRUCTIONS;
    const executor = this.executorFactory.create({
      runId: run.id,
      runKind: run.kind,
      agentId: run.agentId,
      runtime,
      channelId: run.channelId,
      modelId: run.modelId,
      prompt,
      sessionId: run.sessionId,
      workDir: this.runWorkDir(run),
      developerInstructions,
      emit: (event) => this.handleAgentEvent(run, event),
      onExit: (code) => {
        if (run.agentId === "claude" && typeof code === "number" && code !== 0) run.lastError = `Claude exited with code ${code}`;
        this.markRunExited(run);
        run.updatedAt = Date.now();
        this.activeStops.delete(run.id);
        this.emit();
      },
    });
    this.activeStops.set(run.id, () => executor.stop());

    try {
      await executor.start();
    } catch (error) {
      this.markRunFailed(run, error instanceof Error ? error.message : String(error));
    }
  }

  private async askCodexWorkflowAgent(input: {
    requestId: string;
    prompt: string;
    runtime: AgentRuntime;
    channelId: string;
    modelId: string;
    workDir: string;
    sessionId: string | undefined;
    onEvent: ((event: WorkflowAgentEvent) => void) | undefined;
  }): Promise<WorkflowAgentResponse> {
    const executable = input.runtime.command || this.executables.codex;
    const model = runtimeModelId(input.modelId);
    const channel = this.channelById(input.channelId);

    let settled = false;
    let content = "";
    let sessionId = input.sessionId;
    let timeout: ReturnType<typeof createWorkflowAgentTimeout> | undefined;
    let client: CodexRpcClient | undefined;

    return new Promise<WorkflowAgentResponse>((resolve, reject) => {
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        timeout?.clear();
        void client?.shutdown();
        callback();
      };

      timeout = createWorkflowAgentTimeout({
        timeoutMs: WORKFLOW_AGENT_IDLE_TIMEOUT_MS,
        onTimeout: () => settle(() => reject(new Error("Workflow agent timed out after 10 minutes without activity"))),
      });

      client = new CodexRpcClient({
        executable,
        cwd: input.workDir,
        extraArgs: codexAppServerConfigArgs(channel, input.modelId),
        env: process.env as Record<string, string>,
        onEvent: (event) => {
          timeout?.refresh();
          if (event.type === "delta") {
            content += event.content;
            input.onEvent?.({ requestId: input.requestId, type: "delta", content: event.content });
            return;
          }
          if (event.type === "completed") {
            if (!content && event.content) content = event.content;
            input.onEvent?.({ requestId: input.requestId, type: "completed", content: content.trim(), sessionId });
            settle(() => resolve({ content: content.trim(), sessionId }));
            return;
          }
          if (event.type === "error") {
            input.onEvent?.({ requestId: input.requestId, type: "error", error: event.error });
            settle(() => reject(new Error(event.error)));
          }
        },
        onRequest: (id, method, params) => {
          if (client) this.respondToCodexServerRequest(client, id, method, params);
        },
        onExit: (_code, _signal, stderr) => {
          if (settled) return;
          settle(() => reject(new Error(stderr.trim() || "Workflow Codex agent exited before completing")));
        },
      });

      void (async () => {
        try {
          await client.start();
          const threadResult = sessionId
            ? await client.request("thread/resume", {
                threadId: sessionId,
                model,
                modelProvider: null,
                cwd: input.workDir,
                approvalPolicy: "never",
                config: null,
                baseInstructions: null,
                developerInstructions: CODEX_WORKFLOW_DEVELOPER_INSTRUCTIONS,
              })
            : await client.request("thread/start", {
                model,
                modelProvider: null,
                profile: null,
                cwd: input.workDir,
                approvalPolicy: "never",
                config: null,
                baseInstructions: null,
                developerInstructions: CODEX_WORKFLOW_DEVELOPER_INSTRUCTIONS,
                compactPrompt: null,
                includeApplyPatchTool: null,
                experimentalRawEvents: true,
                persistExtendedHistory: true,
              });

          sessionId = (threadResult as { thread?: { id?: string } }).thread?.id ?? sessionId;
          await client.request("turn/start", {
            threadId: sessionId,
            input: [{ type: "text", text: input.prompt, text_elements: [] }],
          });
        } catch (error) {
          settle(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
      })();
    });
  }

  private async askClaudeWorkflowAgent(input: {
    requestId: string;
    prompt: string;
    runtime: AgentRuntime;
    modelId: string;
    workDir: string;
    sessionId: string | undefined;
    onEvent: ((event: WorkflowAgentEvent) => void) | undefined;
  }): Promise<WorkflowAgentResponse> {
    let content = "";
    let sessionId = input.sessionId;
    let errorMessage: string | undefined;

    return new Promise<WorkflowAgentResponse>((resolve, reject) => {
      let timeout: ReturnType<typeof createWorkflowAgentTimeout> | undefined;
      let runner: ClaudeRunner | undefined;
      let settled = false;
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        timeout?.clear();
        callback();
      };
      timeout = createWorkflowAgentTimeout({
        timeoutMs: WORKFLOW_AGENT_IDLE_TIMEOUT_MS,
        onTimeout: () => {
          void runner?.stop();
          settle(() => reject(new Error("Workflow agent timed out after 10 minutes without activity")));
        },
      });
      runner = new ClaudeRunner({
        executable: input.runtime.command || this.executables.claude,
        cwd: input.workDir,
        env: process.env as Record<string, string>,
        prompt: input.prompt,
        modelId: runtimeModelId(input.modelId) ?? undefined,
        sessionId,
        onEvent: (event) => {
          timeout?.refresh();
          if (event.type === "delta") {
            content += event.content;
            input.onEvent?.({ requestId: input.requestId, type: "delta", content: event.content });
          }
          if (event.type === "completed" && !content && event.content) content = event.content;
          if (event.type === "session") sessionId = event.sessionId;
          if (event.type === "error") {
            errorMessage = event.error;
            input.onEvent?.({ requestId: input.requestId, type: "error", error: event.error });
          }
        },
        onExit: (code) => {
          if (code !== 0) {
            settle(() => reject(new Error(errorMessage ?? `Claude exited with code ${code}`)));
            return;
          }
          input.onEvent?.({ requestId: input.requestId, type: "completed", content: content.trim(), sessionId });
          settle(() => resolve({ content: content.trim(), sessionId }));
        },
      });
      void runner.start().catch((error) => {
        settle(() => reject(error instanceof Error ? error : new Error(String(error))));
      });
    });
  }

  private handleAgentEvent(run: RunState, event: AgentEvent): void {
    if (event.type === "session") {
      run.sessionId = event.sessionId;
      run.updatedAt = Date.now();
      this.emit();
      return;
    }

    if (event.type === "delta") {
      if (!run.pendingAssistantMessageId) {
        const message = createAssistantMessage(event.content);
        run.pendingAssistantMessageId = message.id;
        run.messages.push(message);
      } else {
        const message = run.messages.find((item) => item.id === run.pendingAssistantMessageId);
        if (message) message.content += event.content;
      }
      run.updatedAt = Date.now();
      this.emit();
      return;
    }

    if (event.type === "meta" || event.type === "system" || event.type === "tool_call" || event.type === "tool_result" || event.type === "handoff") {
      this.appendEventToAssistant(run, {
        id: randomUUID(),
        type: event.type,
        content: event.content,
        timestamp: Date.now(),
        ...("name" in event && event.name ? { name: event.name } : {}),
        ...("fromAgentId" in event && event.fromAgentId ? { fromAgentId: event.fromAgentId } : {}),
        ...("toAgentId" in event && event.toAgentId ? { toAgentId: event.toAgentId } : {}),
        ...("metadata" in event && event.metadata ? { metadata: event.metadata } : {}),
      });
      run.updatedAt = Date.now();
      this.emit();
      return;
    }

    if (event.type === "completed") {
      if (event.content) {
        if (!run.pendingAssistantMessageId) {
          run.messages.push(createAssistantMessage(event.content));
        }
      }
      run.pendingAssistantMessageId = undefined;
      run.running = false;
      if (run.kind === "task" && run.status !== "stopped") {
        run.status = "completed";
        run.progress = "in_review";
      }
      run.updatedAt = Date.now();
      const stop = this.activeStops.get(run.id);
      this.activeStops.delete(run.id);
      void stop?.();
      if (run.kind === "task") this.finishTeamStepFromTask(run);
      this.emit();
      return;
    }

    if (event.type === "error") {
      run.lastError = event.error;
      run.messages.push(createErrorMessage(event.error));
      run.pendingAssistantMessageId = undefined;
      run.running = false;
      if (run.kind === "task" && run.status !== "stopped") run.status = "failed";
      run.updatedAt = Date.now();
      const stop = this.activeStops.get(run.id);
      this.activeStops.delete(run.id);
      void stop?.();
      if (run.kind === "task") this.finishTeamStepFromTask(run);
      this.emit();
    }
  }

  private appendEventToAssistant(run: RunState, event: ChatEvent): void {
    let message = run.pendingAssistantMessageId
      ? run.messages.find((item) => item.id === run.pendingAssistantMessageId && item.role === "assistant")
      : undefined;

    if (!message) {
      message = [...run.messages].reverse().find((item) => item.role === "assistant");
    }

    if (!message) {
      message = createAssistantMessage();
      run.pendingAssistantMessageId = message.id;
      run.messages.push(message);
    }

    message.events = [...(message.events ?? []), event];
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
    this.schedulePersist();
  }

  private restorePersistedState(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const record = raw as Record<string, unknown>;
    if (record.version === 2) {
      this.restorePersistedStateV2(record);
      return;
    }
    this.restorePersistedStateV1(record);
  }

  private restorePersistedStateV1(record: Record<string, unknown>): void {
    const chats = Array.isArray(record.chats)
      ? record.chats.map((item) => this.restoreChatState(item)).filter((item): item is ChatState => Boolean(item))
      : [];
    this.installRestoredChats(chats, asOptionalString(record.activeChatId), asOptionalString(record.workDir));
    this.installRestoredTasks([], undefined);
    this.installRestoredTeams([], [], undefined, undefined);
  }

  private restorePersistedStateV2(record: Record<string, unknown>): void {
    const messagesByChat = new Map<string, ChatMessage[]>();
    if (Array.isArray(record.messages)) {
      for (const item of record.messages) {
        if (!item || typeof item !== "object") continue;
        const messageRecord = item as Record<string, unknown>;
        const chatId = asOptionalString(messageRecord.chatId);
        const message = this.restoreMessage(messageRecord);
        if (!chatId || !message) continue;
        const messages = messagesByChat.get(chatId) ?? [];
        messages.push(message);
        messagesByChat.set(chatId, messages);
      }
    }

    const eventsByMessage = new Map<string, ChatEvent[]>();
    if (Array.isArray(record.events)) {
      for (const item of record.events) {
        if (!item || typeof item !== "object") continue;
        const eventRecord = item as Record<string, unknown>;
        const messageId = asOptionalString(eventRecord.messageId);
        const event = this.restoreEvent(eventRecord);
        if (!messageId || !event) continue;
        const events = eventsByMessage.get(messageId) ?? [];
        events.push(event);
        eventsByMessage.set(messageId, events);
      }
    }

    for (const messages of messagesByChat.values()) {
      for (const message of messages) {
        const events = eventsByMessage.get(message.id);
        if (events && events.length > 0) message.events = events;
      }
    }

    const messagesByTask = new Map<string, ChatMessage[]>();
    if (Array.isArray(record.taskMessages)) {
      for (const item of record.taskMessages) {
        if (!item || typeof item !== "object") continue;
        const messageRecord = item as Record<string, unknown>;
        const taskId = asOptionalString(messageRecord.taskId);
        const message = this.restoreMessage(messageRecord);
        if (!taskId || !message) continue;
        const messages = messagesByTask.get(taskId) ?? [];
        messages.push(message);
        messagesByTask.set(taskId, messages);
      }
    }

    const taskEventsByMessage = new Map<string, ChatEvent[]>();
    if (Array.isArray(record.taskEvents)) {
      for (const item of record.taskEvents) {
        if (!item || typeof item !== "object") continue;
        const eventRecord = item as Record<string, unknown>;
        const messageId = asOptionalString(eventRecord.messageId);
        const event = this.restoreEvent(eventRecord);
        if (!messageId || !event) continue;
        const events = taskEventsByMessage.get(messageId) ?? [];
        events.push(event);
        taskEventsByMessage.set(messageId, events);
      }
    }

    for (const messages of messagesByTask.values()) {
      for (const message of messages) {
        const events = taskEventsByMessage.get(message.id);
        if (events && events.length > 0) message.events = events;
      }
    }

    const chats = Array.isArray(record.sessions)
      ? record.sessions
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const sessionRecord = item as Record<string, unknown>;
            const chatId = asOptionalString(sessionRecord.id);
            return this.restoreChatState({
              ...sessionRecord,
              messages: chatId ? messagesByChat.get(chatId) ?? [] : [],
            });
          })
          .filter((item): item is ChatState => Boolean(item))
      : [];
    this.installRestoredChats(chats, asOptionalString(record.activeChatId), asOptionalString(record.workDir));

    const tasks = Array.isArray(record.tasks)
      ? record.tasks
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const taskRecord = item as Record<string, unknown>;
            const taskId = asOptionalString(taskRecord.id);
            return this.restoreTaskState({
              ...taskRecord,
              messages: taskId ? messagesByTask.get(taskId) ?? [] : [],
            });
          })
          .filter((item): item is TaskState => Boolean(item))
      : [];
    this.installRestoredTasks(tasks, asOptionalString(record.activeTaskId));

    const teams = Array.isArray(record.teams)
      ? record.teams.map((item) => this.restoreTeamState(item)).filter((item): item is AgentTeamState => Boolean(item))
      : [];
    const teamRuns = Array.isArray(record.teamRuns)
      ? record.teamRuns.map((item) => this.restoreTeamRunState(item)).filter((item): item is TeamRunState => Boolean(item))
      : [];
    this.installRestoredTeams(teams, teamRuns, asOptionalString(record.activeTeamId), asOptionalString(record.activeTeamRunId));
    this.restoreWorkflowStore(record.workflowStore, record.workflowDraft);
  }

  private installRestoredChats(chats: ChatState[], activeChatId: string | undefined, workDir: string | undefined): void {
    this.chats.clear();
    for (const chat of chats) this.chats.set(chat.id, chat);

    if (this.chats.size === 0) {
      const chat = this.createChatState(DEFAULT_AGENT);
      this.chats.set(chat.id, chat);
      this.activeChatId = chat.id;
    } else {
      this.activeChatId = activeChatId && this.chats.has(activeChatId) ? activeChatId : [...this.chats.keys()][0];
    }

    if (workDir) this.workDir = workDir;
  }

  private installRestoredTasks(tasks: TaskState[], activeTaskId: string | undefined): void {
    this.tasks.clear();
    for (const task of tasks) this.tasks.set(task.id, task);
    this.activeTaskId = activeTaskId && this.tasks.has(activeTaskId) ? activeTaskId : [...this.tasks.keys()][0];
  }

  private installRestoredTeams(
    teams: AgentTeamState[],
    teamRuns: TeamRunState[],
    activeTeamId: string | undefined,
    activeTeamRunId: string | undefined,
  ): void {
    this.teams.clear();
    for (const team of teams) this.teams.set(team.id, team);
    this.teamRuns.clear();
    for (const run of teamRuns) this.teamRuns.set(run.id, run);
    this.activeTeamId = activeTeamId && this.teams.has(activeTeamId) ? activeTeamId : [...this.teams.keys()][0];
    this.activeTeamRunId = activeTeamRunId && this.teamRuns.has(activeTeamRunId) ? activeTeamRunId : [...this.teamRuns.keys()][0];
  }

  private restoreChatState(raw: unknown): ChatState | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (!isAgentId(record.agentId)) return null;

    const now = Date.now();
    const chat = new ChatState(record.agentId, defaultChannelForAgent(record.agentId, this.channels));
    chat.id = asOptionalString(record.id) ?? chat.id;
    chat.title = asOptionalString(record.title) ?? defaultTitle(record.agentId);
    const channelId = asOptionalString(record.channelId);
    chat.channelId = channelId && this.channelById(channelId)?.agentId === chat.agentId ? channelId : defaultChannelForAgent(chat.agentId, this.channels);
    const modelId = asOptionalString(record.modelId);
    chat.modelId = modelId && isModelForChannel(chat.agentId, chat.channelId, modelId, this.channels) ? modelId : defaultModelForAgent(chat.agentId);
    chat.sessionId = asOptionalString(record.sessionId);
    chat.running = false;
    chat.pendingAssistantMessageId = undefined;
    chat.lastError = asOptionalString(record.lastError);
    chat.createdAt = asNumber(record.createdAt, now);
    chat.updatedAt = asNumber(record.updatedAt, chat.createdAt);
    const messages = Array.isArray(record.messages)
      ? record.messages.map((message) => this.restoreMessage(message)).filter((message): message is ChatMessage => Boolean(message))
      : [];
    chat.messages = this.normalizeRestoredMessages(messages);
    return chat;
  }

  private restoreTaskState(raw: unknown): TaskState | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (!isAgentId(record.agentId) || typeof record.prompt !== "string") return null;

    const channelId = asOptionalString(record.channelId);
    const normalizedChannelId =
      channelId && this.channelById(channelId)?.agentId === record.agentId ? channelId : defaultChannelForAgent(record.agentId, this.channels);
    const modelId = asOptionalString(record.modelId);
    const normalizedModelId =
      modelId && isModelForChannel(record.agentId, normalizedChannelId, modelId, this.channels) ? modelId : defaultModelForAgent(record.agentId);
    const now = Date.now();
    const task = new TaskState(record.prompt, record.agentId, normalizedChannelId, normalizedModelId, asOptionalString(record.workDir) ?? this.workDir);
    task.id = asOptionalString(record.id) ?? task.id;
    task.title = asOptionalString(record.title) ?? titleFromPrompt(record.prompt);
    task.sessionId = asOptionalString(record.sessionId);
    task.progress = isTaskProgress(record.progress) ? record.progress : "todo";
    const status = isTaskRunStatus(record.status) ? record.status : "completed";
    task.status = status === "running" ? "failed" : status;
    task.running = false;
    task.pendingAssistantMessageId = undefined;
    task.lastError = asOptionalString(record.lastError);
    task.createdAt = asNumber(record.createdAt, now);
    task.updatedAt = asNumber(record.updatedAt, task.createdAt);
    const messages = Array.isArray(record.messages)
      ? record.messages.map((message) => this.restoreMessage(message)).filter((message): message is ChatMessage => Boolean(message))
      : [];
    task.messages = this.normalizeRestoredMessages(messages);
    return task;
  }

  private restoreTeamState(raw: unknown): AgentTeamState | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const name = asOptionalString(record.name);
    if (!name) return null;
    const now = Date.now();
    const team = new AgentTeamState(
      name,
      isAgentTeamMode(record.mode) ? record.mode : "pipeline",
      asOptionalString(record.sharedContext) ?? "",
      this.normalizeTeamMembers(asArray(record.members) as AgentTeamMember[]),
    );
    team.id = asOptionalString(record.id) ?? team.id;
    team.createdAt = asNumber(record.createdAt, now);
    team.updatedAt = asNumber(record.updatedAt, team.createdAt);
    return team;
  }

  private restoreTeamRunState(raw: unknown): TeamRunState | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const teamId = asOptionalString(record.teamId);
    const prompt = asOptionalString(record.prompt);
    if (!teamId || !prompt) return null;

    const placeholderTeam = new AgentTeamState(
      asOptionalString(record.teamName) ?? "Agent Team",
      isAgentTeamMode(record.mode) ? record.mode : "pipeline",
      "",
      [],
    );
    placeholderTeam.id = teamId;

    const now = Date.now();
    const run = new TeamRunState(
      placeholderTeam,
      prompt,
      isAgentWorkflowTarget(record.target) ? record.target : undefined,
      asOptionalString(record.workDir) ?? this.workDir,
    );
    run.id = asOptionalString(record.id) ?? run.id;
    run.teamName = asOptionalString(record.teamName) ?? placeholderTeam.name;
    run.title = asOptionalString(record.title) ?? titleFromPrompt(prompt);
    run.status = isTeamRunStatus(record.status) ? record.status : "failed";
    if (run.status === "running" || run.status === "queued") run.status = "failed";
    run.currentStepIndex = Math.max(0, Math.floor(asNumber(record.currentStepIndex, 0)));
    run.sharedContextSnapshot = asOptionalString(record.sharedContextSnapshot) ?? "";
    run.lastError = asOptionalString(record.lastError);
    run.createdAt = asNumber(record.createdAt, now);
    run.updatedAt = asNumber(record.updatedAt, run.createdAt);
    run.steps = asArray(record.steps).map((step) => this.restoreTeamRunStep(step)).filter((step): step is TeamRunStep => Boolean(step));
    const restoredMembers = this.normalizeTeamMembers(asArray(record.membersSnapshot) as AgentTeamMember[]);
    run.membersSnapshot = restoredMembers.length > 0 ? restoredMembers : this.teamMembersFromRunSteps(run.steps);
    return run;
  }

  private restoreTeamRunStep(raw: unknown): TeamRunStep | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (!isAgentId(record.agentId)) return null;
    return {
      id: asOptionalString(record.id) ?? randomUUID(),
      teamMemberId: asOptionalString(record.teamMemberId) ?? randomUUID(),
      roleName: asOptionalString(record.roleName) ?? "Agent",
      prompt: asOptionalString(record.prompt) ?? "",
      agentId: record.agentId,
      channelId: asOptionalString(record.channelId) ?? defaultChannelForAgent(record.agentId, this.channels),
      modelId: asOptionalString(record.modelId) ?? defaultModelForAgent(record.agentId),
      status:
        isTeamRunStepStatus(record.status) && record.status !== "running" && record.status !== "queued"
          ? record.status
          : "failed",
      taskId: asOptionalString(record.taskId),
      artifact: asOptionalString(record.artifact),
      lastError: asOptionalString(record.lastError),
      startedAt: typeof record.startedAt === "number" ? record.startedAt : undefined,
      completedAt: typeof record.completedAt === "number" ? record.completedAt : undefined,
    };
  }

  private restoreWorkflowStore(rawStore: unknown, legacyDraft: unknown): void {
    this.workflows.clear();
    this.workflowRuns.clear();
    this.activeWorkflowId = undefined;

    const storeRecord = asRecord(rawStore);
    if (storeRecord) {
      for (const item of asArray(storeRecord.workflows)) {
        const workflow = this.restoreWorkflowDraft(item);
        if (workflow) this.workflows.set(workflow.workflowId, workflow);
      }
      for (const item of asArray(storeRecord.runs)) {
        const run = this.restoreWorkflowRun(item);
        if (run) this.workflowRuns.set(run.runId, run);
      }
      const activeWorkflowId = asOptionalString(storeRecord.activeWorkflowId);
      this.activeWorkflowId =
        activeWorkflowId && this.workflows.has(activeWorkflowId)
          ? activeWorkflowId
          : [...this.workflows.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.workflowId;
      return;
    }

    const workflow = this.restoreWorkflowDraft(legacyDraft);
    if (!workflow) return;
    this.workflows.set(workflow.workflowId, workflow);
    this.activeWorkflowId = workflow.workflowId;
  }

  private restoreWorkflowDraft(raw: unknown): WorkflowDraftState | undefined {
    const record = asRecord(raw);
    if (!record || !isAgentId(record.agentId)) return undefined;
    const graph = this.restoreWorkflowGraph(record.graph);
    if (!graph) return undefined;
    const channelId = asOptionalString(record.channelId);
    const normalizedChannelId =
      channelId && this.channelById(channelId)?.agentId === record.agentId ? channelId : defaultChannelForAgent(record.agentId, this.channels);
    const modelId = asOptionalString(record.modelId);
    const finalReport = asOptionalString(record.finalReport);
    return this.cloneWorkflowDraft({
      workflowId: asOptionalString(record.workflowId) ?? `wf_${randomUUID()}`,
      title: asOptionalString(record.title) ?? graph.title,
      status: this.restoreWorkflowDraftStatus(record.status),
      revision: Math.max(1, Math.floor(asNumber(record.revision, 1))),
      agentId: record.agentId,
      channelId: normalizedChannelId,
      modelId: modelId && isModelForChannel(record.agentId, normalizedChannelId, modelId, this.channels) ? modelId : defaultModelForAgent(record.agentId),
      objective: asOptionalString(record.objective) ?? graph.objective,
      graph,
      graphReady: record.graphReady === true,
      messages: asArray(record.messages)
        .map((message) => {
          const messageRecord = asRecord(message);
          if (!messageRecord || !isWorkflowGrillMessageRole(messageRecord.role)) return undefined;
          return {
            id: asOptionalString(messageRecord.id) ?? randomUUID(),
            role: messageRecord.role,
            content: asOptionalString(messageRecord.content) ?? "",
          };
        })
        .filter((message): message is WorkflowDraftState["messages"][number] => Boolean(message)),
      reply: asOptionalString(record.reply) ?? "",
      error: asOptionalString(record.error),
      runProgress: asArray(record.runProgress)
        .map((item) => this.restoreWorkflowRunProgressItem(item))
        .filter((item): item is WorkflowRunProgressItem => Boolean(item)),
      runContextDocument: asOptionalString(record.runContextDocument) ?? "",
      contextDocument: asOptionalString(record.contextDocument) ?? "",
      ...(finalReport !== undefined ? { finalReport } : {}),
      runIds: asArray(record.runIds).map((item) => asOptionalString(item)).filter((item): item is string => Boolean(item)),
      agentSessionId: asOptionalString(record.agentSessionId),
      createdAt: asNumber(record.createdAt, asNumber(record.updatedAt, Date.now())),
      updatedAt: asNumber(record.updatedAt, Date.now()),
    });
  }

  private restoreWorkflowRun(raw: unknown): WorkflowRunState | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;
    const runId = asOptionalString(record.runId);
    const workflowId = asOptionalString(record.workflowId);
    const graphSnapshot = this.restoreWorkflowGraph(record.graphSnapshot);
    if (!runId || !workflowId || !graphSnapshot) return undefined;
    const finalReport = asOptionalString(record.finalReport);
    return {
      runId,
      workflowId,
      status: this.restoreWorkflowRunStatus(record.status),
      graphSnapshot,
      progress: asArray(record.progress)
        .map((item) => this.restoreWorkflowRunProgressItem(item))
        .filter((item): item is WorkflowRunProgressItem => Boolean(item)),
      contextDocument: asOptionalString(record.contextDocument) ?? "",
      ...(finalReport !== undefined ? { finalReport } : {}),
      startedAt: asNumber(record.startedAt, Date.now()),
      finishedAt: typeof record.finishedAt === "number" ? record.finishedAt : undefined,
      lastError: asOptionalString(record.lastError),
    };
  }

  private restoreWorkflowStatus(value: unknown): WorkflowStatus {
    return value === "running" || value === "completed" || value === "failed" || value === "stopped" ? value : "draft";
  }

  private restoreWorkflowDraftStatus(value: unknown): WorkflowStatus {
    const status = this.restoreWorkflowStatus(value);
    return status === "running" ? "failed" : status;
  }

  private restoreWorkflowRunStatus(value: unknown): WorkflowStatus {
    const status = this.restoreWorkflowStatus(value);
    return status === "running" ? "failed" : status;
  }

  private restoreWorkflowGraph(raw: unknown): WorkflowGraph | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;
    const title = asOptionalString(record.title);
    const objective = asOptionalString(record.objective);
    if (!title || !objective) return undefined;
    const nodes = asArray(record.nodes)
      .map((node) => this.restoreWorkflowGraphNode(node))
      .filter((node): node is WorkflowGraphNode => Boolean(node));
    const edges = asArray(record.edges)
      .map((edge) => this.restoreWorkflowGraphEdge(edge))
      .filter((edge): edge is WorkflowGraphEdge => Boolean(edge));
    if (nodes.length === 0) return undefined;
    return { title, objective, nodes, edges };
  }

  private restoreWorkflowGraphNode(raw: unknown): WorkflowGraphNode | undefined {
    const record = asRecord(raw);
    if (!record || !isWorkflowGraphNodeKind(record.kind)) return undefined;
    const id = asOptionalString(record.id);
    const title = asOptionalString(record.title);
    const prompt = asOptionalString(record.prompt);
    if (!id || title === undefined || prompt === undefined) return undefined;
    const node: WorkflowGraphNode = { id, kind: record.kind, title, prompt };
    if (isAgentId(record.agentId)) node.agentId = record.agentId;
    const channelId = asOptionalString(record.channelId);
    if (channelId !== undefined) node.channelId = channelId;
    const modelId = asOptionalString(record.modelId);
    if (modelId !== undefined) node.modelId = modelId;
    return node;
  }

  private restoreWorkflowGraphEdge(raw: unknown): WorkflowGraphEdge | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;
    const fromNodeId = asOptionalString(record.fromNodeId);
    const toNodeId = asOptionalString(record.toNodeId);
    if (!fromNodeId || !toNodeId) return undefined;
    return {
      id: asOptionalString(record.id) || `${fromNodeId}->${toNodeId}`,
      fromNodeId,
      toNodeId,
    };
  }

  private restoreWorkflowRunProgressItem(raw: unknown): WorkflowRunProgressItem | undefined {
    const record = asRecord(raw);
    if (!record) return undefined;
    const nodeId = asOptionalString(record.nodeId);
    const title = asOptionalString(record.title);
    if (!nodeId || !title || !isWorkflowRunNodeStatus(record.status)) return undefined;
    const status = record.status === "running" || record.status === "queued" ? "failed" : record.status;
    const item: WorkflowRunProgressItem = {
      nodeId,
      title,
      status,
    };
    const detail = asOptionalString(record.detail) ?? (status === "failed" && record.status !== "failed" ? "Interrupted before app restart" : undefined);
    if (detail) item.detail = detail;
    const taskId = asOptionalString(record.taskId);
    if (taskId) item.taskId = taskId;
    return item;
  }

  private restoreMessage(raw: unknown): ChatMessage | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (!isMessageRole(record.role) || typeof record.content !== "string") return null;
    const message: ChatMessage = {
      id: asOptionalString(record.id) ?? randomUUID(),
      role: record.role,
      content: record.content,
      timestamp: asNumber(record.timestamp, Date.now()),
    };
    if (record.local === true) message.local = true;
    if (Array.isArray(record.events)) {
      const events = record.events.map((event) => this.restoreEvent(event)).filter((event): event is ChatEvent => Boolean(event));
      if (events.length > 0) message.events = events;
    }
    return message;
  }

  private restoreEvent(raw: unknown): ChatEvent | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    if (!isChatEventType(record.type) || typeof record.content !== "string") return null;
    const event: ChatEvent = {
      id: asOptionalString(record.id) ?? randomUUID(),
      type: record.type,
      content: record.content,
      timestamp: asNumber(record.timestamp, Date.now()),
    };
    if (isAgentId(record.agentId)) event.agentId = record.agentId;
    const name = asOptionalString(record.name);
    if (name) event.name = name;
    if (isAgentId(record.fromAgentId)) event.fromAgentId = record.fromAgentId;
    if (isAgentId(record.toAgentId)) event.toAgentId = record.toAgentId;
    const metadata = asRecord(record.metadata);
    if (metadata) event.metadata = metadata;
    return event;
  }

  private normalizeRestoredMessages(messages: ChatMessage[]): ChatMessage[] {
    const normalized: ChatMessage[] = [];
    for (const message of messages) {
      if (message.role !== "meta") {
        normalized.push(message);
        continue;
      }

      const event: ChatEvent = {
        id: message.id,
        type: "meta",
        content: message.content,
        timestamp: message.timestamp,
      };
      let target = [...normalized].reverse().find((item) => item.role === "assistant");
      if (!target) {
        target = createAssistantMessage();
        target.timestamp = message.timestamp;
        normalized.push(target);
      }
      target.events = [...(target.events ?? []), event];
    }
    return normalized;
  }

  private schedulePersist(): void {
    if (!this.storagePath) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.persistState();
    }, PERSIST_DEBOUNCE_MS);
  }

  private buildPersistedPayload(): PersistedAppStateV2 {
    const sessions: PersistedChatSessionRecord[] = [];
    const messages: PersistedChatMessageRecord[] = [];
    const events: PersistedChatEventRecord[] = [];
    const tasks: PersistedTaskRunRecord[] = [];
    const taskMessages: PersistedTaskMessageRecord[] = [];
    const taskEvents: PersistedTaskEventRecord[] = [];
    const teams: PersistedAgentTeamRecord[] = [];
    const teamRuns: PersistedTeamRunRecord[] = [];

    for (const chat of this.chats.values()) {
      sessions.push({
        id: chat.id,
        title: chat.title,
        agentId: chat.agentId,
        channelId: chat.channelId,
        modelId: chat.modelId,
        sessionId: chat.sessionId,
        lastError: chat.lastError,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
      });
      for (const message of chat.messages) {
        messages.push({
          id: message.id,
          chatId: chat.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          ...(message.local ? { local: true } : {}),
        });
        for (const event of message.events ?? []) {
          events.push({
            ...event,
            chatId: chat.id,
            messageId: message.id,
          });
        }
      }
    }

    for (const task of this.tasks.values()) {
      tasks.push({
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        agentId: task.agentId,
        channelId: task.channelId,
        modelId: task.modelId,
        workDir: task.workDir,
        status: task.status,
        progress: task.progress,
        sessionId: task.sessionId,
        lastError: task.lastError,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
      for (const message of task.messages) {
        taskMessages.push({
          id: message.id,
          taskId: task.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          ...(message.local ? { local: true } : {}),
        });
        for (const event of message.events ?? []) {
          taskEvents.push({
            ...event,
            taskId: task.id,
            messageId: message.id,
          });
        }
      }
    }

    for (const team of this.teams.values()) {
      teams.push({
        id: team.id,
        name: team.name,
        mode: team.mode,
        sharedContext: team.sharedContext,
        members: team.members.map((member) => cloneTeamMember(member)),
        workflow: buildWorkflowSnapshot({ mode: team.mode, members: team.members }),
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      });
    }

    for (const run of this.teamRuns.values()) {
      teamRuns.push({
        id: run.id,
        teamId: run.teamId,
        teamName: run.teamName,
        title: run.title,
        prompt: run.prompt,
        membersSnapshot: run.membersSnapshot.map((member) => cloneTeamMember(member)),
        target: run.target ? { ...run.target } : undefined,
        mode: run.mode,
        status: run.status,
        currentStepIndex: run.currentStepIndex,
        workDir: run.workDir,
        sharedContextSnapshot: run.sharedContextSnapshot,
        workflow: buildWorkflowSnapshot({
          mode: run.mode,
          members: run.membersSnapshot,
          steps: run.steps,
          runStatus: run.status,
        }),
        steps: run.steps.map((step) => ({ ...step })),
        lastError: run.lastError,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
      });
    }

    return {
      version: 2,
      activeChatId: this.activeChatId ?? null,
      activeTaskId: this.activeTaskId ?? null,
      activeTeamId: this.activeTeamId ?? null,
      activeTeamRunId: this.activeTeamRunId ?? null,
      workDir: this.workDir,
      sessions,
      messages,
      events,
      tasks,
      taskMessages,
      taskEvents,
      teams,
      teamRuns,
      workflowStore: this.cloneWorkflowStore(),
    };
  }

  private async persistState(): Promise<void> {
    if (!this.storagePath) return;
    if (this.persistInFlight) await this.persistInFlight;

    const payload = this.buildPersistedPayload();
    if (this.sqliteStore) {
      this.persistInFlight = this.sqliteStore.save(payload);
      try {
        await this.persistInFlight;
      } catch (error) {
        console.warn(`Failed to persist app state to SQLite ${this.storagePath}:`, error);
      } finally {
        this.persistInFlight = undefined;
      }
      return;
    }

    const targetPath = this.storagePath;
    const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
    this.persistInFlight = (async () => {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      await rename(tempPath, targetPath);
    })();

    try {
      await this.persistInFlight;
    } catch (error) {
      console.warn(`Failed to persist chat history to ${targetPath}:`, error);
    } finally {
      this.persistInFlight = undefined;
    }
  }
}

export function getDefaultWorkDir(): string {
  return process.cwd();
}
