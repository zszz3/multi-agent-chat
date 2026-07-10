# Runtime 与底层 Agent 调用架构

本文档描述 Multi Agent Chat 的核心架构：上层 Runtime（AgentHub / WorkflowRuntime）如何通过 Driver 层调用下层的各种 Agent 实现。

## 1. 整体分层

```
┌─────────────────────────────────────────────────────┐
│                    调用方                             │
│  AgentHub (Chat/Task)    WorkflowRuntime (Workflow)  │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
               ▼                      ▼
┌─────────────────────────────────────────────────────┐
│               AgentExecutorFactory                    │
│         (薄适配层：RunTaskRequest → AgentExecutor)     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│           RuntimeDriverRegistry                       │
│  根据 AgentId 分发到对应的 RuntimeDriver              │
│  codex │ claude │ api │ hermes │ opencode │ openclaw  │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│              RuntimeDriver (接口)                     │
│  - createOneShotExecutor()  → AgentExecutor          │
│  - createInteractiveSession() → InteractiveSession   │
│  - askWorkflow()             → 跳过 Task，直接调用    │
│  - testChannel() / deleteSessionArtifacts()           │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│         具体实现 (AgentExecutor / Runner)              │
│  CodexRpcClient  Claude SDK  fetch()  HermesRunner / ACP │
│     (JSON-RPC)      (SDK)    (HTTP)    (CLI / JSON-RPC) │
└─────────────────────────────────────────────────────┘
```

核心设计原则：**上层（AgentHub / WorkflowRuntime）不感知具体 Agent 类型**。它们只操作 `configuredAgentId` 和 `modelId`，实际的 Agent 分发由 `RuntimeDriverRegistry` 完成。

## 2. 核心接口

### 2.1 AgentId — Agent 类型标识

```typescript
// src/shared/types.ts
type AgentId = "codex" | "claude" | "api" | "hermes" | "opencode" | "openclaw";
```

联合类型，每个值对应一个 Runtime Driver。

### 2.2 ConfiguredAgent — 用户配置的 Agent

```typescript
// src/shared/types.ts
interface ConfiguredAgent {
  id: string;              // 用户定义的唯一 ID
  name: string;            // 显示名称
  runtimeAgentId: AgentId; // 指向哪个 Runtime（codex/claude/api/hermes/opencode/openclaw）
  channelId: string;       // 指向哪个 Channel（包含 provider/模型列表/API key 等）
  modelId: string;         // 默认模型
}
```

### 2.3 RuntimeDriver — 每种 Agent 的完整契约

```typescript
// src/main/agents/runtime-driver.ts
interface RuntimeDriver {
  runtimeId: AgentId;
  getCapabilities(runtime: AgentRuntime): RuntimeCapabilities;
  createOneShotExecutor(context: AgentExecutionContext): AgentExecutor;
  createInteractiveSession?(context: InteractiveSessionContext): InteractiveSession;
  askWorkflow?: (input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>;
  testChannel?: (input: RuntimeChannelTestContext) => Promise<string>;
  deleteSessionArtifacts?: (input: RuntimeSessionCleanupContext) => Promise<void>;
}
```

### 2.4 AgentExecutor — 一次性执行器

