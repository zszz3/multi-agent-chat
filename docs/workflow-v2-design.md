# Workflow V2 架构总纲

## 定位

本文档是 **Workflow V2 的总纲**，只回答 4 个问题：

1. 我们要解决什么问题
2. 系统的核心形态是什么
3. 关键边界和约束是什么
4. 哪些设计取舍已经确定

它**不承担**详细 schema、状态机、事件协议、缓存指纹、落盘格式等实现细节说明。这些内容应拆到后续专题文档。

---

## 目标

Workflow V2 不是“多几个 agent 一起跑”，而是一套可控的多智能体编排系统。它要解决的核心问题是：

- 让复杂任务可以被拆成多个节点稳定执行
- 让高成本专家模型只花在真正需要全局判断的地方
- 让低成本快速模型承担高频阅读、检索、实现和执行工作
- 让审查、打回、人工介入都成为系统内能力，而不是临时补丁
- 让长链路任务在上下文、成本和可恢复性上保持可控

---

## 核心原则

- **自由编排优先**：Manager 直接产出图定义，模板只是辅助，不反过来约束编排
- **角色分层优先**：不是所有节点一视同仁，而是明确谁负责编排、谁负责执行、谁负责验收
- **默认低成本执行**：能由 fast model 完成的工作，不默认占用 expert model
- **边保持极简**：边只表达依赖关系，不承载过多语义
- **数据与控制分离**：Worker 负责产出数据，Leader 负责导航和裁决
- **验证前置机械化**：格式、字段、规则先做硬校验，语义质量再交给 LLM 审查
- **执行期可恢复**：运行状态、缓存和人工介入必须是系统一等能力

---

## 角色分层与模型路由

Workflow V2 默认采用三层角色：

| 角色 | 默认模型 | 主要职责 |
|------|----------|----------|
| `orchestrator` | expert | Clarify、拆解、编排、升级决策、阶段总结 |
| `executor` | fast | 阅读局部上下文、搜索、实现、测试、产出初稿 |
| `reviewer` | expert | 独立审查、对抗式找错、放行或打回 |

推荐运行形态：

`Orchestrator -> Executor Swarm -> Reviewer -> Orchestrator`

这套分层的价值在于：

- 主 agent 不需要吞下全部执行细节，上下文膨胀更慢
- fast model 承担高频执行，可显著降低成本
- reviewer 与 executor 分离，能减少“自己实现自己通过”的偏差
- expert model 主要用在编排、升级、裁决和验收上，性价比更高

模型选择原则：

- `orchestrator` 默认走 expert
- `executor` 默认走 fast
- `reviewer` 默认走 expert
- 只有在高风险、高不确定性或反复失败时，才把 executor 升级到更强模型

---

## 图模型

Workflow 由 **节点** 和 **边** 组成。

### 节点

节点是最小执行单元。每个节点至少需要表达：

- 它要做什么
- 它如何执行
- 它要产出什么
- 它如何被验证

当前只需要支持两类执行模型：

- `llm`：由 agent 执行的自然语言任务
- `script`：由脚本执行的确定性任务

未来可以扩展 `human`、`sub-workflow`、`api-call`，但不属于 MVP 必需范围。

### 边

边先只表达一件事：**依赖关系**。

也就是说，一条边只说明：

- 下游节点要等上游节点完成
- 上游节点的产出对下游节点可见

下面这些语义 **不放在边上**：

- 审查
- 打回
- 条件分支
- 汇聚策略
- 控制指令

这些复杂性应放在节点角色和运行时策略里，而不是放在图连接本身。

---

## 模板系统

模板的定位是 **快捷方式**，不是 **类型约束**。

Manager 可以：

- 完全不用模板，直接写完整节点
- 引用模板快速生成节点
- 在模板基础上覆盖部分字段

这意味着 Workflow V2 的中心始终是“自由编排”，不是“在预设节点类型里做选择题”。

---

## 数据面与控制面

系统采用：

- **数据面**：Worker 之间传递结构化产出
- **控制面**：Leader / Orchestrator 负责导航、裁决和阶段性调整

核心原则：

- Worker 可以贡献数据和建议
- Worker 不直接修改其他节点行为
- 行为调整权集中在 Leader / Orchestrator

这能减少多 agent 相互污染、相互改指令导致的失控。

---

## 验证与验收

验证应分层进行。

### 第一层：机械校验

优先做不消耗 LLM 的检查，例如：

- 结构化输出是否存在
- 必填字段是否齐全
- 基础约束是否满足
- 脚本是否正常退出

### 第二层：语义审查

只有在机械校验通过后，才进入语义质量判断。

