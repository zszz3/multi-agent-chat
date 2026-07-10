export type AgentId = "codex" | "claude" | "api" | "hermes" | "opencode";

export interface AgentRuntime {
  id: AgentId;
  label: string;
  command: string;
  version: string | null;
  available: boolean;
  error?: string;
}

export interface AgentModelOption {
  id: string;
  label: string;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface ModelCatalogRefreshResult {
  channelId: string;
  source: "codex_cli" | "openai_models";
  discoveredCount: number;
  snapshot: AppSnapshot;
}

export interface AgentPluginConfig {
  id: string;
  enabled: boolean;
}

export type RuntimeProviderApiFormat = "anthropic" | "openai_chat" | "openai_responses" | "gemini_native";
export type ClaudeApiKeyField = "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";

export interface RuntimeRequestOverrides {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface CodexPluginCatalogItem {
  id: string;
  name: string;
  marketplace: string;
  installed: boolean;
  enabled: boolean;
  version?: string;
}

export interface AgentChannel {
  id: string;
  agentId: AgentId;
  label: string;
  models: AgentModelOption[];
  profileName?: string;
  presetId?: string;
  modelProvider?: string;
  providerName?: string;
  baseUrl?: string;
  wireApi?: string;
  httpHeaders?: Record<string, string>;
  apiFormat?: RuntimeProviderApiFormat;
  apiKeyField?: ClaudeApiKeyField;
  isFullUrl?: boolean;
  customUserAgent?: string;
  environment?: Record<string, string>;
  requestOverrides?: RuntimeRequestOverrides;
  plugins?: AgentPluginConfig[];
  modelCatalogJson?: string;
  modelReasoningEffort?: string;
}

export interface ConfiguredAgent {
  id: string;
  name: string;
  description: string;
  runtimeAgentId: AgentId;
  channelId: string;
  modelId: string;
  reasoningEffort?: string;
  tags: string[];
  managed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ResourceSourceType = "official" | "user";

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tags: string[];
  sourceLabel?: string;
  sourcePath?: string;
  sourceUrl?: string;
  translationZh?: string;
  sourceType?: ResourceSourceType;
}

export type SkillInstallTarget = "codex" | "claude" | "trae";

export interface InstallSkillRequest {
  templateId: string;
  target: SkillInstallTarget;
  sourceType?: ResourceSourceType;
}

export interface ImportOnlineSkillRequest {
  id: string;
  name: string;
  description: string;
  prompt: string;
  tags: string[];
  sourceLabel?: string;
  sourcePath?: string;
  sourceUrl?: string;
}

export interface UninstallSkillRequest {
  templateId: string;
  target: SkillInstallTarget;
}

export interface InstalledSkillResult {
  templateId: string;
  target: SkillInstallTarget;
  path: string;
  sourcePath: string;
  existed: boolean;
}

export interface ImportedSkillResult {
  template: SkillTemplate;
  path: string;
  existed: boolean;
}

export interface UninstalledSkillResult {
  templateId: string;
  target: SkillInstallTarget;
  path: string;
  removed: boolean;
}

export interface AgentTestResult {
  agentId: string;
  ok: boolean;
  status: "passed" | "failed";
  message: string;
  output?: string;
  elapsedMs: number;
  testedAt: number;
  runtimeAgentId: AgentId;
  channelId: string;
  modelId: string;
}

export type ProviderBalanceStatus = "success" | "unsupported" | "missing_key" | "error";

export interface ProviderBalanceItem {
  label?: string;
  remaining?: number;
  total?: number;
  used?: number;
  unit?: string;
  isValid?: boolean;
  invalidMessage?: string;
}

export interface ProviderBalanceResult {
  channelId: string;
  providerName?: string;
  supported: boolean;
  status: ProviderBalanceStatus;
  message: string;
  items: ProviderBalanceItem[];
  queriedAt: number;
}

export type AgentTestEvent =
  | { agentId: string; type: "phase"; content: string; timestamp: number }
  | { agentId: string; type: "user"; content: string; timestamp: number }
  | { agentId: string; type: "assistant_delta"; content: string; timestamp: number }
  | { agentId: string; type: "assistant"; content: string; timestamp: number }
  | { agentId: string; type: "tool"; content: string; timestamp: number }
  | { agentId: string; type: "warning"; content: string; timestamp: number }
  | { agentId: string; type: "stderr"; content: string; timestamp: number }
  | { agentId: string; type: "error"; content: string; timestamp: number };

export interface GeneratedConfigFile {
  channelId: string;
  modelId: string;
  profileName: string;
  path: string;
}

export interface ImportedCodexConfig {
  sourcePath: string;
  channel: AgentChannel;
}

export interface CodexDefaultConfig {
  modelProvider: string | null;
  providerName: string | null;
  baseUrl: string | null;
  wireApi: string | null;
  httpHeaders: Record<string, string> | null;
  apiKey: string | null;
  modelId: string | null;
  modelCatalogJson: string | null;
  modelReasoningEffort: string | null;
  plugins: AgentPluginConfig[] | null;
}

export type ExecutionStyle = "oneshot" | "interactive";
export type RuntimeExecutionMode = ExecutionStyle;
export type RuntimeContinuationPolicy = "fresh" | "resume-preferred" | "resume-required";

export interface RuntimeConfig {
  model: string;
  reasoningEffort?: string;
  [key: string]: unknown;
}

export interface RuntimeConversation {
  runtimeId: AgentId;
  codecVersion: string;
  payload: unknown;
}

export interface RuntimeRequest {
  runtimeId: AgentId;
  executionMode: RuntimeExecutionMode;
  continuationPolicy: RuntimeContinuationPolicy;
  runtimeConfig: RuntimeConfig;
  runtimeConversation?: RuntimeConversation;
}

export interface RuntimeResumeCapabilities {
  supportsInProcessConversationResume: boolean;
  supportsResumeAfterDetach: boolean;
  supportsResumeAfterAppRestart: boolean;
  supportsTurnResume: boolean;
}

export interface RuntimeInteractionCapabilities {
  supportsInterrupt: boolean;
  supportsContinue: boolean;
  supportsApprovalRequests: boolean;
  supportsUserInputRequests: boolean;
}

export type InteractionRequestState = "live" | "resolved" | "expired";
export type ApprovalDecision = "approved" | "rejected";

export interface ChatRuntimeSessionState {
  executionStyle: ExecutionStyle;
  attachmentState: "detached" | "idle" | "running" | "interrupted";
  attachmentGeneration: number;
  activeTurnId?: string;
  lastMeaningfulActivityAt?: number;
  capabilities: RuntimeResumeCapabilities & RuntimeInteractionCapabilities;
}

export type AgentEvent =
  | { type: "runtime_conversation"; runtimeConversation: RuntimeConversation }
  | { type: "delta"; content: string }
  | { type: "meta"; content: string }
  | { type: "system"; content: string; metadata?: Record<string, unknown> }
  | { type: "tool_call"; content: string; name?: string; metadata?: Record<string, unknown> }
  | { type: "tool_result"; content: string; name?: string; metadata?: Record<string, unknown> }
  | { type: "handoff"; content: string; fromAgentId?: AgentId; toAgentId?: AgentId; metadata?: Record<string, unknown> }
  | { type: "approval_request"; requestId: string; content: string; metadata?: Record<string, unknown> }
  | { type: "approval_response"; requestId: string; decision: ApprovalDecision; content?: string; metadata?: Record<string, unknown> }
  | { type: "user_input_request"; requestId: string; content: string; metadata?: Record<string, unknown> }
  | { type: "user_input_response"; requestId: string; content: string; metadata?: Record<string, unknown> }
  | { type: "completed"; content?: string }
  | { type: "error"; error: string };

export interface SendPromptRequest {
  prompt: string;
  agentIds: AgentId[];
  workDir: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error" | "meta";
  content: string;
  timestamp: number;
  events?: ChatEvent[];
  local?: boolean;
}

export interface ChatEvent {
  id: string;
  type:
    | "meta"
    | "system"
    | "tool_call"
    | "tool_result"
    | "handoff"
    | "approval_request"
    | "approval_response"
    | "user_input_request"
    | "user_input_response"
    | "error";
  content: string;
  timestamp: number;
  agentId?: AgentId;
  name?: string;
  fromAgentId?: AgentId;
  toAgentId?: AgentId;
  requestId?: string;
  requestState?: InteractionRequestState;
  decision?: ApprovalDecision;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  configuredAgentId: string;
  modelId: string;
  channelId?: string;
  runtimeState?: ChatRuntimeSessionState;
  runtimeConversation?: RuntimeConversation;
  running: boolean;
  messages: ChatMessage[];
  pendingAssistantMessageId: string | undefined;
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export type TaskRunStatus = "queued" | "running" | "completed" | "failed" | "stopped";
export type TaskProgress = "backlog" | "todo" | "in_progress" | "in_review" | "done";

export interface TaskRun {
  id: string;
  title: string;
  prompt: string;
  configuredAgentId: string;
  modelId: string;
  workDir: string;
  status: TaskRunStatus;
  progress: TaskProgress;
  running: boolean;
  runtimeConversation?: RuntimeConversation;
  messages: ChatMessage[];
  pendingAssistantMessageId: string | undefined;
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface RunTaskRequest {
  prompt: string;
  configuredAgentId: string;
  modelId?: string;
  workDir?: string;
}

export interface WorkflowAgentRequest extends RuntimeRequest {
  requestId?: string;
  prompt: string;
  configuredAgentId: string;
  workDir?: string;
}

export interface WorkflowAgentResponse {
  content: string;
  runtimeConversation?: RuntimeConversation;
}

export type WorkflowAgentEvent =
  | { requestId: string; type: "delta"; content: string }
  | { requestId: string; type: "workflow_graph"; graph: WorkflowGraph; workflowId?: string; revision?: number; content?: string }
  | { requestId: string; type: "completed"; content: string; runtimeConversation?: RuntimeConversation }
  | { requestId: string; type: "error"; error: string };

export type AgentTeamMode = "pipeline" | "parallel" | "supervisor";
export type AgentWorkflowTargetKind = "workspace" | "task" | "custom";

export interface AgentWorkflowTarget {
  kind: AgentWorkflowTargetKind;
  label: string;
  value: string;
}

export interface AgentCanvasPosition {
  x: number;
  y: number;
}

export type AgentWorkflowNodeKind = "start" | "agent" | "join" | "synthesis" | "done";
export type AgentWorkflowNodeStatus = "idle" | "queued" | "running" | "completed" | "failed" | "stopped";

export interface AgentWorkflowNode {
  id: string;
  kind: AgentWorkflowNodeKind;
  label: string;
  status: AgentWorkflowNodeStatus;
  teamMemberId?: string;
  stepId?: string;
  description?: string;
  canvasPosition?: AgentCanvasPosition;
}

export interface AgentWorkflowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
}

export interface AgentWorkflowPhase {
  id: string;
  title: string;
  nodeIds: string[];
}

export interface AgentWorkflowSnapshot {
  mode: AgentTeamMode;
  phases: AgentWorkflowPhase[];
  nodes: AgentWorkflowNode[];
  edges: AgentWorkflowEdge[];
}

export interface AgentTeamMember {
  id: string;
  roleName: string;
  prompt: string;
  configuredAgentId: string;
  canvasPosition?: AgentCanvasPosition;
}

export interface AgentTeam {
  id: string;
  name: string;
  mode: AgentTeamMode;
  sharedContext: string;
  members: AgentTeamMember[];
  workflow: AgentWorkflowSnapshot;
  createdAt: number;
  updatedAt: number;
}

export type TeamRunStatus = "queued" | "running" | "completed" | "failed" | "stopped";
export type TeamRunStepStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export interface TeamRunStep {
  id: string;
  teamMemberId: string;
  roleName: string;
  prompt: string;
  configuredAgentId: string;
  status: TeamRunStepStatus;
  taskId: string | undefined;
  artifact: string | undefined;
  lastError: string | undefined;
  startedAt: number | undefined;
  completedAt: number | undefined;
}

export interface TeamRun {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  prompt: string;
  target: AgentWorkflowTarget | undefined;
  mode: AgentTeamMode;
  status: TeamRunStatus;
  currentStepIndex: number;
  workDir: string;
  sharedContextSnapshot: string;
  workflow: AgentWorkflowSnapshot;
  steps: TeamRunStep[];
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentTeamRequest {
  name: string;
  mode?: AgentTeamMode;
  sharedContext?: string;
  members?: Array<Partial<Omit<AgentTeamMember, "id">> & { id?: string }>;
}

export interface UpdateAgentTeamRequest {
  name?: string;
  mode?: AgentTeamMode;
  sharedContext?: string;
  members?: Array<Partial<Omit<AgentTeamMember, "id">> & { id?: string }>;
}

export interface RunAgentTeamRequest {
  teamId: string;
  prompt: string;
  target?: AgentWorkflowTarget;
  workDir?: string;
}

export type WorkflowGraphNodeKind = "start" | "agent" | "end";

export interface WorkflowGraphNode {
  id: string;
  kind: WorkflowGraphNodeKind;
  title: string;
  prompt: string;
  /**
   * Optional per-node agent/model override. When set, this agent node runs with
   * this configured agent (and model) instead of the workflow-level default.
   */
  configuredAgentId?: string | undefined;
  modelId?: string | undefined;
  /**
   * Optional explicit canvas position. When set, the workflow board pins the
   * node here instead of auto-layout; agents (via MCP) and user drags both write
   * this. Omit it to let the auto wrapping layout place the node.
   */
  position?: { x: number; y: number };
}

export interface WorkflowGraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface WorkflowGraph {
  title: string;
  objective: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphValidation {
  valid: boolean;
  errors: string[];
  startNodeIds: string[];
  executableNodeIds: string[];
  topologicalNodeIds: string[];
}

export interface WorkflowGrillMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

export type WorkflowRunNodeStatus = "queued" | "running" | "paused" | "awaiting_input" | "completed" | "failed";

export interface WorkflowRunProgressItem {
  nodeId: string;
  title: string;
  status: WorkflowRunNodeStatus;
  detail?: string;
  taskId?: string;
}

export type WorkflowEventType =
  | "node_ready"
  | "node_started"
  | "node_paused"
  | "node_output"
  | "node_judged"
  | "node_failed"
  | "node_completed"
  | "gate_opened"
  | "gate_answered";

/**
 * Append-only record of a workflow run's node transitions. The event log is the
 * source of truth; the UI-facing progress list is projected from it via
 * projectNodeStates(). See src/main/WORKFLOW-RUNTIME.md.
 */
export interface WorkflowEvent {
  type: WorkflowEventType;
  nodeId: string;
  at: number;
  attempt?: number;
  taskId?: string;
  detail?: string;
  pass?: boolean;
  summary?: string;
  artifactRefs?: WorkflowArtifactReference[];
  error?: string;
  /** gate_opened: the concrete question the agent needs a human to answer. */
  question?: string;
  /** gate_answered: the human's answer that unblocks the node. */
  answer?: string;
}

export type WorkflowStatus = "draft" | "running" | "completed" | "failed" | "stopped";

export interface WorkflowArtifactReference {
  kind: "text" | "file" | "url";
  title: string;
  content?: string;
  path?: string;
  url?: string;
}

export interface LocalFilePreview {
  path: string;
  title: string;
  content: string;
  truncated: boolean;
}

/**
 * An artifact an agent deliberately published for the user to see, via the
 * `artifacts_register` MCP tool. `target` is the owning session id
 * (chatId | taskId | workflowId | runId). File paths are validated + resolved to
 * an absolute path under the work directory at registration time.
 */
export interface RegisteredArtifact {
  id: string;
  target: string;
  kind: "text" | "file" | "url";
  title: string;
  path?: string;
  url?: string;
  content?: string;
  description?: string;
  registeredAt: number;
}

export interface RegisterArtifactRequest {
  target: string;
  title?: string;
  kind?: "text" | "file" | "url";
  path?: string;
  url?: string;
  content?: string;
  description?: string;
}

export interface WorkflowDraftState {
  workflowId: string;
  sourceType?: ResourceSourceType;
  topologyLocked?: boolean;
  title: string;
  status: WorkflowStatus;
  revision: number;
  configuredAgentId: string;
  modelId: string;
  objective: string;
  /**
   * Dedicated working directory for this workflow. All node agents run with this
   * as their cwd, and outputs/memory are written under it. Defaults to a
   * per-workflow directory; can be pointed at a real project dir when needed.
   */
  workDir?: string;
  graph: WorkflowGraph;
  graphReady: boolean;
  messages: WorkflowGrillMessage[];
  reply: string;
  error: string | undefined;
  runProgress: WorkflowRunProgressItem[];
  runContextDocument: string;
  contextDocument: string;
  finalReport?: string;
  runIds: string[];
  runtimeConversation?: RuntimeConversation;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRunState {
  runId: string;
  workflowId: string;
  status: WorkflowStatus;
  graphSnapshot: WorkflowGraph;
  progress: WorkflowRunProgressItem[];
  events: WorkflowEvent[];
  contextDocument: string;
  finalReport?: string;
  startedAt: number;
  finishedAt: number | undefined;
  lastError: string | undefined;
}

export interface WorkflowStoreState {
  activeWorkflowId: string | undefined;
  workflows: WorkflowDraftState[];
  runs: WorkflowRunState[];
}

export const DEFAULT_SCHEDULED_WORKFLOW_CLOUD_BASE_URL = "";
export const DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY = "09:00";
export const DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE = "Asia/Shanghai";

export type ScheduledWorkflowRunStatus = "queued" | "running" | "completed" | "failed" | "skipped";
export type ScheduledWorkflowFrequency = "daily" | "weekly" | "monthly";

export interface ScheduledWorkflowRunnerConfig {
  baseUrl: string;
  tenantId?: string | undefined;
  userId?: string | undefined;
  deviceName?: string | undefined;
  deviceId?: string | undefined;
  runnerToken?: string | undefined;
}

export type RegisterScheduledWorkflowRunnerRequest = Pick<ScheduledWorkflowRunnerConfig, "baseUrl" | "tenantId" | "userId" | "deviceName">;

export interface ScheduledWorkflowRunnerStatus {
  connected: boolean;
  connecting: boolean;
  lastConnectedAt?: number | undefined;
  lastEventAt?: number | undefined;
  lastError?: string | undefined;
}

export interface ScheduledWorkflowSchedule {
  scheduleId: string;
  workflowId: string;
  title: string;
  enabled: boolean;
  intervalSeconds: number;
  frequency: ScheduledWorkflowFrequency;
  timeOfDay: string;
  timezone: string;
  weekdays?: number[] | undefined;
  dayOfMonth?: number | undefined;
  nextRunAt?: number | undefined;
  lastRunAt?: number | undefined;
  source: "local" | "cloud";
  createdAt: number;
  updatedAt: number;
}

export interface CreateScheduledWorkflowScheduleRequest {
  workflowId: string;
  title: string;
  enabled: boolean;
  intervalSeconds?: number | undefined;
  frequency: ScheduledWorkflowFrequency;
  timeOfDay: string;
  timezone: string;
  weekdays?: number[] | undefined;
  dayOfMonth?: number | undefined;
}

export type UpdateScheduledWorkflowScheduleRequest = Partial<CreateScheduledWorkflowScheduleRequest>;

export interface ScheduledWorkflowRun {
  runId: string;
  scheduleId: string;
  workflowId: string;
  eventId?: string | undefined;
  workflowRunId?: string | undefined;
  title: string;
  status: ScheduledWorkflowRunStatus;
  startedAt: number;
  finishedAt: number | undefined;
  message?: string | undefined;
}

export interface ScheduledWorkflowDueEvent {
  eventId: string;
  type: string;
  title: string;
  message: string;
  payload: Record<string, unknown>;
}

export interface AckScheduledWorkflowEventRequest {
  status: Extract<ScheduledWorkflowRunStatus, "completed" | "failed" | "skipped">;
  workflowRunId?: string | undefined;
  message?: string | undefined;
}

export interface ScheduledWorkflowStoreState {
  activeScheduleId: string | undefined;
  runnerConfig: ScheduledWorkflowRunnerConfig;
  runnerStatus: ScheduledWorkflowRunnerStatus;
  schedules: ScheduledWorkflowSchedule[];
  runs: ScheduledWorkflowRun[];
}

export interface ScheduledWorkflowOperationResult {
  ok: boolean;
  scheduleId?: string;
  runId?: string;
  error?: string;
}

export interface WorkflowOperationResult {
  ok: boolean;
  workflowId?: string;
  runId?: string;
  revision?: number;
  error?: string;
  validation?: WorkflowGraphValidation;
}

export interface CreateWorkflowRequest {
  title: string;
  objective: string;
  graph: WorkflowGraph;
  configuredAgentId?: string;
  modelId?: string;
  workDir?: string;
  graphReady?: boolean;
  messages?: WorkflowGrillMessage[];
  reply?: string;
  error?: string;
  runProgress?: WorkflowRunProgressItem[];
  runContextDocument?: string;
  contextDocument?: string;
  finalReport?: string;
  runIds?: string[];
  runtimeConversation?: RuntimeConversation;
  createdAt?: number;
  updatedAt?: number;
}

export interface CreateWorkflowDraftRequest {
  title?: string;
  configuredAgentId?: string;
  modelId?: string;
}

export interface PatchWorkflowDraftRequest {
  workflowId: string;
  title?: string;
  status?: WorkflowStatus;
  configuredAgentId?: string;
  modelId?: string;
  objective?: string;
  workDir?: string | null;
  graph?: WorkflowGraph;
  graphReady?: boolean;
  messages?: WorkflowGrillMessage[];
  reply?: string;
  error?: string | null;
  runProgress?: WorkflowRunProgressItem[];
  runContextDocument?: string;
  contextDocument?: string;
  finalReport?: string | null;
  runtimeConversation?: RuntimeConversation | null;
  resetRunState?: boolean;
}

export interface SendWorkflowDraftReplyRequest {
  workflowId: string;
  reply: string;
}

export interface UpdateWorkflowRequest {
  workflowId: string;
  expectedRevision?: number;
  title?: string;
  objective?: string;
  graph?: WorkflowGraph;
  configuredAgentId?: string;
  modelId?: string;
  graphReady?: boolean;
  messages?: WorkflowGrillMessage[];
  reply?: string;
  error?: string;
  runProgress?: WorkflowRunProgressItem[];
  runContextDocument?: string;
  contextDocument?: string;
  finalReport?: string;
  runtimeConversation?: RuntimeConversation;
}

export interface AppendWorkflowContextRequest {
  workflowId: string;
  report: string;
  handoff: string;
  artifacts?: WorkflowArtifactReference[];
}

export interface AppendWorkflowRunContextRequest extends AppendWorkflowContextRequest {
  runId: string;
  nodeId?: string;
}

export interface StartWorkflowRunRequest {
  workflowId: string;
  contextDocument?: string;
}

export interface RunWorkflowGraphRequest {
  workflowId: string;
  contextDocument?: string;
}

export interface PauseWorkflowNodeRequest {
  workflowId: string;
  runId: string;
  nodeId: string;
}

export interface StartWorkflowNodeRequest extends PauseWorkflowNodeRequest {}

export interface AnswerWorkflowGateRequest {
  workflowId: string;
  runId: string;
  nodeId: string;
  answer: string;
}

export interface FinishWorkflowRunRequest {
  workflowId: string;
  runId: string;
  status: Exclude<WorkflowStatus, "draft" | "running">;
  progress?: WorkflowRunProgressItem[];
  appendEvents?: WorkflowEvent[];
  contextDocument?: string;
  finalReport?: string;
  lastError?: string;
}

export interface AppSnapshot {
  detectedAt: number;
  activeChatId: string | undefined;
  activeTaskId: string | undefined;
  activeTeamId: string | undefined;
  activeTeamRunId: string | undefined;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  chats: ChatSession[];
  tasks: TaskRun[];
  teams: AgentTeam[];
  teamRuns: TeamRun[];
  workflowStore: WorkflowStoreState;
  scheduledWorkflowStore: ScheduledWorkflowStoreState;
  workflowDraft: WorkflowDraftState | undefined;
  artifacts: RegisteredArtifact[];
}
