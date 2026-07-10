# Workflow V2 角色与模型路由

## 角色分层

Workflow V2 默认采用三层角色：

| 角色 | 默认模型 | 职责 |
|------|----------|------|
| `orchestrator` | expert | Clarify、拆解、编排、设计审查、升级决策、阶段总结 |
| `executor` | fast | 阅读局部上下文、搜索、实现、跑命令、生成初稿 |
| `reviewer` | expert | 独立审查、对抗式找错、放行、打回或升级 |

## 为什么这样分层

- 主 agent 不需要吞下全部执行 transcript，上下文膨胀更慢
- fast model 承担高频执行，可显著降低成本
- reviewer 与 executor 分离，减少“自己实现自己通过”的偏差
- expert model 主要花在抽象、裁决、设计一致性和最终验收上

## 模型分配原则

- `orchestrator` 默认走 expert
- `executor` 默认走 fast
- `reviewer` 默认走 expert

只有在下列场景才升级 executor：

- 跨模块或高影响改动
- 架构判断存在分歧
- 连续失败或反复重试
- 涉及生产资源、权限、发布
- 用户明确要求深度审查

## 结果包回传

为了控制主 agent 上下文，executor 回传给 orchestrator 的应是结果包，而不是完整对话。

推荐最小结构：

```typescript
interface TaskPacket {
  objective: string;
  acceptanceCriteria: string[];
  constraints?: string[];
  touchedPaths?: string[];
  relevantContextDigest: string;
  budget?: {
    maxTurns?: number;
    maxTokens?: number;
  };
}

interface ResultPacket {
  summary: string;
  changedArtifacts?: string[];
  evidence?: string[];
  openQuestions?: string[];
  riskFlags?: string[];
  confidence: "high" | "medium" | "low";
  nextStepSuggestion?: string;
}
```

设计要点：

- `TaskPacket` 只携带完成任务所需的最小上下文
- `ResultPacket` 只保留可复用、可审查、可压缩的信息
- 原始长日志可以保留，但不默认回灌到 orchestrator 上下文

## Reviewer 的独立性

reviewer 的输入应尽量独立于 executor 的主观判断：

- 看目标
- 看约束
- 看变更结果
- 看测试或证据

可以参考 executor 的结论，但不应只复述 executor 的结论。
