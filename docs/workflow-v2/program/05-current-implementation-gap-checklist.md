# Workflow V2 当前实现差距清单

> 审计日期：2026-07-15
> 审计范围：`docs/workflow-v2/design/`、Workflow V2 Foundation / Interactive / Evolution specs，以及当前工作树中的 `src/shared/workflow-v2/`、`src/main/workflows/`、`src/main/hub/workflow/`、`src/renderer/src/pages/workflow/`。
> 文档类型：当前实现审计清单。它不替代 spec；行为目标仍以对应 spec 为准。

## 结论

- Workflow V2 的 Foundation 主链路已经存在：图定义与校验、冻结计划、任务/结果包、节点级验证与独立 reviewer、单 run 并行与资源互斥、人工介入、租约监督、文件持久化、缓存恢复、Hook 生命周期、interactive conversation 和 node-agent window 都有实现与测试。
- `docs/workflow-v2/design/` 描述的是完整目标，不等于当前全部实现。当前差距主要集中在 Evolution Phase 07–14，以及模板产品化、真实模型路由、Leader 控制面和完整交互 UX。
- Interactive Phase 01、02 的 spec 状态已经落后于代码：严格依赖满足与显式 `executionMode` 已进入实现；Phase 04 仍是部分完成。需要单独做状态复核，不能继续沿用目录 README 的“全部未实现”结论。
- 当前工作树包含其他未提交代码改动。本清单只记录观察结果，不把未提交实现当作已完成阶段证据，也不修改这些代码。

## 状态标记

- `[ ]`：未完成，不能声明设计目标已实现。
- `[~]`：已有类型、局部实现或测试，但尚未形成端到端、可恢复、可验证闭环。
- `[x]`：本次审计确认已有主链路；不代表对应未来 phase 已完成。

## 已有基础，不应重复实现

- [x] DAG 定义、模板编译函数、静态校验、冻结计划与 `graphVersion` 已存在。
- [x] `TaskPacket` / `ResultPacket`、机械验证、独立 reviewer TaskRun、重试与人工介入主链路已存在。
- [x] 节点依赖只由 `completed` / `skipped` 满足，阻塞节点不会提前释放下游。
- [x] `one-shot` / `interactive` / `script` 已进入定义、校验、计划和运行时分派。
- [x] interactive conversation、明确完成确认、脚本参数输入、节点窗口和事件驱动渲染已有实现。
- [x] run state、events、cache、checkpoint、resume/rerun/reuse 和启动对账已有 Foundation 级实现。
- [x] Hook 生命周期、来源合并、有限 JSON 变量、暂停/跳过、LLM Hook 和工作目录相对路径校验已有实现。

## P0：安全与运行正确性

### 1. Script 仍不是可信沙箱

- [ ] 为 Script 建立真实 backend capability matrix；不支持的平台、语言和模式必须在冻结计划前 fail closed。
- [ ] 禁止把 capability 声明和 hash 当作隔离本身；执行前必须校验命令、argv、环境变量、cwd、文件系统、网络和资源限制。
- [ ] 替换当前 `new Function(...)` 的 inline TypeScript 执行，避免脚本直接获得主进程能力。
- [ ] 对 command backend 增加 allowlist/adapter、环境白名单、stdout/stderr 上限、超时后进程树终止和 orphan 检测。
- [ ] 对 workspace 写入提供操作系统级或容器级边界；仅依赖 `cwd` 和字符串路径检查不能满足 sandbox/workspace 合同。
- [ ] 将 approval 绑定到 workflow、graphVersion、run、node、attempt、executable hash 和 capability snapshot，并持久化 launch journal。

当前证据：`src/main/workflows/v2/workflow-v2-script-executor.ts` 直接调用 `spawn(...)`，inline TypeScript 通过 `new Function(...)` 执行；`workflow-v2-script-analysis.ts` 主要根据声明能力和 executable kind 推导风险，没有建立真实隔离能力。

对应目标：Evolution Phase 08，`EV08-01` 至 `EV08-10`。

### 2. 模型 profile 尚未解析成真实 runtime route

- [ ] 把 `fast` / `balanced` / `expert` 解析为冻结的 provider、runtime、agent、model 和 capability route。
- [ ] 节点执行、reviewer、supervisor、progress probe、llmHook 必须使用各自冻结 route，而不是统一复用 run 级 `configuredAgentId` / `modelId`。
- [ ] reviewer 的“独立”不仅要是新 TaskRun，还要能证明 route、上下文和工具策略符合 reviewer 合同。
- [ ] 在 driver/runtime 层强制 no-tool/no-file/no-network；prompt 中写“不要调用工具”不能作为安全保证。
- [ ] route 变化必须参与 cache fingerprint，并在恢复时重新校验 capability。

