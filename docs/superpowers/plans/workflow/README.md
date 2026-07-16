# Workflow 实施计划入口

本目录只定义任务顺序、文件范围、测试命令和提交边界。行为合同以 matching spec 为准。

| 分层 | 状态 | 入口 |
| --- | --- | --- |
| Foundation | 已完成执行记录 | [Phase 01–06 plans](foundation/README.md) |
| Evolution | 尚未执行 | [Phase 07–14 plans](evolution/README.md) |
| History | 历史执行记录 | [旧计划](history/README.md) |

规则：

- Foundation 的勾选项是历史完成证据，不应重新当作待办执行。
- Evolution 的未勾选项是未来任务，不得提前勾选。
- plan 不得重新定义状态机、权限、持久化或失败语义；发现缺口先修改 spec。
- 一次只执行一个 phase，并在进入下一 phase 前完成验证、审计、提交和推送。
