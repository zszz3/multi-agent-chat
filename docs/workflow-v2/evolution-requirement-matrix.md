# Workflow V2 演进需求追踪矩阵

## 用法

本文把 Phase 07–14 的关键要求编号，供实施前映射和阶段完成审计使用。它不替代 spec；若表述冲突，以 evolution program 和目标 phase spec 为准。

实施规则：

- 开始一个 phase 时，把该 phase 的每个 ID 复制到 completion record。
- 每个 ID 必须链接到生产代码、直接正向测试、直接失败/故障测试和命令结果。
- 一个宽泛的端到端测试不能替代状态机、安全、迁移或并发的直接测试。
- `unsupported` 只有在 spec 允许 fail closed 时才是有效结果；`not tested` 不得声明为支持。
- 任一 ID 缺少证据，该 phase 保持 `Proposed`，不得进入下一 phase。

## Phase 07：Runtime Service Boundaries

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-07-runtime-service-boundaries.md)

| ID | 必须证明 | 直接正向证据 | 失败/回归证据 |
| --- | --- | --- | --- |
| EV07-01 | 重构前行为已由 characterization fixtures 冻结 | legacy/V2 入口、事件、状态、输出快照 | 失败、取消、恢复、人工介入快照 |
| EV07-02 | facade 只负责组装/转发，运行语义进入单一职责服务 | module graph 与 facade 测试 | facade 中不得残留调度/持久化/Hook 实现 |
| EV07-03 | runtime ports 无 AgentHub/Electron/renderer 反向依赖 | boundary/import test | 循环依赖和 forbidden import 测试 |
| EV07-04 | task/context/durability/intervention/hook 服务拥有唯一契约 | contract ownership 检查 | 重复接口/兼容 shape 被拒绝 |
| EV07-05 | public callback、legacy path、schema-1 语义不变 | 旧调用方和持久化 fixtures | exact optional/error/event 回归 |
| EV07-06 | 主错误、清理错误、取消与资源释放顺序明确 | coordinator failure tests | cleanup 不能覆盖主错误或泄漏 task/lease |

## Phase 08：Execution Capabilities And Script Sandbox

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md)

| ID | 必须证明 | 直接正向证据 | 失败/安全证据 |
| --- | --- | --- | --- |
| EV08-01 | capability/effect policy 被验证、冻结、hash 绑定 | planner capability fixture | 缺 backend/language/mode 在建 run 前失败 |
| EV08-02 | 执行前重算 capability，不能静默扩权/换 backend | matching snapshot integration | stale/missing capability 进入 typed intervention |
| EV08-03 | no-tool/no-file/no-network LLM 是 runtime 保证 | driver conformance | prompt-only runtime 必须报告 unsupported |
| EV08-04 | Script source 以 argv/data 输入，环境和输出有界 | real backend success | shell injection、env secret、stdout/stderr 洪泛 |
| EV08-05 | `sandbox` 的 fs/network/resource/process 隔离真实可用 | claimed-platform real-backend CI | 任一 isolation primitive 缺失即 unsupported |
| EV08-06 | `workspace` 由 kernel/container 约束写入范围 | workspace confinement integration | cwd/path 字符串校验不得冒充隔离；逃逸测试 |
| EV08-07 | `full` 默认关闭且逐 attempt 审批 | approved bounded host run | stale/replayed/cross-node/hash mismatch approval |
| EV08-08 | approval/launch journal 单次、CAS、可恢复 | requested 到 settled 状态机 | starting/running 崩溃不自动重放同一 attempt |
| EV08-09 | 取消能终止并等待整个进程树 | descendant termination test | orphan child、超时后仍运行、PID reuse 误杀 |
| EV08-10 | Linux/macOS/Windows 每个宣称模式都有证据 | capability/backend matrix | `not tested` 在生产中必须是 unsupported |

## Phase 09：Event-Driven Scheduling And Global Locks

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-09-event-driven-scheduling-and-global-locks.md)

| ID | 必须证明 | 直接正向证据 | 失败/并发证据 |
| --- | --- | --- | --- |
| EV09-01 | 单节点 settlement 立即处理并补槽 | deferred fast/slow DAG test | 不得残留 whole-wave `Promise.allSettled` barrier |
| EV09-02 | readiness/output 顺序确定且与 promise 完成顺序无关 | shuffled settlement fixture | 多次运行输出/事件顺序不可漂移 |
| EV09-03 | 节点完整锁集原子、排序获取 | shared/exclusive lock tests | partial acquisition/deadlock/conflicting holders |
| EV09-04 | AgentHub 级锁跨 workflow/run 生效 | two-run integration | 两个 run 不得同时持有冲突锁 |
| EV09-05 | FIFO/priority/lease/generation 防饥饿和 stale release | fake-clock queue tests | 过期 owner 不得释放新 lease |
| EV09-06 | fail_fast 等待取消、清理和 checkpoint | sibling abort integration | 不能提前返回或留下 active child/lock |
| EV09-07 | finish_independent 保持 schema-1 status 兼容 | failed + independent branch test | 不能添加隐藏终态或调度失败后代 |
| EV09-08 | run checkpoint 与 lock registry 的崩溃顺序可恢复 | fault-injection matrix | 不可发布未持久化完成或错误释放资源 |

