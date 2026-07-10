# Runtime 扩展方案：面向 Hermes / OpenClaw / 后续 Runtime

> 状态（2026-07-10）：runtime 自治架构与 Hermes 接入已经完成。Hermes 的 task/workflow/channel-test 使用官方 `hermes -z` one-shot，chat 使用官方 `hermes acp` interactive。OpenCode 与 OpenClaw 按独立后续分支推进。

## 1. 目标

这份文档只回答一个问题：

如何让当前 runtime 架构能继续稳定接入新的 runtime，例如：

- `hermes`
- `openclaw`
- 后续更多 CLI / SDK / API 型 agent runtime

目标不是再抽象一层“万能运行时”，而是把现有 runtime 入口整理成一个更稳定的扩展面，让新增 runtime 时：

- 改动面尽量小
- 不污染 `AgentHub`
- 不持续膨胀主装配文件
- 每个 runtime 的具体实现内聚在自己的目录里

## 2. 当前现状

当前 runtime 扩展链路大致是：

```text
AgentHub
  -> RuntimeRouter
  -> RuntimeDriverRegistry
  -> hub/runtime/executor/agent-executor.ts
  -> runtime-specific executor / workflow executor / interactive session
```

已经成立的边界有：

- 上层业务（chat/task/workflow）基本不直接关心 `CodexRpcClient`、Claude SDK、HermesRunner
- `RuntimeRouter` 只认抽象能力：
  - `createOneShotExecutor`
  - `createInteractiveSession`
  - `askWorkflow`
  - `testChannel`
  - `deleteSessionArtifacts`

当前中央装配文件已经收敛为 runtime builder 注册聚合；executor、workflow、capability、session 和 cleanup 由 runtime 目录自治。新增 runtime 仍需在共享类型、检测和 UI 枚举等必要边界登记，但业务层不需要 runtime-specific 分支。

## 3. 基本原则

后续扩 runtime，建议坚持下面四条原则。

### 3.1 业务层无感知

`AgentHub`、workflow、task、team、chat 这些业务层，不应再出现：

- `if runtimeId === "codex"`
- `if runtimeId === "hermes"`
- `if runtimeId === "openclaw"`

业务层只应该描述：

- 我要执行 chat/task/workflow
- 我要什么 execution mode
- 我要什么 continuation policy

至于底层具体怎么跑，由 runtime driver 决定。

### 3.2 主装配层少感知

主装配层不需要“完全无感知”，但应该“最少感知”。

也就是说：

- 它可以知道要注册哪些 driver
- 但不应该长时间保存各 runtime 的实现细节

理想状态是：

```ts
return new RuntimeDriverRegistry([
  createCodexDriver(options),
  createClaudeDriver(options),
  createApiDriver(options),
  createHermesDriver(options),
  createOpenClawDriver(options),
])
```

而不是在一个文件里同时展开：

- Codex executor
- Claude executor
- Hermes workflow runner
- OpenClaw interactive session

### 3.3 具体 runtime 自己对自己负责

每个 runtime 自己负责：

- one-shot executor
- interactive session（如果支持）
- workflow executor（如果支持）
- channel test（如果支持）
- cleanup（如果支持）
- runtime conversation codec（如果支持持久化）

这样新增 runtime 时，不是“修改系统内部很多地方”，而是“新增一个 runtime bundle，再注册进去”。

### 3.4 能力是显式声明的

不要靠约定猜测 runtime 能做什么。

每个 runtime driver 应显式声明：

- 支持哪些 surface
- 支持哪些 execution mode
- 支持哪些 continuation policy
- 是否支持 interactive session
- 是否支持 runtimeConversation codec

这样后面接 `openclaw` 时，不需要先假设它“应该像 codex 一样”，而是按它自己的能力声明接入。

## 4. 建议的目标结构

建议把 runtime 扩展逐步稳定到下面这类结构：

```text
src/main/hub/runtime/
  executor/
    agent-executor.ts                  # 只做 registry 聚合
    agent-executor-types.ts            # 共享类型

    codex/
      create-codex-driver.ts
      codex-executor.ts
      codex-workflow.ts
      codex-cleanup.ts
      codex-session.ts

    claude/
      create-claude-driver.ts
      claude-executor.ts
      claude-workflow.ts
      claude-cleanup.ts
      claude-session.ts

    api/
      create-api-driver.ts
      api-executor.ts

    hermes/
      create-hermes-driver.ts
      hermes-executor.ts
      hermes-workflow.ts
      hermes-capabilities.ts
      hermes-session.ts
      hermes-cleanup.ts

    openclaw/
      create-openclaw-driver.ts
      openclaw-executor.ts
      openclaw-workflow.ts
      openclaw-session.ts            # 如果未来支持 interactive
      openclaw-cleanup.ts            # 如果未来支持 cleanup
```

