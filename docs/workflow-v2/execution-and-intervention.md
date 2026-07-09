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
