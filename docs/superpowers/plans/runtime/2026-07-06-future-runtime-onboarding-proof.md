# Future Runtime Onboarding Proof Implementation Plan

> **Historical plan:** Superseded on 2026-07-10 by the completed runtime-extension rollout and full Hermes integration. Current Hermes uses the `hermes-default` preset, official `hermes -z` one-shot execution, and official ACP interactive sessions; examples below preserve the original proof-runtime worksheet.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the runtime-driver architecture can onboard one more local runtime without adding new product-level `if (runtimeId === "...")` branches by introducing a minimal `hermes` runtime and moving the remaining runtime-specific workflow, test, and cleanup decisions behind driver-owned hooks.

**Architecture:** Extend the shared runtime catalog surfaces (`AgentId`, fallback models, config channels, provider presets, renderer labels) to include `hermes`. Then widen `RuntimeDriver` just enough to own workflow invocation, runtime-channel testing, and session-artifact cleanup, and implement a minimal one-shot Hermes CLI driver so the branch demonstrates a real onboarding path instead of only a type-level stub.

**Tech Stack:** Electron main process, TypeScript, Vitest, local CLI launcher adapter, React renderer runtime labels.

**Prerequisite:** Execute the canonical runtime boundary reset spec set first, starting with `docs/superpowers/specs/runtime/2026-07-08-runtime-boundary-reset-design.md`. This plan assumes the shared driver registry already exists.

---

### Task 1: Extend The Shared Runtime Catalog To Include Hermes

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/models.ts`
- Modify: `src/shared/config-channels.ts`
- Modify: `src/shared/provider-presets.ts`
- Create: `src/shared/runtime-catalog.test.ts`
- Create: `src/renderer/src/app/agents.test.ts`
- Modify: `src/renderer/src/app/agents.ts`

- [ ] **Step 1: Add failing tests for Hermes fallback models, channels, presets, and renderer labels**

```ts
import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG_CHANNEL_IDS } from "./config-channels";
import { FALLBACK_MODEL_OPTIONS } from "./models";
import { AGENT_PROVIDER_PRESETS } from "./provider-presets";

describe("runtime catalog", () => {
  test("includes Hermes fallback models, default channel, and provider preset", () => {
    expect(FALLBACK_MODEL_OPTIONS.hermes.map((model) => model.id)).toContain("default");
    expect(DEFAULT_CONFIG_CHANNEL_IDS.hermes).toBe("hermes-local");
    expect(AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "hermes-local")).toMatchObject({
      runtimeAgentId: "hermes",
      label: "Hermes",
    });
  });
});
```

```ts
import { describe, expect, test } from "vitest";
import { agentAccent, agentLabel } from "./agents";

describe("renderer runtime helpers", () => {
  test("renders Hermes label and accent", () => {
    expect(agentLabel("hermes")).toBe("Hermes");
    expect(agentAccent("hermes")).toBe("agent-hermes");
  });
});
```

- [ ] **Step 2: Run the shared catalog and renderer helper tests and verify they fail because `AgentId` does not include `hermes` yet**

Run: `npm test -- src/shared/runtime-catalog.test.ts src/renderer/src/app/agents.test.ts`

Expected: FAIL with missing `hermes` properties on `AgentId`-keyed records and missing `agentLabel("hermes")` support.

- [ ] **Step 3: Add Hermes to the shared runtime catalog without touching runtime behavior yet**

```ts
// src/shared/types.ts
export type AgentId = "codex" | "claude" | "api" | "hermes";
```

```ts
// src/shared/models.ts
export const FALLBACK_MODEL_OPTIONS: Record<AgentId, AgentModelOption[]> = {
  codex: [
    { id: DEFAULT_MODEL_ID, label: "Default" },
    { id: "gpt-5.5", label: "GPT-5.5" },
    { id: "gpt-5.4", label: "GPT-5.4" },
    { id: "gpt-5.4-mini", label: "GPT-5.4-Mini" },
    { id: "gpt-5.3-codex-spark", label: "GPT-5.3-Codex-Spark" },
  ],
  claude: [
    { id: DEFAULT_MODEL_ID, label: "Default" },
    { id: "sonnet", label: "Sonnet" },
    { id: "opus", label: "Opus" },
  ],
  api: [
    { id: DEFAULT_MODEL_ID, label: "Default" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "glm-5.1", label: "GLM-5.1" },
    { id: "kimi-k2.6", label: "Kimi K2.6" },
  ],
  hermes: [
    { id: DEFAULT_MODEL_ID, label: "Default" },
    { id: "hermes-default", label: "Hermes Default" },
  ],
};
```

```ts
// src/shared/config-channels.ts
export const CONFIG_AGENT_ORDER: AgentId[] = ["codex", "claude", "api", "hermes"];

