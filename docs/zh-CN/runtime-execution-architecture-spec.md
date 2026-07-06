# Runtime 执行架构 Spec

日期：2026-07-04
分支：`feat/claude-interactive-runtime`
状态：Phase 1 已落地；Claude 当前默认后端是基于官方包拉起的 `stream-json` 兼容 transport；`CLAUDE_INTERACTIVE_TRANSPORT=runner` 保留为更保守的兼容 fallback；`sdk` 仅保留为未来官方程序化接入占位；approval / user-input 事件已归一化为共享 AgentEvent；interactive reconfigure 已按 hot-safe / attach-boundary / identity-breaking 分类落地
范围：Codex、Claude、API 以及未来本地 runtime（如 Hermes）的执行结构

## 当前落地状态（2026-07-05）

截至 `feat/claude-interactive-runtime` 分支上的 `9b780ad`，这份 spec 的第一阶段主线已经落地：

- 已完成共享 runtime driver registry、interactive session manager、runtime session 持久化与恢复归一化
- Codex chat 已切到共享 interactive session 路径，支持单 chat 附着复用、idle detach 和 thread resume
- Claude chat 已切到共享 interactive session 边界，支持惰性附着、session 复用、stop/interrupt 后的 stale-event rejection
- `AgentHub` 已在启动后集中注册 idle sweep，并把重启恢复的 interactive chat 统一归一化为 `detached`
- `AgentHub` 现已把 Claude approval / user-input 事件持久化为结构化 chat event，并在 stop 或重启恢复时把未完成请求降级为 non-live
- chat state 现支持可持久化的 per-chat `channelId` override；running turn 中的 attach-boundary reconfigure 会暂存到下一次 attach，identity-breaking 变化会清空 native resume handle
- API runtime 仍保持 stateless `oneshot`

在此之后继续补齐的当前能力：

- Claude 现在默认走基于官方包拉起的 `stream-json` 兼容 transport，并保留 `CLAUDE_INTERACTIVE_TRANSPORT=runner` 作为更保守的显式兼容 fallback
- Claude 的 resume capability 声明现在会跟随激活中的 transport 选择保持一致
- interactive session reconfigure 现在通过共享 planner 分类，并通过同一个 per-chat queue 串行进入 session

这一轮实际验证过的命令是：

```bash
npm run typecheck
npm test -- src/main/agent-hub.test.ts src/main/agents/session-reconfigure.test.ts src/main/agents/interactive-session-manager.test.ts src/main/agents/codex-interactive-session.test.ts src/main/agents/claude-interactive-session.test.ts src/preload/index.test.ts
```

对应的关键提交为：

- `aa48218` `feat: add interactive session manager`
- `4a22260` `feat: reuse codex chat sessions`
- `dbdfa5a` `feat: route claude chat through shared sessions`
- `9b780ad` `docs: finalize runtime execution architecture`

## 读者与使用方式

本规范按“一个全新接手、没有任何历史对话上下文的实现 agent”来写。

在本仓库中推进 runtime execution 重构时，应把这份 spec 视为首要真相源。不要假设历史文件名、已经回滚的实验代码、或之前分支上的局部实现今天仍然存在，除非它们在当前 checkout 里真实可见。

当本规范描述的是架构边界时，这个边界是规范性要求；当它提到某个历史文件名或一个可能的落地位置时，除非规范明确写死，否则它只是示例而不是强制路径。

如果当前仓库状态与历史实现记忆不一致，按以下规则处理：

- 保留本规范中的架构意图
- 以当前 checkout 的真实状态为准，而不是以历史分支假设为准
- 不要仅仅因为某个旧文件曾经存在，就把它机械地重新加回来
- 如果在实现过程中发现本地状态与规范不一致，应更新规范或实现，使两者重新收敛

## 规范词含义

本规范中的 `MUST`、`MUST NOT`、`SHOULD`、`SHOULD NOT`、`MAY` 按通常的规范语义理解：

- `MUST` / `MUST NOT`
  - 属于本架构正确性所必需的要求
- `SHOULD` / `SHOULD NOT`
  - 属于强烈推荐的默认做法，除非存在被记录的 runtime-specific 原因
- `MAY`
  - 属于允许范围内的可选实现方式

## 执行基线

除非后文另有更严格约束，否则默认采用以下执行基线：

- 这份 spec 关注的是 main-process runtime execution architecture，不关注 renderer 层的展示微调
- 第一阶段的主要实现目标是 chat execution；workflow、task、runtime test 的 interactive 行为仍然不在这一版范围内，除非后续阶段明确纳入
- API runtime 在这一版 spec 中保持 stateless oneshot
- 仓库需要一条共享的 runtime dispatch boundary，但这条边界不必复用任何特定的历史文件名

## 全新 agent 执行规则

一个没有历史上下文、仅依赖当前仓库和本规范的实现 agent，必须遵守以下规则：

- 动手修改前先检查当前 checkout，并以当前仓库状态为准
- runtime execution 的边界、生命周期和降级语义，以本 spec 为最高真相源
- 除非本 spec 明确要求修改，否则应保留现有的用户可见 chat history 和 API runtime 行为
- 即使历史文件名已经变化，也应保留本规范定义的架构归属边界，而不是机械追历史命名
- 接入或迁移 runtime 时，不得在 `AgentHub` 中继续扩大产品层 runtime 特判分支
- 不得把 renderer 层的禁用输入框、按钮防重之类机制当作 interactive 正确性的核心边界
- 不得把 history reconstruction 伪装或命名为 native runtime resume

## 术语表

- logical chat session
  - 产品层的 chat 对象，会一直存在直到用户删除
