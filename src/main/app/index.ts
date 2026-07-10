import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, screen, shell, type OpenDialogOptions } from "electron";
import { createHash } from "node:crypto";
import { hostname, platform, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentHub } from "../hub/agent-hub";
import { setCodexChatRouterBaseUrl, startCodexChatRouter, type CodexChatRouterServer } from "../bridges/codex-chat-router";
import { createLocalTextFilePreviewUnderRoots } from "../platform/local-file-preview";
import { createPlatformServices } from "../platform/platform-services";
import { startMcpBridge, type McpBridgeServer } from "../bridges/mcp-bridge";
import { ScheduledWorkflowCloudClient, type ScheduledWorkflowCloudEventConnection } from "../workflows/scheduled-workflow-cloud";
import { deleteImportedSkillFromLibrary, importOnlineSkillToLibrary, installBundledSkill, uninstallBundledSkill } from "../skills/skill-installer";
import { loadBundledWorkflows } from "../workflows/bundled-workflows";
import { OfficialCatalogStore } from "../official-catalog-store";
import { UserSkillStore } from "../user-skill-store";
import { centeredWindowBounds } from "../platform/window-bounds";
import { createMainAppResourceLocator } from "./app-paths";
import { windowPresentationOptions } from "./window-options";
import { fetchOnlineSkills, ONLINE_SKILL_SOURCES } from "../../shared/online-skills";
import { SKILL_TEMPLATES } from "../../shared/skill-templates";
import { DEFAULT_SCHEDULED_WORKFLOW_CLOUD_BASE_URL } from "../../shared/types";
import type {
  AgentChannel,
  AckScheduledWorkflowEventRequest,
  AppSnapshot,
  CodexDefaultConfig,
  ConfiguredAgent,
  CreateWorkflowDraftRequest,
  CreateScheduledWorkflowScheduleRequest,
  CreateAgentTeamRequest,
  FinishWorkflowRunRequest,
  ImportOnlineSkillRequest,
  InstallSkillRequest,
  PatchWorkflowDraftRequest,
  AnswerWorkflowGateRequest,
  PauseWorkflowNodeRequest,
  RunAgentTeamRequest,
  RunWorkflowGraphRequest,
  RunTaskRequest,
  SendWorkflowDraftReplyRequest,
  StartWorkflowNodeRequest,
  ScheduledWorkflowRun,
  ScheduledWorkflowRunnerConfig,
  ScheduledWorkflowRunnerStatus,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowDueEvent,
  StartWorkflowRunRequest,
  TaskProgress,
  UninstallSkillRequest,
  UpdateAgentTeamRequest,
  WorkflowAgentRequest,
  WorkflowDraftState,
} from "../../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_NAME = "Multi Agent Chat";
const APP_DATABASE_FILE = "app.db";
const OFFICIAL_CATALOG_DATABASE_FILE = "official-catalog.db";
const MODEL_CHANNELS_FILE = "model-channels.json";
const MCP_BRIDGE_FILE = "mcp-bridge.json";
const DEFAULT_WINDOW_WIDTH = 1360;
const DEFAULT_WINDOW_HEIGHT = 860;
const MIN_WINDOW_WIDTH = 980;
const MIN_WINDOW_HEIGHT = 680;
const appResources = createMainAppResourceLocator({
  mainBundleDir: __dirname,
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
});
const platformServices = createPlatformServices(process.platform, { resourceLocator: appResources });
const hub = new AgentHub({}, undefined, undefined, undefined, platformServices);
const officialCatalog = new OfficialCatalogStore(path.join(app.getPath("userData"), OFFICIAL_CATALOG_DATABASE_FILE));
const userSkillStore = new UserSkillStore(path.join(app.getPath("userData"), APP_DATABASE_FILE));

