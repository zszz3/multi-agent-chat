import { contextBridge, ipcRenderer } from "electron";
import type {
  AgentChannel,
  AgentId,
  AppSnapshot,
  CodexPluginCatalogItem,
  CreateAgentTeamRequest,
  GeneratedConfigFile,
  ImportedCodexConfig,
  RunAgentTeamRequest,
  RunTaskRequest,
  TaskProgress,
  UpdateAgentTeamRequest,
  WorkflowAgentEvent,
  WorkflowAgentRequest,
  WorkflowAgentResponse,
  WorkflowDraftState,
} from "../shared/types";

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("snapshot:get"),
  refreshAgents: (): Promise<AppSnapshot> => ipcRenderer.invoke("agents:refresh"),
  createChat: (agentId?: AgentId): Promise<AppSnapshot> => ipcRenderer.invoke("chat:create", agentId),
  selectChat: (chatId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:select", chatId),
  setChatAgent: (chatId: string, agentId: AgentId): Promise<AppSnapshot> => ipcRenderer.invoke("chat:set-agent", chatId, agentId),
  setChatChannel: (chatId: string, channelId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:set-channel", chatId, channelId),
  setChatModel: (chatId: string, modelId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:set-model", chatId, modelId),
  saveModelChannels: (channels: AgentChannel[]): Promise<AppSnapshot> => ipcRenderer.invoke("model-channels:save", channels),
  generateCodexConfigs: (): Promise<GeneratedConfigFile[]> => ipcRenderer.invoke("model-channels:generate"),
  importCodexConfigs: (): Promise<ImportedCodexConfig[]> => ipcRenderer.invoke("model-channels:import-codex"),
  listCodexPlugins: (): Promise<CodexPluginCatalogItem[]> => ipcRenderer.invoke("codex:plugins:list"),
  setWorkDir: (workDir: string): Promise<AppSnapshot> => ipcRenderer.invoke("workdir:set", workDir),
  chooseWorkDir: (): Promise<AppSnapshot> => ipcRenderer.invoke("workdir:choose"),
  sendPrompt: (prompt: string, chatId?: string): Promise<AppSnapshot> => ipcRenderer.invoke("run:send", prompt, chatId),
  stopChat: (chatId: string): Promise<AppSnapshot> => ipcRenderer.invoke("run:stop", chatId),
  askWorkflowAgent: (request: WorkflowAgentRequest): Promise<WorkflowAgentResponse> => ipcRenderer.invoke("workflow-agent:ask", request),
  updateWorkflowDraft: (draft?: WorkflowDraftState): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:update", draft),
  onWorkflowAgentEvent: (callback: (event: WorkflowAgentEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: WorkflowAgentEvent) => callback(event);
    ipcRenderer.on("workflow-agent:event", listener);
    return () => ipcRenderer.removeListener("workflow-agent:event", listener);
  },
  runTask: (request: RunTaskRequest): Promise<AppSnapshot> => ipcRenderer.invoke("task:run", request),
  selectTask: (taskId: string): Promise<AppSnapshot> => ipcRenderer.invoke("task:select", taskId),
  stopTask: (taskId: string): Promise<AppSnapshot> => ipcRenderer.invoke("task:stop", taskId),
  updateTaskProgress: (taskId: string, progress: TaskProgress): Promise<AppSnapshot> => ipcRenderer.invoke("task:update-progress", taskId, progress),
  deleteTask: (taskId: string): Promise<AppSnapshot> => ipcRenderer.invoke("task:delete", taskId),
  createTeam: (request: CreateAgentTeamRequest): Promise<AppSnapshot> => ipcRenderer.invoke("team:create", request),
  updateTeam: (teamId: string, request: UpdateAgentTeamRequest): Promise<AppSnapshot> => ipcRenderer.invoke("team:update", teamId, request),
  deleteTeam: (teamId: string): Promise<AppSnapshot> => ipcRenderer.invoke("team:delete", teamId),
  selectTeam: (teamId: string): Promise<AppSnapshot> => ipcRenderer.invoke("team:select", teamId),
  selectTeamRun: (teamRunId: string): Promise<AppSnapshot> => ipcRenderer.invoke("team-run:select", teamRunId),
  runTeam: (request: RunAgentTeamRequest): Promise<AppSnapshot> => ipcRenderer.invoke("team-run:start", request),
  stopTeamRun: (teamRunId: string): Promise<AppSnapshot> => ipcRenderer.invoke("team-run:stop", teamRunId),
  clearHistory: (): Promise<AppSnapshot> => ipcRenderer.invoke("history:clear"),
  onSnapshot: (callback: (snapshot: AppSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("snapshot:changed", listener);
    return () => ipcRenderer.removeListener("snapshot:changed", listener);
  },
};

contextBridge.exposeInMainWorld("multiAgentChat", api);

export type MultiAgentChatApi = typeof api;
