# 主进程开发文档

## 作用范围

`src/main/` 是整个 Electron 应用的本地后端，负责生命周期、状态、执行、持久化和业务编排。

只要你的改动影响了：

- 聊天真实执行行为
- 任务运行逻辑
- Workflow 状态流转
- Agent 配置保存与测试
- 调度、持久化、bridge、技能安装

那么真正的实现大概率都在这一层，而不是 renderer。

## 核心文件

- `index.ts`：Electron 启动、窗口创建、IPC 注册、本地服务启动
- `agent-hub.ts`：应用状态中心和主要业务编排层
- `agent-executor.ts`：薄 runtime driver registry 和 one-shot 执行桥
- `agents/runtime-driver.ts`：共享 runtime capability 与 interactive session 契约
- `agents/interactive-session-manager.ts`：interactive runtime 的按 chat 排队和 idle-detach 编排
- `agents/codex-interactive-session.ts`：可复用的 Codex chat attachment
- `agents/claude-interactive-session.ts`：可复用的 Claude chat attachment
- `runtime-command-completions.ts`：应用命令、runtime 元数据和 learned native history 的 slash completion provider
- `runtime-command-store.ts`：runtime 命令覆盖与 learned native command 持久化
- `model-config.ts`：channel 归一化、配置导入导出、Codex 配置生成
- `provider-balance.ts`：provider 余额查询
- `scheduled-workflow-cloud.ts`：调度工作流的云端同步逻辑
- `skill-installer.ts`：技能导入、安装、卸载
- `sqlite-store.ts`：SQLite 持久化封装
- `mcp-bridge.ts`：本地 bridge，供 MCP server 调用
- `codex-chat-router.ts`：Codex Chat 路由服务

## 这一层的核心设计

可以把 `src/main` 理解成一个“桌面应用里的本地服务端”。

典型处理链路是：

1. `index.ts` 注册 IPC。
2. renderer 发起请求。
3. IPC handler 调用 `AgentHub`。
4. `AgentHub` 修改状态或触发执行。
5. 状态变化后发出新的 snapshot。
6. `index.ts` 再把 snapshot 推回 renderer。

所以这层的关键设计不是页面，而是：

- 状态真源集中
- 长任务执行集中
- 配置和持久化集中

## `AgentHub` 的地位

`src/main/agent-hub.ts` 是这个仓库最关键的文件之一。

它负责：

- 加载持久化状态
- 管理 configured agents 和 channels
- 创建、切换、删除 chat
- 发送 prompt，收集事件流，写回 chat session
- 在应用重启后把 interactive chat 恢复成 `detached` 的安全状态
- 统一协调 interactive session 的 idle sweep 与恢复路径
- 解析 chat slash completion 分组并提供 main-owned native metadata
- 对 chat-only 的 native slash turn 记录 learned success / eviction
- 创建、运行、停止 task
- 创建和运行 team / team run
- 管理 workflow store、workflow draft 和 workflow run
- 管理 scheduled workflow 状态

很多“看起来像前端功能”的问题，真正的逻辑都在 `AgentHub`。

如果你要查一个功能改动真正落在哪里，优先看这里。

## Slash Completion 边界

slash completion 查询故意放在主进程：

- renderer 只负责请求和渲染分组
- `AgentHub` 决定有哪些 completion group
- `/app` 命令来自共享应用命令定义
- runtime-native metadata 由 runtime-aware provider 提供，例如 Codex model / plugin / imported skill
- learned native suggestion 来自主进程持久化的成功历史，并按 runtime id + CLI fingerprint 分区

不要试图仅靠 `AppSnapshot` 在 renderer 里重建这套逻辑。runtime 指纹、导入 skill 清单和当前 Codex 元数据本来就是 main 才有的上下文。

native slash outcome tracking 也只属于 chat：

- 只有 chat 的 runtime slash turn 会创建 pending bookkeeping
- success、显式 error、start failure、stop/interruption、Claude exit-only failure 都会结束这段 bookkeeping
- task / workflow 不复用这套 native slash 学习状态
- 只有明确 invalid-command 证据才会逐出 learned history；其余失败保持 transport / runtime failure 的保守分类

## 执行层

执行层现在明确分成两种风格：

