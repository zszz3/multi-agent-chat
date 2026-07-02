# Claude 交互运行时方案

日期：2026-07-02
分支：`feat/claude-interactive-runtime`
状态：本分支完成 Phase 1，Phase 2 仅保留方案
范围：Claude 聊天 slash 命令路由、前端提示，以及后续真正交互式运行时的边界

## 目标

让 Claude 聊天会话里的 slash 输入默认按正常对话消息进入 Claude 会话，只有用户显式输入 `/app ...` 时才走应用本地命令。

Phase 1 只处理聊天路由和交互提示澄清，不引入 PTY。真正的终端级交互放到后续 Phase 2。

## Phase 1

### TodoList

- [x] 在主进程聊天发送链路里加入显式的 slash 命令路由决策。
- [x] 保留 `/app help`、`/app status`、`/app models`、`/app plugins` 作为应用本地命令。
- [x] Claude 聊天里把非 `/app` 的 slash 输入原样转发进正常会话。
- [x] Codex 继续兼容 `/status`、`/models`、`/plugins`、`/help`，同时补齐 `/app ...` 命名空间。
- [x] 把渲染层 slash 补全改成 runtime-aware，Claude 只提示 `/app`。
- [x] 明确本地帮助文案，说明 Claude passthrough 和 Codex 兼容别名的语义。
- [x] 用 `npm run typecheck` 和定向 vitest 覆盖完成验证。

### 验收标准

- Claude 聊天里，`/help`、`/config`、`/clear` 等非 `/app` slash 输入必须原样进入 Claude Code 会话，并作为正常会话历史参与上下文。
- Claude 聊天里，`/app help`、`/app status`、`/app models`、`/app plugins` 必须始终走本地命令，消息标记为 `local: true`。
- Claude 的多轮上下文继续复用现有 `sessionId + --resume` 链路，不在 Phase 1 引入新的交互后端。
- Codex 聊天里，`/status`、`/models`、`/plugins`、`/help` 不回归，同时 `/app ...` 成为稳定的正式命名空间。
- 渲染层 slash 建议中，Claude 只出现 `/app`，Codex 出现 `/app` 加兼容别名。
- 类型检查和聊天路由相关定向测试通过。

### Phase 1 非目标

- 不引入 PTY 或终端仿真层。
- 不引入 `node-pty`。
- 不改任务、workflow、agent test 的 Claude 执行模型。
- 不为 Phase 1 新增共享 public type。

## Phase 2

### TodoList

- [ ] 引入专门的 PTY 驱动 Claude 交互 Runner。
- [ ] 把输出模型升级为增量终端 I/O，而不是当前一次性 runner 语义。
- [ ] 支持中断、继续、权限或审批提示处理。
- [ ] 只有在 PTY 真实落地后，再补 runtime capability 或 message origin 一类元数据。
- [ ] 后续补齐交互式会话生命周期的验证覆盖。

### 验收标准

- Claude 聊天能够承载真正的终端式交互会话，支持增量输出和后续输入。
- 用户可以在不丢失底层 Claude 会话的前提下执行中断和继续。
- 权限或审批提示能够在应用内暴露并完成处理，而不是被一次性 runner 吞掉。
- Phase 2 落地后不能回归 Phase 1 的 slash passthrough 语义，也不能破坏 `/app` 本地命名空间。
