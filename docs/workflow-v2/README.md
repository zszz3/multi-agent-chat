# Workflow V2 文档索引

本目录用于承载 `Workflow V2` 的配套设计文档。

约定：

- 本目录只放稳定设计说明
- 一个模块一个文件
- 每个文件控制在可单次阅读的体量内

文档层级：

- 本目录：稳定设计说明，解释系统为什么这样设计
- `superpowers/specs/workflow/`：现行规范、不可变约束和完成证据
- `superpowers/plans/workflow/`：实施顺序、任务清单和验证命令
- 2026-06-17 的 Workflow Settings Cleanup plan/spec：V2 之前的 renderer UI 历史，不定义 V2 运行语义

当前模块：

1. [概览与边界](overview-and-boundaries.md)
2. [角色与模型路由](roles-and-routing.md)
3. [图模型与节点](graph-and-nodes.md)
4. [模板系统](templates.md)
5. [验证与审查](validation-and-review.md)
6. [数据面、控制面与 Leader](data-control-and-leader.md)
7. [钩子系统](hooks.md)
8. [执行、并行与人工介入](execution-and-intervention.md)
9. [上下文与成本控制](context-and-cost.md)
10. [存储与恢复](storage-and-recovery.md)
11. [MVP 范围](mvp-scope.md)
12. [Phase 07–14 演进路线图](evolution-roadmap.md)
13. [演进实施 Agent 指南](evolution-execution-guide.md)
14. [演进契约注册表](evolution-contract-registry.md)
15. [演进需求追踪矩阵](evolution-requirement-matrix.md)

## 已完成基础程序：Phase 01–06

如果要理解已经实现的基础契约，按以下顺序阅读：

1. [Workflow V2 实施总纲 spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-implementation-program.md)
2. [Phase 01: Authoring Contract](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-01-authoring-contract.md)
3. [Phase 02: Planning And Routing Contract](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md)
4. [Phase 03: Execution Runtime And Dataflow](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md)
5. [Phase 04: Review And Human Intervention](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md)
6. [Phase 05: Persistence, Cache, And Recovery](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md)
7. [Phase 06: Hooks And Extension Surface](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md)

对应的已完成执行计划：

1. [Workflow V2 实施总计划](../superpowers/plans/workflow/2026-07-10-workflow-v2-implementation-program.md)
2. [Phase 01 Plan: Authoring Contract](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-01-authoring-contract.md)
3. [Phase 02 Plan: Planning And Routing Contract](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md)
4. [Phase 03 Plan: Execution Runtime And Dataflow](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md)
5. [Phase 04 Plan: Review And Human Intervention](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md)
6. [Phase 05 Plan: Persistence, Cache, And Recovery](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md)
7. [Phase 06 Plan: Hooks And Extension Surface](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md)

## 提议演进程序：Phase 07–14

实施新优化时从总纲开始，严格按顺序推进：

1. [演进总纲 spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-evolution-program.md)
2. [Phase 07: Runtime Service Boundaries](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md)
3. [Phase 08: Execution Capabilities And Script Sandbox](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md)
4. [Phase 09: Event-Driven Scheduling And Global Locks](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md)
5. [Phase 10: Model Routing, Budget Ledger, And Context](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md)
6. [Phase 11: Revision And Replan Lifecycle](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md)
7. [Phase 12: Storage Migration And Crash Consistency](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md)
8. [Phase 13: Hook Safety, Idempotency, And Memory](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md)
9. [Phase 14: Observability, Simulation, And Workflow UX](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md)

对应执行计划：

1. [演进总计划](../superpowers/plans/workflow/2026-07-10-workflow-v2-evolution-program.md)
2. [Phase 07 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md)
3. [Phase 08 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md)
4. [Phase 09 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md)
5. [Phase 10 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md)
6. [Phase 11 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md)
7. [Phase 12 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md)
8. [Phase 13 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md)
9. [Phase 14 Plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md)

Phase 07–14 当前是提议状态，计划中的未勾选项表示尚未实现，不影响 Phase 01–06 的完成结论。