该结构现已落地。通用 ACP 协议客户端位于 `src/main/agents/acp/`，Hermes bundle 只负责 Hermes 的命令选择、能力声明和会话装配。

## 5. 推荐的 driver builder 形态

建议每个 runtime 都提供一个统一入口：

```ts
export function createHermesDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver
export function createOpenClawDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver
```

这个函数内部负责组装该 runtime 的全部能力。

例如 `createHermesDriver()` 内部决定：

- 用哪个 one-shot executor
- workflow 是否复用同一路径
- testChannel 怎么做
- 是否有 runtime codec
- 是否支持 cleanup

中央 `agent-executor.ts` 不再关心这些细节，只负责把各个 driver 放进 registry。

## 6. Hermes 接入结果

官方文档和上游 ACP adapter 证明 Hermes 具备稳定的 session identity 与恢复语义，因此最终能力边界是：

- `task/workflow/channel-test`：`hermes -z` one-shot
- `chat`：`hermes acp` interactive
- `runtimeConversation codec`：持久化并校验 ACP `sessionId`，支持 detach 和应用重启后的 resume
- `interrupt`：ACP `session/cancel`
- `approval`：ACP permission request/response
- `cleanup`：`hermes sessions delete <session-id> --yes`
- `Default` 配置：内置 `hermes-default` preset，可选填 model id

Hermes 因此同时证明了“简单 one-shot CLI”和“session-capable ACP runtime”可以共存在同一 runtime-local bundle 内，而不向 `AgentHub` 泄漏协议细节。

## 7. OpenClaw 接入建议

`openclaw` 不应先入为主地按 Codex 或 Claude 套。

接入时应先回答下面几个问题：

1. 它是 CLI、SDK，还是 RPC 型？
2. 它支持 one-shot 还是 interactive？
3. 它有没有稳定的 resume/session/thread identity？
4. 它的 workflow 执行是否等价于普通 one-shot？
5. 它是否需要额外 cleanup？

基于这些答案，再决定它属于哪一类 runtime：

### 类型 A：stateless one-shot runtime

适合结构：

- `openclaw-executor.ts`
- `openclaw-workflow.ts`
- 不需要 session / codec

### 类型 B：session-capable interactive runtime

适合结构：

- `openclaw-executor.ts`
- `openclaw-session.ts`
- `openclaw-workflow.ts`
- `openclaw-cleanup.ts`
- `openclaw-runtime-state-codec.ts`

### 类型 C：API runtime

适合结构：

- `openclaw-api-executor.ts`
- `openclaw-api-workflow.ts`
- 保持 stateless

不要在 runtime 还没定型时就强行把 `openclaw` 塞进 Codex/Claude 模板，否则以后会一直修补边界。

## 8. 具体接入流程建议

以后新增一个 runtime，建议按下面顺序做：

### Phase 1：定义能力边界

先定义：

- `runtimeId`
- 支持哪些 surface
- 支持哪些 mode/policy
- 是否支持 runtimeConversation

### Phase 2：实现 runtime 自己的 bundle

至少包括：

- `createXxxDriver()`
- `xxx-executor.ts`

按能力再选：

- `xxx-session.ts`
- `xxx-workflow.ts`
- `xxx-test.ts`
- `xxx-cleanup.ts`

### Phase 3：只在中央注册一处

中央只新增：

```ts
createXxxDriver(options)
```

不要把实现细节抄回主文件。

### Phase 4：通过 router 验证 surface

验证：

- `chat`
- `task`
- `workflow`
- `channel-test`
- `cleanup`

只验证该 runtime 声明支持的 surface。

## 9. 不建议的方向

下面这些方向后面会让扩 runtime 越来越重：

- 在 `AgentHub` 里增加 runtime-specific 判断
- 在主装配文件里持续堆大段 runtime-specific 代码
- 用一个“大而全”的通用 executor 试图适配所有 runtime
- 在缺少官方协议证据时就强行声明 interactive / resume / cleanup
- 把 session、workflow、test、cleanup 混在一个超大 runtime 文件里

## 10. 最终建议

如果未来确定会继续扩：

- `hermes`
- `openclaw`
- 以及更多 runtime

那么最值得投资的不是“再加抽象”，而是“把 runtime 目录真正做成按 runtime 自治的注册式结构”。

一句话总结：

- 上层业务保持无感知
- 中央视图最少感知
- 每个 runtime 自己对自己的实现负责
- 新 runtime 以 `createXxxDriver()` 为入口接入

这样后面扩 `hermes`、`openclaw` 时，代码改动会更集中，边界也更稳定。