## Phase 10：Model Routing, Budget Ledger, And Context

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-10-model-routing-budget-ledger-and-context.md)

| ID | 必须证明 | 直接正向证据 | 失败/恢复证据 |
| --- | --- | --- | --- |
| EV10-01 | 每个 worker/control role 解析成冻结实际 route | route snapshot fixtures | missing/changed route 不得 fallback |
| EV10-02 | 所有模型调用共享一个 durable ledger | 六种 call kind coverage | reviewer/probe/supervisor/summarizer/hook 不得漏记 |
| EV10-03 | reserve/start/settle/release 原子且 stable id | ledger state-machine tests | task 创建失败、重试、恢复不得双计费 |
| EV10-04 | prompt/completion/call/cost/wall-clock 真正执行 | provider/tokenizer integration | unsupported strict limit 必须拒绝 route |
| EV10-05 | context 由有界、有来源、确定排序 segment 组成 | assembly fixture | 禁止 raw transcript fallback 和 required drop |
| EV10-06 | truncate 只影响显式 optional/truncatable segment | hash-bound resolution test | renderer token count/任意字段不具权威性 |
| EV10-07 | summarize 恰好一次、预算化、结构化、有 provenance | summarizer ledger test | 递归总结/总结冒充 completion 或 review |
| EV10-08 | ask_human/context_budget 使用统一 typed intervention | end-to-end resolution | budget_exhausted 不得 continue/扩预算 |
| EV10-09 | route/context/tokenizer/budget 输入进入 cache/recovery | fingerprint/restart test | stale cache 或 started ledger 盲目重试 |

## Phase 11：Revision And Replan Lifecycle

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-11-revision-and-replan-lifecycle.md)

| ID | 必须证明 | 直接正向证据 | 失败/幂等证据 |
| --- | --- | --- | --- |
| EV11-01 | 旧 plan/run/graphVersion 永不原地变异 | immutable lineage fixture | replan/retry/resume 不能改旧对象 |
| EV11-02 | revision 状态转换 durable、main 校验、幂等 | full state-machine test | repeated/invalid/cross-workflow transition |
| EV11-03 | drafting 走独立一次性审批预算和 ledger | one-call draft integration | 不得花 exhausted parent 或偷偷第二次调用 |
| EV11-04 | proposed plan 重走 compiler/validator/capability/route/budget | normal-gates parity | 模型 free-form patch/自称有效不得绕过 |
| EV11-05 | normalized diff/impact/reuse 机械计算 | graph/policy fixture | 不信任模型 change summary；removed output 不注入 |
| EV11-06 | approval 绑定 revision/plan/capability/route hashes | approval integration | stale/replayed/changed/cross-revision approval |
| EV11-07 | apply 先持久化后创建唯一新 run/graphVersion | lineage end-to-end | crash/retry apply 不得创建两个 run |
| EV11-08 | revision store 在 Phase 12 前独立自版本化 | restart/recovery fixture | 不得偷偷提升 core run-state schema |

## Phase 12：Storage Migration And Crash Consistency

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-12-storage-migration-and-crash-consistency.md)

| ID | 必须证明 | 直接正向证据 | 失败/故障证据 |
| --- | --- | --- | --- |
| EV12-01 | immutable schema-1 golden fixtures 覆盖主要状态 | fixture semantic expectations | fixture 不能全部由当前代码动态生成 |
| EV12-02 | manifest/envelope/checksum/generation 有唯一权威 | schema-2 validator tests | malformed/newer/checksum mismatch fail closed |
| EV12-03 | 原子写含 temp/write/fsync/rename/dir-fsync 边界 | reopened old-or-new tests | 任一 fault 不得删除最后有效目标 |
| EV12-04 | v1->v2 用 staging、全量验证、报告、切换、备份 | fixture migration matrix | 不得原地改唯一副本；中断可 resume/rollback |
| EV12-05 | Phase 08–11 独立工件全部发现并迁移 | Script/lock/ledger/revision fixtures | omitted/orphan/incompatible artifact 必须报错 |
| EV12-06 | event union 有界、typed、sequence/CAS/idempotent | emitter/reader exhaustive tests | unknown type、gap、duplicate、partial line |
| EV12-07 | snapshot/compaction/retention 保留恢复与审计证据 | rebuild equivalence | snapshot crash/删除顺序不得丢事件 |
| EV12-08 | stale async writer 不能覆盖新 intervention/settlement | competing-generation test | 禁止 blind overwrite retry loop |
| EV12-09 | startup 精确分类 temp/backup/migration/corrupt/newer | repair/quarantine fixtures | 单个坏 run 不得拖垮全部 workflow |
| EV12-10 | 每个写入/迁移/append/compaction 边界均做 crash injection | fresh-store crash matrix | “没有抛异常”不算结果证明 |

