# 原生命令路由实施计划（执行台账）

> **给后续 Agent：** 英文逐步执行版仍以 `docs/superpowers/plans/2026-07-05-native-command-routing-implementation.md` 为准；这份 `zh-CN` 镜像负责说明实现状态、提交映射、验证范围和后续开放问题。

**目标：** 让聊天输入只把 `/app ...` 视为应用自有命令；Codex / Claude 保留原生 slash 语义；API runtime 对非 `/app` slash 诚实拒绝；并把 launch / completion / learned history 边界整理成后续可扩展的 runtime 框架。

**架构：** 这一轮实现落成了五条长期边界：共享 `/app` 命令注册表、主进程 chat command router、runtime launch profile 与全局 override、grouped slash completion provider 管线、按 runtime fingerprint 分区的 learned native command store。`AgentHub` 继续做状态 owner，但 slash 分类、补全组装和启动解析已经拆到专门模块，后续接新 runtime 不需要继续扩大产品层分支。

**技术栈：** Electron main/preload/renderer、TypeScript、Vitest、Codex app-server RPC、Claude `stream-json`、`userData` 下的 JSON 持久化。

---

## 当前状态

- 状态：已在 `fix/native-command-support` 分支完成并推送到 `origin/fix/native-command-support`。
- 结论：本期 first-slice 范围内没有已知缺失实现；剩余事项只包括 design spec 里已经列出的开放问题。
- 用法：这份文档现在是执行台账，不再是等待选择执行方式的草稿。

## 任务落地映射

### Task 1：共享 `/app` 注册表与 chat router

- 状态：已完成
- 主要提交：
  - `bb33db5` `feat: add shared chat command router`
  - `2cf8e9c` `fix: accept whitespace-separated /app commands`
  - `631c727` `test: lock /app near-prefix routing boundary`
- 关键文件：
  - `src/shared/app-commands.ts`
  - `src/main/chat-command-router.ts`
  - `src/main/chat-command-router.test.ts`

### Task 2：`AgentHub` 路由边界与 `/app` 执行

- 状态：已完成
- 主要提交：
  - `b6a333a` `feat: route chat slash commands by runtime`
- 关键文件：
  - `src/main/agent-hub.ts`
  - `src/main/agent-hub.test.ts`

### Task 3：runtime launch profile、持久化 override、跨平台解析

- 状态：已完成
- 主要提交：
  - `c42b40a` `feat: add runtime launch profiles`
  - `fa3f30a` `fix: persist runtime command overrides`
- 关键文件：
  - `src/main/runtime-launch-profiles.ts`
  - `src/main/runtime-launch-profiles.test.ts`
  - `src/main/runtime-command-store.ts`
  - `src/main/runtime-command-store.test.ts`
  - `src/main/agents/detect.ts`
  - `src/main/agents/detect.test.ts`

### Task 4：runtime 配置 UI 与 override IPC

- 状态：已完成
- 主要提交：
  - `48bb6cb` `feat: add runtime executor overrides`
  - `8e12a85` `fix: validate runtime executor override saves`
  - `0f67747` `fix: preserve windows runtime arg paths`
  - `643ab4a` `fix: keep raw runtime arg drafts`
- 关键文件：
  - `src/main/index.ts`
  - `src/preload/index.ts`
  - `src/preload/index.test.ts`
  - `src/renderer/src/pages/runtime/RuntimePage.tsx`
  - `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.ts`
  - `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts`

### Task 5：slash completion 基础设施与 renderer 分组展示

- 状态：已完成
- 主要提交：
  - `1c31f27` `feat: add grouped slash completions`
  - `bec22e2` `fix: guard slash completion preload API`
- 关键文件：
  - `src/main/runtime-command-completions.ts`
  - `src/main/runtime-command-completions.test.ts`
  - `src/renderer/src/pages/chat/useSlashCommandCompletions.ts`
  - `src/renderer/src/pages/chat/ChatPage.tsx`
  - `src/renderer/src/pages/chat/chat-utils.tsx`
  - `src/renderer/src/AppShell.tsx`

### Task 6：Codex / Claude metadata、learned suggestions、invalid-command eviction、文档同步

- 状态：已完成
- 主要提交：
  - `0647d76` `feat: add native command completions`
  - `3793461` `fix: surface Claude slash metadata through AgentHub`
  - `0b3f787` `fix: cache Claude slash metadata lookups`
  - `678656d` `fix: refresh cached Claude slash metadata`
- 关键文件：
  - `src/main/runtime-command-store.ts`
  - `src/main/runtime-command-completions.ts`
  - `src/main/agent-hub.ts`
  - `src/main/agents/codex-events.ts`
  - `src/main/agents/claude-stream.ts`
  - `docs/architecture-overview.md`
  - `docs/modules/main.md`
  - `docs/modules/renderer.md`
  - `docs/zh-CN/architecture-overview.md`
  - `docs/zh-CN/modules/main.md`
  - `docs/zh-CN/modules/renderer.md`

## 发布后维护

- `c2b419b`：修复 `App.layout.test.tsx` 的历史漂移断言，确保 focused renderer 验证集重新可信。
- `4a26c71`：统一 bundled skill frontmatter 与 Markdown 渲染的行尾解析，避免 Windows / macOS 因 CRLF/LF 差异出现技能描述和标题渲染偏差。

## 验证基线

- 代码面应以英文 plan 中的 focused verification 集合为准，尤其是：
  - `src/main/chat-command-router.test.ts`
  - `src/main/agent-hub.test.ts`
  - `src/main/runtime-launch-profiles.test.ts`
  - `src/main/runtime-command-store.test.ts`
  - `src/main/runtime-command-completions.test.ts`
  - `src/preload/index.test.ts`
  - `src/renderer/src/App.layout.test.tsx`
  - `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.test.ts`
- 当前收尾维护已经额外验证：
  - `npm test -- src/renderer/src/App.layout.test.tsx`
  - `npm run typecheck`

## 仍然开放但不阻塞本期的问题

- Codex 第一版到底采用哪些 App Server metadata 作为原生命令补全来源，以及参数级补全如何在 UI 表达。
- Claude 在本仓库集成里应优先扫描哪些 custom command / skill 目录与元数据文件。
- 未来新 runtime 是否需要比当前四类 route result 更丰富的 command capability descriptor。

## 交接说明

- 如果后续 Agent 只是继续扩展 metadata/completion，不要重做当前 `/app` / runtime slash 边界。
- 如果后续 Agent 要排查 slash completion 行为，先看：
  - `src/main/runtime-command-completions.ts`
  - `src/main/agent-hub.ts`
  - `src/renderer/src/pages/chat/useSlashCommandCompletions.ts`
- 如果后续 Agent 要扩展 CLI 启动兼容性，先看：
  - `src/main/runtime-launch-profiles.ts`
  - `src/main/runtime-command-store.ts`
  - `src/renderer/src/pages/runtime/hooks/useRuntimeConfigManager.ts`
