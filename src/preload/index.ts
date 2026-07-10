import { contextBridge, ipcRenderer } from "electron";
import type { OnlineSkillResult } from "../shared/online-skills";
import type {
  AgentChannel,
  AgentTestEvent,
  AgentTestResult,
  AckScheduledWorkflowEventRequest,
  AppSnapshot,
  BuildWorkflowV2GraphRevisionRequest,
  BuildWorkflowV2GraphRevisionResult,
  BuildWorkflowV2PlanRequest,
  BuildWorkflowV2PlanResult,
  CodexDefaultConfig,
  CodexPluginCatalogItem,
  ConfiguredAgent,
  CreateWorkflowDraftRequest,
  CreateScheduledWorkflowScheduleRequest,
  CreateAgentTeamRequest,
  PatchWorkflowDraftRequest,
  FinishWorkflowRunRequest,
  GeneratedConfigFile,
  ImportedCodexConfig,
  ImportedSkillResult,
  ImportOnlineSkillRequest,
  InstalledSkillResult,
  InstallSkillRequest,
  LocalFilePreview,
  ModelCatalogRefreshResult,
  AnswerWorkflowGateRequest,
  PauseWorkflowNodeRequest,
  ResolveWorkflowV2InterventionRequest,
  ProviderBalanceResult,
  RunWorkflowGraphRequest,
  RunAgentTeamRequest,
  RunTaskRequest,
  SendWorkflowDraftReplyRequest,
  StartWorkflowNodeRequest,
  ScheduledWorkflowOperationResult,
  ScheduledWorkflowRun,
  ScheduledWorkflowRunnerConfig,
  ScheduledWorkflowRunnerStatus,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowDueEvent,
  SkillTemplate,
  StartWorkflowRunRequest,
  TaskProgress,
  UninstalledSkillResult,
  UninstallSkillRequest,
  UpdateAgentTeamRequest,
  WorkflowAgentEvent,
  WorkflowAgentRequest,
  WorkflowAgentResponse,
  WorkflowDraftState,
  WorkflowOperationResult,
} from "../shared/types";

