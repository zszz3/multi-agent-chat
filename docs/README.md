# 文档索引

`docs/` 只保留仍可指导实现的设计、规格和 Agent 接入资料。阶段进度、已完成的实施计划、目录快照和重复的架构总览不在这里长期维护。

## 开发入口

- [不同 Agent 接入指南](agent-integration-guide.md)：新增 CLI、ACP、SDK 或 API Agent 时的实现路径与验收清单
- [Workflow V2 设计](workflow-v2/README.md)：产品边界、图模型、执行、恢复和扩展机制
- [设计规格](superpowers/specs/README.md)：Runtime 与 Workflow 的稳定契约

## 已接入 Agent 资料

- [Hermes](hermes/README.md)
- [OpenCode](opencode/README.md)
- [OpenClaw](openclaw/README.md)

这些资料记录上游官方能力与本项目的适配结果。具体实现以当前代码和 specs 为准。

## 设计草案

- [Runtime 控制面网关拆分方案](zh-CN/topics/runtime-control-gateway-proposal.md)

草案不代表已经实现；落地后应转成 spec，或在不再适用时删除。
