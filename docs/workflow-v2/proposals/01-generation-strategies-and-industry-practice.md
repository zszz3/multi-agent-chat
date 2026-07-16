# Workflow V2 生成策略、行业实践与推荐落地方案

## 文档状态

- 调研日期：2026-07-11
- 状态：设计研究与候选方案，不是已实现行为
- 范围：Workflow 的目标理解、计划生成、图生成、运行期扩展和重新规划
- 不在范围：时间线 UI、指标看板、诊断导出、遥测平台等可观测性能力

本文不覆盖或修改 Phase 07–14 的权威契约。若决定实施本文建议，应先新增独立 spec/plan，或者明确修改 Phase 02、09、10、11 的契约归属；不得把新语义藏进现有 `kind`、prompt、Hook 或任意 JSON 字段。

## 结论先行

当前 Workflow V2 的“冻结 DAG”适合作为统一执行中间表示，不建议废弃。需要新增的是 DAG 前面的多策略生成层，以及 DAG 之上的阶段边界。

推荐的目标形态是：

```text
自然语言目标
  -> GoalContract
  -> GenerationStrategyRouter
  -> Template / Static / HTN / Rolling-Wave / Ensemble Generator
  -> Candidate Workflow IR
  -> Deterministic Compiler + Static Analysis
  -> 当前执行窗口的 Frozen WorkflowV2Plan
  -> 执行
  -> 阶段完成或明确 stall/replan 边界
  -> 生成下一执行窗口或新 run
```

推荐默认组合：

1. 有高匹配度模板时，使用模板实例化。
2. 跨模块工程任务，使用 HTN 式分层分解。
3. 输入或工作量只有运行后才知道时，使用有界 dynamic map。
4. 解决路径高度不确定时，使用 rolling-wave，只冻结当前窗口。
5. 高风险计划才生成多个候选并独立选优。
6. Magentic/blackboard 式自由协作只允许出现在有预算、有轮次、有 stall 上限的受限 stage 内，不能替代整个产品的 durable executor。

最重要的边界是：生成器可以提出计划，但不能直接产生运行副作用；所有方案最终都必须经过同一个编译、验证、能力、预算和审批入口。

## 当前方案的准确定位

当前代码已经拥有（以 [definition contract](../../../src/shared/workflow-v2/definition.ts)、[planning contract](../../../src/shared/workflow-v2/planning.ts) 和 [main planner](../../../src/main/workflows/v2/workflow-v2-planner.ts) 为事实入口）：

- `WorkflowV2AuthoredDefinition -> WorkflowV2Definition` 的模板编译和静态验证
- `WorkflowV2Definition -> WorkflowV2Plan` 的角色、上下文、预算和 task packet 冻结
- 只表达依赖的 DAG 边
- LLM/Script 两种执行节点
- 机械验证、独立审查、重试、暂停、进度探测和显式 replan 边界

但当前 `buildWorkflowV2Plan()` 接收的是已经完整生成的 `WorkflowV2Definition`。它实际上是 plan compiler/freezer，不是“从目标生成 workflow”的生成器。

现阶段缺失的是：

- 自然语言目标到结构化目标合同的入口
- 生成策略选择
- 模板检索和版本选择
- 层次化任务分解
- 多候选计划生成与机械选优
- 阶段式、滚动式计划冻结
- 有界运行时 fan-out/fan-in
- 生成质量报告和不可执行计划的自动修复回路

因此，正确方向不是让现有 planner 继续变成更大的 LLM prompt，而是在它前面增加独立 generation subsystem。

## 调研方法和比较维度

本次只采用官方产品文档、项目官方文档/仓库和论文原文。比较维度包括：

- 何时决定拓扑：部署时、run 开始时、stage 边界、task 输出后、每一轮 Agent 协作时
- 谁拥有计划权威：模板、规则、规划器、LLM manager、人工
- 动态范围：参数展开、同构 fan-out、异构 task 生成、完整重新规划
- 冻结单位：整张图、子图、stage、child workflow、单轮任务池
- 状态和恢复：父子历史、checkpoint、run lineage、重试和幂等
- 约束方式：schema、HTN method、状态机、预算、并发、人工批准
- 适用任务：批处理、工程实现、探索研究、长期流程、开放式多 Agent

## 方案全景

