# Workflow V2 文档入口

本目录只负责解释文档分层和阅读入口，不在根目录混放具体方案。

## 先判断你要找什么

| 目的 | 入口 | 权威性 |
| --- | --- | --- |
| 理解 Workflow V2 的概念、模块和设计背景 | [解释性设计说明](design/README.md) | 非规范；不能据此判断实现状态 |
| 查已经实现的 Phase 01–06 行为合同 | [Foundation specs](../superpowers/specs/workflow/foundation/README.md) | 权威、已实现并验证 |
| 查 Phase 07–14 的目标行为 | [Evolution specs](../superpowers/specs/workflow/evolution/README.md) | 权威提案；已有局部基础，但尚未完整闭环 |
| 执行某个阶段的开发任务 | [Workflow plans](../superpowers/plans/workflow/README.md) | 任务顺序；行为仍以 spec 为准 |
| 理解 Phase 07–14 的治理、依赖和验收 | [演进程序材料](program/README.md) | program 辅助材料，不替代 spec |
| 对照当前代码查看尚未闭环的能力 | [当前实现差距清单](program/05-current-implementation-gap-checklist.md) | 当前工作树审计；不替代 spec |
| 阅读尚未批准的备选架构和行业调研 | [候选方案与研究](proposals/README.md) | 非规范、不可据此声称已实现 |
| 查旧 UI 项目的来历 | [历史 specs](../superpowers/specs/workflow/history/README.md) | 仅追溯，不作为新实现入口 |

## 目录结构

```text
docs/workflow-v2/
  design/       概念、模块和设计理由的解释性材料
  program/      演进程序的路线、实施指南、契约登记和验收矩阵
  proposals/    未批准、未实现的候选方案和外部调研

docs/superpowers/specs/workflow/
  foundation/   已实现并验证的 Phase 01–06 权威合同
  evolution/    Proposed 的 Phase 07–14 权威合同，当前仅有局部基础
  history/      仅供追溯的旧项目合同

docs/superpowers/plans/workflow/
  foundation/   已完成 Phase 01–06 的执行记录
  evolution/    尚未完整执行的 Phase 07–14 任务计划
  history/      旧项目执行记录
```

## 权威顺序

同一问题出现不一致时，按以下顺序处理：

1. 仓库指令和当前代码事实。
2. 对应 program spec 和 phase spec。
3. 对应 phase plan。
4. `design/` 的解释性说明。
5. `program/` 的辅助材料。
6. `proposals/` 和 `history/`。

发现冲突时应修改低权威文档，不能为了兼容旧说明改变已批准合同。

## 新文档归档规则

- 描述已批准行为约束：进入 `specs/workflow/<status>/`。
- 描述实现步骤和验证命令：进入 `plans/workflow/<status>/`。
- 解释概念、模块或设计理由：进入 `workflow-v2/design/`。
- 维护一个 program 的依赖、交接和验收材料：进入 `workflow-v2/program/`。
- 仍在比较、调研或等待批准的方案：进入 `workflow-v2/proposals/`。
- 不得在 design 文档中夹带未标注的未来行为，也不得把 proposal 写成已经实现。
