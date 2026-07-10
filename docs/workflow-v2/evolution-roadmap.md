# Workflow V2 演进路线图

## 文档定位

本文是 Workflow V2 完成 Phase 01–06 后的稳定演进说明，回答“下一步为什么做、按什么顺序做、完成后系统应达到什么状态”。

权威层级：

1. 本文解释整体方向和阶段依赖。
2. `docs/superpowers/specs/workflow/2026-07-10-workflow-v2-evolution-program.md` 定义不可变约束和总体验收标准。
3. Phase 07–14 spec 定义每个阶段必须实现的行为契约。
4. Phase 07–14 plan 定义逐文件、逐测试、逐提交的实施步骤。
5. 代码与自动化测试提供最终实现证据；计划中的勾选本身不是完成证据。

实施交付前同时阅读：

- [演进实施 Agent 指南](evolution-execution-guide.md)
- [演进契约注册表](evolution-contract-registry.md)
- [演进需求追踪矩阵](evolution-requirement-matrix.md)

Phase 01–06 的完成结论保持不变。本文描述的是后续增强，不回写或重新解释已冻结的基础语义。

Workflow 目标生成、HTN、rolling-wave、dynamic map 和 bounded agentic stage 的候选方案另见[生成策略、行业实践与推荐落地方案](generation-strategies-and-industry-practice.md)。该研究当前不是 Phase 07–14 的实现承诺；决定落地前必须新增独立 spec/plan 或明确修订对应前置契约。

## 当前基线

已有能力：

- 编译后的 DAG、模板展开和静态验证
- 冻结计划、角色/profile、上下文和成本预算契约
- 依赖、并发和 run 内资源锁调度
- LLM/Script 适配器边界和结构化结果 packet
- 机械验证、独立 reviewer、执行租约和人工介入
- 文件持久化、事件、缓存、恢复和启动 reconciliation
- 生命周期 Hooks、失败策略和路由/评审语义隔离

当前需要闭环的事实：

- 产品默认 Script policy 仍对所有模式 fail-closed。
- `replan` 只停止旧 run 并记录请求，没有形成新 graphVersion 的产品闭环。
- 调度器按批次 `Promise.allSettled`，快节点会等待同批慢节点。
- `resourceLocks` 只在一个 run 内生效，不防止两个 workflow 争用同一工作区资源。
- `fast/balanced/expert` 尚未稳定解析成冻结的实际 agent/channel/model 路由。
- `maxCompletionTokens` 尚未执行，`summarize` 和 `ask_human` 上下文策略尚未闭环。
- `llmHook` 的无工具约束仍包含提示词约束，副作用 Hook 缺少 durable receipt。
- 存储 schema 只有严格版本拒绝，没有迁移、校验和、事件 compaction 或崩溃注入证明。
- `workflow-runtime.ts` 同时承担过多职责，后续继续堆功能会扩大回归面。
- UI 尚缺 plan/capability/budget 预览、revision diff 和完整运行时间线。

## 串行阶段

```text
Phase 07 Runtime Service Boundaries
  -> Phase 08 Execution Capabilities And Script Sandbox
  -> Phase 09 Event-Driven Scheduling And Global Locks
  -> Phase 10 Model Routing, Budget Ledger, And Context
  -> Phase 11 Revision And Replan Lifecycle
  -> Phase 12 Storage Migration And Crash Consistency
  -> Phase 13 Hook Safety, Idempotency, And Memory
  -> Phase 14 Observability, Simulation, And Workflow UX
```

不得交换阶段顺序。若后续阶段需要更早的契约，应修改前置 phase spec 并先补齐前置阶段，不能在后续代码里放临时旁路。

## 文档入口表