export const DEFAULT_CONFIG_CHANNEL_IDS: Record<AgentId, string> = {
  codex: "codex-openai",
  claude: "claude-code",
  api: "api-openai",
  hermes: "hermes-local",
};
```

```ts
// src/shared/provider-presets.ts
{
  id: "hermes-local",
  label: "Hermes",
  runtimeAgentId: "hermes",
  models: FALLBACK_MODEL_OPTIONS.hermes,
}
```

```ts
// src/renderer/src/app/agents.ts
export function agentLabel(agentId: AgentId): string {
  if (agentId === "codex") return "Codex";
  if (agentId === "claude") return "Claude Code";
  if (agentId === "hermes") return "Hermes";
  return "API";
}

export function agentAccent(agentId: AgentId): string {
  if (agentId === "codex") return "agent-codex";
  if (agentId === "claude") return "agent-claude";
  if (agentId === "hermes") return "agent-hermes";
  return "agent-api";
}
```

- [ ] **Step 4: Re-run the shared catalog and renderer helper tests**

Run: `npm test -- src/shared/runtime-catalog.test.ts src/renderer/src/app/agents.test.ts`

Expected: PASS for Hermes shared-catalog coverage.

- [ ] **Step 5: Commit the catalog expansion**

```bash
git add src/shared/types.ts src/shared/models.ts src/shared/config-channels.ts src/shared/provider-presets.ts src/shared/runtime-catalog.test.ts src/renderer/src/app/agents.ts src/renderer/src/app/agents.test.ts
git commit -m "feat: add hermes runtime catalog surfaces"
```

### Task 2: Move Remaining Workflow, Test, And Cleanup Branches Behind `RuntimeDriver`

**Files:**
- Modify: `src/main/agents/runtime-driver.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.ts`
- Modify: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing `AgentHub` tests that prove workflow dispatch comes from the driver hook, not hardcoded runtime branches**

```ts
test("askWorkflowAgent delegates to the registered runtime driver hook", async () => {
  const hub = new AgentHub({ codex: "missing-codex-for-test", claude: "missing-claude-for-test", hermes: "missing-hermes-for-test" } as any);
  addConfiguredAgents(hub, [configuredAgent("hermes-agent", { runtimeAgentId: "hermes", channelId: "hermes-local" })]);

  const workflow = vi.fn(async () => ({ content: "hermes workflow", sessionId: "hermes-session-1" }));
  (hub as any).runtimeDrivers = new RuntimeDriverRegistry([
    {
      runtimeId: "hermes",
      getCapabilities: () => oneshotChatCapabilities("hermes"),
      createOneShotExecutor: () => ({ start: async () => undefined, stop: async () => undefined }),
      askWorkflow: workflow,
      testChannel: async () => "ok",
      deleteSessionArtifacts: async () => undefined,
    },
  ]);

  const response = await hub.askWorkflowAgent({
    prompt: "Plan the repo",
    configuredAgentId: "hermes-agent",
  });

  expect(response).toEqual({ content: "hermes workflow", sessionId: "hermes-session-1" });
  expect(workflow).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused `AgentHub` slice and verify it fails because `RuntimeDriver` does not own workflow/test/cleanup hooks yet**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: FAIL because `askWorkflowAgent(...)`, `testConfiguredAgent(...)`, and `deleteAgentSession(...)` still branch on `runtimeAgentId` directly.

- [ ] **Step 3: Extend `RuntimeDriver` with the minimum hooks needed for workflow, runtime tests, and session cleanup**

```ts
// src/main/agents/runtime-driver.ts
import type { AgentTestEvent, WorkflowAgentEvent, WorkflowAgentResponse } from "../../shared/types";

export interface RuntimeWorkflowRequestContext {
  requestId: string;
  prompt: string;
  runtime: AgentRuntime;
  channelId: string;
  modelId: string;
  workDir: string;
  sessionId?: string;
  onEvent?: (event: WorkflowAgentEvent) => void;
}

export interface RuntimeChannelTestContext {
  runtime: AgentRuntime;
  channelId: string;
  modelId: string;
  workDir: string;
  emit: (event: Omit<AgentTestEvent, "agentId" | "timestamp">) => void;
}

export interface RuntimeSessionCleanupContext {
  sessionId: string;
  workDir: string;
}

export interface RuntimeDriver {
  runtimeId: AgentId;
  getCapabilities(runtime: AgentRuntime): RuntimeCapabilities;
  createOneShotExecutor(context: AgentExecutionContext): AgentExecutor;
  createInteractiveSession?(context: InteractiveSessionContext): InteractiveSession;
  askWorkflow?(input: RuntimeWorkflowRequestContext): Promise<WorkflowAgentResponse>;
  testChannel?(input: RuntimeChannelTestContext): Promise<string>;
  deleteSessionArtifacts?(input: RuntimeSessionCleanupContext): Promise<void>;
}
```

```ts
// src/main/agent-hub.ts
const driver = this.runtimeDrivers.driverFor(resolved.runtimeAgentId);
if (!driver.askWorkflow) throw new Error(`${resolved.runtimeAgentId} workflow execution is not configured.`);
return driver.askWorkflow({
  requestId,
  prompt,
  runtime,
  channelId,
  modelId,
  workDir,
  sessionId: input.sessionId,
  onEvent,
});
```

Use the same pattern for `testConfiguredAgent(...)`, `testRuntimeChannel(...)`, and `deleteAgentSession(...)`. After this task, `AgentHub` should no longer need runtime-family `if/else` chains for these three concerns.

- [ ] **Step 4: Re-run the focused `AgentHub` slice**

Run: `npm test -- src/main/agent-hub.test.ts`

Expected: PASS for driver-owned workflow dispatch, with the old runtime-specific branches removed or reduced to driver registration code.

- [ ] **Step 5: Commit the driver hook extraction**

```bash
git add src/main/agents/runtime-driver.ts src/main/agent-executor.ts src/main/agent-hub.ts src/main/agent-hub.test.ts
git commit -m "refactor: move workflow and runtime tests behind drivers"
```

### Task 3: Add A Minimal One-Shot Hermes CLI Driver

**Files:**
- Create: `src/main/agents/hermes-runner.ts`
- Create: `src/main/agents/hermes-runner.test.ts`
- Modify: `src/main/agents/detect.ts`
- Modify: `src/main/agents/detect.test.ts`
- Modify: `src/main/agent-executor.ts`
- Modify: `src/main/agent-hub.test.ts`

- [ ] **Step 1: Add failing tests for Hermes detection and one-shot JSON-line streaming**

```ts
test("detects a Hermes CLI from HERMES_PATH", async () => {
  vi.resetModules();
  vi.stubEnv("HERMES_PATH", "C:\\Users\\demo\\AppData\\Local\\Programs\\Hermes\\hermes.cmd");

  const execCli = vi.fn(async (request: { executable: string; args?: string[] }) => {
    if (request.executable === "C:\\Users\\demo\\AppData\\Local\\Programs\\Hermes\\hermes.cmd") {
      return { stdout: "hermes-cli 1.2.3\n", stderr: "" };
    }
    throw new Error(`unexpected executable: ${request.executable}`);
  });

  vi.doMock("../cli-launcher", () => ({ execCli }));
  const { detectAgentRuntimes } = await import("./detect");

  const runtimes = await detectAgentRuntimes();
  expect(runtimes.find((runtime) => runtime.id === "hermes")).toMatchObject({
    id: "hermes",
    command: "C:\\Users\\demo\\AppData\\Local\\Programs\\Hermes\\hermes.cmd",
    available: true,
    version: "1.2.3",
  });
});
```

```ts
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { AgentEvent } from "../../shared/types";
import { writeNodeCliLauncher } from "../test-cli-fixtures";
import { HermesRunner } from "./hermes-runner";

describe("HermesRunner", () => {
  test("streams Hermes JSON lines into AgentEvent values", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-hermes-runner-"));
    const executable = await writeNodeCliLauncher(
      dir,
      "hermes-fake",
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ type: "delta", content: "Hello" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "completed", content: "Hello", sessionId: "hermes-session-1" }) + "\\n");
`,
    );

    const emitted: AgentEvent[] = [];
    const runner = new HermesRunner({
      executable,
      cwd: dir,
      prompt: "hello",
      modelId: "default",
      onEvent: (event) => emitted.push(event),
      onExit: () => undefined,
    });

    await runner.start();

    expect(emitted).toEqual([
      { type: "delta", content: "Hello" },
      { type: "session", sessionId: "hermes-session-1" },
      { type: "completed", content: "Hello" },
    ]);
  });
});
```

- [ ] **Step 2: Run the focused Hermes tests and verify they fail before the runner and detection support exist**

Run: `npm test -- src/main/agents/detect.test.ts src/main/agents/hermes-runner.test.ts`

Expected: FAIL because `detectAgentRuntimes()` does not include Hermes and `HermesRunner` does not exist.

- [ ] **Step 3: Implement Hermes detection, a simple JSON-line runner, and a one-shot driver registration**

```ts
// src/main/agents/detect.ts
const AGENT_COMMANDS: Record<Exclude<AgentId, "api">, { label: string; env: string; executable: string }> = {
  codex: { label: "Codex", env: "CODEX_PATH", executable: "codex" },
  claude: { label: "Claude Code", env: "CLAUDE_PATH", executable: "claude" },
  hermes: { label: "Hermes", env: "HERMES_PATH", executable: "hermes" },
};

