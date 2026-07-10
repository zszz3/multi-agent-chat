# Workflow V2 钩子系统

## 作用

钩子用于在节点生命周期的关键阶段插入轻量控制逻辑，而不要求为每个小需求都新增一种节点类型。

钩子不是第二套规划或路由系统。它不能新增边、选择下一个节点、修改冻结计划或生成评审结论。

## 生命周期位置

```text
beforeExecute
  -> 注入受控上下文
  -> Agent / 脚本执行
  -> afterOutput
  -> 机械验证 / 独立语义评审
  -> afterComplete
```

- `beforeExecute`：节点执行前，可暂停、跳过、设置变量或注入上下文。
- `afterOutput`：已捕获原始输出但尚未验证，可执行只读转换、投递或暂停/跳过。
- `afterComplete`：验证与评审通过后、节点提交完成前，仅允许不会撤销完成语义的动作。

## 原语分类

### 流程控制

- `pause`
- `skip`

### 上下文操控

- `injectContext`
- `setVariable`
- `readMemory`
- `writeMemory`

### 输出投递

- `writeFile`

### LLM 能力

- `llmHook`

## llmHook

`llmHook` 允许 Manager 用自然语言描述轻量校验、转换或判断逻辑。

原则：

- 只读、无副作用
- 固定使用 `modelProfile: fast`
- prompt 长度限制为 1–2000 字符
- 在主进程中启动独立 TaskRun，不暴露工具调用能力
- 只能返回有限 JSON，并写入声明的 `outputVariable`
- 可访问经过裁剪的运行上下文、当前节点输出和钩子变量
- 计入工作流的模型调用预算

## 钩子执行原则

- 钩子在主进程顺序执行
- Agent 和脚本进程不感知钩子存在
- 钩子链中的变量可以逐步累积
- 变量必须是有限 JSON，并写入 durable node control，恢复后可以继续使用
- 单次节点累计注入上下文最多 12,000 字符
- `skip` 会产生显式结果 packet，并解除下游依赖
- `pause` 进入统一、可持久化的人工介入边界

## 来源与优先级

同一生命周期内按以下顺序执行：

1. 模板默认钩子（`template`）
2. 节点定义钩子（`node`）
3. 用户追加钩子（`user`）

模板编译会追加用户配置，不会用用户配置整体覆盖模板钩子。每个编译后的动作保留来源，便于追踪。

## 失败策略

每个动作可声明 `failurePolicy`：

- `fail_node`：默认值，动作失败时节点失败
- `pause_run`：动作失败时进入统一人工介入边界
- `skip_hook`：记录该动作被跳过，然后继续后续钩子

流程控制动作自身抛出的 `pause` / `skip` 信号不会被失败策略吞掉。

## 配置与安全边界

- 每种动作只接受其声明的配置字段，未知字段在冻结计划前被拒绝。
- 配置递归拒绝 `edge`、`route`、`nextNodeId`、`targetNodeId`、`graphVersion`、`reviewDecision` 等路由或评审字段。
- 自定义处理器只能返回 `variables`、`injectedContext` 或 `control`，其他字段被拒绝。
- `writeFile` 只接受安全的相对路径，并限制在工作流工作目录内。
- `pause` 和 `skip` 不允许在 `afterComplete` 使用。

## 示例

```ts
hooks: {
  beforeExecute: [
    { kind: "setVariable", config: { key: "scope", value: "workspace" } },
    { kind: "injectContext", config: { fromVariable: "scope" } },
  ],
  afterOutput: [
    {
      kind: "llmHook",
      failurePolicy: "pause_run",
      config: {
        readOnly: true,
        modelProfile: "fast",
        prompt: "提取输出中的风险等级。",
        outputVariable: "risk",
      },
    },
  ],
}
```
