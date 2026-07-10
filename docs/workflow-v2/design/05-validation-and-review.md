# Workflow V2 验证与审查

> 文档类型：解释性设计说明。用于理解概念和设计背景；行为约束和完成状态以 [Foundation specs](../../superpowers/specs/workflow/foundation/README.md) 为准。

## 验证分层

每个节点的完成验证取决于其执行模型，但总体原则一致：先机械校验，再语义审查。

### 机械校验

优先做不消耗 LLM 的检查：

- 结构化输出是否存在
- 必填字段是否齐全
- 基础约束是否满足
- 脚本是否正常退出
- 脚本输出是否是合法 JSON

### 语义审查

只有机械校验通过后，才进入语义质量判断。

适合 LLM 审查的内容：

- 内容质量
- 逻辑正确性
- 是否符合语义要求
- 是否满足设计目标

## LLM 节点验证流水线

```text
Agent 输出
  -> 解析结构化提交
  -> outputFields 完整性校验
  -> constraints 硬校验
  -> judgeDimensions 评估
  -> 通过 / 重试 / 失败 / ask_human
```

设计含义：

- 先用规则挡掉低级错误
- 再用 LLM 做高成本语义判断
- 必须项失败可重试
- 可选项失败可以仅告警

## Script 节点验证流水线

```text
脚本执行
  -> exitCode 检查
  -> stdout 解析
  -> outputFields 完整性校验
  -> 通过 / 失败 / ask_human
```

script 节点不需要 `judgeDimensions`，因为它更适合可直接规则验证的确定性任务。

## 独立 reviewer

对于重要节点，推荐使用独立 reviewer，而不是让当前节点自评通过。

推荐闭环：

`executor -> fast 自检/测试 -> reviewer -> accept/reject/escalate`

## ReviewVerdict

reviewer 不应只返回一段自由文本，建议输出结构化 verdict：

```typescript
interface ReviewVerdict {
  decision: "accept" | "reject" | "escalate";
  reasons: string[];
  requiredFixes?: string[];
  riskLevel: "low" | "medium" | "high";
  evidence?: string[];
  confidence: "high" | "medium" | "low";
}
```

运行时建议：

- `accept`：进入下游
- `reject`：带 `requiredFixes` 重新排队执行
- `escalate`：暂停并交给 orchestrator 或人工

## 最小状态机

review 相关状态至少需要能表达：

```text
pending -> ready -> running -> validating -> awaiting_review -> completed
running -> failed / paused
validating -> running / failed / paused
awaiting_review -> completed / ready / paused
```

其中：

- `awaiting_review` 是运行状态，不是边语义
- `paused` 是统一的人机介入状态