```typescript
// src/main/hub/runtime/executor/agent-executor-types.ts
interface AgentExecutor {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

所有 OneShot 模式下统一使用此接口，启动后通过 `emit` 回调输出事件流。

### 2.5 InteractiveSession — 持久交互会话

```typescript
// src/main/agents/runtime-driver.ts
interface InteractiveSession {
  reconfigure(context): void;           // 模型/channel 变更后重新配置
  ensureAttached(): Promise<void>;      // 惰性附着子进程
  sendPrompt(prompt: string): Promise<void>;  // 发送 prompt
  interrupt(): Promise<void>;           // 中断当前 turn
  detach(reason): Promise<void>;        // 释放子进程
  snapshot(): ChatRuntimeSessionState;  // 获取当前会话快照
}
```

### 2.6 RuntimeCapabilities — 能力声明

```typescript
// src/main/agents/runtime-capabilities.ts
interface RuntimeCapabilities {
  runtimeId: AgentId;
  chatStyle: "oneshot" | "interactive";    // Chat 场景支持什么模式
  taskStyle: "oneshot" | "interactive";    // Task 场景支持什么模式
  workflowStyle: "oneshot" | "interactive"; // Workflow 场景支持什么模式
  testStyle: "oneshot" | "interactive";    // 测试场景支持什么模式
  supportsInterrupt: boolean;              // 是否支持中断
  supportsContinue: boolean;               // 是否支持继续
  supportsApprovalRequests: boolean;       // 是否支持审批请求
  supportsUserInputRequests: boolean;      // 是否支持用户输入请求
  resume: RuntimeResumeCapabilities;       // 会话恢复能力
}
```

## 3. 两条主要调用路径

### 3.1 Oneshot 路径（Task / Workflow 节点）

Chat 的 Task、Workflow 的每个节点都走这条路。

```
AgentHub.runTask(request)
  │
  ├─ resolveConfiguredAgent(configuredAgentId) → runtimeAgentId, channel, modelId
  │
  └─ runChat(run, prompt, resolved)
       │
       └─ executorFactory.create({
            agentId: resolved.runtimeAgentId,  ← 关键：通过这里分发
            ...
          })
            │
            └─ RuntimeAgentExecutorFactory.create(context)
                 │
                 └─ registry.driverFor(context.agentId)
                      │
                      ├─ "codex" → new CodexAgentExecutor(context, options)
                      ├─ "claude" → new ClaudeAgentExecutor(context, options)
                      ├─ "api"   → new ApiAgentExecutor(context, options)
                      └─ "hermes" → new HermesAgentExecutor(context, options)
```

详细流程：

```
1. runTask() 创建 TaskState，设置 status=running
2. resolveConfiguredAgent() 查找：
   - configuredAgentId → ConfiguredAgent
   - ConfiguredAgent.runtimeAgentId → AgentId (codex/claude/api/hermes/opencode/openclaw)
   - ConfiguredAgent.channelId → AgentChannel (含 modelProvider, baseUrl 等)
3. runChat() 构造 AgentExecutionContext：
   {
     agentId: "codex",               // 决定用哪个 Driver
     runtime: { id: "codex", ... },  // AgentRuntime（含 command 路径）
     channelId: "codex-default",     // 决定用哪个 Channel
     modelId: "claude-sonnet-4-6",   // 决定用哪个模型
     prompt: "...",
     workDir: "/path/to/work",
     ...
   }
4. executorFactory.create(context) → 创建对应的 AgentExecutor
5. executor.start() → 拉起子进程 / 发 HTTP 请求

事件流通过 AgentExecutionContext.emit 回传：
  emit({ type: "session", sessionId })  → run.sessionId = sessionId
  emit({ type: "delta", content })      → 增量文本追加到消息
  emit({ type: "completed", content })  → 标记消息完成
  emit({ type: "error", error })        → 错误处理
  onExit(code)                          → 进程退出处理
```

### 3.2 Interactive 路径（Chat 对话）

Chat 场景支持持久会话：一个 chat 的多个 turn 复用同一个子进程或 session。

```
用户输入 prompt
  │
  ▼
AgentHub.sendPrompt(prompt, chatId)
  │
  ├─ resolveConfiguredAgent(chat.configuredAgentId) → runtimeAgentId
  │
  └─ interactiveSessions.dispatch(chatId, context, async (session, lease) => {
       session.ensureAttached()   // 如果没有附着则拉起子进程
       session.sendPrompt(prompt) // 发送新一轮对话
     })
       │
       ├─ InteractiveSessionManager.dispatch()
       │    │
       │    ├─ getOrCreate()  → 首次调用时创建 InteractiveSession
       │    │    └─ driver.createInteractiveSession(context)
       │    │         ├─ "codex" → new CodexInteractiveSession
       │    │         └─ "claude" → new ClaudeInteractiveSession
       │    │
       │    └─ 通过 Promise 链保证同一 chat 的请求串行执行
       │
       └─ session.sendPrompt(prompt)
            ├─ CodexInteractiveSession:
            │    ensureAttached() → new CodexRpcClient() → client.start()
            │    → thread/start (或 thread/resume)
            │    → turn/start
            │
            └─ ClaudeInteractiveSession:
                 ensureAttached() → transport.startTurn()
                 → CLI: claude --resume <sessionId> --prompt "..."