| 方案 | 拓扑生成时机 | 确定性 | 对未知信息适应性 | 成本 | 推荐用途 |
| --- | --- | --- | --- | --- | --- |
| 完整静态 DAG | run 前 | 高 | 低 | 低 | 小型、需求明确任务 |
| 模板实例化 | run 前 | 很高 | 低到中 | 最低 | 发布、迁移、审查、重复工程流程 |
| HTN 分层规划 | run 前或 stage 前 | 高到中 | 中 | 中 | 软件工程、多阶段复合任务 |
| Rolling-wave | 每个 stage 边界 | 中 | 高 | 中 | 排障、陌生仓库、研究和设计任务 |
| Dynamic map/fork | 上游产生集合后 | 高 | 处理中等不确定数量 | 中 | 文件、数据分区、测试矩阵、批处理 |
| 多候选 Ensemble | run 前或 replan 时 | 中 | 中到高 | 高 | 高风险设计、生产迁移 |
| Agentic manager / Blackboard | 每轮动态决定 | 低 | 很高 | 很高 | 开放式探索、无法预定义子任务 |
| 状态机/行为树 | 条件变化时选择固定分支 | 很高 | 对预定义异常高 | 中 | 运维、恢复、长期业务流程 |

这些方案不是互斥的。一个实际系统通常用模板或 HTN 生成宏观结构，在其中使用 dynamic map，并只在不确定 stage 内使用 rolling-wave 或 agentic manager。

## 行业实现调研

### Apache Airflow：区分部署期图生成和运行时任务映射

Airflow 明确区分两种动态性：

- Dynamic DAG Generation：DAG 结构可以由配置或代码生成，但不同 run 的任务数量不变；官方要求生成顺序稳定，否则 UI 中的任务顺序会漂移。
- Dynamic Task Mapping：scheduler 在运行时根据上游 task 输出创建 N 个 task instance，并支持 map/reduce、repeated mapping、filter、zip 等模式。

官方示例中，一个 `make_list` task 返回 list/dict，scheduler 在 consumer 执行前按元素展开。聚合端使用 lazy sequence，避免预先把未知数量的结果全部物化。

对本项目的启示：

- “配置生成完整 DAG”和“运行时根据数据展开任务”必须是两套显式语义。
- 运行时展开应是同构、schema 约束、有最大数量的系统能力，而不是让 worker 返回任意节点 JSON。
- 动态实例必须使用稳定 identity 和顺序。
- 大量 fan-out 的结果聚合应通过 artifact/reference 或 lazy reader，不应全部塞进 prompt。

真实落地例子：上游节点发现 120 个受影响文件，系统根据同一个“分析文件”模板生成最多 120 个实例，完成后由 reduce 节点聚合；不是提前生成 120 个文件名未知的节点。

