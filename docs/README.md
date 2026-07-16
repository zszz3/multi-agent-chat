# Multi Agent Chat 文档

本目录记录当前架构、权威行为规格、实施计划、Runtime 接入资料和候选研究。文档必须明确区分“当前实现”“目标合同”“执行记录”和“尚未批准的方案”。

## 从这里开始

| 需求 | 文档 | 说明 |
| --- | --- | --- |
| 了解项目模块与调用链 | [当前架构概览](architecture-overview.md) | 以当前代码为依据的主进程、Renderer、Runtime、Workflow 和持久化边界 |
| 接入新的 Agent Runtime | [不同 Agent 接入指南](agent-integration-guide.md) | CLI、ACP、SDK 和 API Runtime 的实现路径与验收要求 |
| 理解 Workflow V2 | [Workflow V2 文档入口](workflow-v2/README.md) | 设计、spec、plan、program、proposal 和 history 的分层入口 |
| 查询权威行为合同 | [Superpowers Specs](superpowers/specs/README.md) | 已批准的 Runtime 与 Workflow 行为约束 |
| 执行开发计划 | [Superpowers Plans](superpowers/plans/README.md) | 文件范围、步骤、测试和完成记录 |
| 检查 Workflow 当前缺口 | [实现差距清单](workflow-v2/program/05-current-implementation-gap-checklist.md) | 当前代码审计，不替代 spec |
| 研究 Workflow 生成策略 | [生成策略与行业实践](workflow-v2/proposals/01-generation-strategies-and-industry-practice.md) | 候选研究，不代表已经实现 |

## Runtime 接入资料

- [Hermes](hermes/README.md)
- [OpenCode](opencode/README.md)
- [OpenClaw](openclaw/README.md)

这些目录记录上游能力证据、适配边界和本项目实现结果。Runtime 的最终能力以 `src/shared/runtime-catalog.ts`、对应 driver、测试和当前 spec 为准。

## Workflow 文档分层

```text
docs/workflow-v2/
  design/       概念、模块和设计理由
  program/      路线、契约登记、验收矩阵和当前差距
  proposals/    未批准方案与外部研究

docs/superpowers/specs/workflow/
  foundation/   已实现的基础合同
  evolution/    尚未完整闭环的演进目标
  history/      仅供追溯的旧合同

docs/superpowers/plans/workflow/
  foundation/   已完成的执行记录
  evolution/    尚待完成的实施计划
  history/      旧项目执行记录
```

同一问题出现冲突时，按以下顺序判断：

1. 当前代码、测试和仓库指令。
2. 对应的权威 spec。
3. 对应的 plan 与完成证据。
4. 架构或 design 解释。
5. program 辅助材料。
6. proposal 与 history。

## 文档维护规则

- 根 `README.md` 只保留产品定位、当前能力、快速开始和主要导航。
- 当前模块边界与数据流写入 `architecture-overview.md`。
- 新增 Runtime 时同步 Runtime catalog、接入指南和对应 Runtime 资料。
- 已批准行为变更先更新 spec，再更新实现计划和代码。
- 实现完成后必须同步状态、测试证据和差距清单。
- Proposal 不得写成已实现能力；历史文档不得作为当前开发入口。
- 文档中的路径、命令和字段名应能在当前仓库中直接验证。

## 其他候选方案

- [Runtime 控制面网关拆分方案](zh-CN/topics/runtime-control-gateway-proposal.md)

候选方案不代表已经实现。决定落地后应转成 spec 与 plan，或保留明确的否决结论。
