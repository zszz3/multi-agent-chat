# Runtime 控制面网关拆分方案（草案）

本文档给出一个面向后续多底座接入的粗方案，用来回答当前 `RuntimeRouter` 已统一执行链路后，`Codex app-server` 这一类“管理/查询型调用”应如何收敛的问题。

适用背景：

- 当前 chat / task / workflow 的执行链路已经基本走统一 runtime abstraction
- 但 `/status`、`/models`、`/plugins` 这类能力仍然带有明显的 runtime-specific 直连特征
- 未来希望支持 `Codex`、`Claude Code` 以及更多可切换底座，并允许用户自行选择

## 1. 问题定义

当前主线已经有比较清晰的执行面抽象：

- `RuntimeDriverRegistry`
- `RuntimeRouter`
- `InteractiveSessionManager`
- `AgentExecutorFactory`

这套抽象适合解决的问题是：

- 发送 prompt
- 执行 chat / task / workflow
- 管理 interactive / oneshot 生命周期
- 管理 continuation policy 和 runtime conversation

但 `withCodexAppServer` 处理的是另一类问题：

- 读取 app-server 配置
- 查询模型列表
- 查询插件目录
- 查询 MCP server 状态

这类调用不是“让底层 agent 执行一次任务”，而是“查询运行时本身的控制信息”。如果继续把这些逻辑散落在 `AgentHub` 内，短期可用，但长期会有几个问题：

- `AgentHub` 继续膨胀
- 控制面能力没有统一入口
- 新 runtime 接入时容易重复造一套管理查询逻辑
- UI 层难以根据能力自动判断应展示哪些命令或入口

## 2. 方案结论

不建议把控制面能力直接塞进现有 `RuntimeRouter`。

建议新增一层与执行面并列的抽象：

- `RuntimeRouter` 只负责执行面
- `RuntimeControlGateway` 负责控制面

这样做的核心目的不是“再造一套路由”，而是把两类语义不同的能力分开：

- 执行面：让 agent 干活
- 控制面：读取 runtime 自身状态与可管理能力

## 3. 目标

本方案的目标：

- 为多 runtime 提供统一的控制面查询入口
- 让 UI 可以按 capability 决定展示哪些管理功能
- 把 `AgentHub` 中 runtime-specific 的管理 RPC 逐步迁出
- 为未来接入 `Claude Code` 等底座留出稳定扩展位

本方案不追求的内容：

- 不强求所有 runtime 现在就支持完全同构的 `status/models/plugins`
- 不改动当前执行面 contract
- 不在第一阶段统一所有返回字段

## 4. 分层建议

建议形成如下结构：

```text
调用方
├─ AgentHub
├─ WorkflowRuntime
└─ Renderer / IPC handlers

执行面
├─ RuntimeDriverRegistry
├─ RuntimeRouter
├─ AgentExecutorFactory
└─ InteractiveSessionManager

控制面
├─ RuntimeControlRegistry
├─ RuntimeControlGateway
└─ RuntimeControlDriver

具体 runtime 实现
├─ Codex runtime driver / control driver
├─ Claude runtime driver / control driver
└─ Other runtime driver / control driver
```

建议的目录方向：

```text
src/main/agents/runtime/
  runtime-router.ts
  runtime-driver.ts
  runtime-control-gateway.ts
  runtime-control-driver.ts
  runtime-control-registry.ts

src/main/agents/codex/
  codex-runtime-driver.ts
  codex-control-driver.ts

src/main/agents/claude/
  claude-runtime-driver.ts
  claude-control-driver.ts
```

## 5. 核心接口草图

第一版不建议设计成一个“超级大接口”，而是按能力拆成可选能力。

```ts
type RuntimeControlCapability =
  | "status"
  | "models"
  | "plugins"
  | "tools"
  | "mcpServers";

interface RuntimeControlDriver {
  runtimeId: AgentId;

  listCapabilities(): RuntimeControlCapability[];

  getStatus?(input: RuntimeControlContext): Promise<RuntimeStatusSummary>;
  listModels?(input: RuntimeControlContext): Promise<RuntimeModelSummary[]>;
  listPlugins?(input: RuntimeControlContext): Promise<RuntimePluginSummary[]>;
  listTools?(input: RuntimeControlContext): Promise<RuntimeToolSummary[]>;
  listMcpServers?(input: RuntimeControlContext): Promise<RuntimeMcpServerSummary[]>;
}
```

其中 `RuntimeControlContext` 建议包含：

- `runtimeId`
- `channelId`
- `modelId`
- `workDir`
- `configuredAgentId`

必要时可扩展：

- `runtime`
- `runtimeConversation`
- `uiSurface`

但第一版不要把执行态上下文硬塞进控制面，以免再次混层。

## 6. 返回模型建议

不要一开始追求所有 runtime 字段完全一致，建议使用“两层结构”：

1. 统一摘要层
2. runtime-specific 扩展层

示意：

```ts
interface RuntimeStatusSummary {
  runtimeId: AgentId;
  title: string;
  lines: string[];
  raw?: unknown;
}

interface RuntimeModelSummary {
  id: string;
  label: string;
  default?: boolean;
  hidden?: boolean;
  raw?: unknown;
}

interface RuntimePluginSummary {
  id: string;
  label: string;
  installed?: boolean;
  enabled?: boolean;
  source?: string;
  raw?: unknown;
}
```