```

**InteractiveSessionManager 的作用**：

- 每个 chatId 维护一个 `ManagedInteractiveSession`
- 内部有 Promise 链队列，保证同一 chat 的消息按序处理
- 支持 `interrupt()` 打断正在运行的 turn
- 定时扫描（每 30 分钟）回收空闲超过 1 小时的会话

**ProcessLease 的作用**：

- 每个 InteractiveSession 内有一个 `ProcessLease`（`src/main/agents/process-lease.ts`）
- `attachmentGeneration`：每次重新 attach 递增，用于识别事件是否来自过期的附着
- `turnId`：每次新 turn 递增，用于识别事件是否来自已被中断的 turn
- 当 `attachmentGeneration` 或 `turnId` 不匹配时，事件被丢弃

## 4. 六种 Runtime 的详细实现

### 4.1 Codex — 子进程 JSON-RPC

```
CodexAgentExecutor (oneshot)
  │
  └─ CodexRpcClient
       │
       ├─ spawn("codex", ["app-server", "--json", ...])
       │    └─ 通过 codexAppServerConfigArgs 传递模型/审批参数
       │
       ├─ 协议：JSON-RPC via stdin/stdout
       │    thread/start  → { thread: { id } }
       │    turn/start    → 开始执行（流式事件）
       │    thread/resume → 恢复已有会话
       │
       └─ 事件流：
            {"type":"stream_event", "event":{...}}  → onEvent 逐行解析
```

Codex 能力：`interactive` 风格，支持中断、继续、审批请求、用户输入请求。
在 Workflow 模式下支持 session resume（通过 `thread/resume` 恢复已有 thread）。

### 4.2 Claude — 子进程 CLI

```
ClaudeAgentExecutor (oneshot)
  │
  └─ ClaudeRunner
       │
       ├─ spawn("claude", ["--print", "--output-format", "stream-json",
       │                    "--model", "sonnet", "--resume", sessionId, prompt])
       │
       └─ 协议：stream-json via stdout line-delimited
            └─ normalizeClaudeStreamEvent() 标准化事件格式
```

Claude 能力：`interactive` 风格，支持中断、继续、审批请求、用户输入请求。
`--resume` 参数支持会话恢复。

Transport 选择逻辑（`src/main/agents/claude-transport-selection.ts`）决定用 CLI 还是 SDK。

### 4.3 API — 纯 HTTP

```
ApiAgentExecutor (oneshot)
  │
  ├─ 根据 modelProvider 决定 URL 和请求体格式
  │    ├─ "anthropic-api" → POST {baseUrl}/messages
  │    │    body: { model, max_tokens, system, messages }
  │    │
  │    └─ 其他              → POST {baseUrl}/chat/completions
  │         body: { model, messages, stream: false }
  │
  └─ 响应解析：
       Anthropic: content[].text 拼接
       OpenAI:    choices[0].message.content
```

API 能力：全部 `oneshot` 风格，**不支持**中断、继续、审批请求、用户输入请求。
无状态，每次请求独立 HTTP 调用。

### 4.4 Hermes — 官方 CLI one-shot + ACP interactive

```
task / workflow / channel-test (oneshot)
  └─ HermesRunner
       └─ hermes -z <prompt> [--model <modelId>] → stdout 最终文本

chat (interactive)
  └─ HermesInteractiveSession
       └─ AcpInteractiveClient
            └─ hermes acp → ACP JSON-RPC over stdio
                 ├─ session/new、session/resume、session/prompt
                 ├─ session/cancel
                 ├─ message / thought / tool / plan 更新
                 └─ permission request / response
