# Workflow 权威规格入口

本目录只保存行为合同、不可变约束和完成证据。解释性设计、候选方案和实施任务不得混入 spec。

| 分层 | 状态 | 入口 | 用途 |
| --- | --- | --- | --- |
| Foundation | Implemented and verified | [Phase 01–06](foundation/README.md) | 当前已实现的 Workflow V2 基础合同 |
| Evolution | Proposed | [Phase 07–14](evolution/README.md) | 后续演进的权威目标，不代表当前行为 |
| History | Historical | [旧项目](history/README.md) | 追溯旧 UI/产品决策 |

规则：

- 行为是什么、失败如何处理、何时算完成，只在 spec 中定义。
- 实现顺序放在 `../../plans/workflow/`。
- 概念解释放在 `../../../workflow-v2/design/`。
- 尚未批准的研究放在 `../../../workflow-v2/proposals/`。
- spec 状态只能依据代码、测试和可复现完成证据更新。