对于重要节点，推荐使用独立 reviewer 节点，而不是让当前节点“自评通过”。这类 reviewer 应具备明确裁决能力：

- 通过
- 打回
- 升级处理

具体 verdict schema 属于后续实现文档，不放在总纲中展开。

---

## 执行策略

### 计划与执行分离

一次 run 应明确分成两个阶段：

1. **计划阶段**：生成图、角色分工、预算和验收标准
2. **执行阶段**：按既定图运行、验证、审查、重试或暂停

默认情况下，进入执行阶段后图应视为冻结。若中途确实需要改图，应走显式修订流程，而不是运行中随意漂移。

### 并行策略

并行以拓扑层级为基础：

- 无依赖冲突的节点可以并行
- 共享高风险资源的节点需要互斥
- 并发上限由运行时统一控制

### 升级策略

默认走低成本路径，以下场景再升级：

- 跨模块或高影响改动
- 架构判断分歧
- 连续失败
- 涉及生产资源、权限、发布
- 用户明确要求深度审查

### 人工介入

系统必须允许在关键节点暂停，并由人工决定：

- 是否继续
- 是否跳过
- 是否改计划
- 是否升级模型或审查强度

---

## 上下文与成本控制

Workflow V2 必须显式控制上下文，而不是依赖 prompt 自觉。

基本原则：

- executor 只拿完成任务所需的最小上下文
- orchestrator 主要读取阶段摘要，而不是完整执行过程
- reviewer 主要看目标、结果、证据和风险，不回放全部细节
- 原始长日志可以保留，但不默认回灌到主上下文

也就是说，系统应以“结果包回传”为默认，而不是“完整 transcript 回传”。

具体的 budget 字段、压缩规则和证据保留上限，属于后续实现文档。

---

## 存储与恢复

Workflow V2 需要天然支持恢复，而不是失败后全量重跑。

MVP 建议：

- 使用文件系统保存 workflow 和 run 状态
- 保存事件日志，便于追溯
- 为已完成节点保留缓存
- 失败后从受影响节点恢复，而不是整个流程重来

缓存复用的原则很简单：

- 只有在节点定义、上游输入、模型档位、工具能力和执行环境等关键因素都未变化时，缓存才可信

缓存指纹和落盘格式属于实现细节，应单独文档说明。

---

## Leader 的职责

Leader 是图中显式存在的协调节点，不是隐形魔法逻辑。

它负责：

- 汇总阶段状态
- 裁决来自 Worker 的建议
- 告诉下游“重点看什么、忽略什么”
- 在必要时触发升级、暂停或修订

Leader 不应该成为所有数据都必须经过的中转站。数据仍应尽量直传，Leader 主要承担“导航和控制”而不是“搬运和改写所有信息”。

---

## MVP 边界

MVP 阶段优先把下面这些能力跑通：

- 自由编排节点
- `llm` / `script` 两类执行模型
- 角色分层与模型路由
- 极简边系统
- 机械校验 + 独立审查
- 并行执行 + 资源互斥
- 暂停、恢复、缓存复用

下面这些内容先不在总纲里展开，也不要求 MVP 一次做完：

- 复杂边语义
- 完整状态机细节
- 详细事件协议
- 细粒度缓存指纹定义
- 模板注册表的全部实现
- 图 diff / merge 机制

---

## 已确定的取舍

- **编排方式**：自由编排优先，模板为辅
- **角色分层**：orchestrator / executor / reviewer
- **模型分配**：默认 fast 执行，expert 编排与验收
- **边语义**：只表达依赖关系
- **控制方式**：数据直传，Leader 导航
- **审查方式**：重要任务走独立 reviewer
- **执行策略**：先机械校验，再语义审查
- **恢复策略**：支持断点恢复和缓存复用
- **存储方式**：MVP 优先文件系统

---

## 配套文档

详细内容已拆到 [docs/workflow-v2](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/README.md) 目录，按模块隔离：

1. [概览与边界](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/overview-and-boundaries.md)
2. [角色与模型路由](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/roles-and-routing.md)
3. [图模型与节点](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/graph-and-nodes.md)
4. [模板系统](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/templates.md)
5. [验证与审查](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/validation-and-review.md)
6. [数据面、控制面与 Leader](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/data-control-and-leader.md)
7. [钩子系统](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/hooks.md)
8. [执行、并行与人工介入](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/execution-and-intervention.md)
9. [上下文与成本控制](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/context-and-cost.md)
10. [存储与恢复](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/storage-and-recovery.md)
11. [MVP 范围](/Users/pengjie.zhai/multi-agent-chat/docs/workflow-v2/mvp-scope.md)

这份总纲只负责对齐方向，不负责容纳全部细节。
