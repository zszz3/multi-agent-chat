import { describe, expect, test, vi } from "vitest";

const electronState = vi.hoisted(() => ({
  exposedApi: undefined as Record<string, unknown> | undefined,
  exposedKey: "",
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((key: string, api: Record<string, unknown>) => {
      electronState.exposedKey = key;
      electronState.exposedApi = api;
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

describe("preload skill API", () => {
  test("exposes local install controls without runtime skill translation", async () => {
    vi.resetModules();
    electronState.exposedApi = undefined;
    electronState.exposedKey = "";

    await import("./index");

    expect(electronState.exposedKey).toBe("multiAgentChat");
    expect(electronState.exposedApi).toHaveProperty("installSkill");
    expect(electronState.exposedApi).toHaveProperty("uninstallSkill");
    expect(electronState.exposedApi).toHaveProperty("searchOnlineSkills");
    expect(electronState.exposedApi).toHaveProperty("revealPathInFinder");
    expect(electronState.exposedApi).toHaveProperty("getKeepAwake");
    expect(electronState.exposedApi).toHaveProperty("setKeepAwake");
    expect(electronState.exposedApi).toHaveProperty("saveScheduledWorkflowRunnerConfig");
    expect(electronState.exposedApi).toHaveProperty("upsertScheduledWorkflowSchedule");
    expect(electronState.exposedApi).toHaveProperty("deleteScheduledWorkflowSchedule");
    expect(electronState.exposedApi).toHaveProperty("recordScheduledWorkflowRun");
    expect(electronState.exposedApi).toHaveProperty("finishScheduledWorkflowRun");
    expect(electronState.exposedApi).toHaveProperty("refreshScheduledWorkflowSchedules");
    expect(electronState.exposedApi).toHaveProperty("createScheduledWorkflowSchedule");
    expect(electronState.exposedApi).toHaveProperty("updateScheduledWorkflowSchedule");
    expect(electronState.exposedApi).toHaveProperty("triggerScheduledWorkflowSchedule");
    expect(electronState.exposedApi).toHaveProperty("ackScheduledWorkflowEvent");
    expect(electronState.exposedApi).toHaveProperty("connectScheduledWorkflowRunner");
    expect(electronState.exposedApi).toHaveProperty("disconnectScheduledWorkflowRunner");
    expect(electronState.exposedApi).toHaveProperty("onScheduledWorkflowEvent");
    expect(electronState.exposedApi).toHaveProperty("queryRuntimeChannelBalance");
    expect(electronState.exposedApi).toHaveProperty("loadCodexDefaultConfig");
    expect(electronState.exposedApi).not.toHaveProperty("translateSkill");
  });
});
