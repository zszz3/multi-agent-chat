# Workflow Plans

本目录存放 `workflow` 模块的实施计划文档。

约定：

- 总计划只负责说明实施顺序、模块边界、集成原则
- 具体执行拆到独立 phase plan
- 一个 phase 一份文件，避免单文档过大
- 实施时严格按 phase 顺序推进，不跳阶段吸收后置能力
- 已完成的历史计划单独归档说明，不与当前 Workflow V2 phase plan 混用
- plan 记录执行顺序与验证结果；行为契约以对应 spec 为准

## 推荐阅读顺序

1. `2026-07-10-workflow-v2-implementation-program.md`
2. `2026-07-10-workflow-v2-phase-01-authoring-contract.md`
3. `2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md`
4. `2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md`
5. `2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md`
6. `2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md`
7. `2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md`

## 当前 Workflow V2 计划

- `2026-07-10-workflow-v2-implementation-program.md`
- `2026-07-10-workflow-v2-phase-01-authoring-contract.md`
- `2026-07-10-workflow-v2-phase-02-planning-and-routing-contract.md`
- `2026-07-10-workflow-v2-phase-03-execution-runtime-and-dataflow.md`
- `2026-07-10-workflow-v2-phase-04-review-and-human-intervention.md`
- `2026-07-10-workflow-v2-phase-05-persistence-cache-and-recovery.md`
- `2026-07-10-workflow-v2-phase-06-hooks-and-extension-surface.md`

## 历史已完成计划

- [`2026-06-17-workflow-settings-cleanup.md`](2026-06-17-workflow-settings-cleanup.md)：renderer 层的 Workflow UI 清理，不属于 Workflow V2 执行架构。原来的通用 Settings 页面已被后续 Runtime/Agent 导航拆分取代，其余关键行为仍保留。

“历史已完成”表示该计划用于追溯，不应重新作为当前实现入口。新的 Workflow V2 改动从总计划和对应 phase plan 继续推进。