```

Hermes chat 支持 detach、应用重启后的会话恢复、中断、继续和审批请求；不声明 turn resume 与自由形式用户输入请求。ACP `sessionId` 由 `hermesRuntimeStateCodec` 持久化，cleanup 使用 `hermes sessions delete <sessionId> --yes`。

### 4.5 OpenCode — 官方 NDJSON one-shot + ACP interactive

```text
task / workflow / channel-test (oneshot)
  └─ opencode run --format json [--model provider/model] <prompt>

chat (interactive)
  └─ opencode acp --cwd <workDir>
       └─ 通用 AcpInteractiveClient / AcpInteractiveSession
```

OpenCode chat 支持 ACP session 恢复、中断、继续、审批和模型选择；`openCodeRuntimeStateCodec` 持久化 native session id，cleanup 使用 `opencode session delete <sessionId>`。

### 4.6 OpenClaw — 官方 agent JSON one-shot + Gateway ACP interactive

```text
task / workflow / channel-test (oneshot)
  └─ openclaw agent --session-key <isolated-key> --message <prompt> --json [--model provider/model]

chat (interactive)
  └─ openclaw acp
       └─ Gateway-backed ACP session new/resume/prompt/cancel/permission
```

OpenClaw ACP 当前不暴露模型选择，interactive 使用 Gateway session model；配置页中的可选 `provider/model` 只用于 one-shot。runtime codec 持久化 Gateway-backed ACP session id。因官方没有精确删除单个 durable Gateway session 的等价命令，OpenClaw 不声明 cleanup surface。

## 5. RuntimeDriverRegistry 的构造

```typescript
// src/main/hub/runtime/executor/agent-executor.ts — createRuntimeDriverRegistry()

createRuntimeDriverRegistry(options) {
  return new RuntimeDriverRegistry([
    createCodexDriver(options),   // interactive, RPC 风格
    createClaudeDriver(options),  // interactive, SDK 风格
    createApiDriver(options),     // oneshot, HTTP 风格
    createHermesDriver(options),  // interactive chat + CLI oneshot
    createOpenCodeDriver(options), // interactive chat + NDJSON oneshot
    createOpenClawDriver(options), // Gateway ACP chat + agent JSON oneshot
  ]);
}
```

新的 runtime 扩展路径以 `createXxxDriver()` 为唯一入口。中央 registry 只做注册聚合，具体 runtime 的 executor / workflow / cleanup / session / capability 组装放回各自目录自治。

AgentHub 初始化时传入共享上下文和可选的按-runtime覆盖钩子。各 `createXxxDriver()` builder 负责决定使用覆盖实现，还是使用 runtime-local 默认实现：

```
AgentHub 构造:
  runtimeDrivers = createRuntimeDriverRegistry({
    executables,                          // { codex: "codex", claude: "claude", ... }
    channelById,                          // AgentHub 的 channel 查询
    respondToCodexServerRequest,          // Codex RPC 的 server→client 回调

    // 以下钩子可由 AgentHub 覆盖，因为某些路径需要访问 AgentHub 内部状态
    askWorkflowByRuntime: {
      codex:  → this.askCodexWorkflowAgent(),
      claude: → this.askClaudeWorkflowAgent(),
      api:    → this.askApiWorkflowAgent(),
      // hermes builder 可使用 runtime-local runHermesWorkflow 默认实现
    },

    testChannelByRuntime: {
      codex:  → this.testCodexAgent(),
      claude: → this.testClaudeAgent(),
      api:    → this.testApiAgent(),
    },

    deleteSessionArtifactsByRuntime: { ... },
  });
```

### Workflow 模式下 askWorkflow 的特殊性

Workflow 节点不走 `runTask()`，而是通过 `askWorkflow()` 钩子直接调用底层 Agent：

```
WorkflowRuntime.executeRun()
  │
  └─ runTask(request)
       │
       └─ AgentHub.runTask(input)
            │
            └─ ... 最后走到 executorFactory.create() → 对应的 Executor
