# Workflow V2 存储与恢复

## 存储方式

MVP 优先使用文件系统，而不是 SQLite。

原因：

- workflow 状态数据量较小
- 更容易调试
- 工作目录与状态天然内聚
- 删除和清理更直接

## 目录结构建议

```text
~/.multi-agent-chat/
  ├── node-types/
  └── workflows/
      └── <workflow-id>/
          ├── state.json
          ├── runs/
          │   └── <run-id>/
          │       ├── state.json
          │       ├── events.jsonl
          │       └── cache/
          ├── node-types/
          ├── memory.md
          └── outputs/
```

## 原子写入

状态文件建议使用 `write temp -> rename` 的方式写入，避免中途中断造成损坏。

## 恢复粒度

每个节点是独立恢复单元：

- 失败节点及其下游重新执行
- 已完成节点尽量复用缓存
- 被软超时监督中断的节点优先从最近 checkpoint 创建新 attempt

运行状态应持久化最近一次结构化进度报告、checkpoint 引用、已使用续租次数和上次停止原因。checkpoint 是恢复输入，不是完成结果；恢复后仍需提交最终结果包并通过验证与审查。

## 恢复流程

```text
1. 加载并校验 run state 与节点控制状态；事件日志保留为审计源
2. 按目标图版本和缓存指纹逐节点决定 `reuse / resume / rerun`
3. 将可复用输出物化为已完成节点，保持对下游的数据供给
4. 将 checkpoint 节点恢复为可运行状态并创建新 attempt
5. 若保存了 runtime conversation，则以 `resume-required` 续接原会话
6. 重新执行受影响节点及其下游，并继续增量持久化 checkpoint
```

恢复入口只接受非活跃且可恢复的 run。持久化状态的 workflow/run 身份必须与请求一致；已完成节点不会因为单个下游节点中断而被重新执行。

AgentHub 启动时会用 durable run state 对账公开状态：durable `completed` 修复为公开完成；durable `running` 或 `paused` 映射为 `stopped`，同时保留已完成输出、暂停原因和介入事件，供用户从具体节点继续。对账结果会立即回写公开存储，避免下一次启动再次看到过期的 `running` 状态。

## 缓存复用原则

缓存只有在这些关键因素都未变化时才可信：

- 节点定义
- 上游输入
- 模型档位
- 工具能力
- 执行环境
- 审查策略

## Cache Fingerprint

推荐缓存指纹至少包含：

```typescript
interface NodeCacheFingerprint {
  nodeDefinitionHash: string;
  upstreamOutputHash: string;
  modelProfile: string;
  role?: string;
  requiredToolsHash?: string;
  executionEnvHash?: string;
  reviewerPolicyHash?: string;
  templateVersion?: string;
}
```

## 与 graphVersion 的关系

- 同一 `graphVersion` 下按缓存指纹判断是否命中
- `graphVersion` 变化后，默认重新评估未完成节点
- 已完成节点只有在新版本下指纹仍相同，才允许复用