- runtime attachment
  - 当前附着在某个 interactive chat 上的子进程或 transport session
- native runtime resume
  - 新拉起一个本地进程后，重新附着回 runtime 自己原本已存在的 conversation 或 thread
- history-based continuation
  - 即使 runtime 底层新建了 native session，产品层仍然依赖持久化 history 和 context 重建下一次请求
- continuation context
  - 产品层为了保持行为一致或重建 history continuation 而持有的字段
- attachment generation
  - 用来标识当前本地 attachment 的单调递增 lease token
- turn id
  - 用来标识当前 interactive turn 的单调递增操作 token

## 指令摘要

本规范把 runtime 执行统一收敛为两种面向产品的风格：

- `oneshot`：一次 prompt 或请求对应一次执行
- `interactive`：一个长期逻辑 chat session 对应一个 chat，runtime 进程按需附着

这里要统一的是生命周期与编排边界，不是底层协议。Codex 可以继续保留原生 app-server RPC，Claude 当前默认走基于官方包拉起的 `stream-json` 兼容 transport，API 继续保持 HTTP；真正官方程序化 SDK transport 仍属于后续工作。共享边界应该是执行风格、capability、事件模型和 session 生命周期。

## 问题定义

当前代码仍然把不少 runtime 细节泄漏到了上层：

- `AgentHub` 只把 Claude chat 当作 interactive runtime。
- Codex 已经有天然的长连接 app-server 协议，但 chat 现在还是每轮重新创建 client 进程，而不是一个 chat 对应一个长期进程。
- Claude 的 interactive 方向已经开始做 session 抽象，但后端路径仍然混杂了 one-shot CLI re-entry 和实验性的 PTY 假设。
- 如果未来接入 Hermes 这类 runtime，当前结构很容易继续在编排层堆 `runtimeAgentId === "..."`。

这种结构随着 runtime 增多会越来越难维护。

## 目标

- 产品架构中只保留 `oneshot` 和 `interactive` 两种执行风格。
- 让 `AgentHub` 负责编排，而不是硬编码 runtime 行为。
- 把 interactive 语义收敛到共享接口后面，使 Codex、Claude、未来的本地 runtime 都能按同一套方式接入。
- 把 Codex chat 改造成真正的 interactive session：一个 chat 对应一个长期进程。
- 保持 API runtime 原样不动，继续走 one-shot。
- 优先采用结构化、可验证的 runtime 集成方式，而不是把终端模拟作为默认架构。

## 非目标

- 不强行把所有 runtime 统一到底层同一种协议，例如 RPC、PTY 或 HTTP。
- 不重做 API runtime 的请求模型。
- 第一阶段不把 workflow、task、runtime test 也改造成 interactive。
- 不要求在执行风格抽象落地前就先做全量持久化结构迁移。

## 必须达到的最终结果

当本规范完整落地时，仓库必须同时具备以下结果：

- 一条共享的 main-process runtime dispatch boundary，用于按执行风格和 capability 分发
- 一条 capability-driven 的 `AgentHub` 编排路径，而不是 Claude-only 或 Codex-only 的 chat 控制分支
- 一套共享 interactive-session 管理模型，明确区分 logical chat session 与 runtime attachment
- Codex chat 作为 `interactive` runtime 落地，具备懒附着、进程复用、空闲 detach 和原生 thread resume
- Claude chat 作为 `interactive` runtime 落地，当前默认后端是基于官方包拉起的 `stream-json` 兼容 transport，`runner` 是显式兼容回退路径，而真正官方程序化 SDK transport 仍属于后续工作；PTY 不能是默认架构
- API runtime 保持不变，继续是 stateless `oneshot`
- 持久化与应用重启后的恢复行为，符合本规范中的 continuation 与 downgrade 规则
- 有验证可以证明 runtime reuse、stale-event rejection、idle detach 以及 continuation fallback 的正确性

## 决策摘要

### 面向产品的执行风格

应用层只保留两种 runtime 执行风格：

- `oneshot`
  - 启动一次执行
  - 流式接收事件
  - 完成或失败
  - 释放底层进程或请求
- `interactive`
  - 创建或附着到一个长期逻辑 chat session
  - 多轮发送 prompt
  - 可以 interrupt，但不丢失 chat 身份
  - 可以在同一 runtime session 上 continue
  - 只有真正执行时才懒启动 runtime 子进程
  - 子进程可以被回收，逻辑 chat session 仍然保留

### 协议策略

架构应当尽量保留各个 runtime 已验证的底层协议：

- Codex 继续保留原生 app-server RPC。
- Claude interactive 当前优先选基于官方包拉起的 `stream-json` 兼容 session；`runner` 作为更保守的兼容回退路径；真正官方程序化 SDK transport 仍保留为后续工作，而不是 PTY。
- API runtime 继续保持 HTTP one-shot。

应用要统一的是生命周期、capability 与共享事件处理，而不是为了统一而统一底层 transport。

### Interactive 进程策略

interactive runtime 必须把“逻辑 chat session 的生命周期”和“子进程的生命周期”分开。

- 逻辑 chat session 只有在用户显式删除 chat 时才结束。
- 子进程只能在 session 真正执行时创建，例如 `sendPrompt(...)` 或 `continue(...)`。
- 打开、恢复、列出、查看 chat 时，不得提前拉起子进程。
- 一个已附着的子进程如果超过 1 小时没有活动，就应当可以被回收。
- 空闲回收只会让 runtime 从逻辑 chat session 上 detach，不会删除 chat session。
- 后续用户再次发送 prompt 或 continue 时，如果 runtime 对当前丢失边界（如 detach、应用重启）支持 native resume，应优先使用 native resume。
- 如果当前丢失边界不支持 native resume，共享 runtime 层应退回到由产品层持有的 history-based continuation。
- 本轮规范只统一 continuation strategy 的选择边界，不统一具体的 history 序列化、压缩或 prompt 重建算法。
- 探活、心跳、健康检查之类只用于保活的事件，不能刷新空闲超时计时。

