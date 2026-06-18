# Multi Agent Chat

Multi Agent Chat 是一个本地 Electron 桌面应用，用来把多种 Agent 运行方式统一到一个工作台里。它可以直接驱动本机的 Codex CLI、Claude Code CLI，也可以把任意 OpenAI-compatible / Anthropic-compatible 服务配置成纯 API Agent。

应用重点不是做一个单一聊天窗口，而是把“聊天、可复用 Agent、任务、团队协作、Workflow、MCP 暴露能力”放在同一个本地工具里。

## 功能总览

- 多会话 Chat：按工作目录、Runtime、Channel、模型运行 Codex / Claude / API Agent。
- Skills 页面：集中查看内置 Agent 技能模板，也可以在线搜索 OpenAI / Anthropic 官方 GitHub skill 源，并把内置技能安装到本机 Agent 目录。
- 可复用 Agent 配置：为不同 Provider、模型、Prompt、插件和高级参数保存独立 Agent。
- Provider Preset：内置 OpenAI、Anthropic、DeepSeek、GLM、Kimi、LongCat、MiMo、OpenRouter、GitHub Models、Together、Novita、NVIDIA、SiliconFlow、Bailian、Volcengine、Hunyuan、MiniMax、Azure OpenAI、Custom 等模板。
- Volcengine / 豆包 endpoint 可配置：`ep-m-...` 这类用户自己的 endpoint 不写死在代码里，由用户在界面里配置。
- Agent Test：配置页可以直接测试 Agent 是否可用，并展示测试过程、输出和错误。
- Test session 清理：Claude 测试会删除测试 session 文件；Codex 测试如果从 `codex exec --json` 输出中拿到测试 session id，会执行 `codex archive <sessionId>` 清理测试会话。
- Codex 插件配置：可以加载 Codex plugin catalog，也可以手动给 Channel 添加插件。
- Task 看板：把一次 Agent 执行作为任务管理，支持状态流转、日志查看、停止和删除。
- Agent Teams：把多个 Agent 组成团队，以并行、流水线或主管模式协作。
- Workflow：先对话澄清目标，再生成 DAG，运行节点，汇总结果，预览产出文档。
- 本地 MCP：通过 `npm run mcp` 把配置好的 Agent / Workflow 能力暴露给其他 MCP 客户端。
- 设置页：支持界面语言切换和本地偏好。

## Chat

Chat 页面用于直接和 Agent 对话。

支持能力：

- 创建和切换多个聊天会话。
- 选择工作目录。
- 选择 Runtime：`Codex`、`Claude Code`、`API`。
- 选择 Channel / Provider 和模型。
- 对正在运行的会话展示流式输出、工具事件、错误和运行状态。
- 已经开始对齐 CLI 体验：Enter 发送、Shift+Enter 换行、会话历史、快捷搜索入口。
- Codex 支持 `/status`、`/models`、`/plugins`、`/help` 等 slash command。

如果一个会话已经开始和 Agent 对话，应用会锁定关键运行配置，避免同一条会话中途切换 Runtime / Channel / Model 导致上下文不一致。

## Skills

Skills 页面用于集中管理 Agent 技能模板，并支持搜索公开 GitHub skill 源。

当前包含两类来源：

- 内置技能：随应用仓库发布，放在 `src/shared/bundled-skills/<skill-id>/`。每个目录至少包含原始 `SKILL.md`，可选 `SKILL.zh.md` 中文阅读版、`metadata.json` 来源信息，以及该 skill 自带的 `scripts/`、`references/`、`assets/` 等文件。
- 在线搜索：读取公开 GitHub 仓库里的 `SKILL.md` 元数据，目前内置 `openai/skills` 和 `anthropics/skills` 两个官方源。

内置技能只保留 7 个常用技能：`brainstorming`、`systematic-debugging`、`personal-finance-planning`、`resume-optimization`、`paper-writing`、`refactor-review-knowledge`、`code-review-and-quality`。
其中 `personal-finance-planning` 会显示 TradingAgents 的 GitHub 参考来源：`https://github.com/TauricResearch/TradingAgents`。
`brainstorming`、`systematic-debugging`、`resume-optimization`、`refactor-review-knowledge`、`code-review-and-quality` 使用随仓库打包的原始 `SKILL.md`；`personal-finance-planning` 和 `paper-writing` 是本项目内置的 custom skill。
用户可以在 Skills 页面把当前选中的内置技能软链接到自己的本机目录：Codex 使用 `~/.codex/skills/<skill-id>`，Claude 使用 `~/.claude/skills/<skill-id>`，Trae 使用 `~/.trae/skills/<skill-id>`。删除时只删除应用创建的软链接，不删除用户自己已有的真实目录。
安装时应用会先把整个 skill 目录复制到自己的 managed 目录，再软链接到本机 Agent 目录；因此脚本、references、assets 会一起保留。安装到本地的 `SKILL.md` 保持原文；页面上的中文阅读版随应用内置，只用于理解，不会调用 API Agent，也不会改写本地 skill 文件。
开发时新增外部 skill，可以把下载下来的目录放到 `src/shared/bundled-skills/<skill-id>/`，保留原始 `SKILL.md`，再按需补 `metadata.json` 和 `SKILL.zh.md`；重启 dev server 后会被 skill template 列表读取。

