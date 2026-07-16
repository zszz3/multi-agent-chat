# Workflow V2 解释性设计说明

本目录解释 Workflow V2 的概念、模块和设计理由。部分文档保留了早期“建议/草案”措辞，因此它们只帮助理解背景，不替代权威 spec，也不能单独证明某项能力已经实现。

按顺序阅读：

1. [概览与边界](01-overview-and-boundaries.md)
2. [角色与模型路由](02-roles-and-routing.md)
3. [图模型与节点](03-graph-and-nodes.md)
4. [模板系统](04-templates.md)
5. [验证与审查](05-validation-and-review.md)
6. [数据面、控制面与 Leader](06-data-control-and-leader.md)
7. [钩子系统](07-hooks.md)
8. [执行、并行与人工介入](08-execution-and-intervention.md)
9. [上下文与成本控制](09-context-and-cost.md)
10. [存储与恢复](10-storage-and-recovery.md)
11. [MVP 范围](11-mvp-scope.md)

维护规则：

- 只解释概念、模块边界和设计理由；实现状态必须链接到 spec 或代码证据。
- 未来方案移入 `../proposals/`，演进治理材料移入 `../program/`。
- 行为、状态机、权限或持久化语义冲突时，以对应 spec 为准并同步修正文档。
