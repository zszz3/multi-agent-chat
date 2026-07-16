# Workflow V2 数据面、控制面与 Leader

> 文档类型：解释性设计说明。用于理解概念和设计背景；行为约束和完成状态以 [Foundation specs](../../superpowers/specs/workflow/foundation/README.md) 为准。

## 数据面与控制面分离

核心原则：

```text
数据面（Worker ↔ Worker）：自由传递，纯信息，只读
控制面（Leader → Worker）：单向，只有 Leader 能改行为
```

## Worker 产出

Worker 产出应分成两部分：

```typescript
interface WorkerOutput {
  data: Record<string, unknown>;
  proposals?: WorkForwardProposal[];
}

interface WorkForwardProposal {
  suggestion: string;
  targetHint?: string;
  suggestedPrompt?: string;
  suggestedParams?: Record<string, unknown>;
  reason: string;
  confidence: "high" | "medium" | "low";
}
```

含义：

- `data` 给下游 Worker 使用
- `proposals` 给 Leader 裁决
- Worker 自己不能直接改其他节点行为

## 下游上下文组装

建议结构：

```text
## Leader 导航
重点关注：...
可以跳过：...
Leader 决策：...

## 上游完整数据
{{upstreamContext}}

## 任务指令
(Manager 写的 prompt)
```

## 为什么采用“数据直传 + Leader 导航”

相较于“所有数据先经过 Leader 再分发”，当前方案的好处是：

- 保留原始信息，不易丢失
- 无额外摘要延迟
- 成本更低
- Leader 导航出错时，下游仍能看到全文

## Leader 的职责

Leader 是图中显式存在的协调节点，不是隐形逻辑。它负责：

- 裁决 proposal
- 生成导航层
- 做进度评估
- 决定是否升级、暂停或修订

## Leader 节点示意

```json
{
  "id": "leader",
  "kind": "leader",
  "title": "工作流总指挥",
  "execModel": "llm",
  "role": "orchestrator",
  "outputFields": [
    { "key": "decisions", "required": true },
    { "key": "navigation", "required": true }
  ]
}
```

## 图中展示

- 实线：数据边
- 虚线：控制覆盖层

这里的“控制覆盖层”只是 UI 展示，不代表额外边类型。