let mainWindow: BrowserWindow | null = null;
let ipcRegistered = false;
let mcpBridge: McpBridgeServer | undefined;
let codexChatRouter: CodexChatRouterServer | undefined;
let keepAwakeBlockerId: number | undefined;
const scheduledWorkflowCloudClient = new ScheduledWorkflowCloudClient();
let scheduledWorkflowEventConnection: ScheduledWorkflowCloudEventConnection | undefined;

function createWindow(): BrowserWindow {
  const bounds = preferredWindowBounds();
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: PRODUCT_NAME,
    backgroundColor: "#ffffff",
    show: false,
    ...windowPresentationOptions(process.platform),
    webPreferences: {
      preload: appResources.preloadBundlePath(),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  window.on("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(appResources.rendererHtmlPath());
  }

  return window;
}

function preferredWindowBounds(): { x: number; y: number; width: number; height: number } {
  const cursorPoint = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursorPoint);
  return centeredWindowBounds(workArea, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT);
}

function setKeepAwake(enabled: boolean): boolean {
  if (enabled) {
    if (keepAwakeBlockerId !== undefined && powerSaveBlocker.isStarted(keepAwakeBlockerId)) return true;
    keepAwakeBlockerId = powerSaveBlocker.start("prevent-app-suspension");
    return powerSaveBlocker.isStarted(keepAwakeBlockerId);
  }
  if (keepAwakeBlockerId !== undefined && powerSaveBlocker.isStarted(keepAwakeBlockerId)) {
    powerSaveBlocker.stop(keepAwakeBlockerId);
  }
  keepAwakeBlockerId = undefined;
  return false;
}

function getKeepAwake(): boolean {
  return keepAwakeBlockerId !== undefined && powerSaveBlocker.isStarted(keepAwakeBlockerId);
}

function localScheduledWorkflowIdentity(): Pick<ScheduledWorkflowRunnerConfig, "baseUrl" | "tenantId" | "userId" | "deviceName"> {
  const userData = app.isReady() ? app.getPath("userData") : PRODUCT_NAME;
  const username = (() => {
    try {
      return userInfo().username;
    } catch {
      return "local";
    }
  })();
  const identityHash = createHash("sha256").update(`${userData}:${username}`).digest("hex").slice(0, 16);
  const host = hostname() || "local";
  return {
    baseUrl: DEFAULT_SCHEDULED_WORKFLOW_CLOUD_BASE_URL,
    tenantId: "multi-agent-chat",
    userId: `local-${identityHash}`,
    deviceName: `${host} (${platform()})`,
  };
}

function scheduledWorkflowRunnerConfigWithDefaults(config = hub.snapshot().scheduledWorkflowStore.runnerConfig): ScheduledWorkflowRunnerConfig {
  const identity = localScheduledWorkflowIdentity();
  return {
    ...config,
    baseUrl: config.baseUrl?.trim() || identity.baseUrl,
    tenantId: config.tenantId?.trim() || identity.tenantId,
    userId: config.userId?.trim() || identity.userId,
    deviceName: config.deviceName?.trim() || identity.deviceName,
  };
}

function scheduledWorkflowCloudConfig(): Pick<ScheduledWorkflowRunnerConfig, "baseUrl" | "runnerToken"> {
  const config = hub.snapshot().scheduledWorkflowStore.runnerConfig;
  return {
    baseUrl: config.baseUrl?.trim() || DEFAULT_SCHEDULED_WORKFLOW_CLOUD_BASE_URL,
    runnerToken: config.runnerToken,
  };
}

async function ensureScheduledWorkflowRunnerConfig(): Promise<ScheduledWorkflowRunnerConfig> {
  const current = scheduledWorkflowRunnerConfigWithDefaults();
  if (current.runnerToken?.trim()) {
    const snapshotConfig = hub.snapshot().scheduledWorkflowStore.runnerConfig;
    if (
      snapshotConfig.baseUrl !== current.baseUrl ||
      snapshotConfig.tenantId !== current.tenantId ||
      snapshotConfig.userId !== current.userId ||
      snapshotConfig.deviceName !== current.deviceName
    ) {
      hub.saveScheduledWorkflowRunnerConfig(current);
    }
    return current;
  }

  const registered = await scheduledWorkflowCloudClient.registerRunner(current);
  hub.saveScheduledWorkflowRunnerConfig(registered);
  return registered;
}

