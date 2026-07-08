import { describe, expect, test, vi } from "vitest";
import type { AgentExecutionContext, AgentExecutor } from "../agent-executor";
import type { AgentRuntime } from "../../shared/types";
import { RuntimeDriverRegistry, type InteractiveSessionContext, type RuntimeDriver, type RuntimeWorkflowRequestContext } from "./runtime-driver";
import type { RuntimeCapabilities } from "./runtime-capabilities";
import type { RuntimeStateCodec } from "./runtime-state-codec";
import { RuntimeRouter } from "./runtime-router";

function interactiveCapabilities(runtimeId: AgentRuntime["id"]): RuntimeCapabilities {
  return {
    runtimeId,
    chatStyle: "interactive",
    taskStyle: "oneshot",
    workflowStyle: "oneshot",
    testStyle: "oneshot",
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
  };
}

function oneshotCapabilities(runtimeId: AgentRuntime["id"]): RuntimeCapabilities {
  return {
    runtimeId,
    chatStyle: "oneshot",
    taskStyle: "oneshot",
    workflowStyle: "oneshot",
    testStyle: "oneshot",
    supportsInterrupt: false,
    supportsContinue: false,
    supportsApprovalRequests: false,
    supportsUserInputRequests: false,
    resume: {
      supportsInProcessConversationResume: false,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    },
  };
}

function createDriver(input: Partial<RuntimeDriver> & Pick<RuntimeDriver, "runtimeId">): RuntimeDriver {
  return {
    runtimeId: input.runtimeId,
    surfaceSupport: input.surfaceSupport ?? [],
    getCapabilities: input.getCapabilities ?? (() => oneshotCapabilities(input.runtimeId)),
    ...(input.createOneShotExecutor ? { createOneShotExecutor: input.createOneShotExecutor } : {}),
    ...(input.createInteractiveSession ? { createInteractiveSession: input.createInteractiveSession } : {}),
    ...(input.askWorkflow ? { askWorkflow: input.askWorkflow } : {}),
    ...(input.testChannel ? { testChannel: input.testChannel } : {}),
    ...(input.deleteSessionArtifacts ? { deleteSessionArtifacts: input.deleteSessionArtifacts } : {}),
    ...(input.runtimeStateCodec ? { runtimeStateCodec: input.runtimeStateCodec } : {}),
  };
}