当前证据：`src/shared/workflow-v2/planning.ts` 只冻结逻辑 `modelProfile`；`src/main/workflows/v2/workflow-v2-run-executor.ts` 启动 interactive node 和 reviewer 时仍传入同一组 run 级 agent/model。

对应目标：设计文档 `02-roles-and-routing.md`，Evolution Phase 08、10。

### 3. 调度仍有 batch barrier，锁只在单 run 内生效

- [ ] 将 `Promise.allSettled(batch)` 波次调度改为单节点 settlement 驱动；快节点完成后应立即补充可运行节点，不等待同批慢节点。
- [ ] 建立跨所有 active workflow 的全局 lock manager，而不是只查看当前 run 的 `runningNodes`。
- [ ] 支持 shared/exclusive、原子获取完整锁集、公平排队、租约、取消释放和启动对账。
- [ ] 持久化 scheduler/lock 决策，保证崩溃和恢复后的输出顺序、事件顺序与资源所有权一致。

当前证据：`src/main/workflows/v2/workflow-v2-executor.ts` 以 runnable batch 启动并等待整批 `Promise.allSettled(...)`；`src/main/workflows/v2/workflow-v2-scheduler.ts` 只从当前 `runState` 计算已占用锁。

对应目标：Evolution Phase 09，`EV09-01` 至 `EV09-09`。

### 4. Budget 只有局部计数，没有 durable ledger

- [ ] 建立统一、持久化的 reserve/settle budget ledger，覆盖 executor、reviewer、supervisor、probe、llmHook 和修订生成。
- [ ] 实现 `maxCompletionTokens`；`maxPromptTokens` 不再使用字符数乘四的近似作为最终计费与硬限制。
- [ ] model call 和 wall-clock 计数必须在恢复后继续，而不是从进程内变量重新开始。
- [ ] 超限必须产生 typed failure/intervention evidence，不能只抛字符串 Error。
- [ ] `summaryFallbackPolicy: "summarize" | "ask_human"` 必须真实执行；当前不能继续保留“unavailable”分支。

当前证据：`src/main/workflows/v2/workflow-v2-run-executor.ts` 使用进程内 `startedModelCalls`；`src/main/workflows/v2/workflow-v2-node-policy.ts` 以近似字符数限制 prompt，并对 `summarize` / `ask_human` 直接抛错。

对应目标：设计文档 `09-context-and-cost.md`，Evolution Phase 10。

### 5. 存储缺少迁移与 crash consistency 合同

- [ ] 从严格 `schemaVersion === 1` 拒绝升级为显式 migration registry，并提供 schema 1 fixture 到新 schema 的无损迁移测试。
- [ ] 为 state、event、snapshot 增加 checksum、generation/CAS 和 authoritative write ordering。
- [ ] 将 `WorkflowV2DurableEvent.type: string` 收敛为有界 typed union，并检测 unknown、gap、duplicate 和 partial line。
- [ ] 增加 snapshot、compaction、retention、临时文件恢复、backup、quarantine 和单 run 损坏隔离。
- [ ] 对 persist、append、migration、compaction 做 crash-injection matrix，证明重启后的唯一权威结果。

当前证据：`src/shared/workflow-v2/storage.ts` 固定 `WORKFLOW_V2_STORAGE_SCHEMA_VERSION = 1` 且 event type 为字符串；`src/main/workflows/v2/workflow-v2-store.ts` 有原子 state rename，但没有 migration、checksum、generation、compaction 或 quarantine。

对应目标：设计文档 `10-storage-and-recovery.md`，Evolution Phase 12。

### 6. Hook 副作用不可幂等恢复

- [ ] 为每个 Hook action 建立 registry-owned effect/capability/replay metadata，定义可重放与不可重放边界。
- [ ] 持久化 Hook receipt、action hash、attempt/generation 和 applied/unknown/conflict 状态，避免重试或重启重复副作用。
- [ ] 将 memory 从 executor 内的 `Map` 升级为 durable node/run/workflow scope，并实现隔离、并发和 generation 保护。
- [ ] `writeFile` 使用安全、原子、可对账的 adapter，补 symlink/reparse/race 逃逸测试。
- [ ] llmHook 的 no-effect、fast route 和预算必须由 runtime/ledger 强制，而不是只靠 developer instructions。

当前证据：`src/main/workflows/v2/workflow-v2-run-executor.ts` 为每次执行创建内存 `hookMemory`，并直接 `writeFile(...)`；当前 durable node control 只保存 Hook 变量，没有 effect receipt。

对应目标：设计文档 `07-hooks.md`，Evolution Phase 13。

## P1：核心能力闭环

### 7. GraphRevision 只有元数据构造，没有 revision lifecycle