每个技能包含：

- 名称和描述。
- 标签。
- 出处。
- `SKILL.md` 正文。

Skills 页面只用于查看和搜索技能，不负责创建 Agent。需要配置 Agent 时继续使用配置页。

在线技能来自第三方仓库时，只作为未审查内容展示；使用前需要自行检查 `SKILL.md` 内容和来源链接。

## Agent 配置

配置页用于创建可复用 Agent。每个 Agent 可以保存：

- 名称、ID、描述、标签。
- 默认 Runtime：Codex、Claude Code 或 API。
- 默认 Channel / Provider。
- 默认模型。
- 默认 Prompt。
- Provider API Key / Token。
- Codex 插件列表。
- 高级 Provider 参数：
  - `modelProvider`
  - `providerName`
  - `baseUrl`
  - `wireApi`
  - `modelReasoningEffort`
  - HTTP headers
  - model catalog JSON

Provider Key 按 Provider Preset 保存。同一个 Provider 被多个 Agent 复用时，只需要配置一次 Key。

## Provider 和模型

内置 Provider Preset 覆盖常见平台：

- Codex OpenAI
- Claude Code
- DeepSeek
- GLM
- Kimi
- LongCat
- MiMo
- OpenAI API
- Anthropic API
- OpenRouter
- GitHub Models
- Together
- Novita
- NVIDIA
- SiliconFlow
- Alibaba Bailian
- Volcengine
- Tencent Hunyuan
- MiniMax
- Azure OpenAI
- Custom

OpenAI-compatible Provider 走兼容接口；Anthropic API 走 Anthropic messages 语义；Codex / Claude Code Runtime 会通过各自 CLI 所需的环境变量和参数注入 Provider 配置。

### Volcengine / 豆包 endpoint

Volcengine 的 endpoint / model id 是用户自己的配置，不会硬编码仓库里的某个 `ep-m-...`。

支持配置的 Volcengine Preset：

- `claude-code-volcengine`
- `codex-volcengine`
- `api-volcengine`

在配置页选择 Volcengine 后，可以在 `Endpoint / model ID` 输入框里填：

- `ep-m-...`
- `doubao-seed-...`
- 其他平台允许的模型或 endpoint id

保存后，该值会加入当前 Channel 的 model 列表，并成为该 Agent 的 `modelId`。后续只更新 API Key / Token 时，会保留用户自己填的 endpoint。

## Agent Test

配置页的 `Test` 按钮用于验证当前 Agent 能否真正启动并返回结果。

不同 Runtime 的测试方式：

- Codex：启动 `codex exec --ephemeral --json --skip-git-repo-check --sandbox read-only ...`
- Claude Code：启动 Claude CLI 的一次性测试调用。
- API：直接向配置的 API Provider 发送测试请求。

测试 UI 会展示：

- 当前阶段。
- Runtime、Provider、Model。
- 流式 transcript。
- 最终输出或错误。
- 耗时。

测试通过后，配置页会收敛成绿色成功摘要，显示 `Agent 部署成功`、Provider、Model 和耗时；运行中和失败时仍保留详细过程，方便排查。

### Test session 清理

为了避免本地 session 被测试刷屏：

- Claude 测试会根据输出里的 `session_id` / `sessionId` 找到本地测试 session 文件并删除。
- Codex 测试会解析 `codex exec --json` 输出中的 `session_id`、`sessionId`、`thread_id`、`threadId`、`thread.id`、`session.id` 等字段。
- 如果 Codex 测试输出了 session id，应用会执行 `codex archive <sessionId>` 清理这个测试 session。
- 如果 Codex CLI 没有输出 session id，应用不会猜测最近的本地 session，也不会扫描 `.codex/sessions` 删除文件。

这个逻辑只处理 Test 子进程自己输出的测试 session id，不会使用当前正在对话的 Codex TUI session id。