## Phase 13：Hook Safety, Idempotency, And Memory

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-13-hook-safety-idempotency-and-memory.md)

| ID | 必须证明 | 直接正向证据 | 失败/安全证据 |
| --- | --- | --- | --- |
| EV13-01 | registry 唯一拥有 effect/capability/replay metadata | exhaustive action matrix | definition 不得覆盖安全 metadata |
| EV13-02 | shared replay result 有界且不依赖 main handler 类型 | validator/adapter tests | graph/review/routing/深层/非有限值被拒绝 |
| EV13-03 | receipt id/状态/generation/action hash 确定 | state-machine/restart tests | cross-attempt/stale/invalid transition |
| EV13-04 | succeeded receipt 有可重放结果而非只有 hash | inline/artifact replay | missing/corrupt artifact 不得重复 effect |
| EV13-05 | durable write adapter 可判 applied/not_applied/conflict/unknown | file/memory reconciliation | conflict/unknown 必须暂停而非猜测重试 |
| EV13-06 | llmHook no-effect、路由、预算和原 TaskRun 可对账 | isolated hook integration | ambiguity 不得静默启动第二个调用 |
| EV13-07 | writeFile 防绝对/遍历/symlink/reparse/race 逃逸 | platform fault tests | no-follow 不支持时不得 fallback 普通 writeFile |
| EV13-08 | node/run/workflow memory durable、隔离、generation-safe | scope/restart/concurrency tests | stale write/越权 workflow write/secret 混入 |
| EV13-09 | failure/control/cache/retry 均先落 receipt 决策 | lifecycle integration | unresolved write receipt 不得 cache reuse |

## Phase 14：Observability, Simulation, And Workflow UX

权威文档：[spec](../superpowers/specs/workflow/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md) · [plan](../superpowers/plans/workflow/2026-07-10-workflow-v2-phase-14-observability-simulation-and-workflow-ux.md)

| ID | 必须证明 | 直接正向证据 | 失败/跨层证据 |
| --- | --- | --- | --- |
| EV14-01 | main projector 只从已验证 snapshot/event 产生 bounded DTO | every-event fixtures | renderer 不得 import/read store、receipt、TaskRun |
| EV14-02 | timeline 按 durable sequence 分页并报告 gap | cursor/order fixtures | renderer receipt time、duplicate、stale request race |
| EV14-03 | metrics 可重复且缺证据时为 unknown | deterministic fixtures | 不得捏造 0 或反向影响调度 |
| EV14-04 | dry-run 复用 plan-freeze 权威逻辑且无副作用 | parity/no-effect tests | separate validator 分歧、创建 task/file/memory |
| EV14-05 | plan/revision UX 展示 hashes、影响和安全策略 | approval end-to-end | stale UI/renderer invented mutation 被 main 拒绝 |
| EV14-06 | diagnostics 默认排除 secrets/files/full prompts/conversations | redaction bundle tests | canary secrets 和超大 payload 不得泄露 |
| EV14-07 | IPC 窄、typed、分页、可取消、main revalidate | preload/main contract | 禁止 generic file read/event dispatch API |
| EV14-08 | keyboard/focus/non-color/large-history 状态完整 | a11y/performance tests | loading/empty/stale/partial/error 不得缺失 |
| EV14-09 | 关键迁移、安全、预算、锁、revision、Hook 流程端到端通过 | cross-layer matrix | 任一前置 phase 只能间接证明不得完成总审计 |

## 程序完成门禁

最终 completion record 必须：

1. 覆盖 `EV07-01` 至 `EV14-09`，没有 `not applicable` 逃逸；若需求变更，先修改对应 spec 和本表。
2. 记录每个 phase 的 commit、push、upstream SHA、平台矩阵和已保护的用户改动。
3. 运行 phase focused suites、`git diff --check`、`npm run typecheck`、`npm test`、`npm run build`，记录命令、退出码、测试数。
4. 只把 spec 标为 `Implemented and verified`；plan 勾选必须与当前代码和可复现证据一致。
5. 最后证明 branch 包含选定 upstream，远端无未推送 commit，文档索引和本地链接全部有效。