- [ ] revision draft 必须包含候选定义、确定性 diff、影响节点、复用/rerun 决策和 approval hash。
- [ ] 候选 revision 必须经过正常模板编译、静态校验、capability、route、budget 和 review gate。
- [ ] 审批后创建新 `graphVersion` 和新 run lineage，旧 run/plan/history 保持不可变。
- [ ] `replan` 不能只记录 action 并停止；需要可恢复、幂等的 draft/apply/retry 状态机。
- [ ] renderer 需要展示 revision diff、风险、缓存影响和审批状态。

当前证据：`src/shared/workflow-v2/planning.ts` 的 `WorkflowV2GraphRevision` 只有 reason/summary/version 元数据；`src/main/workflows/v2/workflow-v2-planner.ts` 只构造该对象；`workflow-runtime.test.ts` 明确验证 replan “records and stops without mutating or rerunning the frozen plan”。

对应目标：设计文档 `08-execution-and-intervention.md`，Evolution Phase 11。

### 8. Runtime service boundary 仍未完成

- [ ] 将 V2 coordinator、task gateway、context assembler、durability、intervention、Hook、capability/scheduler 等职责拆成明确、无环服务。
- [ ] `WorkflowRuntime` 只保留 facade/dispatch；`WorkflowV2RunExecutor` 不再同时拥有任务启动、轮询、预算、监督、review、Hook、脚本、持久化和 UI projection。
- [ ] 为 import boundary、唯一 contract ownership、cleanup ordering 和 legacy compatibility 增加 characterization tests。

当前证据：`WorkflowRuntime` 已缩小并委托给 `WorkflowV2RunExecutor`，属于有效基础；但 `src/main/workflows/v2/workflow-v2-run-executor.ts` 仍是千行级协调器并持有多数运行语义，因此 Phase 07 只能标记为 `[~]`。

对应目标：Evolution Phase 07。

### 9. 模板系统只有内存 compiler，没有产品级 registry

- [ ] 实现 `会话级 > 用户级 > 内置` 三层模板加载、替换优先级和持久化目录。
- [ ] 将真实 workflow authoring/validation/create 路径接入 template registry，而不是只在单元测试中调用 compiler。
- [ ] 实现“保存当前节点为模板”、模板列表、删除/覆盖、版本和来源展示。
- [ ] 明确模板版本进入 cache fingerprint 与 revision diff 的方式。

当前证据：`src/shared/workflow-v2/templates.ts` 已实现内存 registry 和 compile；生产代码搜索不到 registry 加载、用户目录或保存入口，使用主要集中在 `templates.test.ts` / `validation.test.ts`。

对应目标：设计文档 `04-templates.md`。

### 10. Leader 仍是运行后派生摘要，不是完整控制面

- [ ] 将 Leader decision 作为 durable、typed、可见记录，而不是只在 executor 返回值中组装一次。
- [ ] 实现 proposal 裁决、优先级、阻塞解释、execution-mode recommendation、script candidate、风险和 revision proposal 的实际决策流程。
- [ ] 决策只能通过控制面影响 scheduler；Worker proposal 不能直接修改下游行为。
- [ ] renderer 展示 Leader 决策、控制覆盖层和决策依据，并保持数据边仍为唯一图边。

当前证据：`src/main/workflows/v2/workflow-v2-leader.ts` 主要从 runnable nodes 和 worker outputs 派生摘要，`executionModeRecommendations` 固定为空；未找到 Leader navigation 的持久化或 renderer projection。

对应目标：设计文档 `06-data-control-and-leader.md`，Interactive Phase 06，Evolution Phase 14。

### 11. Node-agent window 仍缺设计中的完整信息与动作

- [ ] 显示 attempt、blocking reason、runtime capability、完整 tool approval/result/error、upstream digest 和 acceptance criteria。
- [ ] one-shot 节点在完成前提供显式“转换为 interactive / 生成 revision”动作；不能只读后无处理入口。
- [ ] completion proposal 显示逐条 acceptance criterion、证据和 unresolved risks。
- [ ] 明确 conversation starting、恢复中、stale、partial、failed 的 UI 状态，不再回落到 legacy editor。
- [ ] 增加多节点大历史、键盘、焦点和非颜色状态的可访问性测试。

当前证据：`WorkflowNodeAgentWindow.tsx` 已支持 durable messages、tool call/result、发送、打断、确认和驳回；但头部身份信息和 completion proposal 仍比 Phase 04 product contract 简化，one-shot 仍主要是只读展示。

对应目标：Interactive Phase 04，Evolution Phase 14。

### 12. 执行模式缺少完整 plan approval UX

- [x] 后端要求每个节点显式声明 `executionMode`，并冻结 rationale/confidence。
- [ ] 在 plan approval UI 展示每个节点的 mode、rationale、confidence 和 capability compatibility。
- [ ] 用户可在冻结前覆盖 mode；冻结后只能生成 revision proposal。
- [ ] 更新 Interactive Phase 02 的 spec 状态和完成证据，避免继续显示“Not implemented”。

