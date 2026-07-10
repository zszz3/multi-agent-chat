# Runtime Extension Architecture Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the runtime executor layer so new runtimes enter through runtime-local driver builders, capability declarations stay explicit, and the central registry becomes a small aggregator instead of a runtime-specific assembly file.

**Architecture:** Keep the existing runtime boundary reset intact, then incrementally move runtime-specific assembly behind `createXxxDriver()` builders under runtime-local directories. First extract builder entrypoints while reusing existing helpers, then move workflow, cleanup, and session-local wiring into runtime-owned modules, and finally add contract tests that prove runtime onboarding depends on explicit declarations rather than inference.

**Tech Stack:** TypeScript, Electron main process runtime layer, Vitest, existing `RuntimeDriverRegistry` and `RuntimeRouter`, repository docs under `docs/superpowers/specs/runtime`.

---

### Task 1: Extract Runtime-Local Driver Builder Entry Points

**Files:**
- Create: `src/main/hub/runtime/executor/api/create-api-driver.ts`
- Create: `src/main/hub/runtime/executor/claude/create-claude-driver.ts`
- Create: `src/main/hub/runtime/executor/codex/create-codex-driver.ts`
- Create: `src/main/hub/runtime/executor/hermes/create-hermes-driver.ts`
- Create: `src/main/hub/runtime/executor/agent-executor.test.ts`
- Modify: `src/main/hub/runtime/executor/agent-executor.ts`
- Test: `src/main/hub/runtime/executor/agent-executor.test.ts`

- [ ] **Step 1: Write the failing registry aggregation test**

```ts
import { describe, expect, test } from "vitest";
import { createRuntimeDriverRegistry } from "./agent-executor";

function buildOptions() {
  return {
    executables: { codex: "codex", claude: "claude", api: "api", hermes: "hermes" },
    channelById: () => ({
      id: "test-channel",
      runtimeAgentId: "api",
      label: "Test Channel",
      providerId: "openai",
      modelId: "default",
      settings: {},
    }),
    respondToCodexServerRequest: () => undefined,
  } as any;
}

describe("createRuntimeDriverRegistry", () => {
  test("registers all runtimes through runtime-local builder entrypoints", () => {
    const registry = createRuntimeDriverRegistry(buildOptions());
    expect(registry.driverFor("codex").runtimeId).toBe("codex");
    expect(registry.driverFor("claude").runtimeId).toBe("claude");
    expect(registry.driverFor("api").runtimeId).toBe("api");
    expect(registry.driverFor("hermes").runtimeId).toBe("hermes");
  });
});
```