describe("RuntimeRouter", () => {
  const runtime: AgentRuntime = {
    id: "api",
    label: "API",
    version: "test",
    available: true,
    command: "api",
  };

  test("fails explicitly when a runtime does not support the requested chat mode and continuation policy", () => {
    const router = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "api",
          surfaceSupport: [
            {
              surface: "chat",
              executionModes: ["oneshot"],
              continuationPolicies: ["fresh"],
            },
          ],
          getCapabilities: () => oneshotCapabilities("api"),
          createOneShotExecutor: () =>
            ({
              start: async () => undefined,
              stop: async () => undefined,
            }) satisfies AgentExecutor,
        }),
      ]),
    );

    expect(() =>
      router.createInteractiveSession({
        chatId: "chat-1",
        configuredAgentId: "agent-1",
        runtimeId: "api",
        executionMode: "interactive",
        continuationPolicy: "resume-preferred",
        runtimeConfig: { model: "default" },
        runtime,
        channelId: "api-default",
        workDir: "C:/repo",
        developerInstructions: "",
        emit: () => undefined,
      } satisfies InteractiveSessionContext),
    ).toThrow(/api does not support chat interactive with continuation policy resume-preferred/i);
  });

  test("delegates persisted runtimeConversation restoration and cloning to the registered codec", () => {
    const raw = {
      runtimeId: "hermes",
      codecVersion: "v1",
      payload: { sessionId: "hermes-session-1" },
    } as const;
    const restorePersistedConversation = vi.fn(() => raw);
    const cloneConversation = vi.fn(() => raw);
    const codec: RuntimeStateCodec<{ sessionId: string }> = {
      runtimeId: "hermes",
      restorePersistedConversation,
      cloneConversation,
      decodeConversation: () => ({ sessionId: "hermes-session-1" }),
      encodeConversation: (payload) => ({
        runtimeId: "hermes",
        codecVersion: "v1",
        payload,
      }),
    };
    const router = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "hermes",
          surfaceSupport: [],
          runtimeStateCodec: codec,
        }),
      ]),
    );

    expect(router.restorePersistedConversation(raw)).toEqual(raw);
    expect(router.cloneConversation(raw)).toEqual(raw);
    expect(restorePersistedConversation).toHaveBeenCalledWith(raw);
    expect(cloneConversation).toHaveBeenCalledWith(raw);
  });

  test("keeps codec rejection rejected instead of cloning malformed runtimeConversation envelopes", () => {
    const raw = {
      runtimeId: "codex",
      codecVersion: "v1",
      payload: { native: {} },
    } as const;
    const restorePersistedConversation = vi.fn(() => undefined);
    const cloneConversation = vi.fn(() => undefined);
    const codec: RuntimeStateCodec<{ native: { threadId: string } }> = {
      runtimeId: "codex",
      restorePersistedConversation,
      cloneConversation,
      decodeConversation: () => undefined,
      encodeConversation: (payload) => ({
        runtimeId: "codex",
        codecVersion: "v1",
        payload,
      }),
    };
    const router = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "codex",
          surfaceSupport: [],
          runtimeStateCodec: codec,
        }),
      ]),
    );

    expect(router.restorePersistedConversation(raw)).toBeUndefined();
    expect(() => router.cloneConversation(raw)).toThrow(/invalid codex runtime conversation envelope/i);
    expect(restorePersistedConversation).toHaveBeenCalledWith(raw);
    expect(cloneConversation).toHaveBeenCalledWith(raw);
  });

  test("rejects drivers that omit explicit surface support instead of inferring it from hooks", () => {
    const executor = {
      start: async () => undefined,
      stop: async () => undefined,
    } satisfies AgentExecutor;
    const driverWithoutSurfaceSupport = {
      runtimeId: "codex",
      getCapabilities: () => oneshotCapabilities("codex"),
      createOneShotExecutor: () => executor,
    } as unknown as RuntimeDriver;
    expect(
      () =>
        new RuntimeRouter(
          new RuntimeDriverRegistry([
            driverWithoutSurfaceSupport,
          ]),
        ),
    ).toThrow(/surfaceSupport explicitly/i);
  });

  test("fails cleanup explicitly when the runtime is missing, unsupported, or unconfigured", async () => {
    const router = new RuntimeRouter(new RuntimeDriverRegistry([]));

    await expect(router.deleteSessionArtifacts("codex", { workDir: "C:/repo" })).rejects.toThrow(
      /No runtime driver registered for codex/i,
    );

    const unsupportedCleanupRouter = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "api",
          surfaceSupport: [
            {
              surface: "task",
              executionModes: ["oneshot"],
              continuationPolicies: ["fresh"],
            },
          ],
        }),
      ]),
    );

    await expect(unsupportedCleanupRouter.deleteSessionArtifacts("api", { workDir: "C:/repo" })).rejects.toThrow(
      /api runtime does not support cleanup/i,
    );

    const unconfiguredCleanupRouter = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "hermes",
          surfaceSupport: [
            {
              surface: "cleanup",
              executionModes: ["oneshot"],
              continuationPolicies: ["fresh"],
            },
          ],
        }),
      ]),
    );

    await expect(unconfiguredCleanupRouter.deleteSessionArtifacts("hermes", { workDir: "C:/repo" })).rejects.toThrow(
      /hermes runtime cleanup/i,
    );
  });

  test("routes workflow requests only through drivers that declare workflow support", async () => {
    const askWorkflow = vi.fn(async () => ({ content: "workflow ok" }));
    const router = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "codex",
          surfaceSupport: [
            {
              surface: "workflow",
              executionModes: ["oneshot"],
              continuationPolicies: ["fresh", "resume-preferred"],
            },
          ],
          getCapabilities: () => interactiveCapabilities("codex"),
          runtimeStateCodec: {
            runtimeId: "codex",
            restorePersistedConversation: () => undefined,
            cloneConversation: (conversation) => conversation,
            decodeConversation: () => ({ native: { threadId: "thread-1" } }),
            encodeConversation: (payload) => ({
              runtimeId: "codex",
              codecVersion: "v1",
              payload,
            }),
          },
          askWorkflow,
        }),
      ]),
    );

    await expect(
      router.askWorkflow({
        requestId: "wf-1",
        prompt: "Plan it",
        runtimeId: "codex",
        executionMode: "oneshot",
        continuationPolicy: "resume-preferred",
        runtimeConfig: { model: "gpt-5.5" },
        runtime: {
          id: "codex",
          label: "Codex",
          version: "test",
          available: true,
          command: "codex",
        },
        channelId: "codex-openai",
        workDir: "C:/repo",
      } satisfies RuntimeWorkflowRequestContext),
    ).resolves.toEqual({ content: "workflow ok" });
    expect(askWorkflow).toHaveBeenCalledTimes(1);

    const badRouter = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "api",
          surfaceSupport: [
            {
              surface: "workflow",
              executionModes: ["oneshot"],
              continuationPolicies: ["fresh"],
            },
          ],
          getCapabilities: () => oneshotCapabilities("api"),
        }),
      ]),
    );

    await expect(
      badRouter.askWorkflow({
        requestId: "wf-2",
        prompt: "Plan it",
        runtimeId: "api",
        executionMode: "oneshot",
        continuationPolicy: "resume-preferred",
        runtimeConfig: { model: "default" },
        runtime,
        channelId: "api-default",
        workDir: "C:/repo",
      } satisfies RuntimeWorkflowRequestContext),
    ).rejects.toThrow(/api does not support workflow oneshot with continuation policy resume-preferred/i);
  });

  test("routes one-shot execution through the declared driver for the request surface", () => {
    const executor = {
      start: async () => undefined,
      stop: async () => undefined,
    } satisfies AgentExecutor;
    const createOneShotExecutor = vi.fn(() => executor);
    const router = new RuntimeRouter(
      new RuntimeDriverRegistry([
        createDriver({
          runtimeId: "codex",
          surfaceSupport: [
            {
              surface: "task",
              executionModes: ["oneshot"],
              continuationPolicies: ["fresh", "resume-preferred"],
            },
          ],
          getCapabilities: () => interactiveCapabilities("codex"),
          createOneShotExecutor,
        }),
      ]),
    );

    const context = {
      runId: "task-1",
      runKind: "task",
      prompt: "Inspect the repo",
      runtimeId: "codex",
      executionMode: "oneshot",
      continuationPolicy: "fresh",
      runtimeConfig: { model: "gpt-5.5" },
      runtime: {
        id: "codex",
        label: "Codex",
        version: "test",
        available: true,
        command: "codex",
      },
      channelId: "codex-openai",
      workDir: "C:/repo",
      developerInstructions: "",
      emit: () => undefined,
      onExit: () => undefined,
    } satisfies AgentExecutionContext;

    expect(router.createOneShotExecutor(context)).toBe(executor);
    expect(createOneShotExecutor).toHaveBeenCalledWith(context);
  });
});