async function refreshScheduledWorkflowSchedulesFromCloud(): Promise<void> {
  await ensureScheduledWorkflowRunnerConfig();
  const schedules = await scheduledWorkflowCloudClient.listSchedules(scheduledWorkflowCloudConfig());
  hub.replaceScheduledWorkflowSchedules(schedules);
}

async function consumeScheduledWorkflowEvent(event: ScheduledWorkflowDueEvent): Promise<void> {
  hub.updateScheduledWorkflowRunnerStatus({ connected: true, connecting: false, lastEventAt: Date.now(), lastError: undefined });
  try {
    await hub.runScheduledWorkflowEvent(event, (eventId: string, request: AckScheduledWorkflowEventRequest) => {
      return scheduledWorkflowCloudClient.ackEvent(scheduledWorkflowCloudConfig(), eventId, request);
    });
    hub.updateScheduledWorkflowRunnerStatus({ lastError: undefined });
  } catch (error) {
    hub.updateScheduledWorkflowRunnerStatus({
      connected: false,
      connecting: false,
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
}

async function connectScheduledWorkflowRunner(): Promise<AppSnapshot> {
  scheduledWorkflowEventConnection?.close();
  scheduledWorkflowEventConnection = undefined;
  hub.updateScheduledWorkflowRunnerStatus({ connected: false, connecting: true, lastError: undefined });
  try {
    await ensureScheduledWorkflowRunnerConfig();
    await refreshScheduledWorkflowSchedulesFromCloud();
    scheduledWorkflowEventConnection = scheduledWorkflowCloudClient.connectEvents(scheduledWorkflowCloudConfig(), {
      onEvent: (event) => {
        void consumeScheduledWorkflowEvent(event);
      },
      onError: (error) => {
        scheduledWorkflowEventConnection = undefined;
        hub.updateScheduledWorkflowRunnerStatus({
          connected: false,
          connecting: false,
          lastError: error.message,
        });
      },
    });
    hub.updateScheduledWorkflowRunnerStatus({
      connected: true,
      connecting: false,
      lastConnectedAt: Date.now(),
      lastError: undefined,
    });
  } catch (error) {
    hub.updateScheduledWorkflowRunnerStatus({
      connected: false,
      connecting: false,
      lastError: error instanceof Error ? error.message : String(error),
    });
  }
  return hub.snapshot();
}

function disconnectScheduledWorkflowRunner(): AppSnapshot {
  scheduledWorkflowEventConnection?.close();
  scheduledWorkflowEventConnection = undefined;
  hub.updateScheduledWorkflowRunnerStatus({ connected: false, connecting: false });
  return hub.snapshot();
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  await hub.loadModelChannels(path.join(app.getPath("userData"), MODEL_CHANNELS_FILE));
  await hub.loadPersistedState(path.join(app.getPath("userData"), APP_DATABASE_FILE));
  const bundledWorkflows = await loadBundledWorkflows(appResources.bundledWorkflowsRoot());
  await officialCatalog.rebuild(bundledWorkflows, SKILL_TEMPLATES);
  hub.ensureBundledWorkflows(await officialCatalog.listWorkflows());
  codexChatRouter = await startCodexChatRouter({ channels: () => hub.snapshot().channels });
  setCodexChatRouterBaseUrl(codexChatRouter.baseUrl);
  mcpBridge = await startMcpBridge(hub, {
    discoveryPath: process.env.MULTI_AGENT_CHAT_MCP_BRIDGE || path.join(app.getPath("appData"), "multi-agent-chat", MCP_BRIDGE_FILE),
    bundledSkillsRoot: path.join(app.getPath("userData"), "bundled-skills"),
  });
  hub.setMcpBridgeDiscoveryPath(mcpBridge.discoveryPath);

  registerIpcHandlers();
  hub.onChange((snapshot) => mainWindow?.webContents.send("snapshot:changed", snapshot));

  mainWindow = createWindow();
  await hub.initialize();
  void hub.refreshDiscoverableModelCatalogs();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}

function registerIpcHandlers(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle("snapshot:get", () => hub.snapshot());
  ipcMain.handle("agents:refresh", async () => hub.refreshAgents());
  ipcMain.handle("chat:create", (_event, configuredAgentId?: string) => {
    hub.createChat(configuredAgentId);
    return hub.snapshot();
  });
  ipcMain.handle("chat:select", (_event, chatId: string) => {
    hub.selectChat(chatId);
    return hub.snapshot();
  });
  ipcMain.handle("chat:delete", (_event, chatId: string) => hub.deleteChat(chatId));
  ipcMain.handle("chat:set-agent", (_event, chatId: string, configuredAgentId: string) => {
    hub.setChatAgent(chatId, configuredAgentId);
    return hub.snapshot();
  });
  ipcMain.handle("chat:set-model", (_event, chatId: string, modelId: string) => {
    hub.setChatModel(chatId, modelId);
    return hub.snapshot();
  });
  ipcMain.handle("chat:set-channel", (_event, chatId: string, channelId: string) => {
    hub.setChatChannel(chatId, channelId);
    return hub.snapshot();
  });
  ipcMain.handle("model-channels:save", async (_event, channels: AgentChannel[]) => hub.saveModelChannels(channels));
  ipcMain.handle("configured-agents:save", async (_event, agents: ConfiguredAgent[]) => hub.updateConfiguredAgents(agents));
  ipcMain.handle("configured-agents:test", async (event, agentId: string) =>
    hub.testConfiguredAgent(agentId, (agentEvent) => event.sender.send("configured-agents:test-event", agentEvent)),
  );
  ipcMain.handle("runtime-channels:test", async (event, channelId: string) =>
    hub.testRuntimeChannel(channelId, (agentEvent) => event.sender.send("configured-agents:test-event", agentEvent)),
  );
  ipcMain.handle("runtime-channels:balance", async (_event, channelId: string) => hub.queryRuntimeChannelBalance(channelId));
  ipcMain.handle("runtime-channels:load-codex-default", async (): Promise<CodexDefaultConfig> => hub.loadCodexDefaultConfig());
  ipcMain.handle("runtime-channels:refresh-models", async (_event, channelId: string) => hub.refreshModelCatalog(channelId));
  ipcMain.handle("model-channels:generate", async () => hub.generateCodexConfigs());
  ipcMain.handle("model-channels:import-codex", async () => hub.importCodexConfigs());
  ipcMain.handle("codex:plugins:list", async () => hub.listCodexPluginCatalog());
  ipcMain.handle("workdir:set", (_event, workDir: string) => {
    hub.setWorkDir(workDir);
    return hub.snapshot();
  });
  ipcMain.handle("workdir:choose", async () => {
    const options: OpenDialogOptions = {
      title: "Choose work directory",
      defaultPath: hub.getWorkDir(),
      properties: ["openDirectory"],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths[0]) {
      hub.setWorkDir(result.filePaths[0]);
    }
    return hub.snapshot();
  });
  ipcMain.handle("dialog:pick-directory", async (_event, defaultPath?: string) => {
    const options: OpenDialogOptions = {
      title: "Choose workflow directory",
      defaultPath: defaultPath || hub.getWorkDir(),
      properties: ["openDirectory", "createDirectory"],
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? undefined : result.filePaths[0];
  });
  ipcMain.handle("workflow:outputs:list", (_event, workflowId: string) => hub.listWorkflowOutputs(workflowId));
  ipcMain.handle("file:read-text", async (_event, filePath: string) =>
    createLocalTextFilePreviewUnderRoots(filePath, hub.allowedFileRoots(), app.getPath("home")),
  );
  ipcMain.handle("file:reveal", async (_event, filePath: string) => {
    const targetPath = String(filePath ?? "").trim();
    if (!targetPath) throw new Error("Missing path to reveal.");
    const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);
    shell.showItemInFolder(resolvedPath);
    return resolvedPath;
  });
  ipcMain.handle("power:get-keep-awake", () => getKeepAwake());
  ipcMain.handle("power:set-keep-awake", (_event, enabled: boolean) => setKeepAwake(Boolean(enabled)));
  ipcMain.handle("skills:search-online", async (_event, query: string) => fetchOnlineSkills(String(query ?? ""), ONLINE_SKILL_SOURCES));
  ipcMain.handle("skills:list-official", async () => officialCatalog.listSkills());
  ipcMain.handle("skills:list-imported", async () => userSkillStore.list());
  ipcMain.handle("skills:import-online", async (_event, request: ImportOnlineSkillRequest) => {
    const result = await importOnlineSkillToLibrary(request, path.join(app.getPath("userData"), "bundled-skills"));
    await userSkillStore.upsert(result.template);
    return result;
  });
  ipcMain.handle("skills:delete-user", async (_event, templateId: string) => {
    const removed = await userSkillStore.delete(templateId);
    if (removed) await deleteImportedSkillFromLibrary(templateId, path.join(app.getPath("userData"), "bundled-skills"));
    return { templateId, removed };
  });
  ipcMain.handle("skills:install", async (_event, request: InstallSkillRequest) =>
    installBundledSkill(request, app.getPath("home"), path.join(app.getPath("userData"), "bundled-skills")),
  );
  ipcMain.handle("skills:uninstall", async (_event, request: UninstallSkillRequest) =>
    uninstallBundledSkill(request, app.getPath("home"), path.join(app.getPath("userData"), "bundled-skills")),
  );
  ipcMain.handle("run:send", (_event, prompt: string, chatId?: string) => {
    void hub.sendPrompt(prompt, chatId);
    return hub.snapshot();
  });
  ipcMain.handle("run:stop", (_event, chatId: string) => {
    void hub.stopChat(chatId);
    return hub.snapshot();
  });
  ipcMain.handle("workflow-agent:ask", async (event, request: WorkflowAgentRequest) =>
    hub.askWorkflowAgent(request, (agentEvent) => event.sender.send("workflow-agent:event", agentEvent)),
  );
  ipcMain.handle("workflow:draft:create", (_event, request?: CreateWorkflowDraftRequest) => hub.createWorkflowDraft(request));
  ipcMain.handle("workflow:draft:patch", (_event, request: PatchWorkflowDraftRequest) => hub.patchWorkflowDraft(request));
  ipcMain.handle("workflow:draft:reset-session", (_event, workflowId: string) => hub.resetWorkflowDraftSession(workflowId));
  ipcMain.handle("workflow:draft:send-reply", async (_event, request: SendWorkflowDraftReplyRequest) => hub.sendWorkflowDraftReply(request));
  ipcMain.handle("workflow:draft:abandon", (_event, workflowId: string) => hub.abandonWorkflowDraftReply(workflowId));
  ipcMain.handle("workflow:draft:update", (_event, draft?: WorkflowDraftState) => hub.updateWorkflowDraft(draft));
  ipcMain.handle("workflow:select", (_event, workflowId: string) => hub.selectWorkflow(workflowId));
  ipcMain.handle("workflow:rename", (_event, workflowId: string, title: string) => hub.renameWorkflow(workflowId, title));
  ipcMain.handle("workflow:delete", (_event, workflowId: string) => hub.deleteWorkflow(workflowId));
  ipcMain.handle("workflow-run:run-graph", (_event, request: RunWorkflowGraphRequest) => hub.runWorkflowGraph(request));
  ipcMain.handle("workflow-run:pause-node", (_event, request: PauseWorkflowNodeRequest) => hub.pauseWorkflowNode(request));
  ipcMain.handle("workflow-run:start-node", (_event, request: StartWorkflowNodeRequest) => hub.startWorkflowNode(request));
  ipcMain.handle("workflow-run:answer-gate", (_event, request: AnswerWorkflowGateRequest) => hub.answerWorkflowGate(request));
  ipcMain.handle("workflow-run:start", (_event, request: StartWorkflowRunRequest) => {
    hub.startWorkflowRun(request);
    return hub.snapshot();
  });
  ipcMain.handle("workflow-run:finish", (_event, request: FinishWorkflowRunRequest) => {
    hub.finishWorkflowRun(request);
    return hub.snapshot();
  });
  ipcMain.handle("scheduled-workflows:runner-config:save", (_event, config: ScheduledWorkflowRunnerConfig) =>
    hub.saveScheduledWorkflowRunnerConfig(config),
  );
  ipcMain.handle("scheduled-workflows:runner-status:update", (_event, status: Partial<ScheduledWorkflowRunnerStatus>) =>
    hub.updateScheduledWorkflowRunnerStatus(status),
  );
  ipcMain.handle("scheduled-workflows:schedule:upsert", (_event, schedule: ScheduledWorkflowSchedule) =>
    hub.upsertScheduledWorkflowSchedule(schedule),
  );
  ipcMain.handle("scheduled-workflows:schedule:replace-all", (_event, schedules: ScheduledWorkflowSchedule[]) =>
    hub.replaceScheduledWorkflowSchedules(schedules),
  );
  ipcMain.handle("scheduled-workflows:schedule:select", (_event, scheduleId: string) => hub.selectScheduledWorkflow(scheduleId));
  ipcMain.handle("scheduled-workflows:schedule:delete", (_event, scheduleId: string) => hub.deleteScheduledWorkflowSchedule(scheduleId));
  ipcMain.handle("scheduled-workflows:run:record", (_event, run: ScheduledWorkflowRun) => hub.recordScheduledWorkflowRun(run));
  ipcMain.handle(
    "scheduled-workflows:run:finish",
    (
      _event,
      runId: string,
      input: {
        status: "completed" | "failed" | "skipped";
        workflowRunId?: string;
        message?: string;
        finishedAt?: number;
      },
    ) => hub.finishScheduledWorkflowRun(runId, input),
  );
  ipcMain.handle("scheduled-workflows:cloud:refresh", async () => {
    try {
      await refreshScheduledWorkflowSchedulesFromCloud();
      hub.updateScheduledWorkflowRunnerStatus({ lastError: undefined });
    } catch (error) {
      hub.updateScheduledWorkflowRunnerStatus({ lastError: error instanceof Error ? error.message : String(error) });
    }
    return hub.snapshot();
  });
  ipcMain.handle("scheduled-workflows:cloud:create", async (_event, request: CreateScheduledWorkflowScheduleRequest) => {
    try {
      await ensureScheduledWorkflowRunnerConfig();
      const schedule = await scheduledWorkflowCloudClient.createSchedule(scheduledWorkflowCloudConfig(), request);
      hub.upsertScheduledWorkflowSchedule(schedule);
      hub.updateScheduledWorkflowRunnerStatus({ lastError: undefined });
    } catch (error) {
      hub.updateScheduledWorkflowRunnerStatus({ lastError: error instanceof Error ? error.message : String(error) });
    }
    return hub.snapshot();
  });
  ipcMain.handle("scheduled-workflows:cloud:update", async (_event, scheduleId: string, request: Partial<CreateScheduledWorkflowScheduleRequest>) => {
    try {
      await ensureScheduledWorkflowRunnerConfig();
      const schedule = await scheduledWorkflowCloudClient.updateSchedule(scheduledWorkflowCloudConfig(), scheduleId, request);
      hub.upsertScheduledWorkflowSchedule(schedule);
      hub.updateScheduledWorkflowRunnerStatus({ lastError: undefined });
    } catch (error) {
      hub.updateScheduledWorkflowRunnerStatus({ lastError: error instanceof Error ? error.message : String(error) });
    }
    return hub.snapshot();
  });
  ipcMain.handle("scheduled-workflows:cloud:delete", async (_event, scheduleId: string) => {
    try {
      await ensureScheduledWorkflowRunnerConfig();
      await scheduledWorkflowCloudClient.deleteSchedule(scheduledWorkflowCloudConfig(), scheduleId);
      hub.deleteScheduledWorkflowSchedule(scheduleId);
      hub.updateScheduledWorkflowRunnerStatus({ lastError: undefined });
    } catch (error) {
      hub.updateScheduledWorkflowRunnerStatus({ lastError: error instanceof Error ? error.message : String(error) });
    }
    return hub.snapshot();
  });
  ipcMain.handle("scheduled-workflows:cloud:trigger", async (_event, scheduleId: string) => {
    await ensureScheduledWorkflowRunnerConfig();
    const event = await scheduledWorkflowCloudClient.triggerSchedule(scheduledWorkflowCloudConfig(), scheduleId);
    void consumeScheduledWorkflowEvent(event);
    return event;
  });
  ipcMain.handle("scheduled-workflows:cloud:ack", async (_event, eventId: string, request: AckScheduledWorkflowEventRequest) => {
    await ensureScheduledWorkflowRunnerConfig();
    return scheduledWorkflowCloudClient.ackEvent(scheduledWorkflowCloudConfig(), eventId, request);
  });
  ipcMain.handle("scheduled-workflows:runner:connect", async () => connectScheduledWorkflowRunner());
  ipcMain.handle("scheduled-workflows:runner:disconnect", () => disconnectScheduledWorkflowRunner());
  ipcMain.handle("task:run", async (_event, request: RunTaskRequest) => hub.runTask(request));
  ipcMain.handle("task:select", (_event, taskId: string) => {
    hub.selectTask(taskId);
    return hub.snapshot();
  });
  ipcMain.handle("task:stop", async (_event, taskId: string) => {
    await hub.stopTask(taskId);
    return hub.snapshot();
  });
  ipcMain.handle("task:update-progress", (_event, taskId: string, progress: TaskProgress) => hub.updateTaskProgress(taskId, progress));
  ipcMain.handle("task:delete", async (_event, taskId: string) => hub.deleteTask(taskId));
  ipcMain.handle("team:create", (_event, request: CreateAgentTeamRequest) => hub.createTeam(request));
  ipcMain.handle("team:update", (_event, teamId: string, request: UpdateAgentTeamRequest) => hub.updateTeam(teamId, request));
  ipcMain.handle("team:delete", (_event, teamId: string) => hub.deleteTeam(teamId));
  ipcMain.handle("team:select", (_event, teamId: string) => hub.selectTeam(teamId));
  ipcMain.handle("team-run:select", (_event, teamRunId: string) => hub.selectTeamRun(teamRunId));
  ipcMain.handle("team-run:start", async (_event, request: RunAgentTeamRequest) => hub.runTeam(request));
  ipcMain.handle("team-run:stop", async (_event, teamRunId: string) => hub.stopTeamRun(teamRunId));
  ipcMain.handle("history:clear", () => {
    hub.clearHistory();
    return hub.snapshot();
  });
}

void bootstrap();

app.on("before-quit", () => {
  setKeepAwake(false);
  void hub.flushPersistence();
  scheduledWorkflowEventConnection?.close();
  void codexChatRouter?.stop();
  void mcpBridge?.stop();
  officialCatalog.close();
  userSkillStore.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
