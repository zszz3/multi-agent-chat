# Workflow V2 文档索引

本目录用于承载 `Workflow V2` 的配套设计文档。

约定：

- 总纲保留在 [workflow-v2-design.md](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2-design.md)
- 本目录只放细化说明
- 一个模块一个文件
- 每个文件控制在可单次阅读的体量内

当前模块：

1. [概览与边界](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/overview-and-boundaries.md)
2. [角色与模型路由](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/roles-and-routing.md)
3. [图模型与节点](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/graph-and-nodes.md)
4. [模板系统](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/templates.md)
5. [验证与审查](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/validation-and-review.md)
6. [数据面、控制面与 Leader](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/data-control-and-leader.md)
7. [钩子系统](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/hooks.md)
8. [执行、并行与人工介入](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/execution-and-intervention.md)
9. [上下文与成本控制](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/context-and-cost.md)
10. [存储与恢复](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/storage-and-recovery.md)
11. [MVP 范围](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/mvp-scope.md)

如果要从这些设计文档直接进入实施规格，优先看：

1. [Workflow V2 实施总纲 spec](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-implementation-program.md)
2. [Phase 01: Authoring Contract](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-01-authoring-contract.md)
3. [Phase 02: Planning And Routing Contract](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md)
4. [Phase 03: Execution Runtime And Dataflow](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md)
5. [Phase 04: Review And Human Intervention](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md)
6. [Phase 05: Persistence, Cache, And Recovery](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md)
7. [Phase 06: Hooks And Extension Surface](/Users/pengjie.zhai/multi-agent-chat/docs/superpowers/specs/workflow/2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md)
如果后续需要补 schema、状态机、事件协议，建议继续在本目录新增独立文档，而不是回填到总纲。