这样可以兼顾两件事：

- UI 层有可直接展示的稳定字段
- runtime-specific 细节不会被过早抹平

## 7. `Codex` 的落地方式

`Codex` 第一版最适合作为 control gateway 的样板实现。

建议把当前几类逻辑迁入 `codex-control-driver.ts`：

- `withCodexAppServer`
- `config/read`
- `model/list`
- `plugin/list`
- `mcpServerStatus/list`

然后由 `RuntimeControlGateway` 对外提供统一入口：

- `getStatus(...)`
- `listModels(...)`
- `listPlugins(...)`

`AgentHub` 不再直接感知 `CodexRpcClient`，而是只做两件事：

- 解析当前 chat / task 对应的 runtime 选择
- 调用 control gateway 获取结果并转成消息文本

## 8. `Claude Code` 的接入策略

这里不建议预设“Claude 一定有和 Codex 完全一样的插件/模型/状态接口”。

更稳妥的做法是：

- 先让 `Claude` control driver 只声明它真实支持的能力
- capability 不支持的命令在 UI 层直接隐藏，或给出明确提示

例如：

- `Codex` 可能支持 `status/models/plugins/mcpServers`
- `Claude` 第一阶段也许只支持 `status/models`
- 某些 API runtime 可能只支持 `models`

这样用户虽然能“统一选底座”，但系统不会假装所有 runtime 都有同一套控制面。

## 9. UI 与命令层收口方式

当前 `/status`、`/models`、`/plugins` 是命令式入口，后续建议统一为：

- 先通过 control gateway 读取 capability
- 再决定命令是否可用

建议抽象出一层 capability 判断：

```ts
controlGateway.supports(runtimeId, "plugins")
controlGateway.supports(runtimeId, "models")
```

然后：

- chat slash command 用它判断
- renderer 设置页也用它判断
- runtime 详情面板也用它判断

这样可以避免同一判断逻辑散落在多处。

## 10. 迁移步骤建议

### Phase 1：控制面抽象落壳

- 新增 `RuntimeControlDriver` / `RuntimeControlGateway` / `RuntimeControlRegistry`
- 不改动现有执行面
- 用 `Codex` 先跑通最小样板

### Phase 2：迁出 `Codex` 直连逻辑

- 把 `withCodexAppServer` 与相关 RPC 查询迁到 `codex-control-driver.ts`
- `AgentHub` 改为调用 gateway
- slash command 仍保留现有用户体验

### Phase 3：能力显式化

- 给 UI 暴露 runtime control capabilities
- slash command / 页面按钮按 capability 显示

### Phase 4：接入第二个 runtime

- 为 `Claude Code` 实现第一版 control driver
- 只声明它真实支持的能力
- 验证抽象是否足够稳定

## 11. 为什么不直接并进 `RuntimeRouter`

主要原因有三点：

1. 语义不同
   - `RuntimeRouter` 面向执行
   - control gateway 面向查询与管理

2. 职责不同
   - 执行面关注会话、流式事件、中断、恢复
   - 控制面关注能力、状态、目录、配置

3. 演化速度不同
   - 执行面 contract 通常更稳定
   - 控制面字段更容易随 runtime 特性变化

把这两者硬塞进同一个 router，短期会省文件，长期会让 router 变成大杂烩。

## 12. 风险与注意事项

### 12.1 不要过早追求字段完全统一

统一入口是必要的，但统一语义要谨慎。第一阶段更重要的是：

- 统一调用方式
- 统一 capability 表达
- 统一 UI 判断方式

而不是把所有 runtime 的状态字段压成同一张大表。

### 12.2 不要把 `raw` 数据直接上抛到过多调用方

建议保留 `raw` 字段，但只在少数调试或高级展示场景使用。大多数页面和命令应该依赖稳定摘要字段。

### 12.3 保持执行面不受影响

这次收敛的边界应该非常明确：

- 不碰 `RuntimeRouter` 的执行契约
- 不改变 interactive / oneshot 行为
- 不让控制面需求反向污染执行面接口

## 13. 建议的近期落地结论

如果只看当前仓库的下一步重构，我建议：

- 先不要把控制面并入 `RuntimeRouter`
- 先单独引入 `RuntimeControlGateway`
- 先用 `Codex` 做唯一实现
- 等 `Claude Code` 落地第一版后，再校验接口是否需要调整

这是一个更稳、更容易验证、也更符合当前代码状态的演进路径。

## 14. 与当前 `AgentHub` 重构的关系

这份方案也可以作为当前 `agent-hub.ts` 拆分工作的一个边界参考：

- 与执行相关的逻辑，继续向 runtime router / session / executor 侧收敛
- 与控制查询相关的逻辑，不再继续塞回 `AgentHub`
- `AgentHub` 只保留编排职责，不直接承担 runtime-specific 管理 RPC

如果后续按这个方向实施，`withCodexAppServer` 这类 helper 最终应当从 `hub/` 目录继续迁出，落到 runtime-specific control driver 中。