| 阶段 | 行为规范 | 实施计划 |
| --- | --- | --- |
| 07 | [Runtime Service Boundaries spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md) | [Phase 07 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md) |
| 08 | [Execution Capabilities And Script Sandbox spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md) | [Phase 08 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md) |
| 09 | [Event-Driven Scheduling And Global Locks spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md) | [Phase 09 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md) |
| 10 | [Model Routing, Budget Ledger, And Context spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md) | [Phase 10 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md) |
| 11 | [Revision And Replan Lifecycle spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md) | [Phase 11 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md) |
| 12 | [Storage Migration And Crash Consistency spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md) | [Phase 12 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md) |
| 13 | [Hook Safety, Idempotency, And Memory spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md) | [Phase 13 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md) |
| 14 | [Observability, Simulation, And Workflow UX spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md) | [Phase 14 plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md) |

## 阶段目标

### Phase 07：Runtime Service Boundaries

行为保持不变地拆分 V2 runtime 职责，形成单向依赖的 coordinator、task、context、durability、intervention 和 hook host 边界，为后续增强降低回归面。

### Phase 08：Execution Capabilities And Script Sandbox

把“运行时能做什么”变成可验证能力契约；计划冻结前拒绝不支持的节点；为 Script 提供明确、受限、可取消、可审计的后端，并将 `llmHook` 的无工具要求下沉到执行能力层。

### Phase 09：Event-Driven Scheduling And Global Locks

移除整批等待屏障；节点完成后立即持久化和解锁下游；在 AgentHub 范围提供公平、可恢复、无死锁的共享/独占资源锁。

### Phase 10：Model Routing, Budget Ledger, And Context

在计划冻结时解析实际模型路由；统一统计所有模型调用；真正执行 prompt/completion/cost/wall-clock 预算；实现结构化压缩、一次性 summarizer 和上下文预算人工介入。

### Phase 11：Revision And Replan Lifecycle

将 `replan` 从“记录并停止”升级为 revision draft、graph diff、验证、批准、新 graphVersion、新 run lineage 和安全缓存复用的完整流程。

### Phase 12：Storage Migration And Crash Consistency

引入可迁移 schema、typed durable events、校验和、generation/CAS、fsync 边界、事件快照/压缩和崩溃恢复证明，继续保持 file-system-first。

### Phase 13：Hook Safety, Idempotency, And Memory

按 effect class 管理 Hook；持久化 execution receipt；防止恢复后重复副作用；提供 no-tool LLM、符号链接安全文件写入和明确的 node/run/workflow memory scope。

### Phase 14：Observability, Simulation, And Workflow UX

基于 typed events 构建运行投影、时间线、指标、诊断导出、plan/revision 审批和 dry-run 模拟；renderer 不读取原始持久化文件，也不直接修改调度状态。

## 全局工程规则

- 安全、预算、路由、评审和图语义不能只依赖 prompt。
- 所有外部副作用必须有明确 effect policy、超时、取消和幂等语义。
- 所有持久化状态变更必须先定义状态机和失败恢复，再写实现。
- 旧 run/plan 永不原地变异；revision 创建新的版本和 lineage。
- 不支持的能力在 plan freeze 前失败，不允许运行到一半才发现。
- 运行时不得静默降级到更宽权限、更贵模型、完整 transcript 或不受控脚本。
- 每个 phase 只实现自己的 spec；发现跨阶段需求立即停止并修正文档。
- 每个 phase 必须有机械验证、负向测试、故障测试、集成测试和全量回归证据。

## 最终目标

完成 Phase 14 后，Workflow V2 应具备：

- 可验证的执行能力和实际模型路由
- 真正可用且安全的 Script 节点
- 无批次头阻塞、跨 run 锁安全的调度器
- 完整 token/cost/context 预算闭环
- 可批准、可追溯、可复用的 replan/revision
- 可迁移、可校验、可抗崩溃的文件存储
- 能力隔离且恢复幂等的 Hooks
- 可解释、可模拟、可诊断的产品界面

该目标不要求数据库优先、分布式集群调度、任意远程插件或新增复杂边语义。