### 设计模式选型

本规范采用的是一组组合模式：

- Ports and Adapters
  - 主流程定义共享端口
  - runtime-specific 协议适配器放在边缘
- Strategy
  - 根据 runtime capability 选择 `oneshot` 或 `interactive`
- Abstract Factory
  - 每个 runtime driver 统一创建 one-shot runner 和可选 interactive session
- Adapter
  - 把 RPC、SDK、CLI、HTTP 等协议包装成统一接口
- State
  - interactive session 共用统一生命周期状态机

## 选型依据

### 为什么不统一成 RPC

不是每个 runtime 都公开提供稳定的原生 RPC 边界。Codex 有，Claude 没有同等级的公开 app-server 契约。强行统一成 RPC 会导致：

- 要么 Claude 跟不上
- 要么这个仓库过早发明一层私有 broker

这会增加架构风险，但并不能改善产品行为。

### 为什么不统一成 PTY

PTY 只是 transport 手段，不是好的产品边界。它天然依赖终端 I/O、控制信号和 prompt 解析假设，脆弱性更高。它可以作为实验路径或 fallback，但如果 runtime 有更结构化的接入方式，就不应该把 PTY 当默认架构。

### 为什么要 capability dispatch，而不是 agentId 特判

`AgentHub` 需要回答的问题应该是：

- 这个 chat 能不能 continue
- 当前 runtime 能不能 interrupt
- 当前 runtime 有没有可恢复的 session

而不应该通过 `codex`、`claude`、`hermes` 这些字符串去判断。capability dispatch 扩展性更好，而且能把未来 runtime 的变化控制在 runtime driver 内部。

## 规范架构

### 分层

runtime 栈应拆成四层：

1. `AgentHub`
   - 负责 orchestration、chat/task/workflow 状态变更、持久化和面向 UI 的事件应用
   - 不应该承担 runtime-specific 启动分支
2. 共享 runtime dispatch boundary
   - 作为统一 runtime 分发入口
   - 可以落在 `runtime-adapter.ts`，也可以落在等价的后继文件中
   - 根据 runtime driver 的 capability 和执行风格做委派
3. runtime driver / session 层
   - 声明 runtime capability
   - 创建 one-shot runner 和 interactive session
   - 负责 session 生命周期
4. transport 层
   - 负责协议侧的 subprocess、RPC、SDK、CLI、PTY、HTTP glue

### 核心接口

共享架构应逐步收敛到类似下面的接口：

```ts
export type ExecutionStyle = "oneshot" | "interactive";

export interface RuntimeCapabilities {
  chatStyle: ExecutionStyle;
  taskStyle: ExecutionStyle;
  workflowStyle: ExecutionStyle;
  testStyle: ExecutionStyle;
  supportsInterrupt: boolean;
  supportsContinue: boolean;
  resume: RuntimeResumeCapabilities;
  supportsApprovalRequests: boolean;
  supportsUserInputRequests: boolean;
}

export interface RuntimeResumeCapabilities {
  supportsInProcessConversationResume: boolean;
  supportsResumeAfterDetach: boolean;
  supportsResumeAfterAppRestart: boolean;
  supportsTurnResume: boolean;
}

export interface RuntimeDriver {
  runtimeId: AgentId;
  getCapabilities(context: RuntimeCapabilityContext): RuntimeCapabilities;
  createOneShotRunner(context: OneShotContext): OneShotRunner;
  createInteractiveSession?(context: InteractiveContext): InteractiveSession;
}

export interface OneShotRunner {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export type RuntimeAttachmentState =
  | "detached"
  | "idle"
  | "running"
  | "interrupted";

export interface InteractiveSession {
  reconfigure(context: InteractiveContext): void;
  ensureAttached(): Promise<void>;
  sendPrompt(prompt: string): Promise<void>;
  interrupt(): Promise<void>;
  detach(reason: "idle_timeout" | "app_shutdown" | "error"): Promise<void>;
  snapshot(): ChatRuntimeSessionState;
}

export interface InteractiveSessionManager {
  getOrCreate(chatId: string, context: InteractiveContext): InteractiveSession;
  touch(chatId: string, reason: SessionActivityReason): void;
  sweepExpiredSessions(now?: number): Promise<void>;
  delete(chatId: string): Promise<void>;
}
```

`SessionActivityReason` 应当区分“真实活动”和“仅用于探活的事件”。探活类事件不得调用 `touch(...)` 刷新空闲时间。

具体命名可以调整，但架构分层不能变。

### 并发与 lease 模型

interactive session 的正确性不能只依赖 renderer 层禁用发送按钮，也不能建立在“本地用户不会恶意操作”的假设上。主进程必须在重复 IPC 投递、异步重入、迟到事件、用户动作与后台 sweep 并发发生时仍然保持正确。

同一个 chat 上的 interactive 控制操作必须通过轻量级的主进程命令队列或 mailbox 串行化。这个串行化边界是以下操作的必需正确性前提：

- `ensureAttached`
- `sendPrompt`
- `continue`
- `interrupt`
- `detach`
- `delete`
- `reconfigure`

这里不需要重量级 OS 锁，更推荐使用内存内的轻量顺序执行模型。

每一个已附着的 runtime 子进程都必须持有一个本地 attachment lease，并通过单调递增的 `attachmentGeneration` 或等价 lease token 标识。对于同一个逻辑 chat session，每次重新附着一个新的子进程时，generation 都必须推进。

