# Workflow Runtime 设计

本文件描述 workflow 执行的运行时模型。执行器已从 renderer 搬到 main process
（`src/main/workflows/workflow-runtime.ts`）；本设计在此基础上加入 node 级状态机、事件日志
和结构化的节点间交接。

## 主进程职责

- `WorkflowStore`（`src/main/workflow-store.ts`）持有 Workflow 草稿、Workflow Run
  和当前选择，并负责同步状态转换、revision、校验及运行状态镜像。
- `WorkflowRuntime`（`src/main/workflow-runtime.ts`）负责 DAG 调度、Task 执行、
  Judge、Gate、暂停和恢复，不直接拥有持久 Workflow 集合。
- `AgentHub` 保留 IPC/MCP 兼容入口和异步 Agent 协调，将 Workflow 状态操作委托给
  `WorkflowStore`，并继续生成应用级 `AppSnapshot`。

## 目标与非目标

设计目标：

- 用户零负担：界面上仍然只有一张图 + 每个 node 的「开始/暂停」。goal / status /
  event / artifact 全部是 runtime 内部概念，用户不填、不管。
- node 级控制：可以对单个 node 暂停、开始，暂停后不触发下游。
- 状态可靠可回溯：状态变化通过 append-only 事件日志记录，当前状态由日志投影得到。
- 节点间交接不丢信息：下游拿到的是上游的 artifact 引用，不是一段口述摘要。

明确的非目标（本期不做）：

- 独立的 Goal 实体 / 跨 run 复用 / acceptanceCriteria 管理界面。goal 只是 run 上的
  一段文本（复用 `WorkflowV2Definition.objective`）。
- 跨进程崩溃恢复。约定：Electron app 退出即中断 run。
- Codex/Claude 会话真续跑。第一版 resume = 重跑该 node；真续跑（Codex
  `turn/interrupt` + `thread/resume`）作为后续增强。
- 人工审批 gate / inbox。后续再做。

## 参考

- Addy Osmani, Loop Engineering：loop = 分配工作 / 检查结果 / 记录状态 / 决定下一步。
- Claude Dynamic Workflows：控制流在 runtime，不在对话；中间结果存 runtime/文件。
- Ralph Loop：每轮 fresh context，只喂 spec + 任务 + 进度，不靠历史对话。
- LoopX：append-only event history + evidence/artifact ref，不用 prose summary 做交接。
- Inngest durable execution：事件日志为 source of truth，当前状态是投影。

## 数据模型

复用现有类型（`src/shared/types.ts`），只做增量：

- `WorkflowV2Definition.objective` 即 run 的目标文本。补一个可选的完成判断字段
  （done criteria），由生成 workflow 的 agent 顺带产出，用户不手填。
- `WorkflowRunProgressItem` 升级为节点运行态投影（已有 `paused` 状态值）：
  - `status: blocked | ready | running | paused | judging | completed | failed`
  - `taskId?`、`attempt`、`artifactRefs: WorkflowArtifactReference[]`、`summary?`
- `WorkflowRunState` 增加 `events: WorkflowEvent[]`（append-only，source of truth）。
  `progress` 变成从 `events` 投影出来的结果，UI 只读 `progress`。

事件类型（草案）：

```
WorkflowEvent =
  | { type: "node_ready";     nodeId; at }
  | { type: "node_started";   nodeId; taskId; attempt; at }
  | { type: "node_paused";    nodeId; at }
  | { type: "node_output";    nodeId; artifactRefs; summary; at }
  | { type: "node_judged";    nodeId; pass; reason; at }
  | { type: "node_failed";    nodeId; error; at }
  | { type: "node_completed"; nodeId; at }
```

## 调度规则

runtime 自动推进，默认体验与现在一致（全自动）：

1. 一个 node 的全部上游 `completed` → 从 `blocked` 变 `ready` → 自动启动。
2. 用户暂停一个 `running`/`judging` 的 node → 停掉其 task → `paused`，且不触发下游。
3. 用户对 `paused`/`failed` 的 node 点开始 → 重跑该 node（第一版）→ 通过 judge 后
   下游继续。

暂停/开始只是「插手单个 node」的入口，不改变默认自动流。

## 给每个 agent 的上下文

每个 node 启动时 runtime 自动拼装，agent 不读整个聊天：

```
# 总目标        ← WorkflowV2Definition.objective (+ done criteria)
# 你的任务       ← 当前 node 的 prompt
# 上游产出       ← 上游 node 的 artifactRefs（主）+ summary（辅）
# 输出要求       ← 产出放哪 / 是否结构化 / 遗留问题
```

交接主通道是 artifact 引用（文件路径 / 结构化文本 / URL），summary 只是给人看的辅助，
不作为下游 agent 的唯一输入。

## 实现状态

1. ✅ 类型：`WorkflowEvent`、`WorkflowRunState.events`（`WorkflowRunProgressItem`
   本就有 `paused`）。
2. ✅ 投影函数 `projectNodeStates(events, declaredNodes, extraNodes)`：纯函数，
   有单测（`src/shared/workflow-run.test.ts`）。
3. ◐ runtime 在每个 node 状态转换处 append 事件并持久化（append-only 审计日志，
   resume 时从 `run.events` 续读）。当前 `progress` 仍由执行流直接维护，并有测试断言
   `projectNodeStates(run.events)` 的状态与 `run.progress` 完全一致。把 `progress`
   完全改为投影派生（去掉直接维护）是并发调度器的进一步重构，作为后续项，避免动摇
   已测试通过的 pause/retry 逻辑。
4. ✅ node 级 `pauseWorkflowNode` / `startWorkflowNode`：runtime + AgentHub + IPC
   (`workflow-run:pause-node` / `:start-node`) + preload + WorkflowPage 按钮。
5. ✅ artifact-ref 交接：`extractWorkflowArtifactRefs` 解析 node 产出的文件路径/URL，
   下游 prompt 增加「Upstream artifact references」段落，`node_output` 事件携带
   `artifactRefs`。有单测。
6. ✅ UI：每个 run-progress row 上按状态显示开始/暂停按钮（final-review 节点除外）。

## 人工 Gate（已实现）

节点在无法安全独立决策时，可输出 `workflowGate.ask("<问题>")` 并停下。runtime 会：

- 解析 gate 请求（`parseWorkflowGateRequest`），把节点置为 `awaiting_input`，记录
  `gate_opened` 事件（带 question），**不评估、不触发下游、不做 final review**，run
  仍保持 `running`。
- 用户在 WorkflowPage 的该节点行输入决定并提交 → `answerWorkflowGate`（IPC
  `workflow-run:answer-gate`）→ 记录 `gate_answered`，把「## Human decision」写入
  run 的 context document，重跑该节点继续下游。

这对齐 LoopX 的 User Gate：需要人判断的决定显式留存在事件日志与 context 里，而不是
消失在对话中。参考：https://github.com/huangruiteng/loopx

后续增强（不在本期）：把 progress 完全改为投影派生、Codex 真续跑、
per-node 预算/超时/隔离（quota）、多 agent claim/ownership。
