# Workflow V2 执行、并行与人工介入

## 计划与执行分离

一次 run 分成两个阶段：

1. 计划阶段：生成图、角色分工、预算和验收标准
2. 执行阶段：按既定图运行、验证、审查、重试或暂停

默认进入执行阶段后图应视为冻结。若中途需要改图，应走显式修订，而不是运行时自由漂移。

## GraphRevision

执行中如果确实要改图，建议用显式修订对象：

```typescript
interface GraphRevision {
  revisionId: string;
  basedOnGraphVersion: number;
  reason: string;
  changesSummary: string[];
  approvedBy: "orchestrator" | "human";
}
```

最小流程：

```text
执行中发现问题
  -> orchestrator 生成 revision 提案
  -> 校验 basedOnGraphVersion
  -> 写入新 graphVersion
  -> 未完成节点切换到新版本继续执行
```

## 并行策略

并行按拓扑层级进行：

```text
Level 0: [start]
Level 1: [Leader]
Level 2: [W1] [W2]
Level 3: [W3] [W4] [W5]
Level 4: [end]
```

规则：

- 无依赖冲突的节点可以并行
- 同层级节点受全局并发上限约束
- 共享高风险资源的节点通过 `resourceLocks` 互斥

示意：

```json
{ "resourceLocks": ["database:production", "remote:deploy-server"] }
```

## 人工介入

系统必须允许在关键节点暂停，并由人工决定：

- 是否继续
- 是否跳过
- 是否改计划
- 是否升级模型
- 是否提高审查强度

统一的人机介入状态应为 `paused`，避免不同机制各自发明半暂停状态。

产品使用统一的 `ResolveWorkflowV2InterventionRequest`，从页面、preload、IPC 到 durable runtime 只维护一套 action union：

```typescript
type WorkflowV2InterventionAction =
  | "continue"
  | "skip"
  | "escalate"
  | "replan"
  | "increase_review_strength";
```

动作语义：

- `continue`：优先续接已保存的 checkpoint 与 runtime conversation
- `skip`：写入显式 skipped output，让下游知道上游被人工跳过，而不是伪装成缺失输出
- `escalate`：以 `expert` model profile 重跑，并强制独立语义审查
- `increase_review_strength`：保留原执行 profile，但强制独立语义审查
- `replan`：保持当前 run 为 `stopped`，记录需要新 graph revision；不得原地修改冻结计划

介入决定先追加 durable event 并写入 node control state，再恢复执行。页面直接根据持久化 intervention 的 `allowedActions` 渲染按钮，避免 UI 与 runtime 支持范围漂移。

## 租约式执行与超时监督

节点不能只依赖一个固定超时被动等待。每次节点尝试都持有一个有界执行租约，并同时受三类时间边界约束：

- `inactivityTimeoutMs`：长时间没有 heartbeat、消息或工具活动
- `softTimeoutMs`：触发进度探测，但不立即终止任务
- `hardTimeoutMs`：不可突破的最终执行上限

软超时后的控制流必须是：

```text
running
  -> lease_expiring
  -> orchestrator 请求结构化进度报告
  -> continue / retry / escalate / pause / cancel
  -> hard timeout 仍未响应时强制终止
```

普通图上游节点不能执行超时控制。进度探测、续租和中断属于 scheduler、leader 或 orchestrator 的控制面职责。

### WorkflowProgressReport

进度报告必须是结构化数据，不能只依赖自由文本或主观百分比：

```typescript
interface WorkflowProgressReport {
  nodeId: string;
  attempt: number;
  phase: string;
  completedItems: string[];
  remainingItems: string[];
  blockers: string[];
  evidence: string[];
  checkpoint?: string;
  estimatedRemainingMs?: number;
  safeToInterrupt: boolean;
  requestedAction: "continue" | "need_input" | "escalate";
}
```

进度报告只用于决定运行导航，不能代替最终 `WorkerOutput`，也不能直接把节点标记为 `completed`。

### SupervisorDecision

orchestrator 必须输出结构化决策：

```typescript
type SupervisorDecision =
  | { action: "continue"; extensionMs: number; reason: string }
  | { action: "retry"; fromCheckpoint?: string; reason: string }
  | { action: "escalate"; modelProfile: "expert"; reason: string }
  | { action: "pause"; question: string; reason: string }
  | { action: "cancel"; reason: string };
```

续租次数、单次续租时长和总 wall-clock budget 都必须有硬上限。没有新证据、重复相同进度或探测无响应时，不应继续无限续租。

真正中断前应优先请求 checkpoint。只有底层 runtime 支持 steering 时，才向同一运行会话发送进度探测；不支持时必须保存可恢复上下文，再停止旧 task 并创建新 attempt。