每一个启动的 interactive turn 也应持有一个 `turnId` 或等价的单调递增操作标识。interrupt、completed、failed 以及其他 turn 级结果在修改共享 session 状态之前，都必须校验自己对应的是否仍然是当前活跃 turn。

CAS 风格的状态迁移是有价值的，但单独依赖 CAS 不够，因为 runtime attach 和 teardown 包含拉起或关闭子进程这类外部副作用。因此，状态校验必须和串行命令执行、lease token 校验组合使用。

如果一个 runtime 事件所属的 attachment generation 已经不再是该 chat 当前激活的 attachment，那么这个迟到事件或陈旧事件必须被直接丢弃。仅靠 `sessionId` 判断是否接受事件是不够的，因为 native resume 合法情况下会让多个本地 attachment 共用同一个 runtime 侧 session handle。

最低事件接收规则应当是：

- 逻辑 chat session 仍然存在
- 事件的 `attachmentGeneration` 与当前激活 attachment 一致
- 如果事件属于 turn 级别，它的 `turnId` 与当前活跃 turn 一致

否则，这个事件必须被忽略。

后台空闲回收不得绕过同一套串行化边界，直接从外部修改 live interactive 状态。sweep 应当入队一个带条件的 detach 请求，例如 `detachIfStillExpired(expectedGeneration, expectedLastMeaningfulActivityAt)`；只有在真正执行该命令时，lease token 和过期前提仍然匹配，才允许 detach。

interrupt 必须针对当前活跃 turn，而不只是针对逻辑 chat session。本次 interrupt 请求应捕获目标 `attachmentGeneration` 和 `turnId`。如果 interrupt ack 或迟到的 interrupt 相关事件到达时，这个目标已经不是当前值，那么这些结果必须被忽略。

这一模型统一的是顺序执行边界与陈旧事件拒收规则。它不要求仓库最终一定暴露这些完全相同的类型名，但等价的 lease-based 并发边界是强制要求。

### Reconfigure 策略

`reconfigure(context)` 必须被当作受控的 runtime-session 操作，而不是一个无边界的可变 patch。

reconfigure 字段应被分成三类：

- hot-safe metadata
  - 这类字段不会改变 live runtime attachment 的行为，因此可以直接更新
  - 这类字段通常更适合留在 interactive runtime 契约之外，例如纯展示层 UI 元数据
- attach-boundary fields
  - 这类字段会影响 runtime 行为，因此只能在下一次 attach 或 reattach 边界生效
  - 例如：model 选择、工作目录、approval policy、sandbox policy、developer instructions、runtime-local config root
- session-identity-breaking fields
  - 这类字段会破坏 native resume 的前提，因此必须清空或替换 native resume handle，而不能假装 continuity 仍然成立
  - 例如：切换 runtime 家族、切换到不兼容的存储根，或修改任何被官方 resume 契约视为会话查找身份一部分的字段

如果 `reconfigure(...)` 发生在某个 turn 仍处于 `running` 时，那么 attach-boundary fields 不得原地改写 live turn。除非 runtime 官方明确声明某个字段支持安全的 in-place mutation，否则这些修改都应被暂存，并在当前 turn 进入 terminal 或 detached 状态后再生效。

如果某次 reconfigure 使 native resume 失效，应用必须按 continuation-strategy 的既定顺序，显式降级到 history-based continuation 或 explicit failure。不得静默保留一个已经失效的 native resume handle。

### 逻辑会话生命周期

产品层 chat session 是逻辑对象，不是进程状态对象。

- 它会一直存在，直到用户删除 chat。
- 它可以持有 `threadId`、`sessionId` 之类的恢复句柄。
- 它不应该因为子进程被回收，就进入 runtime 专属的 `disposed` 状态。

### continuation 与恢复语义

continuation 能力必须建模为结构化 capability，而不能只用一个布尔值概括。

- `supportsInProcessConversationResume`
  - 当前 attachment 仍然存活时，runtime 能在同一条 runtime 会话上继续对话
- `supportsResumeAfterDetach`
  - runtime 在 idle detach 或进程丢失之后，能够拉起一个新的子进程并重新附着回原来的 runtime 会话
- `supportsResumeAfterAppRestart`
  - 桌面应用重启之后，runtime 能依赖持久化的恢复句柄重新恢复回原来的 runtime 会话
- `supportsTurnResume`
  - runtime 能继续一个已中断或部分完成的 in-flight turn，而不只是基于同一会话开始下一轮 follow-up turn

`supportsContinue` 只是 UI 层动作能力，不等价于“支持 detach 后恢复”或“支持重启后恢复”。

runtime 不得声明比其底层 transport 实际能保证的更强恢复语义。尤其是：会话级恢复、turn 级恢复、detach 后恢复、应用重启后恢复，必须被视为彼此独立的能力。

共享 runtime 抽象应按以下顺序选择 continuation strategy：

1. native runtime resume
2. history-based continuation
3. explicit failure

本规范里的 native runtime resume，指的是新拉起的子进程重新附着回 runtime 自己原本已经存在的会话或 thread，并依赖 runtime 自有的恢复句柄，例如 `threadId`、`sessionId`。

本规范里的 history-based continuation，指的是产品层继续把历史消息作为真相源，并基于持久化的 chat history 加上开发者指令、模型选择、工作目录等稳定配置，重建下一次请求。history-based continuation 在 runtime 内部可以新建一个 runtime session；它不等价于 native runtime resume。

当前这轮架构只统一“native resume 还是 history continuation”的选择边界，不统一具体的 history windowing、压缩、摘要或 prompt 重建算法。这些细节暂时仍由各 runtime 自己决定。

