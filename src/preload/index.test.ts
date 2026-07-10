import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AppSnapshot,
  BuildWorkflowV2GraphRevisionResult,
  BuildWorkflowV2PlanResult,
  ChatRuntimeSessionState,
  ChatSession,
} from "../shared/types";
import type { MultiAgentChatApi } from "./index";
import { describe, expect, expectTypeOf, test, vi } from "vitest";

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
    expect(electronState.exposedApi).toHaveProperty("listSkillCategories");
    expect(electronState.exposedApi).toHaveProperty("createSkillCategory");
    expect(electronState.exposedApi).toHaveProperty("assignSkillCategory");
    expect(electronState.exposedApi).toHaveProperty("revealPathInFinder");
    expect(electronState.exposedApi).toHaveProperty("getKeepAwake");
    expect(electronState.exposedApi).toHaveProperty("setKeepAwake");
    expect(electronState.exposedApi).toHaveProperty("createWorkflowDraft");
    expect(electronState.exposedApi).toHaveProperty("patchWorkflowDraft");
    expect(electronState.exposedApi).toHaveProperty("buildWorkflowV2Plan");
    expect(electronState.exposedApi).toHaveProperty("buildWorkflowV2GraphRevision");
    expect(electronState.exposedApi).toHaveProperty("resetWorkflowDraftSession");
    expect(electronState.exposedApi).toHaveProperty("sendWorkflowDraftReply");
    expect(electronState.exposedApi).toHaveProperty("abandonWorkflowDraftReply");
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
    expect(electronState.exposedApi).toHaveProperty("refreshModelCatalog");
    expect(electronState.exposedApi).not.toHaveProperty("translateSkill");
  });

  test("keeps runtime session typing stable across the preload snapshot surface", () => {
    expectTypeOf<Awaited<ReturnType<MultiAgentChatApi["getSnapshot"]>>>().toEqualTypeOf<AppSnapshot>();
    expectTypeOf<Awaited<ReturnType<MultiAgentChatApi["buildWorkflowV2Plan"]>>>().toEqualTypeOf<BuildWorkflowV2PlanResult>();
    expectTypeOf<Awaited<ReturnType<MultiAgentChatApi["buildWorkflowV2GraphRevision"]>>>().toEqualTypeOf<BuildWorkflowV2GraphRevisionResult>();
    expectTypeOf<ChatSession["runtimeState"]>().toEqualTypeOf<ChatRuntimeSessionState | undefined>();
    expectTypeOf<ChatSession["channelId"]>().toEqualTypeOf<string | undefined>();
  });
});

describe("AgentHub runtime recovery wiring", () => {
  test("initialize starts one central idle sweep while restored interactive chats stay detached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T00:00:00.000Z"));

    let hub: InstanceType<(typeof import("../main/hub/agent-hub"))["AgentHub"]> | undefined;

    try {
      const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-runtime-recovery-"));
      const storagePath = path.join(dir, "app-chats.json");
      await writeFile(
        storagePath,
        JSON.stringify({
          version: 4,
          activeChatId: "chat-1",
          workDir: dir,
          sessions: [
            {
              id: "chat-1",
              title: "Recovered interactive chat",
              configuredAgentId: "default-agent",
              modelId: "default",
              runtimeState: {
                executionStyle: "interactive",
                attachmentState: "running",
                attachmentGeneration: 8,
                activeTurnId: "turn-8-1",
                capabilities: {
                  supportsInProcessConversationResume: true,
                  supportsResumeAfterDetach: true,
                  supportsResumeAfterAppRestart: true,
                  supportsTurnResume: false,
                  supportsInterrupt: true,
                  supportsContinue: true,
                  supportsApprovalRequests: true,
                  supportsUserInputRequests: true,
                },
              },
              runtimeConversation: {
                runtimeId: "codex",
                codecVersion: "v1",
                payload: { native: { threadId: "thread-restore-1" } },
              },
              createdAt: 1710000000000,
              updatedAt: 1710000000000,
            },
          ],
          messages: [],
          events: [],
          tasks: [],
          taskMessages: [],
          taskEvents: [],
          teams: [],
          teamRuns: [],
        }),
        "utf8",
      );

      vi.resetModules();
      vi.doMock("../main/agents/runtime/detect", async () => {
        const actual = await vi.importActual<typeof import("../main/agents/runtime/detect")>("../main/agents/runtime/detect");
        return {
          ...actual,
          detectAgentRuntimes: vi.fn(async () => []),
        };
      });
      const { AgentHub } = await import("../main/hub/agent-hub");
      hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test" });
      await hub.loadPersistedState(storagePath);

      const sweepExpiredSessions = vi.fn(async () => undefined);
      (hub as any).interactiveSessions.sweepExpiredSessions = sweepExpiredSessions;

      await hub.initialize();
      await hub.initialize();
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

      expect(sweepExpiredSessions).toHaveBeenCalledTimes(1);
      expect(sweepExpiredSessions).toHaveBeenCalledWith(Date.now());
      expect(hub.snapshot().chats.find((chat) => chat.id === "chat-1")?.runtimeState).toMatchObject({
        attachmentState: "detached",
        attachmentGeneration: 0,
      });
      expect(hub.snapshot().chats.find((chat) => chat.id === "chat-1")?.runtimeState?.activeTurnId).toBeUndefined();
    } finally {
      if (hub) {
        const idleSweepTimer = (hub as any).idleSweepTimer as ReturnType<typeof setInterval> | undefined;
        if (idleSweepTimer) clearInterval(idleSweepTimer);
      }
      vi.unmock("../main/agents/runtime/detect");
      vi.useRealTimers();
      vi.resetModules();
    }
  });
});
