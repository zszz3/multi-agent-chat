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
  type: "meta";
  content: string;
  timestamp: number;
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
}
