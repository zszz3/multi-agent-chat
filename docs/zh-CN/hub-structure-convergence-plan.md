# Hub 目录分层与后续收敛方案

## 1. 背景

当前仓库的顶层结构已经比较清晰：

- `src/main`：主进程、本地后端、状态与编排
- `src/preload`：安全桥接
- `src/renderer`：前端界面
- `src/shared`：共享类型与纯逻辑
- `src/mcp`：独立 MCP Server

本轮收敛的重点不再是仓库顶层，而是 `src/main/hub` 这一层的进一步稳定化。`hub` 既是主进程业务状态中心，又是 chat/task/team/workflow/schedule 的编排入口，因此最容易重新膨胀成“大总线文件”。

## 2. 当前现状

### 2.1 `src/main` 目录现状

当前 `src/main` 已经基本按职责分层：

- `agents/`：runtime-specific SDK、session、driver 相关基础设施
- `app/`：应用级入口和主进程服务
- `bridges/`：桥接层
- `channels/`：模型通道与 provider 配置
- `hub/`：业务状态中心与领域编排
- `platform/`：平台相关适配
- `skills/`：技能管理
- `workflows/`：workflow runtime

这个层级总体是合理的，后续不建议再大幅重排 `src/main` 顶层。

### 2.2 `src/main/hub` 目录现状

`hub` 目前已经拆成以下子域：

- `api/`：API runtime 相关 hub 侧逻辑
- `chat/`：chat prompt、event、interactive、slash/chat-dispatch 相关逻辑
- `codex/`：Codex app-server / slash / Codex 专属辅助逻辑
- `persisted/`：持久化 payload、restore、store
- `runtime/`
  - `executor/`：runtime executor、workflow executor、cleanup、driver factory
  - `run/`：run policy、runner、task-run
  - `testing/`：runtime test、agent test、CLI test helper
- `state/`：state model、snapshot、restore、artifact/file-root helper
- `team/`：team run、team workflow
- `workflow/`：workflow draft、reply lifecycle、execution、clone、restore、scheduled store

这说明目录层级本身已经从“单层堆文件”进化到了“按领域 + 子职责”组织，方向是对的。

## 3. 已经成型的分层原则

从当前代码可以总结出几条已经被验证有效的原则：

### 3.1 `AgentHub` 只做状态容器和跨子域编排

`agent-hub.ts` 不应继续承载以下内容：

- 具体 runtime SDK 调用细节
- 具体 workflow draft reply 状态机细节
- schedule / artifact / task-start 的细枝末节归一化

这些内容已经开始下沉到 `chat/`、`workflow/`、`state/`、`runtime/run/`、`runtime/executor/` 里的 focused helper，后续应继续坚持。

### 3.2 子目录内部优先按“同职责”拆分，而不是按代码形态拆分

过去几轮已经证明，安全的拆分方式不是“把每个方法都抽成 helper”，而是按连续职责来拆，例如：

- task dispatch 生命周期
- chat prompt dispatch 生命周期
- workflow draft reply 生命周期
- scheduled workflow store 状态变更
- artifact / workflow output 访问面

后续仍然应遵守这条规则，避免产生大量只有一处调用、但语义不独立的薄包装文件。

### 3.3 runtime 扩展点应收敛到 runtime-specific 模块

当前 runtime 已经不是简单的 `if runtimeId === "..."` 结构，而是：

- `RuntimeRouter`
- `RuntimeDriverRegistry`
- runtime-specific executor / workflow executor / interactive session

这条路是正确的。后续如果还要接入 `hermes`、`openclaw` 等 runtime，应继续把 concrete knowledge 下沉到 runtime 自己的 builder / executor / workflow 模块里，而不是回流到 `AgentHub` 或主装配文件。

## 4. 当前主要压力点

### 4.1 `src/main/hub/agent-hub.ts` 仍然偏大

虽然已经持续下降，但它仍然是 `hub` 中最大的业务文件。当前剩余内容主要包括：

- 状态容器本身
- 各类 public command 入口
- workflow/team/task/chat 的跨域编排
- runtime policy 选择
- 持久化恢复装配

这说明它已经不再是“明显混乱”，而是进入了“还可以再收，但必须非常克制”的阶段。

### 4.2 `runtime/executor/agent-executor.ts` 仍然承担 registry 装配

目前 runtime-specific workflow executor 已经拆到独立文件，下一步的重点不是再抽象一层，而是把主装配文件继续收窄成：

- driver registry 组装
- runtime builder 注册

而不是继续保存太多 runtime-specific 构造细节。

### 4.3 `persisted/` 与 `state/` 的边界仍然有继续澄清空间

当前边界大致如下：

- `state/`：运行态结构、snapshot、应用内恢复辅助
- `persisted/`：序列化、反序列化、持久化存储

这个方向是对的，但后续仍要注意：

