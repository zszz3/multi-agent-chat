# Runtime 适配层重构方案

日期：2026-07-02
分支：`feat/claude-interactive-runtime`
状态：本分支完成 Phase 1，Phase 2 到 Phase 4 仍待开发
范围：把 `codex`、`claude`、`api` 三种 runtime 的启动统一到一个主进程适配层入口

## 目标

在主进程里建立一个共享的 runtime 适配层注册表，让聊天、任务、workflow agent、runtime 测试这几条启动链都通过同一个入口分发，而不是继续在多个位置重复写 `codex` / `claude` / `api` 分支。

这次是结构重构，不是协议重写。前几阶段里三种 runtime 的底层行为保持不变：

- `codex` 继续复用 `CodexRpcClient`
- `claude` 继续复用 `ClaudeRunner`
- `api` 继续复用 HTTP `fetch`

## 当前状态

### 已经部分统一

- `chat` 和 `task` 执行现在已经通过 `src/main/agent-executor.ts` 里的 `RuntimeAgentExecutorFactory` 接到 `src/main/runtime-adapter.ts` 的共享 registry。

### 仍然分散

- `workflow agent` 仍然在 `AgentHub.askWorkflowAgent(...)` 里手写三路分支。
- `runtime test` 仍然分散在 `testCodexAgent(...)`、`testClaudeAgent(...)`、`testApiAgent(...)` 三套实现里。
- API 的请求构造和响应提取逻辑在 workflow/test 路径之间还有重复。

## 设计方向

新增 `src/main/runtime-adapter.ts`，把 runtime 相关启动能力收敛到统一接口和注册表中。

建议的适配层接口：

- `createExecutor(...)`：供 chat / task 使用，返回可 `start/stop` 的执行器
- `runWorkflow(...)`：供 workflow agent 使用
- `testAgent(...)`：供 runtime/config 页的 agent test 使用

建议的配套类型：

- `RuntimeAdapter`
- `RuntimeAdapterRegistry`
- `RuntimeExecutorContext`
- `RuntimeWorkflowContext`
- `RuntimeAgentTestContext`

`AgentHub` 继续负责 runtime 解析、状态校验、状态更新；runtime 专属的启动细节迁移到适配层。

## 非目标

- 不做 PTY 改造
- 不重写 Claude 协议
- 不改 Codex app-server 协议
- 不扩展 API provider 能力
- 不做与当前 runtime 语义无关的 renderer 行为变更

## 分阶段开发

## Phase 1

### 目标

先引入共享 runtime 适配层注册表，并把 `chat` / `task` 执行统一接到这层上，保证行为不变。

### TodoList

- [x] 新增 `src/main/runtime-adapter.ts`
- [x] 定义统一适配层接口和注册表
- [x] 为 `codex`、`claude`、`api` 三种 runtime 实现适配器，内部继续包装现有底层启动器
- [x] 把 `RuntimeAgentExecutorFactory` 改成 registry 的薄桥接层
- [x] 保持 `CodexRpcClient`、`ClaudeRunner`、API `fetch` 的低层实现不变

### 验收标准

- 三种 runtime 的 chat / task 行为与当前保持一致
- `AgentHub.runChat(...)` 不再需要知道 runtime 专属启动细节
- `RuntimeAgentExecutorFactory` 不再直接持有 `codex` / `claude` / `api` 的启动分支细节
- 现有聊天执行相关定向测试保持通过

### 验证结果

- `npm run typecheck`
- `vitest run src/main/runtime-adapter.test.ts src/main/agents/claude-runner.test.ts src/main/agents/codex-rpc.test.ts`

## Phase 2

### 目标

把 workflow-agent 启动也迁移到同一个适配层注册表。

### TodoList

- [ ] 用统一 registry dispatch 替换 `askCodexWorkflowAgent(...)`、`askClaudeWorkflowAgent(...)`、`askApiWorkflowAgent(...)` 的分支调用
- [ ] 保持 workflow idle-timeout 和事件转发语义不变
- [ ] 将 workflow 路径里重复的 runtime glue 迁移到适配层辅助逻辑

### 验收标准

- `AgentHub.askWorkflowAgent(...)` 只负责解析 runtime，然后统一调用适配层
- workflow 事件输出仍然保持 `delta`、`completed`、`error` 这三种结构
- Codex workflow 的 session resume 行为不回归
- Claude workflow 的 session resume 行为不回归
- API workflow 仍然遵守当前所选 model 和 provider 请求格式

## Phase 3

### 目标

把 runtime/config 页的 agent test 启动也统一迁入适配层注册表。

### TodoList

- [ ] 用统一 registry dispatch 替换 `testCodexAgent(...)`、`testClaudeAgent(...)`、`testApiAgent(...)` 的分支调用
- [ ] 适当把共享请求构造和响应提取逻辑从 `AgentHub` 中移出
- [ ] 保持 Codex 和 Claude 的测试会话清理行为不变

### 验收标准

- `codex`、`claude`、`api` 的 runtime test 用户可见结果结构保持一致
- Codex / Claude 的临时测试会话清理逻辑不回归
- API runtime test 仍然使用当前选中的 model 和 provider 专属请求体
- `AgentHub` 不再自己维护三套 runtime test 启动实现

## Phase 4

### 目标

收尾剩余重复逻辑，让后续扩展新 runtime 的成本降下来。

### TodoList

- [ ] 继续抽取在前三阶段之后仍然重复的共享 helper
- [ ] 评估 runtime detect 和一次性 CLI probe 是否也要复用 registry，或继续保持独立
- [ ] 补 adapter 层自己的分发和错误处理测试
- [ ] 补文档，明确未来新增 runtime 的接入方式

### 验收标准

- 后续新增 runtime 时，只需要新增一个 adapter 实现并接入 registry
- `AgentHub` 保持业务编排层角色，不再充当 runtime 启动细节层
- runtime 专属代码可以从一个主入口快速定位，而不是散落在 `AgentHub` 多处

## 开发顺序

建议顺序：

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4

这样可以先稳定最高频的 chat/task 主路径，再把 workflow 和 test 迁入统一抽象。

## 验证计划

- `npm run typecheck`
- 定向 vitest：
  - `src/main/agent-hub.test.ts`
  - `src/main/agents/claude-runner.test.ts`
  - `src/main/agents/codex-rpc.test.ts`
  - 新增适配层测试，例如 `src/main/runtime-adapter.test.ts`

仓库现状说明：

- 这次重构之外的既有失败项，需要和适配层改动分开看待，不应混为一组回归。
