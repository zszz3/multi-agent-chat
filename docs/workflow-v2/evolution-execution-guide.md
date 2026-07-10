# Workflow V2 演进实施 Agent 指南

## 目的

本指南规定如何把 Phase 07–14 安全交给一个没有历史对话、上下文能力有限的实现 Agent。它不定义产品行为；产品行为以 evolution program spec 和目标 phase spec 为准。

## 每次只交付一个 Phase

不要让一个 Agent 在同一工作单里实现多个 phase。正确输入包是：

1. 当前仓库和目标分支
2. `AGENTS.md` 及其引用的指令
3. `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-evolution-program.md`
4. 一个目标 phase spec
5. 同一个 phase plan
6. [演进需求追踪矩阵](evolution-requirement-matrix.md)中该 phase 的 ID
7. 当前失败测试、CI 输出或平台能力信息（如有）

Agent 不需要读取后续 phase plan 来提前实现功能。可以查看后续 spec 了解接口消费者，但不能落地后续行为。

## 推荐任务提示词

```text
阅读 AGENTS.md、Workflow V2 Evolution Program Contract、Phase XX spec 和 Phase XX plan 全文。
以当前代码为事实基线，以 spec 为行为权威，以 plan 为实施顺序。
严格完成一个 phase，不吸收后续 phase。
先列出 requirement -> file -> test 映射，再按 task 顺序执行。
遇到 spec 未定义且会改变接口/状态机/持久化/权限/兼容性的选择时停止，先更新 spec，不要猜。
保护所有与本 phase 无关的用户改动。
每个 task 先补直接失败测试，再完成真实行为，运行聚焦测试并提交。
phase 结束运行 git diff --check、npm run typecheck、npm test、npm run build，完成逐项审计后提交推送。
```

## 开始前检查

- 确认当前分支、上游分支和 SHA。
- `git status --short`，标记每个已有改动的所有者。
- 确认前一 phase spec 已是 `Implemented and verified`，且 completion evidence 可复现。
- 运行当前 typecheck、全量测试、生产构建；保存命令和退出码。
- 核对 phase plan 中的文件路径与当前重构后路径；路径变化时先更新 plan。
- 搜索现有工具/接口，避免重复造类型、store、timer、hash、path 或 task helper。

前置条件不满足时不得通过兼容 hack 绕过。

## Requirement 映射模板

实施前在工作记录中为目标 phase 的每个 `EVxx-yy` 填写：

| Spec requirement | Current evidence | Target files | Direct tests | Failure tests | Status |
| --- | --- | --- | --- | --- | --- |
| 示例：unsupported Script fails before run creation | 当前 policy 运行时失败 | planner/capability resolver | planner integration | missing backend | pending |

`Status=complete` 需要直接测试或可检查的运行证据。仅存在类型、函数名或注释不算完成。

## 单个 Task 执行循环

1. 阅读目标代码上下游和现有测试。
2. 写一个能证明缺口的失败测试；确认失败原因是目标缺口，而不是 fixture 错误。
3. 定义/复用类型和状态转换，先处理非法输入和失败语义。
4. 写最小但完整的生产实现；不写只满足测试的 stub。
5. 运行目标测试、相邻模块测试和 typecheck 过滤。
6. 检查异常、取消、超时、资源释放、并发、恢复和重复请求。
7. 删除死代码/临时兼容；更新注释和文档。
8. `git diff --check`，只暂存本 task 文件。
9. 用 plan 给出的 commit 边界提交；及时推送。

## 必须停下来更新 Spec 的情况

- 需要新增或删除公开 IPC 字段
- 需要修改持久化 schema 或迁移顺序
- 需要新增状态、状态转换或终态
- 需要改变权限、工具、网络、文件、进程或审批语义
- 需要改变预算计费、路由、缓存或重试语义
- 需要修改图/边语义
- 两个 spec 对同一字段给出冲突归属
- 当前平台无法实现 spec 声称的安全保证

不得通过“先加一个 boolean”“先 catch 忽略”“先用 prompt 约束”“以后再迁移”继续。

## 边界检查清单

### 类型和验证

- 输入在跨层边界验证，不信任 renderer、模型、磁盘或运行时返回。
- JSON 必须有限、有界、可 clone。
- 枚举未知值 fail closed。
- optional 字段遵守 `exactOptionalPropertyTypes`，不显式传 `undefined`。
- 不重复定义已有 shape。

### 异步和并发

- 所有任务、进程、锁、网络、文件操作有超时/取消语义。
- 清理在 `finally`，并保留主错误与清理错误。
- 状态发布发生在权威操作成功之后。
- 重复请求、恢复、过期 generation、并发 settlement 都有测试。
- 测试用 fake clock/deferred，不依赖 sleep。

### 安全

- prompt 不是权限边界。
- 路径安全使用 realpath/no-follow/原子写，不只用字符串前缀。
- shell source 不拼接到外层 shell。
- 环境、日志、诊断、事件不泄露 secret。
- renderer 的审批必须在 main 重新校验 hash/generation/identity。

### 持久化和恢复

- 写入顺序与崩溃结果在 spec 中明确。
- 每个副作用声明幂等语义。
- schema 变化有旧 fixture 和 migration。
- cache fingerprint 包含所有影响输出的有效输入。
- 恢复不能猜测不确定副作用是否执行。

## 测试层级

每个 phase 至少包含：

- shared contract/validator 单元测试
- 纯状态机/算法测试
- main service 失败/取消/并发测试
- store/recovery 或 capability/security 测试（适用时）
- AgentHub/product integration
- preload/renderer cross-layer contract（跨层变化时）
- regression：旧 Workflow V2 和 legacy workflow
- 全量 typecheck/test/build

涉及文件、进程、锁或迁移时，必须加 fault injection；仅 happy path 不足以完成。

## Completion Audit 模板

```text
Phase:
Spec SHA/path:
Implementation commits:
Upstream base:

Requirements:
- R1 -> source -> direct test -> result

Compatibility:
- legacy workflow:
- schema/fixtures:
- preload/renderer:
- platform matrix:

Verification:
- git diff --check:
- npm run typecheck:
- focused tests:
- npm test:
- npm run build:

Known limitations:
- only items explicitly out of scope; none may contradict DoD

Push state:
- branch:
- remote divergence:
```

没有完成这份审计，不得把 spec 状态改成 `Implemented and verified`。

## 常见错误模式

- 看到测试全绿就声称整个 spec 完成
- 为了兼容旧测试保留两个权威状态源
- 新建 `utils.ts` 堆放无归属逻辑
- 通过 prompt 要求模型“不调用工具”
- 运行到节点中途才检查 plan-time capability
- 使用 `Promise.allSettled` 整批等待掩盖动态调度缺失
- cache 只按 nodeId 或 graphVersion 复用
- replan 原地修改旧 plan
- migration 直接覆盖唯一数据
- Hook 崩溃后无 receipt 直接重放副作用
- renderer 读取原始存储或发送任意事件/状态

发现这些模式应停止并回到对应 spec，而不是继续修补。
