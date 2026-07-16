# Multi Agent Chat

Multi Agent Chat 是一个本地优先的 Electron Agent 工作台。它把多 Runtime 对话、可复用 Agent、任务执行、Workflow V2 编排、定时运行、Skill 管理、MCP 和评测能力放在同一个桌面应用中。

项目当前面向本地开发与验证：核心状态由 Electron 主进程管理，Renderer 通过受控 IPC 调用能力；Agent 可以来自本机 CLI、原生会话协议或 OpenAI / Anthropic 兼容 API。

## 当前能力

| 模块 | 能力 |
| --- | --- |
| Chat | 多会话对话、工作目录、模型与 Channel 选择、流式事件、会话续接与停止 |
| Tasks | 一次性 Agent 任务、状态筛选、日志、停止与结果查看 |
| Workflow | Workflow V2 规划、DAG 校验、并行调度、交互节点、脚本节点、人工介入、恢复与输出预览 |
| Schedules | 本地定时任务配置与到期 Workflow 运行 |
| Skills | 内置 Skill、用户 Skill 分类、在线检索、导入和安装到本机 Agent 目录 |
| Agent | 可复用 Agent 的 Runtime、Provider、模型、Prompt、标签和插件配置 |
| MCP | 本地 MCP 注册表、Agent 绑定，以及 Workflow 规划工具接入 |
| Evaluation | 数据集、Evaluator 和 Experiment 工作台 |
| Config | Runtime 检测、Provider Preset、模型目录、本地配置导入和连接测试 |

当前登记的 Runtime：

- Codex
- Claude Code
- API
- Hermes
- OpenCode
- OpenClaw

具体能力按 Runtime 声明，不会为接口对称虚构会话续接、清理或模型切换能力。接入新 Runtime 时请参考[不同 Agent 接入指南](docs/agent-integration-guide.md)。

## Workflow V2

Workflow 使用“对话规划 → 定义校验 → 用户确认 → 冻结计划 → 执行与恢复”的主链路。

- 图只包含可执行的 LLM 或 Script 节点，不使用占位 Start / End 节点。
- Scheduler 只运行依赖已满足的节点，并受并行度、资源锁和运行状态约束。
- Agent 节点支持 one-shot 与 interactive 会话；Script 节点使用独立的参数与执行详情面板。
- Script 参数支持 Argument、Query、Header、Body、Environment 和 stdin，包含类型校验、枚举选择、权限与风险确认。
- Agent 到 Script 的绑定使用明确的上游节点、输出字段和类型契约，不从 Agent `summary` 隐式取值。
- Run 状态、节点状态、事件、输入请求和恢复信息会持久化；旧冻结计划保留兼容读取能力。
- 用户可见文件应写入当前工作目录下的 `outputs/<workflowId>/<runId>/`。

脚本权限与风险治理不等同于操作系统级沙箱。执行不可信脚本前仍需审查代码、能力声明和工作目录权限。Workflow 的权威文档入口见 [docs/workflow-v2/README.md](docs/workflow-v2/README.md)。

## 快速开始

### 环境要求

- Node.js `>= 22.13.0`
- npm
- Windows、macOS 或 Linux 的 Electron 开发环境
- 按需安装 Runtime CLI：
  - `codex`，或设置 `CODEX_PATH`
  - `claude`，或设置 `CLAUDE_PATH`
  - `hermes`，或设置 `HERMES_PATH`
  - `opencode`，或设置 `OPENCODE_PATH`
  - `openclaw`，或设置 `OPENCLAW_PATH`

只使用 API Runtime 时无需安装上述 CLI。

### 安装与启动

```bash
npm install
npm run dev
```

`npm run dev` 会启动 Electron 主进程、Preload 和 Vite Renderer。开发服务器端口被占用时，Vite 可能选择其他可用端口。

### 启动本地 MCP Server

先保持桌面应用运行，再在另一个终端执行：

```bash
npm run mcp
```

MCP Server 使用 stdio 与客户端通信，并通过本机 discovery 文件连接只监听 `127.0.0.1` 的 Electron bridge。

## 开发命令

```bash
# 类型检查
npm run typecheck

# 完整测试
npm test

# 监听测试
npm run test:watch

# 生产构建
npm run build
```

提交前至少运行 `npm run typecheck` 和与改动相关的测试；涉及主链路或共享契约时应运行完整测试与生产构建。

## 架构入口

```text
src/main/app/                 Electron 启动、窗口、IPC 和本地 bridge
src/main/hub/                 业务协调、持久化状态和运行时装配
src/main/hub/runtime/         Runtime driver 与各 Agent executor
src/main/workflows/v2/        Workflow V2 执行、监督、恢复和脚本治理
src/preload/                  Renderer 可调用的受控 API
src/renderer/src/             React 工作台与功能页面
src/shared/                   跨进程类型、Runtime catalog 和 Workflow 契约
src/mcp/                      stdio MCP Server
docs/                         架构、规格、计划、调研和接入文档
```

详细调用链和模块边界见[当前架构概览](docs/architecture-overview.md)。

## 本地数据与安全

应用状态主要保存在 Electron `userData` 目录：

- `app.db`：聊天、Workflow、运行记录和应用状态
- `official-catalog.db`：官方 Workflow / Skill 目录
- `model-channels.json`：Runtime Channel 与 Provider 配置

本地 MCP bridge 的 discovery 文件通常位于应用数据根目录下的 `multi-agent-chat/mcp-bridge.json`，其中只记录本机连接信息。

工作目录还可能包含：

- `.multi-agent-chat/workflows/<workflowId>/`：Workflow 运行存储
- `outputs/<workflowId>/<runId>/`：用户可见输出文件

这些本地状态、数据库、输出文件和 API Key 不应提交到 Git。当前 Provider 凭据仍属于本地开发配置，生产使用前应迁移到系统 Keychain 或专用密钥存储。

## 文档

- [文档总入口](docs/README.md)
- [当前架构概览](docs/architecture-overview.md)
- [不同 Agent 接入指南](docs/agent-integration-guide.md)
- [Workflow V2 文档入口](docs/workflow-v2/README.md)
- [权威规格](docs/superpowers/specs/README.md)
- [实施计划](docs/superpowers/plans/README.md)
- [Hermes 接入资料](docs/hermes/README.md)
- [OpenCode 接入资料](docs/opencode/README.md)
- [OpenClaw 接入资料](docs/openclaw/README.md)

文档中的设计目标、当前实现和历史记录必须明确区分。判断当前行为时，以代码、测试和标记为已实现的 spec 为准。