持久化的 native-resume 句柄必须包含该 runtime 正确恢复所需的最小充分信息。第一阶段迁移中可以暂时继续兼容 `sessionId: string` 这种形态，但逻辑模型必须允许承载更丰富的 runtime-specific 状态，例如：

- runtime id
- `threadId`、`sessionId` 之类的会话句柄
- 重新附着时需要保持一致的 model 或 channel 标识
- 会影响 runtime 行为的工作目录
- transport 专属的 opaque 恢复元数据
- 当 runtime 支持 turn resume 时，与 pending operation 相关的元数据

当官方 runtime 契约本身不同，native resume 句柄必须分别定义，不能强行抽成一个完全一致的通用结构。

对于 Codex，官方 native resume 契约是 thread-based：

- `threadId` 是必需的 native-resume 标识
  - 官方依据：Codex App Server 通过 `thread/resume` + 已记录的 `thread.id` 恢复会话；Codex SDK 也直接暴露 `resumeThread(threadId)`
- `sessionTreeRootId` 应与 `threadId` 分开持久化
  - 官方依据：`thread.sessionId` 表示当前 live session tree 的根；fork 出来的 thread 会继承根 session id，而不是把自己的 thread id 当成根 id
- 当产品层要求下一轮 continuation 尽量保持行为一致时，应一并持久化 `cwd`
- 如果某些执行默认值是由应用自己而不是 Codex rollout 作为真相源，也应单独持久化
  - 例如：model 选择、approval policy、sandbox policy、personality、额外工作目录 roots
- 如果集成层有意依赖 Codex rollout 对动态工具的持久化，则 `dynamicTools` 可以不必重复作为最小恢复句柄的一部分
  - 官方依据：App Server 会在 `thread/resume` 时恢复已持久化的 `dynamicTools`，前提是客户端没有传入新的替代项

对于 Claude Code 当前兼容 transport 以及未来可能接入的官方程序化 SDK，native resume 契约都围绕 session transcript：

- `sessionId` 是必需的 native-resume 标识
  - 官方依据：SDK 的 `resume` 需要已捕获的 `session_id`
- `cwd` 或等价的稳定 project 标识同样是确定性本地恢复所必需的
  - 官方依据：如果 `cwd` 不匹配 transcript 存储目录，resume 很容易退化成一个全新的 session
- 如果应用覆盖了 Claude 的 config root，那么这个存储根选择也会成为 lookup 边界的一部分
  - 官方依据：transcript 默认位于 `~/.claude/projects/<encoded-cwd>/`，也可能位于 `$CLAUDE_CONFIG_DIR/projects/<encoded-cwd>/`
- 如果要支持跨主机恢复或不依赖本地磁盘恢复，还必须额外持久化足够的信息去定位镜像 transcript store
  - 官方依据：SDK 文档要求通过 `SessionStore` 做共享存储恢复，并在设置 `resume` 时于子进程拉起前调用 `load(...)`
- 如果要保持 subagent transcript continuity，那么外部 session-store 合同还必须保留 subagent transcript 的寻址信息
  - 官方依据：`SessionKey` 包含 `projectKey`、`sessionId` 以及可选的 `subpath`，并且 `listSubkeys` 会在 resume 时被用来发现 subagent transcripts

因此，对本仓库来说，抽象层不应强迫 Codex 和 Claude 共享一个完全相同的 native-resume handle 结构。同时，也应允许产品层附加自己的 continuation context，但不能污染 runtime-native 契约。

更合理的是使用带 runtime 区分、并带分层语义的持久化 resume state，例如：

```ts
type PersistedResumeState =
  | {
      runtimeId: "codex";
      native: {
        threadId: string;
        sessionTreeRootId?: string;
      };
      appContext?: {
        cwd?: string;
        modelId?: string;
        approvalPolicy?: string;
        sandboxPolicy?: unknown;
        personality?: string;
      };
      extensions?: Record<string, unknown>;
    }
  | {
      runtimeId: "claude";
      native: {
        sessionId: string;
        projectKey?: string;
        subpaths?: string[];
      };
      appContext?: {
        cwd: string;
        claudeConfigDir?: string;
        sessionStoreRef?: string;
        modelId?: string;
      };
      extensions?: Record<string, unknown>;
    };
```

在这个结构里：

- `native`
  - 只放官方 native resume 真正必需的 runtime 自有字段
- `appContext`
  - 放产品层为了保持 continuation 行为一致，或为了 history-based continuation 重建请求而持有的字段
- `extensions`
  - 预留给未来 runtime-specific 或 product-specific 的附加字段，避免每次扩展都改动共享顶层契约

具体字段名可以调整，但 Codex 的 thread identity 与 Claude 的 transcript/session identity 必须被显式地区分开，产品层 continuation context 也必须与 runtime-native resume identity 分离。

如果 native resume 在 detach 后恢复或应用重启后恢复时失败，而产品策略和 runtime 集成允许 history-based continuation，那么共享 runtime 层应退回到 history-based continuation。只有当 native resume 和 history-based continuation 都不可用时，应用才应显式报错。它不得在 native resume 明明失败时，却静默宣称 native runtime resume 已成功。

即使某个 runtime 不支持 `supportsResumeAfterDetach` 或 `supportsResumeAfterAppRestart`，它仍然可以通过 history-based continuation 继续多轮对话；但这种 continuation 不得被标记成 native runtime resume，也不得暗示它具备 turn 级别的 in-flight 状态恢复能力。

### History 真相源

虽然这一轮不会把 prompt 重建算法彻底标准化，但仍然必须定义 history-based continuation 的最小持久化真相源。

