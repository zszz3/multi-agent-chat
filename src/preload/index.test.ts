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
    expect(electronState.exposedApi).toHaveProperty("queryRuntimeChannelBalance");
    expect(electronState.exposedApi).not.toHaveProperty("translateSkill");
  });
});