当前证据：`src/shared/workflow-v2/validation.ts`、`src/main/workflows/v2/workflow-v2-planner.ts` 已覆盖后端合同；renderer 搜索不到 rationale/confidence 展示和 override 入口。

对应目标：Interactive Phase 02。

### 13. Observability、simulation 和 approval UX 未形成统一产品面

- [ ] 建立 main-authoritative、typed、redacted 的 plan/run/revision projection，不让 renderer 依赖 executor 或 raw store 内部结构。
- [ ] 提供按 durable sequence 分页的 timeline，显示调度、锁、预算、review、intervention、Hook、恢复和失败原因。
- [ ] 实现无副作用 dry-run，复用权威 validation/capability/routing/budget 逻辑。
- [ ] 提供 plan/revision approval、stale approval 拒绝、hash 展示、影响分析和安全策略说明。
- [ ] 提供可导出的 redacted diagnostics bundle，并补 secret/large-payload 泄漏测试。

当前证据：preload 目前提供 plan/revision 构造和运行控制 API，但没有 dry-run、timeline pagination、diagnostics 或完整 revision approval API；renderer 工作流页也没有对应统一视图。

对应目标：Evolution Phase 14。

## P2：一致性与证据债务

### 14. Interactive specs 状态需要重新审计

- [ ] Phase 01：根据 `workflow-v2-scheduler.ts` 和直接测试补齐完成证据，确认所有 blocking state 都不会满足依赖后再更新状态。
- [ ] Phase 02：后端合同已实现但 UI/override 未完成，应改成准确的 Partial 状态或拆分完成项，不能继续简单写“Not implemented”。
- [ ] Phase 04：按 re-audit 文本逐条核对 node click、starting、one-shot、tool/approval 展示和 completion actions，保留未完成项。
- [ ] 更新 `docs/superpowers/specs/workflow/interactive-orchestration/README.md`，使目录汇总状态与各 phase 当前证据一致。

### 15. Design 与当前 Script contract 需要对齐

- [ ] `03-graph-and-nodes.md` 仍使用 `sandboxMode: sandbox/workspace/full` 和 `language/code/input` 草案；当前实现已改为 executable/parameters/capabilities/risk/authorization。
- [ ] 明确哪些字段是解释性旧草案、哪些由最新 script security specs 接管，避免新实现者按旧 shape 开发。
- [ ] 在 design 中链接 `2026-07-13-workflow-script-security-architecture-design.md`、script parameters/editor/governance specs，并说明 Evolution Phase 08 仍未完成真实 sandbox。

### 16. 完成声明缺少统一 fresh evidence

- [ ] 每个未完成 phase 建立 completion record，逐项映射 `04-evolution-requirement-matrix.md` 的 requirement ID。
- [ ] 记录生产代码、正向测试、失败/安全测试、命令输出、平台矩阵、commit 和 upstream SHA。
- [ ] 阶段完成时运行 focused tests、`npm run typecheck`、`npm test`、`npm run build`、`git diff --check`。
- [ ] 未覆盖 requirement ID、只存在类型、只有 mock、只有 prompt 约束或只有宽泛 e2e 时，不得把 spec 标为 Implemented。

## 推荐实施顺序

1. Phase 07：先完成 runtime service boundary，降低后续安全和状态机改造风险。
2. Phase 08：完成 capability enforcement 与可信 Script backend，优先消除主进程执行风险。
3. Phase 09：替换 batch barrier，并引入全局锁。
4. Phase 10：冻结真实 route，建立 durable budget ledger 和 context overflow 闭环。
5. Phase 11：完成 revision/replan lifecycle。
6. Phase 12：升级存储迁移、typed events 和 crash consistency。
7. Phase 13：完成 Hook receipt、幂等副作用和 durable memory。
8. Phase 14：最后建设 projection、timeline、dry-run、approval UX 和 diagnostics。
9. 在上述主线中穿插模板 registry、node-agent window 补全和 Interactive spec 状态修正，但不要绕过 phase 依赖提前声明 Evolution 完成。

## 审计入口

- 解释性设计：[`../design/README.md`](../design/README.md)
- Foundation specs：[`../../superpowers/specs/workflow/foundation/README.md`](../../superpowers/specs/workflow/foundation/README.md)
- Interactive specs：[`../../superpowers/specs/workflow/interactive-orchestration/README.md`](../../superpowers/specs/workflow/interactive-orchestration/README.md)
- Evolution specs：[`../../superpowers/specs/workflow/evolution/README.md`](../../superpowers/specs/workflow/evolution/README.md)
- Evolution requirement matrix：[`04-evolution-requirement-matrix.md`](04-evolution-requirement-matrix.md)