history-based continuation 的最小真相源应至少包括：

- 按顺序排列、并且对用户可见的 committed chat messages
- 为了稳定重建下一次请求而需要的产品层 continuation context
  - 例如：developer instructions、当前 model、工作目录，以及 `appContext` 中其他由应用持有的字段
- 会实质影响后续推理的结构化结果
  - 例如：已 committed 的 tool result、明确的 approval 决策、明确的 user-input 响应

真相源不得依赖：

- heartbeat 或 probe 流量
- transport keepalive 痕迹
- 从未被提升为稳定 assistant message 或显式 interrupted fragment 的未提交 partial delta
- 尚未被持久化确认的外部副作用

history 重建算法可以暂时保持 runtime-local，但它必须保持消息顺序，不能伪造用户从未看到过的 assistant 输出，也不能把尚未解决的 tool / approval 中间态静默当作已完成历史。

### 持久化与启动恢复

仓库必须明确区分“持久化的逻辑会话状态”和“易失的 attachment 状态”。

interactive session 的持久化结构也必须显式版本化。分层 `PersistedResumeState` 落地之后，仓库不应长期依赖“按字段形状猜格式”的恢复方式。

至少应包含以下持久化元信息：

- 顶层 persistence version
- 逻辑 chat / session 身份
- 可用时的 persisted resume state payload
- 足以识别并迁移 legacy record 的信息

第一阶段把分层 `PersistedResumeState` 引入持久化结构时，必须支持从旧格式迁移。旧格式至少包含扁平的 `sessionId` 加 chat history。这个迁移路径应满足：

- 保留 legacy chats，而不是要求它们在恢复时立即重新附着 runtime
- 只有在 runtime identity 明确时，才把 legacy `sessionId` 映射进 runtime-specific 的 `native` 结构
- 如果 legacy 结构未知或语义含糊，就降级为 history-based continuation，而不是发明一个假的 native resume 契约
- 迁移过程必须是幂等的，使同一条记录可以被安全地重复 load 和 re-save

如果某条持久化记录无法被升级成可信的 native resume handle，应用必须优先退回到 history-based continuation，而不是让整个 chat restore 失败。

以下内容必须被视为可持久化的逻辑会话状态：

- 逻辑 chat 身份以及配置好的 runtime 选择
- 已 committed 的消息历史
- 可用时的 native resume handle
- 为 history-based continuation 服务的产品层 continuation context
- 已完成并会影响后续 continuation 的 approval、user-input、tool-result 持久化结果

以下内容必须被视为易失 attachment 状态，桌面应用重启后不得继续信任：

- 子进程句柄或 pid
- `attachmentGeneration`
- 当前活跃 `turnId`
- 内存中的命令队列内容
- pending interrupt 请求的 bookkeeping
- liveness / probe 状态
- 任何未被官方 native resume 契约持久化确认的 attachment 侧状态

桌面应用重启后，所有 interactive session 都必须以 `detached` 形态启动。即使逻辑 chat session 和持久化的 resume handle 仍然存在，应用也不得假设重启前处于 `running` 或 `interrupted` 的 attachment 在本地仍然存在。

第一阶段应对重启前的 in-flight turn 采用保守归一化策略：

- 清空内存中的 pending assistant-message 指针
- 清空易失的 attachment lease 状态
- 把未完成的 in-flight 工作视为不再 live
- 后续只有在用户再次触发动作时，才按 native resume、history-based continuation 或 explicit retry 去恢复或重试

应用启动时不得仅因为本地存在持久化 chat，就主动拉起 interactive 子进程。resume 仍然必须保持惰性、按执行触发。

### Pending-operation 降级策略

在应用重启、进程 crash、idle detach 这类丢失边界上，pending operation 必须有明确的降级规则。

在第一阶段中，除非某个 runtime 明确声明并且本仓库也实现了更强的 turn resume 语义，否则未完成的 pending operation 应按以下规则处理：

- pending approval request 变为 non-live，后续如果仍然需要，必须重新发起一个新的 approval 流程
- pending user-input request 变为 non-live，后续如果仍然需要，必须显式重新请求
- 没有持久化 tool result 的 pending tool call 必须被视为 unresolved，不能静默当作已完成
- 部分流式输出的 assistant 内容只能：
  - 如果从未成为稳定的用户可见状态，就直接丢弃，或
  - 仅以显式 interrupted fragment 的形式保留，而不能伪装成一个 completed assistant turn

如果未来某个 runtime 真正支持这些状态的 turn-level resume，那么这类更强行为必须受 `supportsTurnResume` 和 runtime-specific tests 保护，不能默认外推到所有 interactive runtime。

### Runtime 附着生命周期

interactive runtime 的进程状态应该建模在 runtime attachment 上，而不是建模在逻辑 chat session 上。

runtime attachment 必须共享同一套生命周期词汇：

- `detached`
- `idle`
- `running`
- `interrupted`

推荐状态迁移规则：

- `detached -> idle`：runtime 子进程被懒启动并附着
- `idle -> running`：开始执行 turn
- `running -> idle`：turn 完成
- `running -> interrupted`：用户中断
- `idle -> detached`：超过 1 小时空闲后回收子进程
- `interrupted -> detached`：超过 1 小时空闲后回收子进程

1 小时空闲超时作用于“已附着但不活跃的子进程”，不作用于逻辑 chat session 本身。`running` 中的 turn 不应被空闲 sweeper 直接回收；如果未来需要处理“长时间无输出但仍在运行”的情况，应单独设计 watchdog 策略。

只有真正有意义的活动才能刷新空闲超时，例如：