- 不要把“运行态归一化逻辑”重新塞回 `persisted/`
- 不要把“纯持久化协议解析”扩散到 `AgentHub`

## 5. 建议的目标结构

建议以后把 `src/main/hub` 稳定在下面这个形态：

```text
src/main/hub/
  agent-hub.ts                 # 只保留状态容器 + 跨域编排入口

  api/                         # hub 侧 API runtime 相关逻辑
  chat/                        # chat prompt / event / interactive / slash / dispatch
  codex/                       # Codex app-server / slash / Codex-specific helper

  state/                       # 运行态模型、snapshot、非持久化访问面
    agent-hub-state.ts
    agent-hub-snapshot.ts
    agent-hub-restore.ts
    agent-hub-artifacts.ts

  persisted/                   # 持久化协议、restore、store、sqlite
    agent-hub-persistence.ts
    agent-hub-persisted-*.ts
    agent-hub-state-restore.ts
    agent-hub-team-state-restore.ts
    sqlite-store.ts

  runtime/
    executor/                  # runtime driver / executor / workflow executor / cleanup
    run/                       # run policy / runner / task-run
    testing/                   # runtime/agent testing helper

  team/                        # team state transition / prompt composition / workflow join
  workflow/                    # workflow draft / reply lifecycle / execution / store / clone / restore
```

这个结构的关键点不是目录名字，而是职责边界：

- `agent-hub.ts` 不再保存“具体实现细节”
- `runtime/` 不再承载上层业务状态
- `workflow/` 内部自成闭环，尽量减少和 chat/task 的交叉 helper
- `persisted/` 只对持久化协议负责，不做业务编排

## 6. 后续收敛顺序建议

建议继续按下面顺序收敛，而不是同时到处动：

### Phase 1：继续收窄 runtime 主装配文件

目标：

- 让 `runtime/executor/agent-executor.ts` 只保留 registry 装配
- 把 Codex / Claude / API / Hermes 的 one-shot executor 也尽量下沉到各自模块
- 如果后续要接 `openclaw`，优先做 `createOpenclawDriver()` 风格扩展，而不是向中央文件继续加分支

### Phase 2：继续收窄 `agent-hub.ts`

目标：

- 优先寻找“连续职责块”，而不是继续做零散 helper
- 可候选块：
  - runtime execution policy / interactive context
  - workflow run 入口编排
  - team run 入口编排

约束：

- 只有在一整段代码本来就在表达同一个职责时才拆
- 不为了把行数压下去而制造薄层转发

### Phase 3：稳定 `persisted/` 与 `state/` 边界

目标：

- 将 team/chat/task 的 restore helper 继续按运行态与持久化协议分清
- 避免 `AgentHub` 持续增长为 restore 装配中心

### Phase 4：形成 runtime plugin-style 注册入口

如果未来确认会继续加 runtime，建议把当前 registry 装配进一步演化为：

```text
runtime/executor/
  codex/create-codex-driver.ts
  claude/create-claude-driver.ts
  api/create-api-driver.ts
  hermes/create-hermes-driver.ts
  openclaw/create-openclaw-driver.ts
  agent-executor.ts            # 只负责聚合注册
```

这样未来新增 runtime 的改动面会更小，也更容易做单 runtime 测试。

## 7. 不建议做的事

后续收敛中，建议明确避免下面几类操作：

- 为了降行数把连续逻辑拆成大量只调用一次的 helper
- 把具体 runtime 的 SDK 细节重新带回 `AgentHub`
- 在 `persisted/` 里混入太多运行态业务决策
- 在 `state/` 里反向塞入存储协议兼容逻辑
- 让一个目录同时按“领域”和“技术形态”混合命名，造成边界摇摆

## 8. 建议的验收标准

后续判断“结构是否收敛到位”时，可以用以下标准：

- 新增一个 runtime 时，主装配文件改动应尽量控制在注册入口附近
- 新增一个 workflow draft reply 规则时，不应需要改 `AgentHub` 大段逻辑
- 新增一个 schedule store 规则时，不应需要进入 chat / runtime 目录
- 读取目录名时，能大致判断文件是在解决“哪一类职责”
- `AgentHub` 保持“状态容器 + 编排器”定位，而不是重新长成超级实现文件

## 9. 结论

当前目录层级已经从“单目录堆文件”进入了“按领域分层”的正确轨道，后续重点不在大搬家，而在继续收紧边界：

- runtime 继续向 runtime-specific 模块下沉
- workflow 继续保持子域内聚
- persisted 与 state 继续去耦
- `AgentHub` 只保留状态容器和跨域编排

如果后续目标是支持更多 runtime，例如 `hermes`、`openclaw` 等，那么最值得优先投资的不是再加一层抽象，而是把主装配入口收窄为“注册表”，让每个 runtime 自己对自己的具体实现负责。