const api = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("snapshot:get"),
  refreshAgents: (): Promise<AppSnapshot> => ipcRenderer.invoke("agents:refresh"),
  createChat: (configuredAgentId?: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:create", configuredAgentId),
  selectChat: (chatId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:select", chatId),
  deleteChat: (chatId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:delete", chatId),
  setChatAgent: (chatId: string, configuredAgentId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:set-agent", chatId, configuredAgentId),
  setChatChannel: (chatId: string, channelId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:set-channel", chatId, channelId),
  setChatModel: (chatId: string, modelId: string): Promise<AppSnapshot> => ipcRenderer.invoke("chat:set-model", chatId, modelId),
  saveModelChannels: (channels: AgentChannel[]): Promise<AppSnapshot> => ipcRenderer.invoke("model-channels:save", channels),
  saveConfiguredAgents: (agents: ConfiguredAgent[]): Promise<AppSnapshot> => ipcRenderer.invoke("configured-agents:save", agents),
  testConfiguredAgent: (agentId: string): Promise<AgentTestResult> => ipcRenderer.invoke("configured-agents:test", agentId),
  testRuntimeChannel: (channelId: string): Promise<AgentTestResult> => ipcRenderer.invoke("runtime-channels:test", channelId),
  queryRuntimeChannelBalance: (channelId: string): Promise<ProviderBalanceResult> => ipcRenderer.invoke("runtime-channels:balance", channelId),
  loadCodexDefaultConfig: (): Promise<CodexDefaultConfig> => ipcRenderer.invoke("runtime-channels:load-codex-default"),
  refreshModelCatalog: (channelId: string): Promise<ModelCatalogRefreshResult> => ipcRenderer.invoke("runtime-channels:refresh-models", channelId),
  onAgentTestEvent: (callback: (event: AgentTestEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: AgentTestEvent) => callback(event);
    ipcRenderer.on("configured-agents:test-event", listener);
    return () => ipcRenderer.removeListener("configured-agents:test-event", listener);
  },
  generateCodexConfigs: (): Promise<GeneratedConfigFile[]> => ipcRenderer.invoke("model-channels:generate"),
  importCodexConfigs: (): Promise<ImportedCodexConfig[]> => ipcRenderer.invoke("model-channels:import-codex"),
  listCodexPlugins: (): Promise<CodexPluginCatalogItem[]> => ipcRenderer.invoke("codex:plugins:list"),
  setWorkDir: (workDir: string): Promise<AppSnapshot> => ipcRenderer.invoke("workdir:set", workDir),
  chooseWorkDir: (): Promise<AppSnapshot> => ipcRenderer.invoke("workdir:choose"),
  pickDirectory: (defaultPath?: string): Promise<string | undefined> => ipcRenderer.invoke("dialog:pick-directory", defaultPath),
  listWorkflowOutputs: (workflowId: string): Promise<Array<{ name: string; path: string }>> => ipcRenderer.invoke("workflow:outputs:list", workflowId),
  readLocalFile: (filePath: string): Promise<LocalFilePreview> => ipcRenderer.invoke("file:read-text", filePath),
  revealPathInFinder: (filePath: string): Promise<string> => ipcRenderer.invoke("file:reveal", filePath),
  getKeepAwake: (): Promise<boolean> => ipcRenderer.invoke("power:get-keep-awake"),
  setKeepAwake: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke("power:set-keep-awake", enabled),
  searchOnlineSkills: (query: string): Promise<OnlineSkillResult[]> => ipcRenderer.invoke("skills:search-online", query),
  listOfficialSkills: (): Promise<SkillTemplate[]> => ipcRenderer.invoke("skills:list-official"),
  listImportedSkills: (): Promise<SkillTemplate[]> => ipcRenderer.invoke("skills:list-imported"),
  importOnlineSkill: (request: ImportOnlineSkillRequest): Promise<ImportedSkillResult> => ipcRenderer.invoke("skills:import-online", request),
  deleteUserSkill: (templateId: string): Promise<{ templateId: string; removed: boolean }> => ipcRenderer.invoke("skills:delete-user", templateId),
  installSkill: (request: InstallSkillRequest): Promise<InstalledSkillResult> => ipcRenderer.invoke("skills:install", request),
  uninstallSkill: (request: UninstallSkillRequest): Promise<UninstalledSkillResult> => ipcRenderer.invoke("skills:uninstall", request),
  sendPrompt: (prompt: string, chatId?: string): Promise<AppSnapshot> => ipcRenderer.invoke("run:send", prompt, chatId),
  stopChat: (chatId: string): Promise<AppSnapshot> => ipcRenderer.invoke("run:stop", chatId),
  askWorkflowAgent: (request: WorkflowAgentRequest): Promise<WorkflowAgentResponse> => ipcRenderer.invoke("workflow-agent:ask", request),
  createWorkflowDraft: (request?: CreateWorkflowDraftRequest): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:create", request),
  patchWorkflowDraft: (request: PatchWorkflowDraftRequest): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:patch", request),
  buildWorkflowV2Plan: (request: BuildWorkflowV2PlanRequest): Promise<BuildWorkflowV2PlanResult> =>
    ipcRenderer.invoke("workflow-v2:plan", request),
  buildWorkflowV2GraphRevision: (request: BuildWorkflowV2GraphRevisionRequest): Promise<BuildWorkflowV2GraphRevisionResult> =>
    ipcRenderer.invoke("workflow-v2:graph-revision", request),
  resetWorkflowDraftSession: (workflowId: string): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:reset-session", workflowId),
  sendWorkflowDraftReply: (request: SendWorkflowDraftReplyRequest): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:send-reply", request),
  abandonWorkflowDraftReply: (workflowId: string): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:abandon", workflowId),
  updateWorkflowDraft: (draft?: WorkflowDraftState): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:draft:update", draft),
  selectWorkflow: (workflowId: string): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:select", workflowId),
  renameWorkflow: (workflowId: string, title: string): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:rename", workflowId, title),
  deleteWorkflow: (workflowId: string): Promise<AppSnapshot> => ipcRenderer.invoke("workflow:delete", workflowId),
  runWorkflowGraph: (request: RunWorkflowGraphRequest): Promise<WorkflowOperationResult> => ipcRenderer.invoke("workflow-run:run-graph", request),
  pauseWorkflowNode: (request: PauseWorkflowNodeRequest): Promise<WorkflowOperationResult> => ipcRenderer.invoke("workflow-run:pause-node", request),
  resolveWorkflowV2Intervention: (request: ResolveWorkflowV2InterventionRequest): Promise<WorkflowOperationResult> =>
    ipcRenderer.invoke("workflow-v2:intervention:resolve", request),
  startWorkflowNode: (request: StartWorkflowNodeRequest): Promise<WorkflowOperationResult> => ipcRenderer.invoke("workflow-run:start-node", request),
  answerWorkflowGate: (request: AnswerWorkflowGateRequest): Promise<WorkflowOperationResult> => ipcRenderer.invoke("workflow-run:answer-gate", request),
  startWorkflowRun: (request: StartWorkflowRunRequest): Promise<AppSnapshot> => ipcRenderer.invoke("workflow-run:start", request),
  finishWorkflowRun: (request: FinishWorkflowRunRequest): Promise<AppSnapshot> => ipcRenderer.invoke("workflow-run:finish", request),
  saveScheduledWorkflowRunnerConfig: (config: ScheduledWorkflowRunnerConfig): Promise<AppSnapshot> =>
    ipcRenderer.invoke("scheduled-workflows:runner-config:save", config),
  updateScheduledWorkflowRunnerStatus: (status: Partial<ScheduledWorkflowRunnerStatus>): Promise<AppSnapshot> =>
    ipcRenderer.invoke("scheduled-workflows:runner-status:update", status),
  upsertScheduledWorkflowSchedule: (schedule: ScheduledWorkflowSchedule): Promise<ScheduledWorkflowOperationResult> =>
    ipcRenderer.invoke("scheduled-workflows:schedule:upsert", schedule),
  replaceScheduledWorkflowSchedules: (schedules: ScheduledWorkflowSchedule[]): Promise<AppSnapshot> =>
    ipcRenderer.invoke("scheduled-workflows:schedule:replace-all", schedules),
  selectScheduledWorkflowSchedule: (scheduleId: string): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:schedule:select", scheduleId),
  deleteScheduledWorkflowSchedule: (scheduleId: string): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:schedule:delete", scheduleId),
  recordScheduledWorkflowRun: (run: ScheduledWorkflowRun): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:run:record", run),
  finishScheduledWorkflowRun: (
    runId: string,
    input: {
      status: "completed" | "failed" | "skipped";
      workflowRunId?: string;
      message?: string;
      finishedAt?: number;
    },
  ): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:run:finish", runId, input),
  refreshScheduledWorkflowSchedules: (): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:cloud:refresh"),
  createScheduledWorkflowSchedule: (request: CreateScheduledWorkflowScheduleRequest): Promise<AppSnapshot> =>
    ipcRenderer.invoke("scheduled-workflows:cloud:create", request),
  updateScheduledWorkflowSchedule: (scheduleId: string, request: Partial<CreateScheduledWorkflowScheduleRequest>): Promise<AppSnapshot> =>
    ipcRenderer.invoke("scheduled-workflows:cloud:update", scheduleId, request),
  triggerScheduledWorkflowSchedule: (scheduleId: string): Promise<ScheduledWorkflowDueEvent> =>
    ipcRenderer.invoke("scheduled-workflows:cloud:trigger", scheduleId),
  ackScheduledWorkflowEvent: (eventId: string, request: AckScheduledWorkflowEventRequest): Promise<void> =>
    ipcRenderer.invoke("scheduled-workflows:cloud:ack", eventId, request),
  connectScheduledWorkflowRunner: (): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:runner:connect"),
  disconnectScheduledWorkflowRunner: (): Promise<AppSnapshot> => ipcRenderer.invoke("scheduled-workflows:runner:disconnect"),
  onScheduledWorkflowEvent: (callback: (event: ScheduledWorkflowDueEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: ScheduledWorkflowDueEvent) => callback(event);
    ipcRenderer.on("scheduled-workflows:event", listener);
    return () => ipcRenderer.removeListener("scheduled-workflows:event", listener);
  },
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
