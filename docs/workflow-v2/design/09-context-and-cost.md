# Workflow V2 上下文与成本控制

> 文档类型：解释性设计说明。用于理解概念和设计背景；行为约束和完成状态以 [Foundation specs](../../superpowers/specs/workflow/foundation/README.md) 为准。

## 原则

Workflow V2 必须显式控制上下文，而不是依赖 prompt 自觉。

目标不是“尽量少给一点”，而是让不同角色只拿自己需要的信息。

## 上下文分配

- `executor`：只拿完成任务所需的最小上下文
- `orchestrator`：主要看阶段摘要、风险和待决策项
- `reviewer`：主要看目标、结果、证据和风险，不回放全部细节

## 回传策略

系统默认采用“结果包回传”，而不是“完整 transcript 回传”。

收益：

- 主 agent 上下文膨胀更慢
- 低价值执行细节不会污染高层决策
- 成本和稳定性更容易控制

## ContextBudget

建议把上下文压缩正式做成运行时约束：

```typescript
interface ContextBudget {
  maxContextTokens: number;
  maxEvidenceItems?: number;
  maxUpstreamNodes?: number;
  summaryFallbackPolicy?: "truncate" | "summarize" | "ask_human";
}
```

推荐默认策略：

- executor 节点预算更紧
- reviewer 允许更多证据，但仍以结果包为主
- orchestrator 不回灌完整执行细节

## 长日志处理

原始长日志可以保留在事件流或附件中，但不默认进入主上下文窗口。

## 时间预算与执行租约

`maxWallClockMs` 是 run 级硬预算，不应被节点续租绕过。节点级租约需要额外声明：

```typescript
interface ExecutionLeasePolicy {
  inactivityTimeoutMs: number;
  softTimeoutMs: number;
  hardTimeoutMs: number;
  progressProbeTimeoutMs: number;
  maxExtensions: number;
  maxExtensionMs: number;
}
```

约束：

- `softTimeoutMs < hardTimeoutMs`
- progress probe 和 supervisor 决策本身也计入 run 级模型调用与 wall-clock budget
- 每次续租不得超过 `maxExtensionMs`
- 所有续租累计后仍不得突破节点 `hardTimeoutMs` 或 run `maxWallClockMs`
- heartbeat 只能证明任务仍活跃，不能证明任务输出合格