- `oneshot`：每次 task、workflow 或 stateless API 调用各起一次执行
- `interactive`：每个逻辑 chat 背后维护一个可惰性附着的 runtime session

选择边界仍然从 `RuntimeAgentExecutorFactory` 进入，但真正的 runtime 分发已经下沉到 driver registry。

当前后端形态是：

- Codex：one-shot 和 interactive 都复用 `CodexRpcClient`，chat 复用由 `CodexInteractiveSession` 管理
- Claude：one-shot 和 interactive 都复用 `ClaudeRunner`，chat 复用由 `ClaudeInteractiveSession` 管理
- API：继续保持纯 HTTP one-shot

`AgentHub` 仍然拥有 snapshot、持久化和恢复语义，但 interactive 进程的生命周期已经收敛到 `InteractiveSessionManager` 和 `src/main/agents/` 下的 runtime-specific session helper。

开发时要尽量保持这个边界：

- runtime 差异留在 driver / session / transport 层
- 上层功能只关心 prompt、model、channel、事件流和逻辑 session

不要把 provider 或 runtime-specific 特殊逻辑散落到 task、workflow、chat 的高层逻辑里。

## IPC 设计

所有 renderer 可调用的命令都在 `src/main/index.ts` 里通过 `ipcMain.handle(...)` 注册。

当前主要按业务域分组，例如：

- `chat:*`
- `task:*`
- `team:*`
- `workflow:*`
- `scheduled-workflows:*`
- `skills:*`
- `model-channels:*`

新增一个前端调用能力时，建议顺序是：

1. 先在 `src/shared/types.ts` 定义或补齐请求返回类型
2. 在 `src/main/index.ts` 注册 IPC
3. 在 `AgentHub` 或其他 main 模块里实现真实逻辑
4. 在 `src/preload/index.ts` 暴露给 renderer

设计原则是：

- `index.ts` 保持薄
- 业务逻辑放到 `AgentHub` 或专门模块

## 持久化设计

这一层负责所有应用核心数据的落盘与恢复。

关键入口：

- `hub.loadModelChannels(...)`
- `hub.loadPersistedState(...)`
- `runtimeCommandStatePathFor(...)`
- `SqliteAppStore`

当前持久化特点：

- 偏 snapshot 驱动
- 不是重 SQL 建模
- 更重视整体状态恢复和桌面应用可运行性

所以修改持久化相关结构时，重点不是写复杂 migration，而是：

- 保持旧数据兼容
- 保持可选字段容错
- 确保序列化后的快照还能被恢复

runtime command 的持久化与主 snapshot 分开。`<storage-path>.runtime-commands.json` 负责保存：

- runtime 命令 override
- learned native slash command history

其中 learned history 按 runtime id 和 CLI fingerprint 分区，避免旧建议跨本地安装误用。

## Scheduled Workflow

调度工作流是这层里比较偏“运维型”的模块，涉及：

- runner 注册
- schedule 云端同步
- 事件连接
- 状态更新
- 向 renderer 推送事件

这类代码改动时，优先考虑：

- 状态是否会乱
- 断连是否能恢复
- 错误是否可见
- snapshot 是否还能一致

不要只看 happy path。

## Skills 与本地文件操作

skills 的导入、安装、卸载都在 main 层处理，因为这些行为会直接碰文件系统。

renderer 只负责展示和触发，不应该自己处理：

- 目录复制
- 软链接
- managed skill 存储

这类改动优先看 `src/main/skill-installer.ts`。

## 测试重点

这一层的关键测试大多已经与源码放在一起，例如：

- `agent-hub.test.ts`
- `runtime-command-store.test.ts`
- `runtime-command-completions.test.ts`
- `mcp-bridge.test.ts`
- `model-config.test.ts`
- `provider-balance.test.ts`
- `scheduled-workflow-cloud.test.ts`
- `src/main/agents/` 下的 runtime 测试

如果你改的是主流程行为，优先补或改这些测试，而不是只看 UI 层是否能点通。

## 开发建议

- 把 `AgentHub` 当成状态真源
- 让 IPC handler 保持浅
- provider 或 runtime 差异收敛到执行层
- 跨层契约统一收敛到 `src/shared`
- 不要把本该在 main 的业务逻辑挪到 renderer
