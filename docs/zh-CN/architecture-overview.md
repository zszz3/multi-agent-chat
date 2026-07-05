# Multi Agent Chat 整体架构说明

## 1. 项目定位

`Multi Agent Chat` 是一个本地 Electron 桌面应用，目标不是只做一个聊天窗口，而是把多种 Agent 使用方式统一到一个桌面工作台中：

- 直接调用本地 CLI，例如 Codex、Claude Code
- 接入 OpenAI-compatible / Anthropic-compatible 的 API Agent
- 复用配置好的 Agent
- 任务执行与跟踪
- Workflow 编排与运行
- 通过 MCP 对外暴露能力

这个项目的核心不是“前端页面”，而是“桌面端本地编排平台”。真正的重心在状态管理、Agent 执行、Workflow 运行、配置管理，以及把这些能力稳定地暴露给 UI 和 MCP。

## 2. 顶层目录结构

仓库的核心源码都在 `src/` 下，按职责分成五层：

```text
src/
  main/      Electron 主进程、持久化、编排、IPC
  preload/   renderer 到主进程的安全桥接层
  renderer/  React 前端界面
  shared/    跨层共享的类型、预设、图结构与技能元数据
  mcp/       独立 MCP Server，连接正在运行的桌面应用
```

构建入口在 `electron.vite.config.ts`：

- `main` 构建到 `out/main`
- `preload` 构建到 `out/preload`
- `renderer` 从 `src/renderer` 构建到 `out/renderer`
- `src/shared/bundled-skills` 会被复制到 `out/shared/bundled-skills`

## 3. 运行时结构

应用启动链路如下：

1. Electron 从 `src/main/index.ts` 启动主进程。
2. 主进程创建 `AgentHub`，加载持久化状态。
3. 主进程注册 IPC，并创建主窗口。
4. `src/preload/index.ts` 通过 `contextBridge` 暴露 `window.multiAgentChat`。
5. `src/renderer/src/main.tsx` 挂载 React 应用。
6. `src/renderer/src/App.tsx` 拉取初始快照并渲染页面。
7. 用户在 UI 上操作后，renderer 调用 preload API，preload 转发到 IPC。
8. 主进程修改 `AgentHub` 状态，并把最新 snapshot 推回 renderer。

可以把它理解成一个“桌面端前后端分层”：

```text
Renderer 触发操作
  -> preload API
  -> ipcRenderer.invoke
  -> ipcMain.handle
  -> AgentHub 修改状态 / 执行任务
  -> 生成新 snapshot
  -> mainWindow.webContents.send("snapshot:changed")
  -> renderer 更新界面
```

Chat 的 slash completion 查询也走同一条 main-owned 边界：renderer 通过 IPC 请求补全分组，`AgentHub` 再基于应用命令、runtime 元数据和 learned native history 返回结果。这个查询没有继续塞进 `AppSnapshot`，因为它依赖 runtime 指纹、导入 skill 清单和运行时元数据。

这个项目的 renderer 不是业务状态真源，真正的状态中心在主进程。

## 4. 各层职责概览

### `src/main`

这一层是桌面应用的“本地后端”，负责：

- Electron 生命周期
- BrowserWindow 创建
- 配置与状态持久化
- Agent 执行
- Chat / Task / Team / Workflow 编排
- Scheduled Workflow 云端同步
- 本地 MCP bridge
- 技能安装与导入

关键文件：

- `src/main/index.ts`：主进程启动、窗口创建、IPC 注册、本地服务启动
- `src/main/agent-hub.ts`：应用状态中心和主要业务编排层
- `src/main/agent-executor.ts`：薄 runtime driver registry 和 one-shot 执行桥
- `src/main/agents/runtime-driver.ts`：共享 runtime capability 与 interactive session 契约
- `src/main/agents/interactive-session-manager.ts`：按 chat 串行执行的 interactive 队列与中心化 idle-detach sweep
- `src/main/agents/codex-interactive-session.ts`：Codex chat 的长期附着边界
- `src/main/agents/claude-interactive-session.ts`：Claude chat 的共享 session 边界
- `src/main/sqlite-store.ts`：SQLite 持久化封装

### `src/preload`

这一层是 renderer 和主进程之间的安全边界。它负责把可调用能力暴露给前端，同时隐藏 Electron IPC 细节。

### `src/renderer`

这一层是 React 应用，负责：

- 应用主壳层
- 页面导航
- 页面交互
- 将 snapshot 映射成 UI

### `src/shared`

这一层提供跨层共享的定义和纯逻辑，主要包括：

- 类型定义
- provider / model 预设
- workflow graph 校验与解析
- skills 元数据与模板加载

### `src/mcp`

这一层是独立启动的 MCP Server，它不直接依赖 renderer，而是通过主进程提供的本地 bridge 与桌面应用通信。

## 5. 状态模型

整个应用的中心状态是 `AppSnapshot`，定义在 `src/shared/types.ts` 中，由 `AgentHub` 统一生成和维护。

其中包含的主要状态域有：

- configured agents
- channels
- chats
- tasks
- teams
- workflow store / workflow draft
- scheduled workflow store
- runtime 可用性
- 当前 workDir

renderer 基本上把这个 snapshot 当成“唯一业务状态源”。这也是为什么很多改动需要同时动 `shared types`、`main` 和 `renderer`。

但也有少量状态故意不进入 `AppSnapshot`。例如 chat-native slash turn 的 pending bookkeeping 只用于主进程在一次 CLI turn 完成后记录成功或逐出 learned suggestion，不会持久化到 renderer snapshot，也不会泄露到 task / workflow 运行态。

## 6. 持久化方式

