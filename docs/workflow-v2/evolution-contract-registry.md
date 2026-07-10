# Workflow V2 演进契约注册表

## 作用

本表给 Phase 07–14 规定类型和状态的唯一归属，防止不同 Agent 在不同目录重复创建相似接口、形成两个权威来源。

规则：

- “Owner phase” 之前不得提前实现该契约。
- Owner phase 可以新增契约；后续 phase 只能兼容扩展，不能复制重命名。
- Shared contract 放 `src/shared/workflow-v2/`；main-only port/service contract 放 `src/main/workflows/v2/`。
- renderer 使用 sanitized public DTO，不导入 main/store 内部类型。
- 变更本表中的 owner、位置或消费者前必须先修改 evolution program/相关 phase spec。

## 已有基础契约

| Contract | Existing owner | Canonical location | Evolution rule |
| --- | --- | --- | --- |
| Definition/node/edge/template | Phase 01 | `src/shared/workflow-v2/definition.ts`, `templates.ts` | 边保持 dependency-only；不复制 node shape |
| Plan/task/result/revision base | Phase 02–03 | `planning.ts`, `packets.ts` | revision lifecycle 在 Phase 11 扩展，不原地改变旧 plan |
| Run/node state | Phase 03–04 | `state.ts`, scheduler | 新状态需要 spec 和 Phase 12 migration 评估 |
| Review/intervention | Phase 04 | `review.ts`, reviewer/runtime | 所有人工动作保持统一边界 |
| Supervision/lease/progress | Phase 04 | `supervision.ts`, supervisor | progress 不能成为 final output |
| Durable run/cache/recovery | Phase 05 | `storage.ts`, store/recovery | Phase 12 负责 schema 2/migration |
| Hook lifecycle/action | Phase 06 | `hooks.ts`, hook runtime | Phase 13 扩展 effect/receipt，不重建 action taxonomy |

## Phase 07–14 新契约

| Contract | Owner phase | Canonical target | Direct consumers | Forbidden duplicate |
| --- | --- | --- | --- | --- |
| `WorkflowV2RuntimePorts` | 07 | `src/main/workflows/v2/workflow-v2-runtime-ports.ts` | facade/coordinator/services | AgentHub-specific duplicate port |
| `WorkflowRunStateUpdate` | 07 extraction | `src/main/workflows/workflow-runtime-contracts.ts` | legacy/V2 facade and public-run adapter | definition inside facade |
| `WorkflowV2StorePort` | 07 extraction | `src/main/workflows/v2/workflow-v2-store-port.ts` | durability/recovery/store adapter | store interface inside facade |
| `ExecuteWorkflowV2ScriptRequest` | 07 extraction | `src/main/workflows/v2/workflow-v2-script-execution.ts` | coordinator/Phase 08 backends | request type inside facade |
| `WorkflowV2ErrorEnvelope` | 07 | `src/shared/workflow-v2/errors.ts` | every later phase/main/preload projection | phase-local error envelope |
| Run/task/context/durability/intervention/hook service interfaces | 07 | matching main V2 modules | coordinator/tests | generic `services.ts` bag |
| `WorkflowV2EffectPolicy` | 08 | shared `execution-capabilities.ts` | planner/task/runtime/hooks/script | per-runtime policy clone |
| `WorkflowV2ExecutionCapabilities` | 08 | shared `execution-capabilities.ts` | detector/planner/approval | boolean `supportsScript` shortcut |
| Script backend/request/approval/launch journal | 08 | main backend + shared approval DTO + per-run self-versioned journal | coordinator/AgentHub/recovery/preload/UI | direct spawn request from renderer or cwd-only workspace confinement |
| Structured/global lock request/lease | 09 | shared `locks.ts` | planner/scheduler/lock manager/store | graph edge lock semantics |
| `WorkflowV2SchedulingPolicy` | 09 | shared scheduling contract | planner/executor | local executor booleans |
| `WorkflowV2ResolvedModelRoute` | 10 | shared routing contract | plan/task/cache/UI | prompt-only model profile mapping |
| Budget ledger entry/summary | 10 | shared budget contract + main ledger | all model task kinds/store/recovery | separate reviewer/hook counters |
| Context segment/assembly result | 10 | shared context contract | assembler/task/cache/UI | raw transcript fallback shape |
| Revision draft/change/status | 11 | shared revision contract | revision service/store/IPC/UI | arbitrary JSON patch |
| Revision store/lineage | 11 | main revision modules | coordinator/recovery/projector | old-run mutation fields |
| Schema 2 manifest/envelope/migration | 12 | shared storage + main migration | all stores/startup | feature-local migration code |
| Typed durable event union | 12 | `src/shared/workflow-v2/events.ts` | emitters/store/projector/UI | open event strings |
| Hook effect metadata/receipt/`WorkflowV2HookReplayResult` | 13 | shared hooks/storage | registry/host/recovery/cache | handler-owned safety metadata or persisted main-only handler result |
| Scoped memory key/value | 13 | shared memory contract + main store | Hook host/recovery | in-process authoritative Map |
| Run/timeline/metrics public DTO | 14 | shared public projection contract | main projector/preload/renderer | renderer import of storage types |
| Simulation report | 14 | shared simulation contract | simulator/approval UI | separate validation semantics |

## 状态机归属

| State machine | Owner | Allowed later changes |
| --- | --- | --- |
| Node execution/validation/review/pause | Phase 03–04 | 新状态先评估 persistence migration 和所有 scheduler transitions |
| Execution lease/supervisor | Phase 04 | Phase 09 只协调 lock/cancel，不复制 lease |
| Intervention | Phase 04 | Phase 10/11 可新增 typed source/action payload，不另建 pause 状态 |
| Lock lease/wait queue | Phase 09 | Phase 12 迁移存储，Phase 14 投影 |
| Budget ledger | Phase 10 | Phase 12 迁移，Phase 14 聚合；其他 phase 不直接改余额 |
| Revision lifecycle | Phase 11 | Phase 14 改进展示，不改变批准权威 |
| Migration/repair | Phase 12 | 后续 schema 用同一 registry 扩展 |
| Hook receipt | Phase 13 | Phase 14 只读投影 |

## 错误码归属

所有新错误使用 evolution program 的 `WorkflowV2ErrorEnvelope`。错误码前缀由 owner phase 管理：

- `runtime_boundary.*` — Phase 07
- `capability.*`, `script.*`, `approval.*` — Phase 08
- `scheduler.*`, `lock.*` — Phase 09
- `route.*`, `budget.*`, `context.*` — Phase 10
- `revision.*` — Phase 11
- `storage.*`, `migration.*`, `event.*` — Phase 12
- `hook.*`, `memory.*` — Phase 13
- `projection.*`, `simulation.*`, `diagnostic.*` — Phase 14

同一个错误事实只能有一个 canonical code。UI 文案从 code/category 映射，不能解析 message 决定行为。

## 跨阶段修改流程

若实现发现某契约必须由更早阶段拥有：

1. 停止当前 phase。
2. 修改 evolution program、本注册表、前置 phase spec/plan。
3. 回到前置 phase 完成实现、验证、提交。
4. 更新后续 phase 的 required preconditions。
5. 再恢复当前 phase。

禁止在当前 phase 创建临时重复接口，等待未来“再统一”。
