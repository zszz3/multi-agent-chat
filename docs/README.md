# 文档索引

`docs/` 保存解释性设计、权威规格、可复现实施计划、候选研究和 Agent 接入资料。每类文档必须进入自己的目录，不能在同一层混写“当前行为”和“未来方案”。

## 开发入口

- [不同 Agent 接入指南](agent-integration-guide.md)：新增 CLI、ACP、SDK 或 API Agent 时的实现路径与验收清单
- [Workflow V2 文档入口](workflow-v2/README.md)：先按 design、spec、plan、program、proposal 和 history 选择正确入口
- [Workflow V2 演进路线图](workflow-v2/program/01-evolution-roadmap.md)：Phase 07–14 的优化顺序、依赖和最终目标
- [Workflow V2 生成策略调研](workflow-v2/proposals/01-generation-strategies-and-industry-practice.md)：静态 DAG、HTN、滚动规划、动态展开和多 Agent 生成方案
- [权威规格](superpowers/specs/README.md)：Runtime 与 Workflow 的行为合同
- [实施计划](superpowers/plans/README.md)：分阶段任务、验证和完成记录

## 已接入 Agent 资料

- [Hermes](hermes/README.md)
- [OpenCode](opencode/README.md)
- [OpenClaw](openclaw/README.md)

这些资料记录上游官方能力与本项目的适配结果。具体实现以当前代码和 specs 为准。

## 其他候选方案

- [Runtime 控制面网关拆分方案](zh-CN/topics/runtime-control-gateway-proposal.md)

候选方案不代表已经实现；决定落地后必须转成 spec 和 plan，或保留明确的否决结论。