- 用户发送 prompt
- 用户点击 continue
- 用户执行 interrupt
- runtime 流式输出 delta
- tool call 或 tool result
- turn completed 或 turn failed
- 结构化 approval / user-input 事件

以下事件不能刷新空闲超时：

- heartbeat 包
- liveness probe
- transport keepalive frame
- health check
- 空结果轮询

空闲回收应采用主进程内的中心化定时 sweep 机制，而不是依赖 heartbeat 驱动的超时续期。定时任务周期固定为 30 分钟。每次 sweep 只根据 `lastMeaningfulActivityAt` 判断是否超过 1 小时空闲，并且只回收当前处于 `idle` 或 `interrupted` 状态的 runtime attachment。处于 `running` 状态的 attachment 必须被空闲 sweeper 跳过。

进程存活性判断仍应主要依赖子进程 `exit`、`error`、`close` 事件以及发送前校验。周期性 sweep 只负责空闲回收，不负责证明进程仍然存活。

状态迁移必须由 runtime attachment 自身行为驱动，而不是在 `AgentHub` 中按 runtime 身份写特判。

### 事件模型

应用层仍应把各 runtime 输出归一化为共享 `AgentEvent` 风格的事件。除非 UI 真正需要，否则 runtime-specific 的原始协议细节不应泄漏到上层。

第一阶段迁移可以继续保留当前的 `session` 事件和 `sessionId: string`，先保证兼容性。只有当未来某个 runtime 需要比字符串更复杂的恢复句柄时，再单独推进更丰富的 session reference 结构。

## Runtime 映射

### Codex

Codex chat 必须迁移为 `interactive`。

- 一个 Codex chat session 应该持有一个逻辑恢复句柄，并且任一时刻最多只附着一个 `CodexRpcClient` 进程
- 打开或恢复 Codex chat 时，不得提前拉起 `CodexRpcClient`
- 第一次发送 prompt 或 continue 时，才懒启动进程并创建或恢复 thread
- 后续消息必须复用同一个 client 进程和 thread id，而不是每轮重启 app-server
- interrupt 优先走协议级 turn interrupt；进程 shutdown 只是 fallback
- 如果附着进程超过 1 小时无活动，应用应关闭该进程，并把 runtime attachment 切回 `detached`，但保留 thread id
- 下一次发送 prompt 时，应重新拉起进程并恢复同一个 thread

Codex 的 task、workflow、runtime test 在第一阶段继续保持 `oneshot`。

### Claude

Claude chat 继续保持 `interactive`，但后端选型要调整。

- 逻辑 chat-session 抽象继续保留
- 当前默认后端是基于官方包拉起的 `stream-json` 兼容 session
- `CLAUDE_INTERACTIVE_TRANSPORT=runner` 可以作为更保守的兼容 transport 留在同一 session 接口后面
- `sdk` 仅保留为未来官方程序化 transport 的占位选择；在当前包表面下显式请求它应失败并提示未实现
- 只要 `stream-json` 或未来官方程序化 SDK 路径能满足生命周期与事件要求，PTY 就不能作为默认架构
- 打开或恢复 Claude chat 时，不得提前拉起子进程
- 第一次发送 prompt 或 continue 时，才懒附着子进程
- 如果附着进程超过 1 小时无活动，应用应关闭该进程，但逻辑 chat session 仍然保持可恢复

Claude 的 task、workflow、runtime test 在第一阶段继续保持 `oneshot`。

### API

API runtime 保持原样：

- chat 是 `oneshot`
- task 是 `oneshot`
- workflow 是 `oneshot`
- runtime test 是 `oneshot`

它不需要 interactive session 实现。

### Hermes 以及未来本地 runtime

未来像 Hermes 这样的 runtime，接入方式应当是新增：

- 已落地补充（2026-07-06）：
- Hermes 现在已经有一个最小 one-shot proof runtime。
- `RuntimeDriver` 现在还拥有 workflow 调用、runtime-channel 测试和 session-artifact cleanup hooks。
- 新增 runtime 时，这三类路径不再需要在 `AgentHub` 里扩产品层分支。

- runtime driver
- capability 定义
- one-shot runner 和/或 interactive session
- 协议 transport helper

而不是去 `AgentHub` 里增加新的 runtime-specific 分支。

## 默认实现落点

这一节是给全新实现 agent 的默认落点地图。某个文件如果已经存在，就在原位演进；如果不存在，就在不破坏本规范既定归属边界的前提下创建最接近的等价模块。

### 保留或重建

- `src/main/agent-hub.ts` 作为编排与状态中心
- `src/main/agents/` 作为 runtime-specific helper 容器
- 一条共享的 main-process runtime dispatch boundary
  - 这条边界可以重新落回 `src/main/runtime-adapter.ts`
  - 也可以在新的等价文件名下重建
  - 这里的架构硬要求是“共享分发边界本身”，而不是历史文件名

### 新增或演进

- `src/main/agents/runtime-driver.ts`
- `src/main/agents/runtime-capabilities.ts`
- `src/main/agents/interactive-session-manager.ts`
- `src/main/agents/process-lease.ts`
- `src/main/agents/codex-interactive-session.ts`
- `src/main/agents/claude-interactive-session.ts`
- `src/main/agents/claude-stream-json-interactive-transport.ts`
- `src/main/agents/claude-runner-interactive-transport.ts`

后续如果要迁到 `runtimes/` 子目录也可以，但不是第一阶段必须动作。

## 面向全新 agent 的实施顺序

### Step 1：执行风格抽象与 capability 清理

- 引入共享 capability 契约
- 把 `AgentHub` 里的 Claude-only interactive 判断改成 capability 驱动
- 引入共享 interactive-session manager，把逻辑 session 和 runtime attachment 分开管理
- 尽量保持当前事件与持久化结构稳定

