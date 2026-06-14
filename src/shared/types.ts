export type AgentId = "codex" | "claude";

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
}

export interface AgentPluginConfig {
  id: string;
  enabled: boolean;
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
  modelProvider?: string;
  providerName?: string;
  baseUrl?: string;
  wireApi?: string;
  httpHeaders?: Record<string, string>;
  plugins?: AgentPluginConfig[];
  modelCatalogJson?: string;
  modelReasoningEffort?: string;
}

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

export type AgentEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; content: string }
  | { type: "meta"; content: string }
  | { type: "system"; content: string; metadata?: Record<string, unknown> }
  | { type: "tool_call"; content: string; name?: string; metadata?: Record<string, unknown> }
  | { type: "tool_result"; content: string; name?: string; metadata?: Record<string, unknown> }
  | { type: "handoff"; content: string; fromAgentId?: AgentId; toAgentId?: AgentId; metadata?: Record<string, unknown> }
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
  type: "meta" | "system" | "tool_call" | "tool_result" | "handoff" | "error";
  content: string;
  timestamp: number;
  agentId?: AgentId;
  name?: string;
  fromAgentId?: AgentId;
  toAgentId?: AgentId;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  agentId: AgentId;
  channelId: string;
  modelId: string;
  sessionId: string | undefined;
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
  agentId: AgentId;
  channelId: string;
  modelId: string;
  workDir: string;
  status: TaskRunStatus;
  progress: TaskProgress;
  running: boolean;
  sessionId: string | undefined;
  messages: ChatMessage[];
  pendingAssistantMessageId: string | undefined;
  lastError: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface RunTaskRequest {
  prompt: string;
  agentId: AgentId;
  channelId?: string;
  modelId?: string;
  workDir?: string;
}

export interface WorkflowAgentRequest {
  requestId?: string;
  prompt: string;
  agentId: AgentId;
  channelId?: string;
  modelId?: string;
  workDir?: string;
  sessionId?: string;
}

export interface WorkflowAgentResponse {
  content: string;
  sessionId: string | undefined;
}

export type WorkflowAgentEvent =
  | { requestId: string; type: "delta"; content: string }
  | { requestId: string; type: "completed"; content: string; sessionId: string | undefined }
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
  agentId: AgentId;
  channelId: string;
  modelId: string;
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
  agentId: AgentId;
  channelId: string;
  modelId: string;
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
  agentId?: AgentId;
  channelId?: string;
  modelId?: string;
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

export type WorkflowRunNodeStatus = "queued" | "running" | "completed" | "failed";

export interface WorkflowRunProgressItem {
  nodeId: string;
  title: string;
  status: WorkflowRunNodeStatus;
  detail?: string;
  taskId?: string;
}

export type WorkflowStatus = "draft" | "running" | "completed" | "failed" | "stopped";

export interface WorkflowArtifactReference {
  kind: "text" | "file" | "url";
  title: string;
  content?: string;
  path?: string;
  url?: string;
}

export interface WorkflowDraftState {
  workflowId: string;
  title: string;
  status: WorkflowStatus;
  revision: number;
  agentId: AgentId;
  channelId: string;
  modelId: string;
  objective: string;
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
  agentSessionId: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowRunState {
  runId: string;
  workflowId: string;
  status: WorkflowStatus;
  graphSnapshot: WorkflowGraph;
  progress: WorkflowRunProgressItem[];
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
  agentId?: AgentId;
  channelId?: string;
  modelId?: string;
  graphReady?: boolean;
  messages?: WorkflowGrillMessage[];
  reply?: string;
  error?: string;
  runProgress?: WorkflowRunProgressItem[];
  runContextDocument?: string;
  contextDocument?: string;
  finalReport?: string;
  runIds?: string[];
  agentSessionId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface UpdateWorkflowRequest {
  workflowId: string;
  expectedRevision?: number;
  title?: string;
  objective?: string;
  graph?: WorkflowGraph;
  agentId?: AgentId;
  channelId?: string;
  modelId?: string;
  graphReady?: boolean;
  messages?: WorkflowGrillMessage[];
  reply?: string;
  error?: string;
  runProgress?: WorkflowRunProgressItem[];
  runContextDocument?: string;
  contextDocument?: string;
  finalReport?: string;
  agentSessionId?: string;
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

export interface FinishWorkflowRunRequest {
  workflowId: string;
  runId: string;
  status: Exclude<WorkflowStatus, "draft" | "running">;
  progress?: WorkflowRunProgressItem[];
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
  chats: ChatSession[];
  tasks: TaskRun[];
  teams: AgentTeam[];
  teamRuns: TeamRun[];
  workflowStore: WorkflowStoreState;
  workflowDraft: WorkflowDraftState | undefined;
}