export async function detectAgentRuntimes(): Promise<AgentRuntime[]> {
  return Promise.all([detectOne("codex"), detectOne("claude"), detectOne("api"), detectOne("hermes")]);
}
```

```ts
// src/main/agents/hermes-runner.ts
import { createInterface } from "node:readline";
import type { AgentEvent } from "../../shared/types";
import { spawnCli } from "../cli-launcher";

interface HermesRunnerOptions {
  executable: string;
  cwd: string;
  prompt: string;
  modelId?: string;
  env?: NodeJS.ProcessEnv;
  onEvent: (event: AgentEvent) => void;
  onExit: (code: number | null) => void;
}

export class HermesRunner {
  private proc: ReturnType<typeof spawnCli> | undefined;

  constructor(private readonly options: HermesRunnerOptions) {}

  async start(): Promise<void> {
    const args = ["run", "--json"];
    if (this.options.modelId && this.options.modelId !== "default") args.push("--model", this.options.modelId);
    args.push(this.options.prompt);

    const proc = spawnCli({
      executable: this.options.executable,
      args,
      cwd: this.options.cwd,
      env: this.options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = proc;

    const rl = createInterface({ input: proc.stdout! });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line) as { type?: string; content?: string; sessionId?: string; error?: string };
      if (event.type === "delta" && typeof event.content === "string") this.options.onEvent({ type: "delta", content: event.content });
      if (typeof event.sessionId === "string") this.options.onEvent({ type: "session", sessionId: event.sessionId });
      if (event.type === "completed") this.options.onEvent(event.content ? { type: "completed", content: event.content } : { type: "completed" });
      if (event.type === "error" && typeof event.error === "string") this.options.onEvent({ type: "error", error: event.error });
    });