验收标准：

- `AgentHub` 不再靠硬编码 Claude 身份判断 continue / interrupt 行为
- interactive UI affordance 由 runtime session capability 和 snapshot 决定
- 恢复或查看 chat 时，不会提前拉起 interactive 子进程

### Step 2：Codex interactive chat session

- 新增 `CodexInteractiveSession`
- 一个 chat 保留一个长期 `CodexRpcClient`
- 复用同一个 thread id 和进程处理 follow-up prompt

验收标准：

- 打开或恢复 Codex chat 时，不会自动拉起 app-server 进程
- 同一个 Codex chat 发第二条消息时，不会再拉起第二个 app-server 进程
- stop / continue 语义与共享 interactive session 行为对齐
- 空闲超过 1 小时的 Codex 附着进程会被 detach，下一次发送 prompt 时能在新进程上恢复同一个 thread

### Step 3：Claude interactive 后端收敛

- 保留当前 Claude interactive session 边界
- 保留基于官方包拉起的 `stream-json` 兼容 transport 作为当前默认后端
- `runner` 只作为更保守的兼容回退后端存在
- `sdk` 仅保留为未来官方程序化 transport 的占位选择；在当前包表面下显式请求它应失败并提示未实现
- PTY 只保留为实验性、显式 opt-in 路径

验收标准：

- Claude interactive transport 可以替换，而不需要改 `AgentHub` 或共享 runtime adapter 契约
- approval / user-input 事件会归一化为共享事件，并在 stop、detach 或重启后把未完成请求降级为 non-live
- 空闲超过 1 小时的 Claude 附着进程会被 detach，但逻辑 chat session 仍然保持可恢复

### Step 4：未来 runtime 接入路径验证

- 用文档或实现证明 Hermes 这类 runtime 的接入路径成立
- 只增加 runtime 本地代码和共享测试

验收标准：

- 新增 runtime 不需要在 `AgentHub` 中扩大产品层分支

## 拒绝的方案

- 把所有 runtime 统一成 RPC
  - 拒绝原因：并非所有 runtime 都有稳定公开的原生 RPC 契约
- 把所有 runtime 统一成 PTY
  - 拒绝原因：终端模拟过于脆弱，不适合作为主抽象
- 继续把 runtime-specific 编排逻辑放在 `AgentHub`
  - 拒绝原因：每新增一个 runtime，分支复杂度都会继续上涨

## 完成定义与验证计划

实现 agent 在满足下面的架构结果和验证项之前，不应宣布本规范已经完成。

实现本规范时，建议的聚焦验证包括：

- `npm run typecheck`
- 共享 dispatch boundary 的测试，加上 `src/main/agent-hub.test.ts`
  - 如果后续重新使用 `src/main/runtime-adapter.ts` 这个文件名，可以继续是 `src/main/runtime-adapter.test.ts`
  - 如果共享边界在别的文件名下重建，则应使用对应的等价替代测试
- runtime-specific 测试，例如：
  - `src/main/agents/codex-interactive-session.test.ts`
  - `src/main/agents/codex-rpc.test.ts`
  - `src/main/agents/claude-interactive-session.test.ts`
  - `src/main/agents/claude-interactive-transport-*.test.ts`

最关键的回归证明点是 runtime reuse：

- 恢复或查看 interactive chat 时，不会提前拉起子进程
- interactive chat 的第一次 prompt 会懒启动子进程
- Codex interactive chat 的 follow-up prompt 复用同一个 client 进程
- Claude interactive chat 的 follow-up prompt 复用同一个 session 抽象
- 空闲超过 1 小时的 interactive 附着进程会被 detach，并能在下一次 prompt 时重新拉起
- 仅用于探活的流量不会阻止 idle-timeout detach
- 支持 native resume 的 runtime，会优先使用 native resume，而不是无意义地退回 history 重建
- 不支持 native resume 的 runtime，会退回到 history-based continuation，而不是假装自己恢复了原生 runtime session
- 当 native resume 失败时，会按文档定义的 continuation-strategy 顺序退回到 history-based continuation 或 explicit failure
- 重复 prompt 投递不会为同一个 chat 创建两个 attachment，也不会同时留下两个活跃 turn
- 过期 attachment generation 的迟到事件会被丢弃，不能污染当前 chat 状态
- interrupt 只影响目标活跃 turn，不会错误污染更新的 turn 或更新的 attachment
- idle sweep 在入队后如果发现 attachment 已被替换或重新激活，不会错误执行 detach
- reconfigure 会立即应用 hot-safe fields，暂存 attach-boundary fields，并在 session identity 变化时清理失效的 native handle
- 应用重启后，所有 interactive attachment 都会被归一化为 `detached`，不会继续信任重启前的 in-flight attachment 状态
- history-based continuation 会依赖稳定的持久化真相源，不会把未解决的 approval 或 tool 中间态伪装成已完成历史
- API 保持原样，继续无状态

## 开放问题

- Codex chat session 中，协议级 interrupt 的精确定义是什么，何时优先于进程 shutdown？
- 当未来 runtime 需要比字符串更复杂的恢复句柄时，是否单独推进 `sessionId` 到 richer session reference 的升级？

## 成功标准

当满足以下条件时，本规范可视为落地成功：

- 产品架构只暴露 `oneshot` 和 `interactive`
- Codex 与 Claude chat 都通过共享 interactive session 概念运行
- API 继续保持 one-shot，不承担额外迁移负担
- 新增 Hermes 或其他 runtime 时，只需要新增 driver 和 helper tests，而不是新增产品层编排分支