## Task

Task 页面适合把一次 Agent 执行作为可跟踪任务来管理。

支持：

- 输入任务目标并选择 Runtime / Channel / Model。
- 启动、停止任务。
- 任务列表和看板视图。
- 按状态筛选：待处理、运行中、Review、完成等。
- 查看任务执行日志、工具事件和最终输出。
- 删除任务，并清理关联的本地 Agent session。

## Agent Teams

Teams 页面用于把多个 Agent 组成团队处理同一个目标。

支持：

- 创建和编辑 Team。
- 添加多个成员，每个成员配置独立 Agent、模型、Prompt。
- 并行模式：多个 Agent 同时处理。
- 流水线模式：上一个成员输出传给下一个成员。
- 主管模式：由 lead / supervisor 组织其他成员。
- 查看团队运行步骤、状态、输出和错误。

## Workflow

Workflow 页面是“先澄清，再生成图，再执行”的工作流能力。

流程：

1. 用户描述目标。
2. Workflow Agent 追问关键约束。
3. 对话完成后生成 Workflow DAG。
4. 用户可以检查和编辑节点。
5. 运行 DAG。
6. 应用展示每个节点的运行状态。
7. 节点输出被汇总成上下文。
8. 主 Agent 做最终 review。
9. 产出文档可以在应用内预览。

Workflow 支持：

- 新建和切换多个 Workflow 会话。
- DAG 校验。
- 节点运行状态展示。
- 运行进度摘要。
- 节点输出、handoff、artifact 汇总。
- 输出文档路径识别和本地预览。
- Workflow 运行上下文持久化。

Workflow 的本地运行数据默认放在工作目录：

```text
.multi-agent-chat/workflows/<workflow-id>/
```

## 本地 MCP

应用提供一个本地 bridge，`npm run mcp` 可以启动 MCP server，让其他 MCP 客户端调用本应用能力。

典型用途：

- 查询已配置 Agent。
- 创建、读取、更新 Workflow。
- 启动 Workflow run。
- 追加 Workflow 上下文。
- 把 Multi Agent Chat 当成本机 Agent 编排服务使用。

使用方式：

```bash
npm run dev
npm run mcp
```

MCP server 通过 stdio 与客户端通信，再连接 Electron 主进程提供的本地 bridge。bridge 只监听 `127.0.0.1`。

## 运行要求

- Node.js `>=22.13.0`
- npm
- 可选 CLI：
  - Codex CLI：`codex` 在 PATH 中，或设置 `CODEX_PATH=/path/to/codex`
  - Claude Code CLI：`claude` 在 PATH 中，或设置 `CLAUDE_PATH=/path/to/claude`

只使用 API Agent 时，可以不安装 Codex / Claude Code CLI。

## 安装和启动

安装依赖：

```bash
npm install
```

启动开发版桌面应用：

```bash
npm run dev
```

应用会通过 `electron-vite` 启动 Electron 窗口。Renderer dev server 默认使用 Vite 端口，如果端口被占用会自动选择可用端口。

## 构建和测试

类型检查：

```bash
npm run typecheck
```

运行测试：

```bash
npm test
```

构建：

```bash
npm run build
```

## 本地数据

应用数据保存在 Electron `userData` 目录，以及当前工作目录下的运行产物目录。

常见本地数据：

- `app.db`：聊天、任务、团队、Workflow、配置等持久化数据。
- `model-channels.json`：Channel / Provider 配置。
- renderer local storage：Provider Key / Token 等开发期本地凭据。
- `.multi-agent-chat/`：Workflow 运行上下文和输出文档。

这些文件不应该提交到 Git。仓库已忽略常见本地数据：

- `eval-data/`
- `datasets/`
- `.venv/`
- `*.db`
- `*.sqlite`
- `*.sqlite3`
- `app-chats.json`
- `model-channels.json`
- `.multi-agent-chat/`

正式发布前，Provider Key 建议迁移到系统 Keychain 或其他安全密钥存储。

## 开发说明

主要入口：

- `src/main/agent-hub.ts`：主进程状态、Agent 调用、任务/团队/Workflow 编排。
- `src/main/index.ts`：Electron 主进程和 IPC 注册。
- `src/preload/index.ts`：Renderer 可用 API。
- `src/renderer/src/App.tsx`：前端主界面。
- `src/shared/types.ts`：主进程、renderer、MCP 共享类型。
- `src/mcp/server.ts`：MCP server。

提交前建议至少运行：

```bash
npm run typecheck
npm test
```