    proc.on("exit", (code) => this.options.onExit(code));
  }

  async stop(): Promise<void> {
    this.proc?.kill("SIGINT");
  }
}
```

```ts
// src/main/agent-executor.ts
class HermesAgentExecutor implements AgentExecutor {
  private runner: HermesRunner | undefined;

  constructor(
    private readonly context: AgentExecutionContext,
    private readonly options: RuntimeAgentExecutorFactoryOptions,
  ) {}

  async start(): Promise<void> {
    const runner = new HermesRunner({
      executable: this.context.runtime.command || this.options.executables.hermes,
      cwd: this.context.workDir,
      prompt: this.context.prompt,
      modelId: this.context.modelId,
      onEvent: this.context.emit,
      onExit: (code) => this.context.onExit(code),
    });
    this.runner = runner;
    await runner.start();
  }

  async stop(): Promise<void> {
    await this.runner?.stop();
  }
}

async function runHermesWorkflow(
  input: RuntimeWorkflowRequestContext,
  options: RuntimeAgentExecutorFactoryOptions,
): Promise<WorkflowAgentResponse> {
  let content = "";
  let sessionId: string | undefined;
  const runner = new HermesRunner({
    executable: input.runtime.command || options.executables.hermes,
    cwd: input.workDir,
    prompt: input.prompt,
    modelId: input.modelId,
    onEvent: (event) => {
      if (event.type === "session") sessionId = event.sessionId;
      if (event.type === "delta") content += event.content;
      if (event.type === "completed" && event.content) content = event.content;
      if (event.type === "error") throw new Error(event.error);
    },
    onExit: () => undefined,
  });
  await runner.start();
  return { content, sessionId };
}

