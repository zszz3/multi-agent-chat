# Workflow V2 架构设计

## 目录

1. [概述](#概述)
2. [Manager 自由编排](#manager-自由编排)
3. [节点执行模型](#节点执行模型)
4. [节点模板系统](#节点模板系统)
5. [节点验证流水线](#节点验证流水线)
6. [边类型系统](#边类型系统)
7. [数据面与控制面分离](#数据面与控制面分离)
8. [Leader 节点](#leader-节点)
9. [钩子系统](#钩子系统)
10. [存储设计](#存储设计)
11. [并行策略](#并行策略)
12. [断点续跑](#断点续跑)
13. [关键选型记录](#关键选型记录)

---

## 概述

Workflow V2 是一套**多智能体编排系统**。核心原则：

- **Manager 自由编排为主，模板为辅助**。Manager（Clarify & Plan agent）直接为每个节点写完整定义，不受预定义类型的限制
- **模板库是可选的快捷方式**。提供内置 + 用户级的节点模板，Manager 可以引用模板快速填参，也可以完全忽略自行编写，也可以引用模板后覆盖其中部分字段
- **节点按执行模型分层**。不同执行模型（LLM agent / 脚本 / 未来扩展）共享基础结构，差异仅在模型专属字段和验证方式
- **数据控制分离**：Worker 之间自由传递数据，但只有 Leader 有权改变节点行为
- **人始终可以介入**：任何节点的配置都可以被用户手动修改，也可以在运行时暂停、注入指令

---

## Manager 自由编排

### 核心设计

Manager 是 workflow 的架构师。在 Clarify & Plan 阶段，Manager 与用户对话收集需求后，直接输出完整的图定义。图中每个节点的**所有字段**都由 Manager 自行决定。

### 模板变量

Manager 写的 `prompt` 中可以使用 `{{}}` 引用运行时上下文：

| 变量 | 说明 |
|------|------|
| `{{objective}}` | workflow 总目标 |
| `{{upstreamContext}}` | 所有上游节点的完整产出 |
| `{{upstream.NODEID.FIELD}}` | 精确引用，如 `{{upstream.n1.findings}}` |
| `{{memory}}` | 共享记忆文件全文 |
| `{{nodeId}}` | 当前节点 ID |
| `{{label}}` | 当前节点标题 |

---

## 节点执行模型

### 抽象分层

每个节点由**基础层**（所有节点共有）和**执行模型层**（决定节点如何运行、如何验证）组成。

```
基础层（BaseNode）
  ├── id, kind, title                  — 标识
  ├── outputFields[]                   — 输出契约（所有节点都要结构化产出）
  ├── hooks?                           — 生命周期钩子
  ├── resourceLocks?                   — 资源互斥
  └── onExhausted?                     — 失败后行为

执行模型层（execModel）
  ├── "llm"  → LLMNode                — LLM agent 对话执行
  ├── "script" → ScriptNode           — 脚本进程执行
  └── (未来扩展) "human"              — 纯人工执行
                  "sub-workflow"      — 递归子工作流
                  "api-call"          — API 调用
```

基础层是所有节点共有的。执行模型层决定：
- 节点**怎么运行**（启动 agent 对话 vs spawn 子进程 vs 弹出人工表单）
- 节点**怎么验证**（judgeDimensions + constraints vs exitCode + stdout 解析）
- 节点需要哪些**专属字段**（prompt + judgeDimensions vs script + language + sandboxMode）

### 基础层通用字段

```typescript
interface BaseNode {
  id: string;
  kind: string;          // Manager 自由命名
  title: string;         // 展示名
  execModel: string;     // "llm" | "script" | (未来) "human" | "sub-workflow" | "api-call"

  // 输出契约（所有模型通用）
  outputFields: OutputFieldDef[];

  // 生命周期钩子（所有模型通用）
  hooks?: {
    beforeExecute?: HookAction[];
    afterOutput?: HookAction[];
    afterComplete?: HookAction[];
  };

  // 并行控制
  resourceLocks?: string[];
}
```

### 执行模型一：LLM Agent 节点

Manager 写一段 prompt，运行时启动 agent 对话，agent 完成任务并提交结构化产出。

```typescript
interface LLMNode extends BaseNode {
  execModel: "llm";

  // LLM 专属
  prompt: string;                          // Manager 写的 agent prompt，支持 {{}} 模板变量
  judgeDimensions: JudgeDimensionDef[];    // 评估维度
  constraints?: ConstraintDef[];           // 前置硬校验
  maxRetry?: number;                       // 最大重试次数，默认 2
  onExhausted?: "fail" | "skip" | "ask_human"; // 重试用尽策略
  requiredTools?: string[];               // agent 需要的工具
}
```

运行方式：同现有 agent task 机制，启动 agent 对话 → 轮询完成。

验证方式：见[节点验证流水线](#节点验证流水线)。

示例：

```json
{
  "id": "n1",
  "kind": "竞品数据收集",
  "title": "收集竞品定价",
  "execModel": "llm",
  "prompt": "搜索并整理XX行业前5名竞品的最新定价信息。\n\n要求：\n1. 每个竞品需包含：产品名、价格、目标客群、定价模式\n2. 标注信息来源和置信度\n3. 不确定的信息标注\"待确认\"\n\n上游上下文：{{upstreamContext}}",
  "outputFields": [
    { "key": "summary", "label": "收集摘要", "required": true },
    { "key": "competitors", "label": "竞品列表", "required": true }
  ],
  "judgeDimensions": [
    { "key": "sourceCompleteness", "label": "来源完整", "prompt": "是否每个竞品都标注了信息来源和置信度？", "passThreshold": "must" }
  ],
  "constraints": [
    { "type": "minLength", "minLength": 200, "description": "输出不少于200字符", "message": "输出过短" }
  ],
  "maxRetry": 2,
  "onExhausted": "ask_human"
}
```

### 执行模型二：脚本节点

Manager 写一段脚本代码（Python / TypeScript / Shell），运行时 spawn 子进程执行，stdin 传入上游数据，stdout 接收结构化产出。

```typescript
interface ScriptNode extends BaseNode {
  execModel: "script";

  // 脚本专属
  script: {
    language: "python" | "typescript" | "bash";
    code: string;              // 脚本代码全文
    input?: string;            // 传入 stdin 的数据引用，如 "{{upstream.n1.competitors}}"
    timeoutMs?: number;        // 超时，默认 30s
  };

  // 脚本运行模式
  sandboxMode: "sandbox" | "workspace" | "full";

  // 验证（不需要 LLM judge，用 exitCode + schema 校验）
  expectedExitCode?: number;   // 默认 0
  onError?: "fail" | "skip" | "ask_human"; // 非零退出时的行为
}
```

运行方式：

```
1. 解析 script.input 引用的上游数据
2. JSON.stringify → 脚本进程 stdin
3. spawn(python3|npx tsx|bash, ['-c', code])
4. 收集 stdout + stderr
5. exitCode 校验 → stdout JSON.parse → outputFields 完整性校验
```

验证方式（不需要 LLM judge）：

```
脚本执行
    ↓
exitCode 检查
    ↓ 非预期退出码 → onError（fail/skip/ask_human）
   通过
    ↓
stdout 解析
    ↓ JSON.parse 失败 → fail（"脚本 stdout 不是合法 JSON"）
   通过
    ↓
outputFields 完整性校验（同 LLM 节点，纯规则校验，无 LLM 消耗）
    ↓
   不通过 → fail
   通过 → ✅ completed
```

脚本不需要 judgeDimensions，因为：
- 脚本是确定性的——同一输入、同一输出
- 逻辑正确性由 Manager 在构图时负责（Manager 写的代码）
- 如果脚本逻辑有 bug 但产出了格式正确的输出，Judge 也发现不了（Judge 看不到脚本内部的错误公式）
- 因此脚本节点适用于逻辑简单、输出可直接验证的场景（纯计算、格式转换、数据聚合）

示例：

```json
{
  "id": "n3",
  "kind": "计算价格弹性",
  "title": "价格弹性计算",
  "execModel": "script",
  "script": {
    "language": "python",
    "code": "import json, sys\ndata = json.load(sys.stdin)\nprices = [c['price'] for c in data['competitors']]\navg = sum(prices) / len(prices)\nelasticities = {c['name']: round((c['price'] - avg) / avg * 100, 1) for c in data['competitors']}\nprint(json.dumps({'elasticities': elasticities, 'avgPrice': round(avg, 2)}))",
    "input": "{{upstream.n1.competitors}}",
    "timeoutMs": 10000
  },
  "sandboxMode": "sandbox",
  "outputFields": [
    { "key": "elasticities", "label": "价格弹性", "required": true },
    { "key": "avgPrice", "label": "平均价格", "required": true }
  ]
}
```

### 沙箱模式

| 模式 | 文件系统 | 网络 | 用途 |
|------|---------|------|------|
| `sandbox` | 无 | 无 | 纯数据计算、格式转换 |
| `workspace` | workflow 工作目录 | 无 | 读写项目文件 |
| `full` | 完整系统 | 有 | 部署、数据库操作（需人工确认） |

`sandbox` 实现：stdin 进数据、stdout 出结果，不传任何文件路径参数，脚本内部 `import os` / `open()` 也无法访问外部。

### 脚本节点优缺点

| 优点 | 缺点 |
|------|------|
| 确定性强——同一输入必得同一输出 | Manager 写的代码可能有 bug，且更难被发现 |
| 简洁——20 行代码等价于几百字 prompt | 执行是黑盒，看不到中间步骤 |
| 零 LLM token 消耗 | 环境依赖（python3/npx 是否在 PATH） |
| 可测试、可复现 | 逻辑藏在代码里，review 图时不易理解 |

### 何时用脚本节点

- 适合：纯数学计算、数据聚合、格式转换（JSON→CSV）、简单文件处理
- 不适合：需要外部搜索、需要语义判断、多步骤逻辑、需要产出自然语言解释

### 未来扩展点

新执行模型只需实现：

```typescript
interface ExecutionModelHandler {
  // 如何启动
  start(node: BaseNode, ctx: NodeContext): Promise<ExecutionResult>;

  // 如何验证产出
  verify(output: unknown, node: BaseNode, ctx: NodeContext): Promise<VerifyResult>;

  // 模型的专属字段 schema（用于校验 Manager 输出的节点定义是否合法）
  schema: JSONSchema;
}
```

注册后运行时即可使用，无需改动执行循环逻辑。

---

## 节点模板系统

### 定位

模板是**可选的快捷方式**，不是约束。Manager 可以：
- **不使用模板**：直接写节点的全部字段
- **引用模板**：通过 `typeRef` 引用一个模板 + 填参数，运行时展开为完整定义
- **引用模板后覆盖**：在模板基础上覆盖其中某些字段

### 模板定义结构

```json
{
  "kind": "信息收集",
  "category": "research",
  "description": "搜索、查询外部信息并整理为结构化报告。适用场景：需要从外部获取数据时",
  "whenToUse": "当需要从外部获取信息时使用。如果所有信息已在上下文中，不要用此模板",

  "execModel": "llm",

  "params": [
    {
      "key": "topic",
      "label": "调研主题",
      "type": "string",
      "required": true,
      "description": "要调研的具体问题或主题"
    },
    {
      "key": "scope",
      "label": "范围约束",
      "type": "string[]",
      "required": false,
      "description": "如 ['只看官方文档', '排除论坛']"
    },
    {
      "key": "outputFormat",
      "label": "输出格式",
      "type": "select",
      "required": true,
      "options": ["report", "table", "checklist"],
      "defaultValue": "report"
    }
  ],

  "prompt": "你需要调研以下主题：{{params.topic}}\n{{#if params.scope}}范围约束：{{params.scope}}{{/if}}\n\n要求：\n1. 列出信息来源\n2. 每条结论标注置信度（高/中/低）\n3. 不确定的信息明确标注\"未确认\"\n4. 按 {{params.outputFormat}} 格式输出\n\n上游上下文：{{upstreamContext}}",

  "outputFields": [
    { "key": "summary", "label": "核心发现", "required": true },
    { "key": "findings", "label": "详细发现列表", "required": true,
      "description": "每条含 source, confidence, detail" },
    { "key": "unconfirmed", "label": "未确认项", "required": true }
  ],

  "judgeDimensions": [
    { "key": "sources", "label": "来源完整", "prompt": "每条结论是否标注了具体来源？", "passThreshold": "must" },
    { "key": "confidence", "label": "置信度合理", "prompt": "置信度评估是否合理？", "passThreshold": "must" }
  ],

  "constraints": [
    { "type": "contains", "pattern": "来源", "description": "必须标注信息来源", "message": "请为每条结论标注来源" }
  ],

  "maxRetry": 2,
  "onExhausted": "ask_human"
}
```

模板包含的是**默认值**，引用时任何字段都可以被覆盖。

### 三种使用方式

**方式一：完全自由（不用模板）**

Manager 直接写所有字段。模板系统完全不参与。

**方式二：引用模板**

Manager 选一个模板，填参数，运行时展开为完整定义。

```json
{
  "id": "n1",
  "typeRef": "信息收集",
  "title": "收集竞品定价",
  "params": {
    "topic": "XX行业前5名竞品最新定价",
    "scope": ["官方价格页面", "行业报告"],
    "outputFormat": "report"
  }
}
```

运行时展开为包含 `execModel: "llm"`、`prompt`、`outputFields`、`judgeDimensions` 等的完整节点。

**方式三：引用模板 + 覆盖**

```json
{
  "id": "n1",
  "typeRef": "信息收集",
  "title": "收集竞品定价",
  "params": { "topic": "...", "outputFormat": "report" },
  "prompt": "你需要调研以下主题：{{params.topic}}。\n\n额外要求：需要同时关注各竞品的促销活动频次和历史定价变化趋势。\n\n{{templatePrompt}}",
  "judgeDimensions": [
    { "key": "trendAnalysis", "label": "趋势分析", "prompt": "是否包含了定价变化趋势的分析？", "passThreshold": "should" }
  ]
}
```

`{{templatePrompt}}` 展开为模板的 `prompt` 字段内容。Manager 在模板 prompt 前后追加自己的内容。

### 模板展开规则

```
1. 如果节点有 typeRef：
   a. 从注册表查找模板定义
   b. 用 node.params 渲染模板中的所有 {{params.xxx}} 模板变量
   c. 将渲染后的模板字段作为默认值
   d. 节点中显式指定的字段覆盖模板默认值（浅覆盖）
   e. prompt 中的 {{templatePrompt}} 展开为模板的 prompt 文本
2. 如果节点没有 typeRef：
   → 直接使用节点自身的所有字段，模板系统完全绕过
```

### 模板注册表

```
优先级：会话级 > 用户级 > 内置
```

| 层级 | 存放位置 | 生命周期 |
|------|---------|---------|
| 会话级 | `~/.multi-agent-chat/workflows/<id>/node-types/` | 跟随 workflow，删除时清理 |
| 用户级 | `~/.multi-agent-chat/node-types/` | 持久，跨会话 |
| 内置 | 应用自带（JSON 文件） | 随应用更新 |

同名 `kind` 被更高优先级层**完全替换**（不做深度 merge）。

### 模板发现（构图时）

Clarify & Plan 阶段的 prompt 中包含当前可用的模板列表，Manager 可以选择使用或完全忽略。

### 保存为模板

用户在 UI 上可以将当前节点的完整定义保存为模板，写入用户级注册表：

```
节点菜单 → "保存为模板" → 确认 kind 名称 → 写入 ~/.multi-agent-chat/node-types/
```

---

## 节点验证流水线

每个节点的完成验证取决于其执行模型。LLM agent 节点和脚本节点走不同的验证路径。

### LLM Agent 节点验证流水线

```
Agent 输出
    │
    ▼
① 解析 workflowReport.submit({...})
    │  失败 → retry（"格式不正确，请使用 workflowReport.submit({...})"）
    ▼
② outputFields 完整性校验（纯规则检查，零 LLM 消耗）
    │  required 字段缺失 → retry（"请补充字段 X"）
    ▼
③ constraints 硬校验（纯规则检查，零 LLM 消耗）
    │  regex / contains / minLength / jsonSchema
    │  不通过 → retry（附具体 constraint.message）
    ▼
④ judgeDimensions 评估（并行 LLM judge agent task）
    │
    ├── 全部通过 → ✅ completed
    ├── must 失败 → retry（附 judge 反馈原文）
    ├── must 全过 + should 失败 → ⚠️ completed（告警日志）
    └── 重试用尽 → onExhausted：
          "fail"       — 整体失败
          "skip"       — 跳过，标记为 completed
          "ask_human"  — 暂停，弹出人工决策
```

### 脚本节点验证流水线

```
脚本执行完成
    │
    ▼
① exitCode 检查
    │  非预期 → onError（"fail" | "skip" | "ask_human"）
    ▼
② stdout JSON.parse
    │  失败 → fail（"脚本 stdout 不是合法 JSON: <原始输出截取>"）
    ▼
③ outputFields 完整性校验（纯规则检查，同 LLM 节点步骤②）
    │
    │  required 字段缺失 → fail
    │  全部通过 → ✅ completed
    └──（脚本节点不经过 judgeDimensions）
```

### 验证层职责

| 验证层 | 消耗 LLM | 能发现什么 |
|--------|---------|-----------|
| outputFields 校验 | 否 | 格式是否完整、required 字段是否缺失 |
| constraints | 否 | 是否符合正则/长度/schema 等机械规则 |
| judgeDimensions | 是 | 内容质量、逻辑正确性、是否符合语义要求 |
| exitCode 检查 | 否 | 脚本是否正常退出 |
| stdout 解析 | 否 | 脚本输出是否合法 JSON |

---

## 边类型系统

### 边类型定义

边定义了节点间的**关系语义**，影响运行时如何向上游数据和下游 prompt 注入内容。

| 类型 | 语义 | 运行时行为 |
|------|------|-----------|
| `flow` | 标准流转 | 上游完成后下游开始，上游产出全文注入下游 `{{upstreamContext}}` |
| `review` | 审查关系 | 同上，下游 prompt 顶部额外注入审查指令 |
| `refine` | 迭代改进 | 下游收到上游产出 + judge 反馈，进入改进模式 |
| `condition` | 条件分支 | 边带 `condition` 表达式，根据上游产出判断走哪条分支 |
| `aggregate` | 汇聚合并 | 等待所有上游完成后，将多份产出合并注入下游 |

### 边定义结构

```typescript
interface WorkflowGraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: "flow" | "review" | "refine" | "condition" | "aggregate";
  label?: string;
  condition?: string;
}
```

---

## 数据面与控制面分离

### 核心原则

```
数据面（Worker ↔ Worker）：自由传递，纯信息，只读
控制面（Leader → Worker）：单向，只有 Leader 能改行为
```

### Worker 产出结构

```typescript
interface WorkerOutput {
  // 数据部分：给下游 Worker，直接注入 {{upstreamContext}}
  data: Record<string, unknown>;     // 对应 outputFields 定义的结构化数据

  // 提案部分：给 Leader，Worker 不能直接改下游行为
  proposals?: WorkForwardProposal[];
}

interface WorkForwardProposal {
  suggestion: string;
  targetHint?: string;
  suggestedPrompt?: string;
  suggestedParams?: Record<string, unknown>;
  reason: string;
  confidence: "high" | "medium" | "low";
}
```

### 下游 prompt 组装结构

```
## Leader 导航
重点关注：findings 中关于定价策略的条目
可以跳过：市场背景概述部分
Leader 决策：接受 n1 的建议

## 上游完整数据
{{upstreamContext}}

## 任务指令
(Manager 写的 prompt)

## 输出要求
(Manager 定义的 outputFields)
```

### 设计选型：数据直传 + Leader 导航 vs 数据经 Leader 分发

| 维度 | 数据直传 + Leader 导航 | 数据经 Leader 分发 |
|------|------------------------|---------------------|
| 信息保真 | 原始数据原样传递 | Leader 可能截断/改写 |
| 延迟 | 零额外延迟 | 每个节点间多一次 LLM 调用 |
| 噪声过滤 | Leader 加导航指引重点 | Leader 要"理解"全文才能准确过滤 |
| 成本 | 导航 prompt 几百 token | 全文摘要，token 消耗大 |
| Leader 错误影响 | 导航偏了下游仍可看全文 | 过滤丢了信息无法恢复 |

**采用方案**：数据直传 + Leader 导航层。

---

## Leader 节点

### 职责

Leader 是 Manager 在构图时**显式插入**的节点。它和普通节点结构相同（`execModel: "llm"`），区别在于职责：

| 职责 | 说明 |
|------|------|
| 裁决 proposal | 接收 Worker 的 proposals，对照总纲和目标决定接受/拒绝/调整 |
| 生成导航层 | 告诉下游"重点看上游产出的哪部分" |
| 进度评估 | 判断当前执行是否符合预期 |

### Manager 写 Leader

```json
{
  "id": "leader",
  "kind": "leader",
  "title": "工作流总指挥",
  "execModel": "llm",
  "prompt": "你是工作流 Leader。\n\n总纲：\n1. 聚焦定价维度，不需要关注技术实现\n2. 产出的建议需要可直接用于内部策略会议\n3. 信息不全时标注风险，不要猜测填充\n\n决策原则：\n- confidence=low 的 proposal 默认拒绝\n\n当前状态：\n- 总目标：{{objective}}\n- 已完成：{{completedNodes}}\n- 待执行：{{pendingNodes}}\n- proposals：{{proposals}}\n\n上游产出摘要：{{upstreamContext}}",
  "outputFields": [
    { "key": "decisions", "label": "裁决列表", "required": true },
    { "key": "navigation", "label": "导航提示", "required": true },
    { "key": "progressAssessment", "label": "进度评估", "required": false }
  ],
  "judgeDimensions": [
    { "key": "decisionGrounded", "label": "裁决有据", "prompt": "每个裁决是否引用了总纲或原始目标？", "passThreshold": "must" }
  ],
  "maxRetry": 1,
  "onExhausted": "fail"
}
```

### 图中展示

- 实线：数据边（Worker → Worker 数据直传）
- 虚线：控制边（Leader → Worker 下发裁决和导航）
- 仅展示当前活跃的连线，数据传输完成后自动隐去

### 设计选型：Manager 显式插入 vs 运行时自动注入

| 维度 | Manager 显式插入 | 运行时自动注入 |
|------|-----------------|---------------|
| 可控性 | 可自定义总纲和决策风格 | 运行时决定，Manager 无法控制 |
| 可见性 | 图里可见，用户可修改 | 用户无感知 |
| 灵活性 | 可插入多个 Leader | 只有一个 |

**采用方案**：Manager 显式插入。

---

## 钩子系统

### 生命周期插入点

```
beforeExecute      ← 启动 agent / 脚本之前
       ↓
  渲染 prompt / 准备脚本执行环境
       ↓
  Agent / 脚本 执行
       ↓
afterOutput        ← 产出后
       ↓
验证流水线（按 execModel 走不同路径）
       ↓
afterComplete      ← 节点完成
```

### Hook Action 原语库

#### 流程控制

| Action | 功能 | 参数 |
|--------|------|------|
| `pause` | 暂停等人工 | `question`: 发给用户的问题 |
| `skip` | 跳过本节点 | `reason`: 跳过原因 |

#### 上下文操控

| Action | 功能 | 参数 |
|--------|------|------|
| `readFile` | 读文件 | `path`, `as`: 存入变量名 |
| `injectContext` | 注入到 prompt | `from`, `intoSection` |
| `writeMemory` | 写共享记忆 | `key`, `value` / `valueFrom` |
| `readMemory` | 读共享记忆 | `key`, `as` |
| `extract` | 从输出提取 | `jsonPath`, `as` |

#### 输出投递

| Action | 功能 | 参数 |
|--------|------|------|
| `writeFile` | 写文件 | `path`, `content` / `contentFrom` |
| `httpCall` | HTTP 请求 | `url`, `method`, `body` |
| `sendSlack` | Slack 消息 | `channel`, `message` |
| `sendEmail` | 邮件 | `to`, `subject`, `body` |
| `postPRComment` | PR 评论 | `prNumber`, `itemsFrom`, `bodyTemplate` |

#### LLM 能力

| Action | 功能 | 参数 |
|--------|------|------|
| `llmHook` | 自然语言钩子 | `prompt`, `outputSchema`(可选), `as`(可选) |

### llmHook

Manager 用自然语言写的校验/转换/判断逻辑。运行时用轻量 LLM 调用执行：

```json
{
  "action": "llmHook",
  "params": {
    "prompt": "检查这份分析报告是否足够支撑内部策略会议。如果结论缺乏具体数据支撑，返回 { pass: false, feedback: '缺少数据支撑的具体描述' }。\n\n分析报告：{{output}}",
    "outputSchema": { "pass": "boolean", "feedback": "string" }
  }
}
```

- 只读、无副作用
- 使用 fast model
- 可访问变量（`{{output}}`、`{{$变量}}`）
- 有副作用的操作用内置原语

### 钩子执行

钩子在主进程中顺序执行，agent 和脚本进程无感知。变量在钩子链中累积：

```
初始变量：
  {{output}}          — 当前节点输出
  {{params.xxx}}      — 节点参数
  {{nodeId}} / {{label}}
  {{objective}}       — workflow 目标
  {{upstreamContext}} — 上游产出
  {{memory}}          — 共享记忆

钩子链累积（$变量）：
  $targetContent / $extracted / $llmCheckResult / ...
```

### 钩子来源

| 来源 | 说明 |
|------|------|
| Manager 直接在节点上写 | 构图时定义 |
| 模板继承 | 模板有 hooks，节点未覆盖则继承 |
| 模板 + Manager 追加 | 引用模板后追加自己的 hooks |
| 用户人工添加 | 在 UI 上给节点加 hooks |

---

## 存储设计

### 目录结构

```
~/.multi-agent-chat/
  ├── node-types/                         ← 用户级节点模板（持久）
  │   ├── 信息收集.json
  │   └── 财务审计.json
  │
  └── workflows/
      └── <workflow-id>/
          ├── state.json                  ← workflow 状态
          ├── runs/
          │   └── <run-id>/
          │       ├── state.json          ← 运行状态（断点续跑恢复源）
          │       ├── events.jsonl        ← 追加式事件日志
          │       └── cache/              ← 节点产出缓存
          ├── node-types/                 ← 会话级节点模板（临时）
          ├── memory.md                   ← 共享记忆
          └── outputs/                    ← 节点产出文件
```

### 文件系统 vs SQLite

| 维度 | 文件系统 | SQLite |
|------|---------|--------|
| 数据量匹配 | workflow 状态几十 KB | 需要序列化 |
| 原子性 | `writeFile(temp) → rename` 原子操作 | 事务 |
| 调试 | `cat state.json` | 需要 SQLite 工具 |
| 清理 | 删文件夹全清 | 需清理 DB + 工作目录 |
| 生命周期内聚 | 数据和工作文件在同一目录 | DB 和文件分离 |

**采用方案**：文件系统。

### 原子写入

```typescript
async function atomicWriteState(dir: string, data: object): Promise<void> {
  const tempPath = path.join(dir, `.state.json.tmp`);
  const targetPath = path.join(dir, "state.json");
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
  await fs.rename(tempPath, targetPath);
}
```

---

## 并行策略

### 执行层级

按拓扑排序分层，同一层级的节点并行启动：

```
Level 0: [start]
Level 1: [Leader]
Level 2: [W1] [W2]          ← 并行
Level 3: [W3] [W4] [W5]    ← 并行（等 W1、W2 完成）
Level 4: [end]
```

### 并发上限

同一层级最多同时运行 N 个 task（默认 N=4，可配置），超出的节点排队。

### 资源互斥

节点的 `resourceLocks` 声明的资源在同层级互斥执行：

```json
{ "resourceLocks": ["database:production", "remote:deploy-server"] }
```

持有相同 lock-key 的节点不会并行。

---

## 断点续跑

### 粒度

每个节点是独立恢复单元。失败节点及其下游重新执行，已完成节点复用缓存。

### 恢复流程

```
1. 加载 run/<run-id>/state.json + events.jsonl
2. 识别已完成节点（node_completed 事件）
3. 识别失败节点（node_failed 事件）
4. 从失败节点的层级重新执行
5. 已完成节点产出从 cache/ 直接加载
```

### 缓存策略

```
节点完成 → 产出写入 cache/<nodeId>.json
断点续跑 → cache/<nodeId>.json 存在 → 直接加载
          → 不存在 → 重新执行

缓存失效：
  - 节点的 prompt 或 params 变化（hash 对比）
  - 上游节点产出 hash 不一致
```

---

## 关键选型记录

| 决策点 | 采用方案 | 主要备选 | 理由 |
|--------|---------|---------|------|
| 节点编排 | Manager 自由编写 | 预定义类型约束 | 灵活性最大化，模板为辅助 |
| 执行模型 | 抽象分层（llm/script/未来） | 单一 LLM 模型 | 脚本节点确定性高、零 LLM 消耗，未来可扩展 |
| 模板定位 | 可选快捷方式 | 强制类型约束 | Manager 不受限 |
| 数据传递 | Worker 直传 + Leader 导航 | 经 Leader 分发 | 保真不丢数据 |
| 行为控制 | 只有 Leader 能改 | Worker 间互改 | 责任清晰 |
| Leader 插入 | Manager 显式插入 | 运行时注入 | Manager 可控，图可见 |
| LLM 节点验证 | 解析+校验+constraints+judge | 仅 judge | 机械检查前置，减少 LLM 消耗 |
| 脚本节点验证 | exitCode+解析+outputFields | 用 judge | 确定性执行不需要 LLM judge |
| 钩子自定义 | llmHook 自然语言 | 写 TypeScript | 零代码 |
| 结构化输出 | workflowReport.submit({...}) | 自由文本 | 可校验、可精确引用 |
| 存储引擎 | 文件系统 | SQLite | 数据量小，和内聚 |
| 原子写入 | writeFileTemp → rename | 直接 writeFile | POSIX 保证原子性 |
| 并发模型 | 同层级并行 + 资源互斥 | 全串行 | 兼顾效率和安全 |
| 断点续跑 | 失败层级恢复 + cache 复用 | 全量重跑 | 避免重复消耗 LLM token |
