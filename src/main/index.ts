import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentHub } from "./agent-hub";
import type {
  AgentChannel,
  AgentId,
  CreateAgentTeamRequest,
  RunAgentTeamRequest,
  RunTaskRequest,
  TaskProgress,
  UpdateAgentTeamRequest,
  WorkflowAgentRequest,
  WorkflowDraftState,
} from "../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT_NAME = "Multi Agent Chat";
const CHAT_HISTORY_FILE = "app-chats.json";
const MODEL_CHANNELS_FILE = "model-channels.json";
const hub = new AgentHub();

let mainWindow: BrowserWindow | null = null;
let ipcRegistered = false;

function createWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, "../preload/index.mjs");
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: PRODUCT_NAME,
    backgroundColor: "#f8fafc",
    show: false,
    webPreferences: {
      preload: preloadPath,
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
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return window;
}

async function bootstrap(): Promise<void> {
  await app.whenReady();
  await hub.loadModelChannels(path.join(app.getPath("userData"), MODEL_CHANNELS_FILE));
  await hub.loadPersistedState(path.join(app.getPath("userData"), CHAT_HISTORY_FILE));

  registerIpcHandlers();
  hub.onChange((snapshot) => mainWindow?.webContents.send("snapshot:changed", snapshot));

  mainWindow = createWindow();
  await hub.initialize();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
}

function registerIpcHandlers(): void {
  if (ipcRegistered) return;
  ipcRegistered = true;
  ipcMain.handle("snapshot:get", () => hub.snapshot());
  ipcMain.handle("agents:refresh", async () => hub.refreshAgents());
  ipcMain.handle("chat:create", (_event, agentId?: AgentId) => {
    hub.createChat(agentId ?? "codex");
    return hub.snapshot();
  });
  ipcMain.handle("chat:select", (_event, chatId: string) => {
    hub.selectChat(chatId);
    return hub.snapshot();
  });
  ipcMain.handle("chat:set-agent", (_event, chatId: string, agentId: AgentId) => {
    hub.setChatAgent(chatId, agentId);
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
  ipcMain.handle("workflow:draft:update", (_event, draft?: WorkflowDraftState) => hub.updateWorkflowDraft(draft));
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
  void hub.flushPersistence();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