async function runHermesChannelTest(
  input: RuntimeChannelTestContext,
  options: RuntimeAgentExecutorFactoryOptions,
): Promise<string> {
  const response = await runHermesWorkflow(
    {
      requestId: "agent-test",
      prompt: AGENT_TEST_PROMPT,
      runtime: input.runtime,
      channelId: input.channelId,
      modelId: input.modelId,
      workDir: input.workDir,
    },
    options,
  );
  return response.content;
}

const hermesDriver: RuntimeDriver = {
  runtimeId: "hermes",
  getCapabilities: () => defaultOneShotCapabilities("hermes"),
  createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
  askWorkflow: (input) => runHermesWorkflow(input, options),
  testChannel: (input) => runHermesChannelTest(input, options),
  deleteSessionArtifacts: async () => undefined,
};

return new RuntimeDriverRegistry([codexDriver, claudeDriver, apiDriver, hermesDriver]);
```

Keep Hermes one-shot only in this proof slice. It does not need interactive session support to prove the driver boundary works.

- [ ] **Step 4: Re-run the focused Hermes tests plus the driver-hook `AgentHub` slice**

Run:

```bash
npm test -- src/main/agents/detect.test.ts src/main/agents/hermes-runner.test.ts src/main/agent-hub.test.ts
```

Expected: PASS for Hermes detection, JSON-line event streaming, and driver-owned workflow dispatch.

- [ ] **Step 5: Commit the Hermes proof runtime**

```bash
git add src/main/agents/hermes-runner.ts src/main/agents/hermes-runner.test.ts src/main/agents/detect.ts src/main/agents/detect.test.ts src/main/agent-executor.ts src/main/agent-hub.test.ts
git commit -m "feat: add hermes runtime onboarding proof"
```

### Task 4: Sync Docs And Re-Verify The Onboarding Path

**Files:**
- Modify: `docs/superpowers/specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
- Modify: `docs/zh-CN/runtime-execution-architecture-spec.md`
- Modify: `docs/architecture-overview.md`
- Modify: `docs/modules/main.md`

- [ ] **Step 1: Update the design and zh-CN spec to say the future-runtime path is now proven by a concrete Hermes driver**

```md
Status wording to add:
- Hermes now exists as a minimal one-shot proof runtime
- workflow, runtime-test, and cleanup dispatch now live behind driver-owned hooks
- adding a new runtime no longer requires widening product-level `AgentHub` branches for those paths
```

- [ ] **Step 2: Refresh the architecture docs so they list Hermes and the new driver hooks**

```md
- `RuntimeDriver` now optionally owns workflow invocation, runtime-channel testing, and session-artifact cleanup
- `src/main/agents/hermes-runner.ts` demonstrates the minimal local CLI path for a future runtime
```

- [ ] **Step 3: Run the final focused verification set**

Run:

```bash
npm run typecheck
npm test -- src/shared/runtime-catalog.test.ts src/renderer/src/app/agents.test.ts src/main/agents/detect.test.ts src/main/agents/hermes-runner.test.ts src/main/agent-hub.test.ts
```

Expected: PASS for typecheck and the runtime-onboarding proof coverage.

- [ ] **Step 4: Commit the docs sync**

```bash
git add docs/superpowers/specs/runtime/2026-07-08-runtime-boundary-reset-design.md docs/zh-CN/runtime-execution-architecture-spec.md docs/architecture-overview.md docs/modules/main.md
git commit -m "docs: sync future runtime onboarding proof"
```

### Scope Guardrails

- Hermes stays one-shot only in this proof slice. Do not add interactive session semantics or resume claims for Hermes.
- Do not add new top-level `if (runtimeId === "hermes")` branches to `AgentHub`. Runtime-specific behavior must live in the driver registration or runtime-local helpers.
- Do not rewrite Codex or Claude transports just to make Hermes look similar. Runtime-local differences are acceptable as long as the driver boundary contains them.
- Do not claim Hermes is available by default; it should remain unavailable until `detectAgentRuntimes()` finds a working binary.

### Definition Of Done

- `AgentId`, fallback models, config channels, provider presets, and renderer labels all include Hermes.
- Workflow execution, runtime-channel testing, and session cleanup dispatch through `RuntimeDriver` hooks instead of hardcoded runtime-family branching in `AgentHub`.
- A minimal Hermes CLI runner exists and is registered as a one-shot runtime.
- Focused tests and `npm run typecheck` pass.