来源：[Airflow Dynamic DAG Generation](https://airflow.apache.org/docs/apache-airflow/stable/howto/dynamic-dag-generation.html)、[Airflow Dynamic Task Mapping](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html)

### Argo Workflows：嵌套 DAG、动态参数循环和明确 fail-fast

Argo DAG template 通过依赖关系获得最大并行度，template 本身还可以调用另一个 DAG/steps template，从而把复杂 workflow 分成可管理的子图。DAG 默认 fail-fast，也允许关闭 fail-fast 让独立分支继续完成。

Argo 的 `withParam` 可以消费前一步生成的 JSON array，在运行时按元素实例化模板。官方示例先用 Python 生成数字列表，再并行执行多个 sleep task；循环结果要求是有效 JSON，聚合结果也有明确格式要求。

对本项目的启示：

- stage/subworkflow 应是正式边界，不是纯 UI 分组。
- dynamic map 的输入必须是 schema-valid bounded JSON array。
- fail-fast 与 finish-independent 必须是计划中的明确策略。
- 嵌套子图可以降低一次性全图复杂度，同时保留局部冻结和验证。

真实落地例子：测试准备节点生成浏览器/操作系统/数据库组合，`withParam` 风格的执行器按同一测试模板展开，再由汇总节点输出兼容性矩阵。

来源：[Argo DAG](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/)、[Argo Loops](https://argo-workflows.readthedocs.io/en/latest/walk-through/loops/)

### AWS Step Functions：状态机、条件路由和大规模 child workflow map

Step Functions 使用显式 `Choice` 状态表达条件路由，并推荐配置 `Default`；没有匹配规则且没有 Default 会产生 transition failure。`Parallel` 状态运行多个自包含分支，并等待所有分支终止后继续。

`Map` 有两种模式：

- Inline：迭代历史进入父 workflow，官方文档当前给出的上限是 40 个并发 iteration。
- Distributed：每个 iteration 是独立 child workflow，官方文档当前给出的并发上限是 10,000，并拥有独立 execution history。

这些数值属于 AWS 当前产品限制，不能复制成 Workflow V2 的默认值；真正值得借鉴的是“少量展开留在父 run，大量展开切 child run/history”的分层原则。

对本项目的启示：

- 条件选择需要显式 gate/choice 语义，不能靠 LLM 输出自然语言让 scheduler 猜。
- 大 fan-out 应切成 child run，避免父 run 状态、事件和上下文无限膨胀。
- parallel branch 必须是自包含边界，跨分支依赖由 join 显式处理。

真实落地例子：对对象存储中的大型 CSV 分区执行相同清洗 workflow，每个分区独立 child run，父 workflow 只保留 map-run 摘要和最终聚合结果。

来源：[AWS Step Functions Map](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-map-state.html)、[Choice](https://docs.aws.amazon.com/step-functions/latest/dg/state-choice.html)、[Parallel](https://docs.aws.amazon.com/step-functions/latest/dg/state-parallel.html)

### Temporal：Child Workflow 和 Continue-As-New

Temporal 建议 bounded workload 优先使用单个 workflow；当需要独立 worker/service、拆分事件历史或以资源 identity 管理生命周期时，再使用 Child Workflow。

官方文档给出的规模说明是：父 workflow 可以用 1,000 个 child workflow、每个 child 启动 1,000 个 activity 来处理总计 1,000,000 个 activity，但单个 parent 通常不应超过 1,000 个 child，因为 child 状态也会进入 parent history。这是 Temporal 的产品建议，不是本项目硬编码容量。

Continue-As-New 会把最新状态传给新 execution：Workflow Id 不变，Run Id 和 event history 更新。它用于限制长历史并让长期 workflow 从 checkpoint 继续。

对本项目的启示：

- stage continuation 应创建新 run/history，而不是让一个 run 无限增长。
- parent/child 只交换结构化 input/output，不共享隐式本地状态。
- 一个 stage 是否需要 child run，应由 history、fan-out、独立重试和资源 identity 决定。
- “继续同一业务目标”和“继续同一个物理 run”应解耦。

真实落地例子：仓库级迁移作为 parent workflow，每个 package 是 child run；package 内部完成分析、修改、测试，parent 只聚合通过/失败和 artifact 引用。

来源：[Temporal Child Workflows](https://docs.temporal.io/child-workflows)、[Temporal Continue-As-New](https://docs.temporal.io/workflow-execution/continue-as-new)

### Conductor OSS：运行时异构 Dynamic Fork

Conductor 的 `FORK_JOIN_DYNAMIC` 在运行时决定 fork 数量和 task 类型，后面必须跟 Join。它支持：

- 每个 fork 执行不同 task
- 所有 fork 执行相同 task
- 每个 fork 执行同一个 subworkflow

官方示例包括并行 HTTP task，以及对多个图片执行不同尺寸的 resize；需要多步分支时，推荐使用 subworkflow，而不是在单个 fork 中临时拼接多步语义。

对本项目的启示：

- 异构动态任务技术上可行，但风险显著高于同构 map。
- 第一阶段应只实现 template-bound homogeneous map。
- 若未来支持异构 fork，允许的 task/template id 必须来自冻结 allowlist，输入逐项校验，并强制 join policy。

来源：[Conductor OSS Dynamic Fork](https://docs.conductor-oss.org/documentation/configuration/workflowdef/operators/dynamic-fork-task.html)

### LangGraph：固定 workflow pattern 与动态 orchestrator-worker

LangGraph 官方资料区分 workflow 和 agent：workflow 走预定代码路径，agent 动态决定过程和工具。官方列出的典型模式包括：

- prompt chaining
- parallelization
- routing
- orchestrator-worker
- evaluator-optimizer

在 orchestrator-worker 模式中，orchestrator 先生成 section 计划，`Send` API 再按 section 动态创建 worker；worker 拥有自己的 state，输出写入共享 key，最后由 orchestrator 聚合。官方示例明确把它用于无法预先知道子任务数量的多文件/多章节内容生成。

对本项目的启示：

- 动态 worker 创建应接收窄输入 state，而不是复制完整主上下文。
- worker 输出应进入带 reducer 的 typed collection，不能依赖完成顺序直接覆盖共享状态。
- evaluator-optimizer 应保留显式最大轮数、合格条件和失败策略。

真实落地例子：先生成报告章节列表，再为每一章创建研究 worker，并行产生章节结果，最后由 synthesis node 汇总。

来源：[LangGraph Workflows and Agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)

### Microsoft Agent Framework / Magentic-One：计划台账、进度台账和 stall-triggered replan

Microsoft Agent Framework 的 Magentic orchestration 基于 Magentic-One：manager 根据上下文、任务进度和 agent 能力动态选择下一个 agent。官方 builder 暴露：

- 最大协调轮数
- 最大连续 stall 数
- 最大 plan reset 数
- 可选人工 plan review

运行中会产生 initial plan、replanned 和 progress-ledger-updated 事件。Progress ledger 记录目标是否满足、是否陷入循环、是否仍有进展、下一个 agent 和下一条指令。连续无进展达到上限后触发 reset/replan。

官方示例使用 ResearcherAgent 和带代码执行能力的 CoderAgent，完成模型能耗比较报告。文档同时明确提醒：Agent Framework 中自定义 participant 超出原始 Magentic-One 配置后的效果尚未被充分验证，因此不能把动态 manager 当成天然可靠的通用 planner。

Magentic-One 论文报告其在 GAIA、AssistantBench 和 WebArena 三类 benchmark 上具有竞争力，并提供了带隔离/重复控制的 AutoGenBench；其核心仍是 orchestrator 计划、跟踪进度并在错误后重新规划。

对本项目的启示：

- 用户提出的“超时后中断、询问进度、根据回复处理”应进一步抽象成 progress ledger + stall counter + bounded replan，而不是只解析一次自由文本回答。
- 动态 manager 适合不确定 stage，不适合直接拥有持久化、预算或副作用权威。
- plan reset 必须有硬上限，重新规划产生新版本/新 run，不能原地漂移。

来源：[Microsoft Agent Framework Magentic orchestration](https://learn.microsoft.com/en-us/agent-framework/user-guide/workflows/orchestrations/magentic)、[Magentic-One paper](https://arxiv.org/abs/2411.04468)

### SHOP/SHOP2：HTN 递归分解和多种 method

SHOP/SHOP2 是基于 ordered task decomposition 的 HTN planner。它从世界状态和抽象任务开始，使用 method 把非原子任务递归分解为 subtasks，直到 primitive task；同一任务可以有多个满足前置条件的 method，planner 会尝试不同分解。

University of Maryland 的项目资料记录了真实使用：Bridge Baron 商业桥牌程序、产品设计/制造规划，以及 SHOP2 在 2002 International Planning Competition 中覆盖全部竞赛 domain、处理接近 1,000 个问题并获奖。

对本项目的启示：

- 软件工程任务非常适合“领域 method + LLM 填参数”，而不是每次完全从零生成 DAG。
- method 的 precondition、subtask contract 和 primitive template 可以机械验证。
- LLM 应负责选择/补充候选 decomposition，规则负责禁止不安全结构。

真实落地例子：`implement_feature` 可根据是否涉及 schema、IPC、UI、迁移分别选择不同 method；最后都分解到 inspect、design、edit、test、review、commit 等可执行 primitive。

来源：[University of Maryland SHOP Project](https://www.cs.umd.edu/projects/shop/description.html)、[SHOP2 paper](https://doi.org/10.1613/jair.1141)

## 行业方案的共同规律

跨上述实现可以得到六条稳定规律：

1. 静态结构和运行时展开必须区分。
2. 动态展开通常围绕一个已知模板和一组运行时数据，而不是任意自由建图。
3. 大 fan-out 使用 child workflow/subworkflow 隔离历史、重试和资源。
4. 动态 manager 必须有轮数、stall、reset 和人工边界。
5. 聚合是正式语义：all、any、quorum、first-success 或 reduce 不能靠 prompt 猜。
6. 长期任务通过 checkpoint/new run 延续业务 identity，而不是无限延长单次执行历史。

## 推荐目标架构

### 1. GoalContract

生成 workflow 前，先把用户目标转换为结构化合同：

```ts
export interface WorkflowV2GoalContract {
  goalId: string;
  objective: string;
  deliverables: Array<{
    id: string;
    description: string;
    required: boolean;
    artifactKind: "text" | "code" | "file" | "report" | "decision";
  }>;
  acceptanceCriteria: WorkflowV2AcceptanceCriterion[];
  constraints: WorkflowV2ConstraintDef[];
  knownInputs: WorkflowV2ArtifactReference[];
  unresolvedQuestions: Array<{
    id: string;
    question: string;
    blocking: boolean;
  }>;
  risk: "low" | "medium" | "high";
  allowedEffects: WorkflowV2EffectPolicy;
  totalBudget: WorkflowV2BudgetEnvelope;
}
```

规则：

- blocking question 未解决时，只能生成 clarification workflow。
- acceptance criteria 必须在生成 DAG 前确定，不能在结果出来后修改标准。
- effect policy 是生成器输入，不是生成器输出；生成器不能自行扩大权限。
- 目标合同有 hash，所有 candidate plan 与它绑定。

### 2. GenerationStrategyRouter

```ts
export type WorkflowV2GenerationStrategy =
  | "template"
  | "static_dag"
  | "htn"
  | "rolling_wave"
  | "ensemble"
  | "bounded_agentic";

export interface WorkflowV2GenerationDecision {
  strategy: WorkflowV2GenerationStrategy;
  reasonCodes: string[];
  templateCandidates: string[];
  maxCandidates: number;
  maxPlanningCalls: number;
  requiresPlanApproval: boolean;
}
```

Router 先用机械特征过滤，再允许 LLM 在安全候选集合中选择：

| 特征 | 首选策略 |
| --- | --- |
| 高模板匹配、输入完整、重复流程 | template |
| 节点少、全部输入已知、无探索 | static_dag |
| 多阶段、领域分解规则清楚 | htn |
| 关键输入需要前一阶段探索才能获得 | rolling_wave |
| 高风险且存在多种架构路径 | ensemble |
| 无法预定义子任务、需要多轮研究/计算 | bounded_agentic |

禁止由 planner prompt 单独决定高权限、高预算或 agentic 模式。

### 3. Generator Port

```ts
export interface WorkflowV2Generator {
  readonly strategy: WorkflowV2GenerationStrategy;
  generate(input: {
    goal: WorkflowV2GoalContract;
    catalog: WorkflowV2GenerationCatalogSnapshot;
    currentStage?: WorkflowV2StageResult;
    budget: WorkflowV2GenerationBudget;
  }): Promise<WorkflowV2GenerationCandidate[]>;
}
```

`catalog` 冻结以下内容：

- template id/version/hash
- HTN method id/version/preconditions
- 可用 node kind 和 capability
- agent/model route snapshot
- validator/reviewer policy
- generator prompt/version

候选输出不能绕过现有 compiler。生成器只产生 authored IR；template expansion、schema validation、topological validation、capability resolution、budget check 和 plan hash 仍由 main process 完成。

### 4. Candidate 和机械评分

```ts
export interface WorkflowV2GenerationCandidate {
  candidateId: string;
  goalHash: string;
  strategy: WorkflowV2GenerationStrategy;
  authoredDefinition: WorkflowV2AuthoredDefinition;
  assumptions: string[];
  unresolvedRisks: string[];
  generatorEvidence: string[];
}

export interface WorkflowV2PlanQualityReport {
  candidateId: string;
  hardErrors: WorkflowV2ErrorEnvelope[];
  warnings: WorkflowV2ErrorEnvelope[];
  deliverableCoverage: Array<{ deliverableId: string; producerNodeIds: string[] }>;
  hiddenDependencyRisks: string[];
  deadNodeIds: string[];
  criticalPathNodeIds: string[];
  estimatedModelCalls: number;
  estimatedParallelism: number;
  approvalRequirements: string[];
}
```

硬门禁先于模型 judge：

- 每个 required deliverable 有唯一或明确聚合 producer
- 每个 required input 有 typed source
- 没有 cycle、missing reference、dead required node
- Script/tool/effect capability 可执行
- 预算不超过 GoalContract
- 所有动态展开有 template、item schema 和 maxItems
- 所有 join 有明确策略
- 所有高风险 effect 有审批边界

机械通过后，独立 reviewer 才评估分解质量、假设合理性、过度拆分、遗漏风险和候选优劣。

### 5. 生成前必须补强的可执行数据合同

多种 generator 共存后，不能继续依赖 prompt 猜测上游哪个字段对应下游哪个输入。当前 dependency edge 仍保持“只表达先后依赖”，数据绑定使用单独 contract：

```ts
export interface WorkflowV2DataContract {
  key: string;
  schema: WorkflowV2JsonSchema;
  required: boolean;
  maxInlineBytes: number;
  storage: "inline" | "artifact" | "either";
}

export interface WorkflowV2InputBinding {
  inputKey: string;
  source:
    | { kind: "goal_input"; artifactId: string }
    | { kind: "node_output"; nodeId: string; outputKey: string }
    | { kind: "map_item"; mapNodeId: string };
  onMissing: "fail" | "skip" | "use_default";
  defaultValue?: WorkflowV2JsonValue;
}
```

编译器必须验证：

- source node 确实是 dependency ancestor，而不只是文本中提到了它。
- source output schema 可以赋给 target input schema。
- required input 不允许绑定到可能 `skipped` 且没有 missing policy 的 producer。
- artifact output 只传 reference，不能被 generator 展开成无限 inline context。
- 一个 input 有且只有一个权威 binding；多来源聚合必须经过显式 reduce/join。

`choice`、`join`、`map`、`stage` 应是 main/runtime 认识的 system control contract，不能伪装成普通 LLM node：

- Choice 使用 allowlisted expression/operator 和必选 default/failure policy。
- Join 明确 `all`、`successful`、`quorum`、`first_success` 或 reducer。
- Map 明确 item schema、template 和最大展开数。
- Stage 明确输入、退出标准和下一窗口生成规则。

这仍然不改变“边只表达依赖”的原则；控制和数据语义分别放在可验证的 node/system contract 与 binding 中。

### 6. Stage 和执行窗口

```ts
export interface WorkflowV2StagePlan {
  stageId: string;
  objective: string;
  inputContracts: WorkflowV2ArtifactContract[];
  exitCriteria: WorkflowV2AcceptanceCriterion[];
  generationMode: "precompiled" | "generate_at_start" | "bounded_agentic";
  maxNodes: number;
  maxChildRuns: number;
  budget: WorkflowV2BudgetEnvelope;
  onComplete: "finish" | "generate_next_stage";
  onStall: "pause" | "retry" | "replan_stage" | "replan_workflow";
}
```

冻结规则：

- 当前 stage 的 `WorkflowV2Plan` 一旦开始执行即不可变。
- 后续 stage 可以还是摘要，但不能执行未编译节点。
- stage 完成后，使用结构化 StageResult 生成下一 stage 的 plan。
- 重新生成产生新的 plan hash、graphVersion 和 run lineage。
- 已完成 stage 只通过 artifact/result references 输入下一阶段，不回灌完整 transcript。

这相当于 rolling-wave，但每个 wave 都沿用当前 frozen-plan 安全边界。

### 7. 有界 Dynamic Map

第一版只支持同构展开：

```ts
export interface WorkflowV2DynamicMapSpec {
  source: { nodeId: string; outputKey: string };
  itemSchema: WorkflowV2JsonSchema;
  templateId: string;
  templateVersion: string;
  maxItems: number;
  concurrency: number;
  failureMode: "fail_fast" | "finish_independent" | "min_success";
  minSuccess?: number;
  join: "all" | "successful" | "first_success" | "reduce";
}
```

规则：

- 上游输出必须是 bounded JSON array 或 artifact reference。
- 超过 `maxItems` 在创建任何 child 前失败或请求批准。
- 每个实例 identity 来自 map node、item canonical hash 和 stable index。
- 同一 item 重放不能创建重复 child。
- 大展开优先 child run，不把所有实例写进父 run 的节点 map。
- 第一版不允许上游直接输出任意 task kind、prompt、script 或权限。

### 8. 受限 Agentic Stage

Magentic/blackboard 模式只能作为一种 stage executor：

```ts
export interface WorkflowV2AgenticStagePolicy {
  allowedAgentIds: string[];
  maxRounds: number;
  maxConsecutiveStalls: number;
  maxPlanResets: number;
  maxGeneratedTasks: number;
  maxTaskDepth: number;
  requirePlanApproval: boolean;
  completionCriteria: WorkflowV2AcceptanceCriterion[];
}
```

每轮更新结构化 ledger：

```ts
export interface WorkflowV2ProgressLedger {
  round: number;
  satisfiedCriterionIds: string[];
  unsatisfiedCriterionIds: string[];
  completedTaskIds: string[];
  openTaskIds: string[];
  blockers: string[];
  evidenceRefs: string[];
  progressFingerprint: string;
  stallCount: number;
  nextAction: "delegate" | "verify" | "replan" | "pause" | "finish";
}
```

同一 fingerprint、相同未满足项且没有新 evidence 时计为 stall。达到上限后只能 pause 或创建新 plan version；不能无限询问 worker“是否完成”。

## 推荐生成状态机

```text
received
  -> normalizing_goal
  -> awaiting_clarification (optional)
  -> selecting_strategy
  -> generating_candidates
  -> compiling
  -> static_analyzing
  -> repairing_candidate (bounded)
  -> reviewing_candidates (optional)
  -> awaiting_plan_approval (risk/policy dependent)
  -> frozen
  -> running
      -> stage_completed -> generating_next_stage
      -> stalled -> stage_replan / workflow_replan / pause
      -> completed
      -> failed
```

限制：

- `repairing_candidate` 有独立 planning budget 和最大轮数。
- compile/static error 使用机器可读诊断回给 generator；不把任意异常全文拼进 prompt。
- `frozen -> running` 后禁止回到同一 candidate 的 editing 状态。
- stage/workflow replan 创建新 immutable plan/run，不修改历史。

## 四个真实落地方案

### 例一：仓库级 API 迁移

目标：把 80 个调用点从旧 API 迁移到新 API。

推荐组合：template + HTN + dynamic map + child run。

```text
GoalContract
  -> inventory stage
      -> 扫描调用点，输出 typed affectedFiles[]
  -> migration stage
      -> DynamicMap(template=update-one-file, maxItems=200)
      -> 每个 package 或文件形成 child run
  -> integration stage
      -> build/test
      -> independent review
  -> final acceptance
```

为什么不一次性完整生成 80 个节点：文件列表只有扫描后才权威，而且重命名/生成文件会使预生成节点失效。

为什么不使用自由 task pool：所有实例本质是同一迁移模板，dynamic map 更确定、更便宜、更容易恢复。

### 例二：跨后端、preload、renderer 的新功能

推荐组合：HTN + rolling-wave。

```text
Stage 1 调研
  -> 定位现有契约、持久化和 IPC
Stage 2 设计
  -> 根据真实调查生成 schema/backend/preload/UI/test 子图
  -> 人工或 expert reviewer 批准
Stage 3 实现
  -> 无冲突模块并行，跨层契约先行
Stage 4 验证
  -> focused tests -> typecheck -> full test/build
```

Stage 2 不能在 Stage 1 前完全冻结，因为目标文件和迁移边界尚未知；但 Stage 3 开始后实现图必须冻结。

### 例三：研究和计算报告

目标：比较多个模型或产品并完成定量结论。

推荐组合：bounded agentic + orchestrator-worker。

```text
manager 生成 research questions
  -> researcher workers 并行收集一手来源
  -> coder worker 进行计算
  -> evidence validator 检查来源/单位/缺失值
  -> manager synthesis
  -> independent reviewer
```

限制：最多 10 rounds、连续 2 次无新 evidence 触发 replan、最多 2 次 plan reset；Researcher 不能执行代码，Coder 不能伪造来源，manager 不能自行放宽验收标准。

### 例四：陌生故障排查

推荐组合：rolling-wave + choice gate，而不是预生成长 DAG。

```text
观察 stage
  -> 收集错误、环境、最小复现
Choice gate
  -> 配置问题：进入配置验证 subworkflow
  -> 代码缺陷：进入定位/修复 subworkflow
  -> 外部依赖：进入隔离/降级 subworkflow
  -> 证据不足：请求人工输入
验证 stage
  -> 复现失败 -> 修复 -> 复现通过 -> 回归
```

每个 Choice 条件由结构化诊断字段决定，不能让 scheduler 解析自然语言错误字符串。

## 不推荐的方案

### 让一个 LLM 一次生成所有节点并直接运行

问题：目标合同、权限、能力和预算没有独立权威；LLM 生成错误会直接变成副作用。

### 让 worker 任意追加节点

问题：worker 同时成为提议者、批准者和执行者，无法稳定限制图规模、权限、循环和预算。

### 每次 agent 返回后都重新生成整张图

问题：计划持续漂移，已完成节点的含义、cache fingerprint、验收标准和审计 lineage 都会失效。

### 把动态任务写成 Hook

问题：Hook 应保持局部生命周期扩展，不能拥有图、路由和 review 语义。

### 只用 prompt 约定 max tasks/max rounds

问题：限制必须由 main 的 scheduler、ledger 和状态机执行，prompt 只可作为辅助说明。

## 分阶段落地顺序

以下是候选 generation track，不自动加入现有 Phase 07–14：

### 与 Phase 07–14 的依赖关系

本文代码块是目标候选 contract，不代表这些类型现在都已导出。实现时必须复用既有 owner，不得在 generation 目录复制同名或相似类型：

| Generation 能力 | 必需前置契约 | 原因 |
| --- | --- | --- |
| GoalContract、generator port、candidate compiler | Phase 07 service boundaries | generator 不能继续堆入 `workflow-runtime.ts` |
| effect-aware strategy 和 plan hard gate | Phase 08 capabilities | 生成器必须知道 Script/tool/filesystem/network 是否真实可执行 |
| dynamic map admission 和 child scheduling | Phase 09 scheduler/locks | 运行时展开必须进入同一个 slot、lock、cancel 调度器 |
| generation budget、实际 route、candidate cost | Phase 10 routing/ledger | planning、repair、review、replan 调用必须统一计费 |
| rolling-wave、stage replan、plan lineage | Phase 11 revision lifecycle | 下一窗口必须创建新 immutable plan/run，不能原地改图 |
| child-run identity、map expansion recovery | Phase 12 schema 2 | fan-out 创建和 join settlement 需要 crash-safe 幂等状态 |
| generator/agentic stage 的副作用边界 | Phase 13 effect/receipt | 动态生成不得造成无法对账的重复副作用 |

如果保持当前 evolution program 的串行顺序，最安全的做法是在 Phase 14 完成后启动 generation track。若希望提前插入 G0/G1，必须先修改 evolution program spec、契约注册表、阶段前置条件和迁移计划，不能直接在代码里交叉实施。

候选类型归属建议：

- `WorkflowV2GoalContract`、strategy、candidate、quality report：新的 shared generation contract。
- `WorkflowV2Generator`、router、compiler adapter：新的 main generation service。
- `WorkflowV2ErrorEnvelope`：复用 Phase 07 所有权。
- `WorkflowV2EffectPolicy`：复用 Phase 08 所有权。
- route、budget、ledger：复用 Phase 10 所有权。
- stage revision/run lineage：复用 Phase 11 所有权。
- child/map durable record：进入 Phase 12 migration registry 或后续 schema migration。
- artifact contract/reference：如果当前 shared contract 不足，先指定唯一 owner 和迁移影响，再新增；不得在 Goal、Stage、Map 三处各定义一个 artifact shape。

### G0：GoalContract 和生成器边界

- 新增 GoalContract、strategy decision、generation budget、candidate contract。
- 当前手写/模板 definition 走 `static_dag` generator adapter。
- 现有 planner 行为不变，只接受 generator 编译后的 definition。

### G1：模板检索和 HTN

- 建立 versioned template/method catalog。
- 先实现 deterministic method selection，再允许 LLM 在候选 method 中选择参数。
- 加 deliverable coverage、hidden dependency、dead node、budget/capability static analysis。

### G2：多候选和计划修复

- 仅高风险任务启用 2–3 个 candidate。
- hard gates 后使用独立 reviewer 选优。
- compile diagnostic 驱动最多一次或两次 bounded repair。

### G3：Stage/Rolling-Wave

- 宏观 stage plan 与当前 frozen execution window 分离。
- stage completion 生成结构化 StageResult。
- 下一 stage 创建新 immutable plan/run lineage。

### G4：Dynamic Map 和 Child Run

- 先实现 homogeneous template map。
- item schema、maxItems、stable id、join policy、child-run recovery 全部完成后再考虑异构 fork。

### G5：Bounded Agentic Stage

- 实现 progress ledger、stall fingerprint、max rounds/resets/tasks/depth。
- agentic manager 只能调用允许的 task templates/agents。
- 先在只读研究场景验证，再考虑有写副作用的工程场景。

## 验收和测试要求

每个 generation 功能至少证明：

- 同一 GoalContract/catalog snapshot 在 deterministic 模式产生相同 canonical plan hash。
- blocking clarification 未解决时不能生成 executable plan。
- required deliverable 不可遗漏。
- compile/validation/capability/budget 失败时不能创建 run。
- candidate repair 不超过调用/轮次预算。
- dynamic map 超限、重复 item、空集合、坏 schema 和部分失败均有确定语义。
- stage replan 不修改旧 plan/run。
- child run 重启不会重复创建或丢失聚合结果。
- agentic stage 无新 evidence 时能稳定检测 stall 并在上限停止。
- LLM 不能通过生成内容扩大 effect policy、route、budget 或 approval。
- legacy Workflow V2 和完整静态 DAG 路径保持兼容。

## 最终建议

近期最值得落地的不是“全自由动态 Agent”，而是下面三项：

1. `GoalContract + StrategyRouter`：补上当前真正缺失的 workflow generation 入口。
2. `HTN + Rolling-Wave Stage`：让工程任务既有结构，又不用在信息不足时猜完整 DAG。
3. `Homogeneous Dynamic Map + Child Run`：解决未知文件数、数据分区和测试矩阵等真实动态工作量。

等这三项经过恢复、预算和副作用测试后，再引入受限 Magentic/blackboard stage。这样既能获得动态规划能力，又不牺牲当前 Workflow V2 已建立的冻结计划、机械验证、独立审查、人工介入和 durable lineage。

## 参考资料

- [Apache Airflow: Dynamic DAG Generation](https://airflow.apache.org/docs/apache-airflow/stable/howto/dynamic-dag-generation.html)
- [Apache Airflow: Dynamic Task Mapping](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/dynamic-task-mapping.html)
- [Argo Workflows: DAG](https://argo-workflows.readthedocs.io/en/latest/walk-through/dag/)
- [Argo Workflows: Loops](https://argo-workflows.readthedocs.io/en/latest/walk-through/loops/)
- [AWS Step Functions: Map](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-map-state.html)
- [AWS Step Functions: Choice](https://docs.aws.amazon.com/step-functions/latest/dg/state-choice.html)
- [AWS Step Functions: Parallel](https://docs.aws.amazon.com/step-functions/latest/dg/state-parallel.html)
- [Temporal: Child Workflows](https://docs.temporal.io/child-workflows)
- [Temporal: Continue-As-New](https://docs.temporal.io/workflow-execution/continue-as-new)
- [Conductor OSS: Dynamic Fork](https://docs.conductor-oss.org/documentation/configuration/workflowdef/operators/dynamic-fork-task.html)
- [LangGraph: Workflows and Agents](https://docs.langchain.com/oss/python/langgraph/workflows-agents)
- [Microsoft Agent Framework: Magentic orchestration](https://learn.microsoft.com/en-us/agent-framework/user-guide/workflows/orchestrations/magentic)
- [Magentic-One paper](https://arxiv.org/abs/2411.04468)
- [University of Maryland: SHOP Project](https://www.cs.umd.edu/projects/shop/description.html)
- [SHOP2: An HTN Planning System](https://doi.org/10.1613/jair.1141)
