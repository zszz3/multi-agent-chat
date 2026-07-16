# 当前架构概览

本文描述当前工作树中的运行边界和主要调用链。它是代码导航，不替代 Workflow 或 Runtime 的权威 spec。

## 1. 进程结构

```text
React Renderer
    │ window.multiAgentChat
    ▼
Preload / contextBridge
    │ ipcRenderer.invoke / events
    ▼
Electron Main
    ├─ AgentHub 与领域服务
    ├─ Runtime driver / session / executor
    ├─ Workflow V2 runtime
    ├─ SQLite 与本地配置存储
    └─ localhost MCP bridge
              ▲
              │ HTTP on 127.0.0.1
stdio MCP Server
```

构建入口由 `electron.vite.config.ts` 定义：

- Main：`src/main/app/index.ts`
- Preload：`src/preload/index.ts`
- Renderer：`src/renderer/src/main.tsx`
- MCP Server：`src/mcp/server.ts`

Renderer 不直接访问 Node.js、数据库或 Agent 进程。所有系统能力通过 Preload 暴露的窄 API 进入主进程。

## 2. Renderer

`src/renderer/src/AppShell.tsx` 负责应用级状态和功能页面装配，`src/renderer/src/app/FeatureRail.tsx` 定义当前主导航：

- Chat
- Tasks
- Workflow
- Schedules
- Skills
- Agent
- MCP
- Evaluation
- Config

页面实现位于 `src/renderer/src/pages/`。新增功能应优先形成独立页面、hook 和 service，不继续把领域逻辑堆入 `AppShell.tsx`。

Renderer 通过 `src/renderer/src/app/services/` 调用 Preload API。跨页面共享的领域类型应放在 `src/shared/`，不能从 Renderer 反向导入 Main 实现。

## 3. Preload 与 IPC

`src/preload/index.ts` 使用 `contextBridge` 暴露 `window.multiAgentChat`。每个方法对应主进程中的一个 IPC handler。

主进程 IPC 的装配入口是 `src/main/app/index.ts`。新增 IPC 时需要同步：

1. `src/shared/` 中的请求、响应类型。
2. `src/preload/index.ts` 中的 API。
3. `src/renderer/src/global.d.ts` 中的窗口类型。
4. 主进程 handler 与领域 service。
5. Preload 和 handler 测试。

Renderer 不能依赖主进程内部对象结构；主进程返回的是可序列化快照、事件或明确的操作结果。

## 4. AgentHub 与领域边界

`src/main/hub/agent-hub.ts` 是应用业务协调入口，但具体职责已经分散到子目录：

```text
src/main/hub/
  chat/         Chat 分发与交互协调
  persisted/    SQLite schema、repository、恢复和迁移
  runtime/      Runtime 注册、driver、executor 与 run 生命周期
  state/        快照、恢复和 artifact 投影
  team/         Agent Team 领域能力
  workflow/     Workflow 草稿、规划、执行与节点会话服务
```

新增 Runtime 特有逻辑时，不应在 AgentHub、Chat 或 Workflow 中增加 Runtime ID 分支；应由 Runtime driver 声明并实现能力。

## 5. Runtime 架构

Runtime 的公共目录是：

- `src/shared/runtime-catalog.ts`：Runtime ID、显示名称、可执行文件和默认 Channel
- `src/main/agents/`：底层 CLI、SDK、RPC 或 ACP 协议适配
- `src/main/hub/runtime/executor/`：按 surface 组织的 driver、executor、session 和 cleanup
- `src/main/agents/runtime/`：公共路由、会话管理、检测和状态 codec

当前 Runtime 包括 Codex、Claude Code、API、Hermes、OpenCode 和 OpenClaw。

上层提交统一 Runtime 请求，并声明 surface、执行模式和续接策略。Runtime 自己负责：

- 命令或协议参数
- 原生 session / thread identity
- 流式事件转换
- 取消与超时
- 可用模型与 Provider 配置
- 是否支持恢复或精确清理

完整接入流程见[不同 Agent 接入指南](agent-integration-guide.md)。

## 6. Workflow V2 主链路

Workflow V2 的共享合同在 `src/shared/workflow-v2/`，主进程实现位于 `src/main/workflows/v2/` 和 `src/main/hub/workflow/`。

```text
用户目标
  → Workflow planning session
  → session-scoped MCP workflow_validate / workflow_create
  → mutable WorkflowV2Definition
  → generation review
  → 用户确认
  → frozen WorkflowV2Plan
  → scheduler 执行 ready nodes
  → LLM / Script output packet
  → validation / review / intervention
  → durable state、事件与用户输出
```

关键边界：

- `definition.ts`：节点、边、Script 参数和输出字段合同
- `validation.ts`：DAG、节点、终止节点和上下游绑定校验
- `planning.ts`：冻结 TaskPacket、ResultPacket、预算和下游消费契约
- `workflow-v2-planner.ts`：从确认定义构建冻结计划
- `workflow-v2-executor.ts`：依赖满足、并行批次和节点执行
- `workflow-v2-run-executor.ts`：具体运行协调、监督、review、Hook 和 Script 调用
- `workflow-runtime.ts`：Workflow 运行 facade 与恢复入口

Agent 节点通过 TaskPacket 获得自己的输出字段及直接下游 Script 的参数需求。Script 节点只从显式 `user`、`workflow`、`upstream` 或 `literal` 来源解析参数。

Workflow 文档的权威分层见 [Workflow V2 文档入口](workflow-v2/README.md)。

## 7. 持久化与本地文件

主应用数据库由 `src/main/hub/persisted/` 管理。主要本地文件位于 Electron `userData`：

- `app.db`
- `official-catalog.db`
- `model-channels.json`

主数据库保存 Chat、Runtime 会话、Workflow 定义、冻结计划、Run、节点进度和事件等结构化状态。官方目录使用独立数据库，避免官方资源与用户资源混写。

Workflow 还会在工作目录中使用：

```text
.multi-agent-chat/workflows/<workflowId>/
outputs/<workflowId>/<runId>/
```

前者用于运行存储，后者只放用户可见输出。注册 artifact 或返回普通 JSON 不会自动创建输出文件；节点必须实际写入文件。

## 8. MCP

`src/mcp/server.ts` 是 stdio MCP Server，声明 Agent、Channel、Model 和 Workflow 工具。它不直接持有应用状态，而是读取 discovery 文件并调用 Electron 主进程启动的 localhost bridge。

Workflow 规划工具会按会话范围注入，`workflow_create` 只更新当前规划草稿，不负责确认或运行 Workflow。

## 9. 测试与变更要求

测试与实现文件通常同目录放置，使用 Vitest。基础验证命令：

```bash
npm run typecheck
npm test
npm run build
```

按改动范围至少覆盖：

- 共享合同：生产者、消费者和持久化恢复
- Runtime：driver capability、one-shot / interactive 路由和清理边界
- Workflow：定义校验、冻结计划、执行、恢复和 Renderer 投影
- IPC：Preload API 与 Main handler
- UI：静态渲染、交互状态和错误路径

不要把 Prompt 约束当作权限隔离、类型校验或持久化保证；可以由代码确定的规则必须由代码和测试强制执行。