当前持久化设计比较务实，重点不是复杂数据库建模，而是稳定存储应用快照和运行产物：

- `app.db`：应用主状态
- `app-chats.json`：聊天历史
- `app.db.runtime-commands.json`：runtime 命令覆盖和按 runtime 指纹分区的 learned native slash history
- `model-channels.json`：模型通道与 provider 配置
- `.multi-agent-chat/workflows/...`：工作流运行上下文与产物

`src/main/sqlite-store.ts` 使用 `node:sqlite`，底层是一个很简单的 `app_state` 表，把序列化后的 payload 存进去。

这说明当前架构更偏向：

- 用 TypeScript 类型建模领域对象
- 用主进程统一维护状态
- 用 SQLite 作为可靠落盘层

而不是把所有业务拆成大量 SQL 表去查询。

## 7. Agent 执行模型

当前支持三类 Runtime：

- `codex`
- `claude`
- `api`

统一入口在 `src/main/agent-executor.ts`，但它现在更接近“按 runtime 分发的薄注册表”，而不是一层同时承担所有会话生命周期的重逻辑。

主进程里的执行风格已经明确分成两类：

- `oneshot`：一次请求对应一次执行，主要用于 task、workflow 和 stateless API 调用
- `interactive`：一个逻辑 chat 对应一个可惰性附着的 runtime session

三个 runtime 后端分别是：

- Codex：通过 `CodexRpcClient` 走 RPC 风格交互，chat 复用由 `CodexInteractiveSession` 管理
- Claude：通过 `ClaudeRunner` 包装 CLI 子进程，chat 复用由 `ClaudeInteractiveSession` 管理
- API：直接 `fetch` 到兼容接口，保持 stateless one-shot

`AgentHub` 仍然是状态真源，但逻辑 chat identity、resume metadata 和恢复归一化在 `AgentHub`，interactive 进程的附着、串行执行、空闲回收则由 `InteractiveSessionManager` 与 runtime-specific session helper 负责。

native slash completion / learning 也沿用这条主进程边界：

- `/app ...` 仍然只属于应用本地命名空间，不会被当成 native command 学习
- learned native command 只从本地 CLI chat 的成功 turn 里记录
- learned history 按 runtime id + CLI fingerprint 分区，避免跨安装串味
- 只有 runtime-specific 的明确 invalid-command 证据才会逐出 learned entry；网络、传输、generic exit 和含糊错误不会误删历史

## 8. 前端组织方式

当前 renderer 结构是：

```text
src/renderer/src/
  app/
  pages/
  ui/
  App.tsx
  main.tsx
  styles.css
```

主要页面模块有：

- `pages/chat`
- `pages/config`
- `pages/runtime`
- `pages/skills`
- `pages/tasks`
- `pages/teams`
- `pages/workflow`
- `pages/schedules`
- `pages/settings`

当前 renderer 的真实情况是：

- 已经开始做按功能拆页
- 但 `App.tsx` 仍然是最大的集成入口

所以从开发视角看，这个项目处于“从大壳文件逐步过渡到 feature page 结构”的阶段。

## 9. MCP 集成方式

MCP 不是直接连 renderer，而是通过本地 bridge 复用桌面应用能力：

1. 桌面应用启动后，主进程提供 bridge 服务。
2. `npm run mcp` 启动 `src/mcp/server.ts`。
3. MCP Server 读取 discovery 文件，获得 bridge 地址和 token。
4. MCP tool 调用被转成 HTTP 请求发给本地 bridge。

这个设计让 MCP 成为“后端能力适配层”，而不是 UI 的一部分。

## 10. 常见改动路径

### 新增一个前端功能

通常会涉及：

- `src/shared/types.ts`
- `src/main/agent-hub.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/renderer/src/pages/...`
- `src/renderer/src/App.tsx`

### 新增一个 Provider 预设

通常会涉及：

- `src/shared/provider-presets.ts`
- `src/shared/models.ts`
- `src/main/model-config.ts`
- runtime 对应的 env/helper 文件
- renderer 的配置页面

### 改 Workflow 行为

通常会涉及：

- `src/shared/types.ts`
- `src/shared/workflow-graph.ts`
- `src/shared/workflow-agent.ts`
- `src/main/agent-hub.ts`
- `src/renderer/src/pages/workflow/*`

### 新增 MCP Tool

通常会涉及：

- 主进程 bridge
- `src/mcp/server.ts`
- 必要时补共享类型

## 11. 当前结构上的几个重点判断

### `main` 是故意做厚的

这里不要套用“主进程必须很薄”的思路。这个仓库的主进程本来就扮演桌面端本地后端，所以厚一点是合理的。关键不是薄，而是：

- 业务编排集中
- 运行逻辑统一
- 边界清晰

### `renderer/App.tsx` 仍然是热点文件

虽然已经拆出大量 `pages/`、`app/`、`ui/` 模块，但 `App.tsx` 仍然承担了很多整合职责。后续继续演进时，优先方向应该是继续把 feature-specific 逻辑往页面目录里挪。

### `shared` 是全仓库契约层

如果这里的类型或语义漂移，影响会同时扩散到：

- main
- preload
- renderer
- mcp

所以改 `shared` 时要比改纯页面代码更谨慎。

## 12. 新人建议阅读顺序

如果你要真正开始改这个项目，建议按下面顺序读：

1. 根目录 `README.md`
2. 本文档 `docs/zh-CN/architecture-overview.md`
3. `src/shared/types.ts`
4. `src/main/index.ts`
5. `src/main/agent-hub.ts`
6. `src/preload/index.ts`
7. `src/renderer/src/App.tsx`
8. 你这次要修改的具体页面或模块目录