- [ ] **Step 2: Run the focused executor registry test and verify it fails because the runtime-local builder files do not exist yet**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor.test.ts`

Expected: FAIL with module-not-found errors for the new `create-*-driver.ts` files or import-resolution errors after the test is added.

- [ ] **Step 3: Add one builder entry file per runtime and collapse `agent-executor.ts` into an aggregator**

```ts
// src/main/hub/runtime/executor/codex/create-codex-driver.ts
import { CodexInteractiveSession } from "../../../../agents/codex/codex-interactive-session";
import { CodexRpcClient } from "../../../../agents/codex/codex-rpc";
import { codexRuntimeStateCodec } from "../../../../agents/runtime/runtime-state-codec";
import { codexEnvironmentForChannel } from "../../../../agents/codex/codex-env";
import { codexAppServerConfigArgs } from "../../../../channels/model-config";
import { createInteractiveRuntimeDriver } from "../agent-executor-driver-factories";
import { CodexAgentExecutor } from "../agent-executor-codex";
import { modelFromRuntimeConfig, type RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { runCodexWorkflow } from "../workflow/agent-executor-codex-workflow";
import { deleteCodexSessionArtifacts } from "../agent-executor-session-cleanup";

export function createCodexDriver(options: RuntimeAgentExecutorFactoryOptions) {
  return createInteractiveRuntimeDriver({
    runtimeId: "codex",
    runtimeStateCodec: codexRuntimeStateCodec,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
    createOneShotExecutor: (context) => new CodexAgentExecutor(context, options),
    createInteractiveSession: (context) =>
      new CodexInteractiveSession(context, {
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
        createCodexClient: ({ onEvent, onExit }) => {
          const channel = options.channelById(context.channelId);
          let client: CodexRpcClient;
          client = new CodexRpcClient({
            executable: context.runtime.command || options.executables.codex,
            cwd: context.workDir,
            extraArgs: codexAppServerConfigArgs(channel, modelFromRuntimeConfig(context.runtimeConfig)),
            env: codexEnvironmentForChannel(channel),
            onEvent,
            onRequest: (id, method, params) => {
              options.respondToCodexServerRequest(client, id, method, params);
            },
            onExit,
          });
          return client;
        },
      }),
    askWorkflow: options.askWorkflowByRuntime?.codex ?? ((input) => runCodexWorkflow(input, options)),
    testChannel: options.testChannelByRuntime?.codex,
    deleteSessionArtifacts:
      options.deleteSessionArtifactsByRuntime?.codex ??
      ((input) => deleteCodexSessionArtifacts(options.executables.codex, input.runtimeConversation)),
  });
}
```

```ts
// src/main/hub/runtime/executor/agent-executor.ts
import { RuntimeRouter } from "../../../agents/runtime/runtime-router";
import { RuntimeDriverRegistry } from "../../../agents/runtime/runtime-driver";
import { createApiDriver } from "./api/create-api-driver";
import { createClaudeDriver } from "./claude/create-claude-driver";
import { createCodexDriver } from "./codex/create-codex-driver";
import { createHermesDriver } from "./hermes/create-hermes-driver";
import type {
  AgentExecutionContext,
  AgentExecutor,
  AgentExecutorFactory,
  RuntimeAgentExecutorFactoryOptions,
} from "./agent-executor-types";

export function createRuntimeDriverRegistry(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriverRegistry {
  return new RuntimeDriverRegistry([
    createCodexDriver(options),
    createClaudeDriver(options),
    createApiDriver(options),
    createHermesDriver(options),
  ]);
}

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  constructor(private readonly router: RuntimeRouter) {}

  create(context: AgentExecutionContext): AgentExecutor {
    return this.router.createOneShotExecutor(context);
  }
}
```

Repeat the same extraction for Claude, API, and Hermes using the code currently assembled inline in `src/main/hub/runtime/executor/agent-executor.ts`.

- [ ] **Step 4: Re-run the focused registry test**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor.test.ts`

Expected: PASS with all four current runtimes still registered through the new runtime-local builder entrypoints.

- [ ] **Step 5: Commit the builder extraction**

```bash
git add src/main/hub/runtime/executor/api/create-api-driver.ts src/main/hub/runtime/executor/claude/create-claude-driver.ts src/main/hub/runtime/executor/codex/create-codex-driver.ts src/main/hub/runtime/executor/hermes/create-hermes-driver.ts src/main/hub/runtime/executor/agent-executor.ts src/main/hub/runtime/executor/agent-executor.test.ts
git commit -m "refactor: extract runtime-local driver builders"
```

### Task 2: Move Workflow And Cleanup Wiring Behind Runtime-Local Bundle Modules

**Files:**
- Create: `src/main/hub/runtime/executor/codex/codex-workflow.ts`
- Create: `src/main/hub/runtime/executor/claude/claude-workflow.ts`
- Create: `src/main/hub/runtime/executor/hermes/hermes-workflow.ts`
- Create: `src/main/hub/runtime/executor/codex/codex-cleanup.ts`
- Create: `src/main/hub/runtime/executor/claude/claude-cleanup.ts`
- Modify: `src/main/hub/runtime/executor/codex/create-codex-driver.ts`
- Modify: `src/main/hub/runtime/executor/claude/create-claude-driver.ts`
- Modify: `src/main/hub/runtime/executor/hermes/create-hermes-driver.ts`
- Modify: `src/main/hub/runtime/executor/agent-executor.test.ts`
- Test: `src/main/hub/runtime/executor/agent-executor.test.ts`

- [ ] **Step 1: Add a failing test that proves runtime-local builders own their workflow and cleanup hooks**

```ts
import { describe, expect, test } from "vitest";
import { createRuntimeDriverRegistry } from "./agent-executor";

function buildOptions() {
  return {
    executables: { codex: "codex", claude: "claude", api: "api", hermes: "hermes" },
    channelById: () => ({ id: "channel", runtimeAgentId: "api", providerId: "openai", modelId: "default", label: "Channel", settings: {} }),
    respondToCodexServerRequest: () => undefined,
  } as any;
}

describe("runtime driver bundle ownership", () => {
  test("keeps workflow and cleanup hooks attached through runtime-local builders", () => {
    const registry = createRuntimeDriverRegistry(buildOptions());
    expect(typeof registry.driverFor("codex").askWorkflow).toBe("function");
    expect(typeof registry.driverFor("claude").askWorkflow).toBe("function");
    expect(typeof registry.driverFor("hermes").askWorkflow).toBe("function");
    expect(typeof registry.driverFor("codex").deleteSessionArtifacts).toBe("function");
    expect(typeof registry.driverFor("claude").deleteSessionArtifacts).toBe("function");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails before the runtime-local workflow and cleanup wrappers exist**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor.test.ts`

Expected: FAIL if the builders still import `workflow/agent-executor-*.ts` and `agent-executor-session-cleanup.ts` directly instead of owning runtime-local wrapper modules.

- [ ] **Step 3: Add runtime-local workflow and cleanup wrapper modules, then point the builders at those modules**

```ts
// src/main/hub/runtime/executor/hermes/hermes-workflow.ts
export {
  runHermesChannelTest,
  runHermesWorkflow,
} from "../workflow/agent-executor-hermes-workflow";
```

```ts
// src/main/hub/runtime/executor/codex/codex-workflow.ts
export { runCodexWorkflow } from "../workflow/agent-executor-codex-workflow";
```

```ts
// src/main/hub/runtime/executor/claude/claude-workflow.ts
export { runClaudeWorkflow } from "../workflow/agent-executor-claude-workflow";
```

```ts
// src/main/hub/runtime/executor/codex/codex-cleanup.ts
export { deleteCodexSessionArtifacts } from "../agent-executor-session-cleanup";
```

```ts
// src/main/hub/runtime/executor/claude/claude-cleanup.ts
export { deleteClaudeSessionArtifacts } from "../agent-executor-session-cleanup";
```

```ts
// src/main/hub/runtime/executor/hermes/create-hermes-driver.ts
import { runHermesChannelTest, runHermesWorkflow } from "./hermes-workflow";

export function createHermesDriver(options: RuntimeAgentExecutorFactoryOptions) {
  return createOneShotRuntimeDriver({
    runtimeId: "hermes",
    runtimeStateCodec: hermesRuntimeStateCodec,
    createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
    askWorkflow: (input) => runHermesWorkflow(input, options),
    testChannel: (input) => runHermesChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
}
```

Use the same pattern for Codex and Claude so every runtime-local builder imports only runtime-local workflow and cleanup entry modules.

- [ ] **Step 4: Re-run the focused bundle-ownership test**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor.test.ts`

Expected: PASS, with the registry file no longer importing workflow or cleanup helpers directly and runtime-local builders owning those dependencies.

- [ ] **Step 5: Commit the workflow and cleanup relocation**

```bash
git add src/main/hub/runtime/executor/codex/codex-workflow.ts src/main/hub/runtime/executor/claude/claude-workflow.ts src/main/hub/runtime/executor/hermes/hermes-workflow.ts src/main/hub/runtime/executor/codex/codex-cleanup.ts src/main/hub/runtime/executor/claude/claude-cleanup.ts src/main/hub/runtime/executor/codex/create-codex-driver.ts src/main/hub/runtime/executor/claude/create-claude-driver.ts src/main/hub/runtime/executor/hermes/create-hermes-driver.ts src/main/hub/runtime/executor/agent-executor.test.ts
git commit -m "refactor: localize runtime workflow and cleanup wiring"
```

### Task 3: Make Capability Declarations Runtime-Owned Instead Of Centrally Implied

**Files:**
- Create: `src/main/hub/runtime/executor/api/api-capabilities.ts`
- Create: `src/main/hub/runtime/executor/claude/claude-capabilities.ts`
- Create: `src/main/hub/runtime/executor/codex/codex-capabilities.ts`
- Create: `src/main/hub/runtime/executor/hermes/hermes-capabilities.ts`
- Create: `src/main/hub/runtime/executor/agent-executor-capabilities.test.ts`
- Modify: `src/main/hub/runtime/executor/agent-executor-driver-factories.ts`
- Modify: `src/main/hub/runtime/executor/agent-executor-capabilities.ts`
- Modify: `src/main/hub/runtime/executor/api/create-api-driver.ts`
- Modify: `src/main/hub/runtime/executor/claude/create-claude-driver.ts`
- Modify: `src/main/hub/runtime/executor/codex/create-codex-driver.ts`
- Modify: `src/main/hub/runtime/executor/hermes/create-hermes-driver.ts`
- Test: `src/main/hub/runtime/executor/agent-executor-capabilities.test.ts`

- [ ] **Step 1: Add failing capability contract tests for each current runtime**

```ts
import { describe, expect, test } from "vitest";
import { createRuntimeDriverRegistry } from "./agent-executor";

function buildOptions() {
  return {
    executables: { codex: "codex", claude: "claude", api: "api", hermes: "hermes" },
    channelById: () => ({ id: "channel", runtimeAgentId: "api", providerId: "openai", modelId: "default", label: "Channel", settings: {} }),
    respondToCodexServerRequest: () => undefined,
  } as any;
}

describe("runtime capability declaration", () => {
  test("declares codex and claude as interactive runtimes", () => {
    const registry = createRuntimeDriverRegistry(buildOptions());
    expect(registry.driverFor("codex").surfaceSupport.find((item) => item.surface === "chat")?.executionModes).toEqual(["interactive"]);
    expect(registry.driverFor("claude").surfaceSupport.find((item) => item.surface === "chat")?.executionModes).toEqual(["interactive"]);
  });

  test("declares api and hermes as oneshot runtimes", () => {
    const registry = createRuntimeDriverRegistry(buildOptions());
    expect(registry.driverFor("api").surfaceSupport.find((item) => item.surface === "chat")?.executionModes).toEqual(["oneshot"]);
    expect(registry.driverFor("hermes").surfaceSupport.find((item) => item.surface === "chat")?.executionModes).toEqual(["oneshot"]);
  });
});
```

- [ ] **Step 2: Run the capability contract test and verify it fails before per-runtime capability modules exist**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor-capabilities.test.ts`

Expected: FAIL because the current support matrices and default capability helpers still live in shared central helpers rather than runtime-local declarations.

- [ ] **Step 3: Push support matrices and capability defaults into runtime-local modules**

```ts
// src/main/hub/runtime/executor/hermes/hermes-capabilities.ts
import { support } from "../agent-executor-capabilities";

export const HERMES_SURFACE_SUPPORT = [
  support("chat", ["oneshot"], ["fresh"]),
  support("task", ["oneshot"], ["fresh"]),
  support("workflow", ["oneshot"], ["fresh"]),
  support("channel-test", ["oneshot"], ["fresh"]),
  support("cleanup", ["oneshot"], ["fresh"]),
] as const;

export function hermesCapabilities() {
  return {
    runtimeId: "hermes" as const,
    chatStyle: "oneshot" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
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
```

```ts
// src/main/hub/runtime/executor/agent-executor-driver-factories.ts
export function createOneShotRuntimeDriver(input: {
  runtimeId: AgentId;
  surfaceSupport: RuntimeDriver["surfaceSupport"];
  getCapabilities: RuntimeDriver["getCapabilities"];
  runtimeStateCodec?: RuntimeDriver["runtimeStateCodec"];
  createOneShotExecutor: NonNullable<RuntimeDriver["createOneShotExecutor"]>;
  askWorkflow: ((input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>) | undefined;
  testChannel: ((input: RuntimeChannelTestContext) => Promise<string>) | undefined;
  deleteSessionArtifacts: ((input: RuntimeSessionCleanupContext) => Promise<void>) | undefined;
}): RuntimeDriver {
  return {
    runtimeId: input.runtimeId,
    surfaceSupport: [...input.surfaceSupport],
    ...(input.runtimeStateCodec ? { runtimeStateCodec: input.runtimeStateCodec } : {}),
    getCapabilities: input.getCapabilities!,
    createOneShotExecutor: input.createOneShotExecutor,
    ...(input.askWorkflow ? { askWorkflow: input.askWorkflow } : {}),
    ...(input.testChannel ? { testChannel: input.testChannel } : {}),
    deleteSessionArtifacts: input.deleteSessionArtifacts ?? (async () => undefined),
  };
}
```

Then update each `create-*-driver.ts` file to pass its own `surfaceSupport` and `getCapabilities` values instead of relying on central defaults.

- [ ] **Step 4: Re-run the capability contract tests**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor-capabilities.test.ts src/main/agents/runtime/runtime-router.test.ts`

Expected: PASS, with the router still rejecting unsupported combinations and each runtime now owning its explicit support matrix.

- [ ] **Step 5: Commit the capability ownership move**

```bash
git add src/main/hub/runtime/executor/api/api-capabilities.ts src/main/hub/runtime/executor/claude/claude-capabilities.ts src/main/hub/runtime/executor/codex/codex-capabilities.ts src/main/hub/runtime/executor/hermes/hermes-capabilities.ts src/main/hub/runtime/executor/agent-executor-capabilities.ts src/main/hub/runtime/executor/agent-executor-driver-factories.ts src/main/hub/runtime/executor/api/create-api-driver.ts src/main/hub/runtime/executor/claude/create-claude-driver.ts src/main/hub/runtime/executor/codex/create-codex-driver.ts src/main/hub/runtime/executor/hermes/create-hermes-driver.ts src/main/hub/runtime/executor/agent-executor-capabilities.test.ts src/main/agents/runtime/runtime-router.test.ts
git commit -m "refactor: localize runtime capability declarations"
```

### Task 4: Add An Onboarding Contract Test Harness For Future Runtimes

**Files:**
- Create: `src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts`
- Modify: `src/main/hub/runtime/executor/agent-executor.test.ts`
- Modify: `src/main/agents/runtime/runtime-router.test.ts`
- Test: `src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts`

- [ ] **Step 1: Write a failing onboarding harness test that exercises declaration, support, and rejection semantics**

```ts
import { describe, expect, test } from "vitest";
import { RuntimeDriverRegistry } from "../../../agents/runtime/runtime-driver";
import { RuntimeRouter } from "../../../agents/runtime/runtime-router";
import { createOneShotRuntimeDriver } from "./agent-executor-driver-factories";
import { support } from "./agent-executor-capabilities";

describe("runtime onboarding contract", () => {
  test("rejects interactive requests for a stateless oneshot runtime", () => {
    const registry = new RuntimeDriverRegistry([
      createOneShotRuntimeDriver({
        runtimeId: "hermes",
        surfaceSupport: [
          support("chat", ["oneshot"], ["fresh"]),
          support("task", ["oneshot"], ["fresh"]),
          support("workflow", ["oneshot"], ["fresh"]),
          support("channel-test", ["oneshot"], ["fresh"]),
          support("cleanup", ["oneshot"], ["fresh"]),
        ],
        getCapabilities: () => ({
          runtimeId: "hermes",
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
        }),
        createOneShotExecutor: () => ({ start: async () => undefined, stop: async () => undefined }),
        askWorkflow: async () => ({ content: "ok" }),
        testChannel: async () => "ok",
        deleteSessionArtifacts: async () => undefined,
      }),
    ]);

    const router = new RuntimeRouter(registry);
    expect(() =>
      router.createInteractiveSession({
        runtimeId: "hermes",
        executionMode: "interactive",
        continuationPolicy: "resume-preferred",
        runtimeConfig: { model: "default" },
        chatId: "chat-1",
        configuredAgentId: "agent-1",
        runtime: { id: "hermes", label: "Hermes", command: "hermes", version: null, available: true },
        channelId: "hermes-local",
        workDir: "/tmp/repo",
        developerInstructions: "",
        emit: () => undefined,
      }),
    ).toThrow(/hermes does not support chat interactive/i);
  });
});
```

- [ ] **Step 2: Run the onboarding harness and verify it fails before the helper signatures support runtime-owned capability declarations cleanly**

Run: `npm test -- src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts`

Expected: FAIL until the driver factories and test helpers fully accept runtime-owned support matrices and capabilities.

- [ ] **Step 3: Normalize the helper signatures and router test coverage so future runtime onboarding follows one path**

```ts
// src/main/hub/runtime/executor/agent-executor.test.ts
test("runtime builders expose one onboarding seam each", async () => {
  const registry = createRuntimeDriverRegistry(buildOptions());
  expect(registry.driverFor("codex").surfaceSupport.length).toBeGreaterThan(0);
  expect(registry.driverFor("claude").surfaceSupport.length).toBeGreaterThan(0);
  expect(registry.driverFor("api").surfaceSupport.length).toBeGreaterThan(0);
  expect(registry.driverFor("hermes").surfaceSupport.length).toBeGreaterThan(0);
});
```

```ts
// src/main/agents/runtime/runtime-router.test.ts
test("rejects resume-required requests for oneshot runtimes without runtime conversations", async () => {
  const registry = new RuntimeDriverRegistry([
    createOneShotRuntimeDriver({
      runtimeId: "api",
      surfaceSupport: [
        support("chat", ["oneshot"], ["fresh"]),
        support("task", ["oneshot"], ["fresh"]),
        support("workflow", ["oneshot"], ["fresh"]),
        support("channel-test", ["oneshot"], ["fresh"]),
        support("cleanup", ["oneshot"], ["fresh"]),
      ],
      getCapabilities: () => defaultOneShotCapabilities("api"),
      createOneShotExecutor: () => ({ start: async () => undefined, stop: async () => undefined }),
      askWorkflow: async () => ({ content: "ok" }),
      testChannel: async () => "ok",
      deleteSessionArtifacts: async () => undefined,
    }),
  ]);
  const router = new RuntimeRouter(registry);

  await expect(
    router.askWorkflow({
      requestId: "req-1",
      runtimeId: "api",
      executionMode: "oneshot",
      continuationPolicy: "resume-required",
      runtimeConfig: { model: "default" },
      runtime: { id: "api", label: "API", command: "api", version: null, available: true },
      channelId: "api-openai",
      workDir: "/tmp/repo",
      prompt: "hello",
    }),
  ).rejects.toThrow(/api workflow oneshot requires runtimeConversation/i);
});
```

- [ ] **Step 4: Re-run the onboarding harness and router proof**

Run: `npm test -- src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts src/main/hub/runtime/executor/agent-executor.test.ts src/main/agents/runtime/runtime-router.test.ts`

Expected: PASS with explicit proof that future runtimes succeed or fail based on their declared support instead of central inference.

- [ ] **Step 5: Commit the onboarding test harness**

```bash
git add src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts src/main/hub/runtime/executor/agent-executor.test.ts src/main/agents/runtime/runtime-router.test.ts
git commit -m "test: add runtime onboarding contract coverage"
```

### Task 5: Sync Runtime Architecture Docs And Verify The Whole Slice

**Files:**
- Modify: `docs/architecture-overview.md`
- Modify: `docs/modules/main.md`
- Modify: `docs/zh-CN/runtime-agent-architecture.md`
- Modify: `docs/superpowers/specs/runtime/README.md`
- Modify: `docs/superpowers/plans/runtime/README.md`
- Test: `src/main/hub/runtime/executor/agent-executor.test.ts`
- Test: `src/main/hub/runtime/executor/agent-executor-capabilities.test.ts`
- Test: `src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts`
- Test: `src/main/agents/runtime/runtime-router.test.ts`

- [ ] **Step 1: Update the architecture docs so they describe runtime-local builder ownership instead of central assembly**

```md
<!-- docs/modules/main.md -->
- `hub/runtime/executor/agent-executor.ts`: runtime registry aggregator that composes one `createXxxDriver()` builder per runtime
- `hub/runtime/executor/codex/`, `claude/`, `api/`, `hermes/`: runtime-local bundles that own executor, workflow, cleanup, session, and capability assembly for each runtime
```

```md
<!-- docs/architecture-overview.md -->
Runtime onboarding now enters through runtime-local builder modules rather than through a single expanding central assembly file. The registry layer remains the only place that knows which runtimes exist, but runtime-specific workflow, cleanup, capability, and session wiring now stay inside runtime-owned bundle directories.
```

```md
<!-- docs/zh-CN/runtime-agent-architecture.md -->
新的 runtime 扩展路径以 `createXxxDriver()` 为唯一入口。中央 registry 只做注册聚合，具体 runtime 的 executor / workflow / cleanup / session / capability 组装放回各自目录自治。
```

- [ ] **Step 2: Run the focused runtime architecture test suite**

Run: `npm test -- src/main/hub/runtime/executor/agent-executor.test.ts src/main/hub/runtime/executor/agent-executor-capabilities.test.ts src/main/hub/runtime/executor/runtime-onboarding-contract.test.ts src/main/agents/runtime/runtime-router.test.ts`

Expected: PASS with router, registry, capability, and onboarding coverage all green.

- [ ] **Step 3: Run typecheck for the runtime slice**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors from the new runtime-local builder modules and test helpers.

- [ ] **Step 4: Update plan indexes and verify the docs diff**

```md
<!-- docs/superpowers/plans/runtime/README.md -->
- `2026-07-10-runtime-extension-architecture-rollout.md`
```

Run: `git diff --check -- docs/architecture-overview.md docs/modules/main.md docs/zh-CN/runtime-agent-architecture.md docs/superpowers/specs/runtime/README.md docs/superpowers/plans/runtime/README.md docs/superpowers/plans/runtime/2026-07-10-runtime-extension-architecture-rollout.md`

Expected: no output

- [ ] **Step 5: Commit the documentation sync and final proof**

```bash
git add docs/architecture-overview.md docs/modules/main.md docs/zh-CN/runtime-agent-architecture.md docs/superpowers/specs/runtime/README.md docs/superpowers/plans/runtime/README.md docs/superpowers/plans/runtime/2026-07-10-runtime-extension-architecture-rollout.md
git commit -m "docs: document runtime extension rollout"
```