```

但实际上 Workflow 中的"judge agent"和"final review agent"也走的是 `runTask()`，即走 Oneshot 路径。
**`askWorkflow` 钩子目前用于 Workflow Draft 的对话交互（`askWorkflowAgent`），而不是 Workflow 节点的批量执行。**

所以 Workflow 节点执行的完整链路是：

```
WorkflowRuntime.executeRun()
  │
  └─ for each level:
       │
       ├─ startWorkflowTask() → AgentHub.runTask(request)
       │    │
       │    ├─ createTaskState(request)
       │    ├─ resolveConfiguredAgent(configuredAgentId)
       │    │    └─ configuredAgentId → ConfiguredAgent.runtimeAgentId → "codex"/"claude"/...
       │    │
       │    └─ runChat(task, prompt, resolved)
       │         └─ executorFactory.create({ agentId: runtimeAgentId, ... })
       │              └─ registry.driverFor(agentId).createOneShotExecutor(context)
       │                   ├─ codex  → CodexAgentExecutor
       │                   ├─ claude → ClaudeAgentExecutor
       │                   ├─ api    → ApiAgentExecutor
       │                   └─ hermes → HermesAgentExecutor
       │
       ├─ waitForTask(taskId) — 轮询等待 task 完成
       │    └─ 每 WORKFLOW_TASK_POLL_MS (2 秒) 检查最新 snapshot 中的 task 状态
       │
       ├─ evaluateNodeAttempt() — Judge agent 评估节点输出
       │    └─ 也是一个 runTask() 调用，同样走 Oneshot Executor
       │
       └─ 同层节点并行执行（Promise.all），逐层串行
```

## 6. 完整调用链路图

### 6.1 Chat 对话（用户聊天）

```
renderer                                     main
───────                                     ────
用户输入 "帮我写代码"
  │
  ├─ preload.runSend(prompt, chatId)
  │    └─ ipcRenderer.invoke("run:send", prompt, chatId)
  │
  └─────────────────────────────────────────→ AgentHub.sendPrompt(prompt, chatId)
                                                │
                                                ├─ resolveConfiguredAgent(chat.configuredAgentId)
                                                │    → runtimeAgentId, channel, modelId, runtime
                                                │
                                                └─ interactiveSessions.dispatch(chatId, context, work)
                                                     │
                                                     ├─ getOrCreate(chatId, context)
                                                     │    └─ driver.createInteractiveSession(context)
                                                     │         ├─ codex → CodexInteractiveSession
                                                     │         └─ claude → ClaudeInteractiveSession
                                                     │
                                                     └─ work(session, lease)
                                                          ├─ session.ensureAttached()
                                                          │    ├─ spawn 子进程
                                                          │    └─ thread/start RPC
                                                          │
                                                          └─ session.sendPrompt(prompt)
                                                               └─ turn/start RPC
                                                                    │
                                                                    └─ 事件流 → context.emit(event)
                                                                         │
                                                                         └─ AgentHub.handleAgentEvent()
                                                                              ├─ 写消息到 chat.messages
                                                                              └─ this.emit()
                                                                                   └─ mainWindow.send("snapshot:changed")
```

### 6.2 Task 执行（任务面板）

```
AgentHub.runTask({ prompt, configuredAgentId, modelId })
  │
  ├─ createTaskState(input) → TaskState (status="queued")
  │
  ├─ resolveConfiguredAgent(configuredAgentId)
  │    → { runtimeAgentId: "codex", channel, modelId, runtime }
  │
  ├─ task.status = "running"
  │
  └─ runChat(task, prompt, resolved)
       │
       └─ executorFactory.create({
            runId: task.id,
            runKind: "task",
            agentId: "codex",         ← 从这里开始分发
            runtime: { id:"codex", command:"codex", ... },
            channelId: "codex-default",
            modelId: "claude-sonnet-4-6",
            prompt: "...",
            developerInstructions: CODEX_TASK_DEVELOPER_INSTRUCTIONS,
            emit: handleAgentEvent,    ← 事件回调
            onExit: markRunExited,     ← 退出回调
          })
            │
            └─ RuntimeAgentExecutorFactory.create(context)
                 └─ registry.driverFor("codex")
                      .createOneShotExecutor(context)
                        → new CodexAgentExecutor(context, options)
                           │
                           └─ start()
                                ├─ new CodexRpcClient(...)
                                ├─ client.start()
                                ├─ client.request("thread/start", ...)
                                └─ client.request("turn/start", ...)
                                     │
                                     └─ onEvent 回调 →
                                          emit({ type: "session", sessionId })
                                          emit({ type: "delta", content })
                                          emit({ type: "completed", content })
                                          onExit(code)
