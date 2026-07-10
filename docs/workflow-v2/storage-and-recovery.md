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
1. 加载 run state 与事件日志
2. 识别已完成节点
3. 识别失败节点
4. 从失败节点层级重新执行
5. 已完成节点优先从 cache 加载
```

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
