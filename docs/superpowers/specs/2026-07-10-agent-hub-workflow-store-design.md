# AgentHub Workflow 状态拆分设计

## 目标

把 Workflow 草稿、Workflow Run 和当前选中 Workflow 的状态所有权从 `AgentHub` 迁移到独立的 `WorkflowStore`，同时保持所有 IPC、MCP、Renderer 和持久化格式不变。

这是拆分 `AgentHub` 的第一阶段。Agent 对话执行、Task 执行和 `WorkflowRuntime` 调度暂时仍由 `AgentHub` 协调。

## 方案比较

### 方案一：先拆持久化

可以减少 `AgentHub` 的序列化代码，但聊天、任务和 Workflow 状态仍互相暴露，无法建立清晰的 Workflow 所有权。

### 方案二：Workflow 兼容外壳（采用）

新增 `WorkflowStore`，让它持有 workflows、runs 和 activeWorkflowId，并负责同步状态转换。`AgentHub` 保留现有公开方法，仅负责把调用委托给 Store、触发完整 AppSnapshot，以及协调异步 Agent 执行。

这样可以先获得独立、可测试的 Workflow 状态模块，同时不要求 IPC、MCP 和 Renderer 同步迁移。

### 方案三：一次拆完整 AgentHub

同时拆聊天、任务、Workflow、调度和持久化。最终结构更彻底，但单次改动会跨越绝大多数测试和对外接口，无法可靠定位回归。

## 模块职责

`src/main/workflow-store.ts` 负责：

- Workflow 草稿集合和当前选择。
- Workflow Run 集合。
- 创建、更新、选择、重命名和删除 Workflow。
- 开始、更新和结束 Workflow Run。
- 生成 `WorkflowStoreSnapshot`。
- 从持久化数据恢复已经标准化的 Workflow 和 Run。

`AgentHub` 继续负责：

- 将 Workflow 操作包装成现有 `AppSnapshot` 返回值。
- Workflow Agent 的异步请求和流式事件。
- 调用 `WorkflowRuntime`。
- 配置 Agent、模型和运行时。
- 应用级持久化调度与快照通知。

## 依赖方式

第一阶段由 `AgentHub` 向 `WorkflowStore` 注入以下兼容能力：

- `normalizeDraft`：沿用当前草稿克隆和 Agent/模型标准化规则。
- `now`、`createWorkflowId`、`createRunId`：保证测试可控。
- `onChange`：统一回到 `AgentHub.emit()`。

Store 不依赖 `AgentHub`、Electron、RuntimeRouter 或完整 `AppSnapshot`。

## 数据流

```text
IPC / MCP
  -> AgentHub 兼容方法
  -> WorkflowStore 状态转换
  -> onChange
  -> AgentHub.emit()
  -> AppSnapshot
  -> Renderer
```

异步 Workflow Agent 流程仍在 Hub 中，但读取和写入草稿必须经过 Store，不再访问独立 Map。

## 兼容性

- `AppSnapshot.workflowStore` 的结构和排序不变。
- Workflow ID、Run ID、revision、时间戳和错误文案不变。
- 持久化 JSON 结构不变。
- `AgentHub` 的公开方法不删除或改名。
- 当前测试应无需修改断言，只补充 Store 的独立测试。

## 验收标准

- `AgentHub` 不再声明 `workflows`、`workflowRuns`、`activeWorkflowId` 字段。
- 新 Store 有独立测试覆盖选择、删除、并发 revision 检查和 Run 生命周期。
- AgentHub Workflow、MCP、WorkflowRuntime、持久化测试通过。
- 完整类型检查和完整测试通过。

## 后续阶段

完成状态所有权迁移后，再分别拆分 Workflow Agent 对话协调、Task 执行接口和 Workflow 事件账本。后续阶段不属于本设计的实现范围。
