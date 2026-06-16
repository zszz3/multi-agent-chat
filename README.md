# Multi Agent Chat

一个本地 Electron 桌面应用，用来统一管理和使用多种 Agent 运行方式。它支持直接和 Codex / Claude Code 聊天，也支持配置纯 API Agent、创建任务、编排 Workflow，并通过本地 MCP 暴露能力给其他 Agent 调用。

## 目前有哪些功能

### 1. Chat 聊天

- 支持创建多个聊天会话。
- 支持选择工作目录、CLI / Runtime、Provider 和模型。
- 支持 `/status`、`/models`、`/plugins` 等 Codex 相关命令。
- 已经开始对齐 CLI 的使用体验，例如 Enter 发送、历史会话、运行中状态展示。

### 2. Agent 配置

在 Config 页面可以创建可复用的 Agent。每个 Agent 可以配置：

- Agent 名称、描述、标签和默认 Prompt。
- 使用哪种 Runtime：
  - `Codex`：调用本机 Codex CLI。
  - `Claude Code`：调用本机 Claude Code CLI。
  - `API`：不启动 CLI，直接请求模型服务 API。
- 使用哪个 Provider 模板。
- 使用哪个模型。
- Provider Key / Token。
- 高级参数，例如 base URL、headers、provider id、model catalog。

Provider Key 按 Provider 维度保存一次，同一个 Provider 被多个 Agent 使用时会复用，不需要每个 Agent 重复配置。

### 3. Provider 模板

内置了一批类似 ccswitch 的 Provider Preset，创建 Agent 时可以直接点选：

- Codex OpenAI
- Claude Code
- OpenAI API
- Anthropic API
- DeepSeek
- GLM
- Kimi
- LongCat
- MiMo
- OpenRouter
- GitHub Models
- Together
- Novita
- NVIDIA
- SiliconFlow
- Bailian
- Volcengine
- Hunyuan
- MiniMax
- Azure OpenAI
- Custom API

其中 OpenAI-compatible Provider 会走 `/chat/completions`，Anthropic API 会走 `/messages`。

### 4. Task 任务

- 可以输入一段任务描述，让 Agent 执行。
- 支持任务列表、状态流转和看板展示。
- 支持查看任务执行日志。
- 支持删除任务，并清理关联的本地会话记录。

### 5. Workflow

Workflow 页面是“先对话，再生成图”的流程：

1. 先像聊天一样描述目标。
2. Grill / 主 Agent 会逐步追问。
3. 对话完成后生成 Workflow DAG。
4. 用户可以编辑节点和模型配置。
5. 运行 Workflow。
6. 右侧展示运行进度。
7. 运行结束后主 Agent 汇总结果。
8. 产出文档可以在应用内点击预览。

Workflow 的中间记忆和输出文档会放在本地工作目录下的 `.multi-agent-chat/workflows/<workflow-id>/`。

### 6. Agent Teams

- 支持创建 Agent Team。
- 支持不同协作模式，例如并行、流水线、主管模式。
- 成员可以配置不同 Agent、模型和 Prompt。
- 适合把一个目标拆给多个 Agent 分工执行。

### 7. 本地 MCP

应用启动后会开启本地 bridge，`npm run mcp` 可以作为 MCP server 接入其他客户端。

目前 MCP 侧主要用于：

- 查询配置好的 Agent。
- 操作 Workflow。
- 给其他 Agent 提供创建 / 查询 / 运行 Workflow 的工具接口。

## 运行要求

- Node.js 22.13 或更高版本
- npm
- 可选 CLI：
  - Codex CLI：`codex` 在 PATH 中，或设置 `CODEX_PATH=/path/to/codex`
  - Claude Code CLI：`claude` 在 PATH 中，或设置 `CLAUDE_PATH=/path/to/claude`

如果只使用 API Agent，可以不安装 Codex / Claude Code CLI。

## 安装

```bash
npm install
```

## 本地启动

```bash
npm run dev
```

应用会通过 `electron-vite` 启动 Electron 桌面窗口。如果默认端口被占用，Vite 会自动选择下一个可用端口。

## 构建

```bash
npm run build
```

构建产物会输出到 `out/`。

## 测试

```bash
npm test -- --run
```

只做类型检查：

```bash
npm run typecheck
```

## MCP 使用

先启动桌面应用：

```bash
npm run dev
```

然后启动 MCP server：

```bash
npm run mcp
```

MCP server 通过 stdio 与客户端通信，再连接本机 Electron 应用提供的本地 bridge。bridge 只监听 `127.0.0.1`，端口动态分配。

## 本地数据说明

应用会把本地历史数据保存在 Electron `userData` 目录下：

- `app.db`：聊天、任务、团队、Workflow、Agent 配置等历史数据。
- `model-channels.json`：Provider / Channel 配置。
- `.multi-agent-chat/`：Workflow 运行时的共享记忆和输出文档。

这些都是本地数据，不应该提交到 Git。仓库已经忽略：

- `eval-data/`
- `datasets/`
- `.venv/`
- `*.db`
- `*.sqlite`
- `*.sqlite3`
- `app-chats.json`
- `model-channels.json`
- `.multi-agent-chat/`

Provider Key 目前为了开发便利保存在本地 renderer 存储中。后续如果要做正式发布，应该迁移到系统 Keychain 或其他安全密钥存储。