```

### 6.3 Workflow 执行（工作流编排）

```
UI 点击 "Run Workflow"
  │
  └─ ipcMain.handle("workflow-run:run-graph" → AgentHub.runWorkflowGraph())
       │
       └─ WorkflowRuntime.runWorkflowGraph(request)
            │
            ├─ validateWorkflowGraph(graph)
            ├─ workflowGraphExecutionLevels(graph) → [["node-a","node-b"], ["node-c"]]
            │
            └─ startWorkflowRun() → this.executeRun({ runId, executionLevels })
                 │
                 ├─ Level 1: [node-a, node-b] 并行
                 │    │
                 │    ├─ startNodeAttempt(node-a) → runTask({ prompt, configuredAgentId, modelId })
                 │    │    └─ AgentHub.runTask() → ... → executorFactory.create()
                 │    │         └─ CodexAgentExecutor → CodexRpcClient → "codex" CLI 子进程
                 │    │
                 │    ├─ startNodeAttempt(node-b) → runTask({ prompt, ... })
                 │    │    └─ ClaudeAgentExecutor → ClaudeRunner → "claude" CLI 子进程
                 │    │
                 │    ├─ Promise.all([waitForNodeAttempt(a), waitForNodeAttempt(b)])
                 │    │    轮询 task.status 直到 "completed" 或 "failed"
                 │    │
                 │    ├─ evaluateNodeAttempt(node-a) → runTask(judgePrompt, ...)
                 │    │    └─ judge agent 评估：pass = true → 通过，进入下一层
                 │    │                   pass = false → retry / fail
                 │    │
                 │    └─ evaluateNodeAttempt(node-b) → 同上
                 │
                 ├─ Level 2: [node-c]
                 │    └─ 同上流程，contextDocument 已累积上游节点输出
                 │
                 └─ Final Review → runTask(finalReviewPrompt, ...)
                      └─ Main agent 汇总所有节点输出生成 finalReport
```

关键点：**同一个 Workflow 的不同节点可以用不同的 Agent**。

```typescript
// 例如 node-a 用 codex，node-b 用 claude
const nodeAgent = resolveWorkflowNodeAgent(
  node,                                    // node.configuredAgentId 覆盖 workflow 默认值
  { configuredAgentId, modelId },          // workflow 级别默认值
  latestSnapshot.configuredAgents          // 全局配置的 agent 列表
);
// → { configuredAgentId: "my-claude-agent", modelId: "claude-sonnet-4-6" }
// → runTask({ configuredAgentId: "my-claude-agent", ... })
// → resolveConfiguredAgent("my-claude-agent")
// → runtimeAgentId = "claude" → ClaudeAgentExecutor
```

## 7. 如何新增一个 Agent Runtime

假设新增 `"mymodel"` runtime，需要修改以下文件：

### 步骤 1：扩展 AgentId 类型

```typescript
// src/shared/types.ts
type AgentId = "codex" | "claude" | "api" | "hermes" | "opencode" | "openclaw" | "mymodel";
```

### 步骤 2：实现 Runner（拉起子进程/发 HTTP）

```typescript
// src/main/agents/mymodel-runner.ts
export class MymodelRunner {
  async start(): Promise<void> { /* spawn 或 fetch */ }
  async stop(): Promise<void> { /* kill 或 abort */ }
}
```

### 步骤 3：实现 AgentExecutor 与 runtime-local bundle

```typescript
// src/main/hub/runtime/executor/mymodel/mymodel-executor.ts
class MymodelAgentExecutor implements AgentExecutor {
  async start(): Promise<void> {
    // new MymodelRunner(...) → runner.start()
    // 通过 this.context.emit 回传事件
    // 通过 this.context.onExit 通知结束
  }
  async stop(): Promise<void> { /* ... */ }
}
```

同时在 `src/main/hub/runtime/executor/mymodel/` 下声明本 runtime 自己的 capability、workflow、cleanup、session 等模块。只实现实际支持的能力；不支持的 surface 和 continuation policy 要显式拒绝。

### 步骤 4：实现并注册 RuntimeDriver builder

```typescript
// src/main/hub/runtime/executor/mymodel/create-mymodel-driver.ts
export function createMymodelDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  return createOneShotRuntimeDriver({
    runtimeId: "mymodel",
    surfaceSupport: mymodelSurfaceSupport,
    getCapabilities: getMymodelCapabilities,
    createOneShotExecutor: (context) => new MymodelAgentExecutor(context, options),
    askWorkflow: undefined,
    testChannel: undefined,
    deleteSessionArtifacts: undefined,
  });
}

