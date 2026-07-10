# Workflow V2 图模型与节点

> 文档类型：解释性设计说明。用于理解概念和设计背景；行为约束和完成状态以 [Foundation specs](../../superpowers/specs/workflow/foundation/README.md) 为准。

## 图模型

Workflow 由节点和边组成。

### 边

边只表达依赖关系：

- 下游节点依赖上游节点完成
- 上游节点的产出对下游可见

下面这些语义不放在边上：

- 审查
- 打回
- 条件分支
- 汇聚策略
- 控制指令

这些复杂语义由节点角色和运行时策略承担。

最小边结构：

```typescript
interface WorkflowGraphEdge {
  fromNodeId: string;
  toNodeId: string;
}
```

### 节点

节点是最小执行单元。每个节点至少需要表达：

- 做什么
- 怎么执行
- 产出什么
- 如何验证

基础层建议：

```typescript
interface BaseNode {
  id: string;
  kind: string;
  title: string;
  execModel: string;
  role?: "orchestrator" | "executor" | "reviewer";
  outputFields: OutputFieldDef[];
  hooks?: {
    beforeExecute?: HookAction[];
    afterOutput?: HookAction[];
    afterComplete?: HookAction[];
  };
  resourceLocks?: string[];
}
```

## LLM 节点

```typescript
interface LLMNode extends BaseNode {
  execModel: "llm";
  modelProfile?: "fast" | "balanced" | "expert";
  prompt: string;
  judgeDimensions: JudgeDimensionDef[];
  constraints?: ConstraintDef[];
  maxRetry?: number;
  onExhausted?: "fail" | "skip" | "ask_human";
  requiredTools?: string[];
  contextBudget?: ContextBudget;
}
```

适用场景：

- 搜索与信息收集
- 自然语言分析
- 代码实现与解释
- 审查和裁决

## Script 节点

```typescript
interface ScriptNode extends BaseNode {
  execModel: "script";
  script: {
    language: "python" | "typescript" | "bash";
    code: string;
    input?: string;
    timeoutMs?: number;
  };
  sandboxMode: "sandbox" | "workspace" | "full";
  expectedExitCode?: number;
  onError?: "fail" | "skip" | "ask_human";
}
```

适用场景：

- 纯数学计算
- 数据聚合
- JSON / CSV / 文本格式转换
- 简单文件处理

不适合：

- 需要外部搜索
- 需要复杂语义判断
- 需要自然语言解释为主的任务

## 沙箱模式

| 模式 | 文件系统 | 网络 | 用途 |
|------|---------|------|------|
| `sandbox` | 无 | 无 | 纯数据计算、格式转换 |
| `workspace` | workflow 工作目录 | 无 | 读写项目文件 |
| `full` | 完整系统 | 有 | 部署、数据库操作（需人工确认） |

## WorkflowDefinition 草案

为了让图能直接落盘和传输，建议统一定义：

```typescript
type WorkflowNode = LLMNode | ScriptNode;

interface WorkflowDefinition {
  workflowId: string;
  graphVersion: number;
  objective: string;
  nodes: WorkflowNode[];
  edges: WorkflowGraphEdge[];
}
```

当前约束：

- `workflowId` 生命周期内稳定
- `graphVersion` 只在计划完成或显式修订时递增
- `nodes.id` 必须唯一
- `edges` 不承担额外调度语义