// src/main/hub/runtime/executor/agent-executor.ts
return new RuntimeDriverRegistry([
  createCodexDriver(options),
  createClaudeDriver(options),
  createApiDriver(options),
  createHermesDriver(options),
  createMymodelDriver(options),
]);
```

### 步骤 5：更新 tools 层

```typescript
// src/main/agents/detect.ts — AGENT_COMMANDS 新增
const AGENT_COMMANDS = {
  ...
  mymodel: { label: "MyModel", env: "MYMODEL_PATH", executable: "mymodel" },
};

// src/main/agent-hub.ts — defaultTitle() 新增分支
// src/main/agent-hub.ts — agentLabel() 新增分支
// src/main/agent-hub.ts — isAgentId() 新增判定
// src/main/agent-hub.ts — executables 默认值
// src/shared/models.ts — defaultChannelForAgent / defaultModelForAgent 新增
```

### 步骤 6：可选 — Interactive Session

如需支持长连接对话：

```typescript
// src/main/agents/mymodel-interactive-session.ts
export class MymodelInteractiveSession implements InteractiveSession {
  // 实现 ensureAttached / sendPrompt / interrupt / detach 等方法
  // 内部使用 ProcessLease 管理生成代次
}
```

### 已有 Workflow 是否无缝切换？

**可以**。Workflow 的每个节点通过 `configuredAgentId` 选择 Agent，只要把节点的 `configuredAgentId` 设置成指向新 Runtime 的 `ConfiguredAgent`，WorkflowRuntime 无需任何改动即可在新 Agent 上运行。

## 8. 与 AgentHub 的沟通模式

### 事件回调机制

所有 Agent 执行过程通过两个回调与 AgentHub 通信：

```
AgentExecutionContext {
  emit: (event: AgentEvent) => void;   // 运行时事件流
  onExit: (code?: number | null) => void;  // 进程/请求结束
}
```

AgentEvent 类型：

| 事件类型 | 含义 | 携带数据 |
|---------|------|---------|
| `session` | 会话已建立 | `sessionId` |
| `delta` | 增量文本输出 | `content` |
| `completed` | 回复完成 | `content?` |
| `error` | 运行时错误 | `error` |
| `meta` | 元信息 | `content` |
| `system` | 系统通知 | `content` |
| `tool_call` | 工具调用 | `content, name` |
| `tool_result` | 工具结果 | `content, name` |
| `approval_request` | 审批请求 | `requestId, content` |
| `user_input_request` | 用户输入请求 | `requestId, content` |

AgentHub 的 `handleAgentEvent()` 方法将这些事件转换为 chat/task 中的消息记录，并通过 `this.emit()` 推送给 renderer。

### 状态同步

```
Agent Executor/Runner
  │
  ├─ emit(event) ──────────→ AgentHub.handleAgentEvent(run, event)
  │                            ├─ 写 ChatMessage / ChatEvent
  │                            ├─ 更新 sessionId / resumeState
  │                            └─ this.emit() → snapshot 推 UI
  │
  └─ onExit(code) ─────────→ AgentHub.markRunExited(run)
                                ├─ run.running = false
                                ├─ task.status = "completed"/"failed"
                                └─ this.emit() → snapshot 推 UI
```

所有状态变更都在 `AgentHub` 中完成，Agent Executor 只负责"执行"和"报告"。
