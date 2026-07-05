# 原生命令路由设计

## 2026-07-05

### 目标

为聊天输入引入一套可扩展到不同 runtime 的命令路由架构：应用只拥有 `/app ...` 命名空间，Codex 和 Claude 保留各自原生 slash 语义，API runtime 诚实拒绝原生 slash，并且未来新增其他底座 agent 时，不需要继续扩大产品层分支。

### 背景

- 分支：`fix/native-command-support`
- 状态：提案
- 读者：没有任何历史对话上下文的新实现 agent
- 真相源：这份文档定义本仓库的原生命令路由、补全和启动兼容边界

### 范围

- Electron 主进程与 renderer 的聊天输入路由
- 应用命令命名空间设计
- runtime 原生 slash 转发策略
- 原生命令补全策略
- runtime CLI 发现与启动兼容性
- 面向未来本地 agent runtime 的扩展边界

### 非目标

- 完整复刻 Codex 或 Claude 原生 TUI 的补全和交互
- 让应用拥有任意 runtime 的完整原生命令空间
- 第一阶段就给 task、workflow、runtime test 加入 slash 语义
- 为 API runtime 模拟一套原生命令
- 围绕某一种安装器品牌写死兼容逻辑，例如只围绕 npm 或 Homebrew

### 外部约束

- Codex CLI 官方文档明确有原生 slash 弹层和过滤行为，但公开的 App Server 方法集中目前没有通用 built-in slash 命令元数据 API。
- Codex App Server 公开了若干 list 型元数据，例如 models、apps、skills、plugins、experimental features，可以支撑部分权威补全。
- Claude Code 官方文档明确有原生 slash 菜单，但公开文档中没有面向外部客户端的 built-in command 通用发现 API。
- Claude Code 对自定义 slash commands 与 skills 暴露了元数据，例如 `argument-hint` 和 `user-invocable`，可以用来做权威补全。
- Claude built-in commands 的可见性会受到平台、套餐和环境影响，因此静态命令表不能被伪装成权威真相。

### 决策

#### 命令所有权边界

- 应用只拥有一个命令命名空间：`/app ...`
- 原生 slash 命令空间属于当前激活 runtime
- 应用不再拥有裸 `/help`、`/status`、`/models`、`/plugins`
- 当前应用本地命令迁移为：
  - `/app help`
  - `/app status`
  - `/app models`
  - `/app plugins`

#### 路由策略

- 所有聊天输入仍然先进入一个共享命令路由器
- 路由器只会把输入分类成以下四类之一：
  - `app_command`
  - `runtime_slash`
  - `plain_prompt`
  - `unsupported_runtime_slash`
- 分类规则：
  - `codex`
    - `/app ...` -> `app_command`
    - 其他任意 `/...` -> `runtime_slash`
    - 其余输入 -> `plain_prompt`
  - `claude`
    - `/app ...` -> `app_command`
    - 其他任意 `/...` -> `runtime_slash`
    - 其余输入 -> `plain_prompt`
  - `api`
    - `/app ...` -> `app_command`
    - 其他任意 `/...` -> `unsupported_runtime_slash`
    - 其余输入 -> `plain_prompt`

#### runtime 执行语义

- `runtime_slash` 必须和 `plain_prompt` 走同一条下游聊天发送链路
- 主进程在把原生 slash 发送给 Codex 或 Claude 前，不得改写、解释或展开命令
- interactive session 的复用、resume、interrupt 和 runtime status 跟踪，对 slash 和非 slash prompt 必须共用同一套机制
- API runtime 遇到非 `/app` 的裸 slash 时，必须返回本地错误，而不是悄悄把它当普通 prompt 发给模型

#### 第一阶段范围边界

- 第一阶段只对 chat 引入原生命令路由
- task、workflow、runtime test 继续保持当前 prompt 行为，不引入 slash 路由语义

#### 高扩展性模型

- 不要把命令行为散落成 `if runtimeId === "codex"` 这种产品层硬编码
- 为未来 runtime 预留三个可注册接口：
  - `RuntimeCommandPolicy`
  - `RuntimeCompletionProvider`
  - `RuntimeLaunchProfile`
- 未来新增底座 agent 时，应该通过注册 policy/provider/profile 接入，而不是继续扩大 `AgentHub` 顶层分支

### 架构

#### 主进程命令路由器

- 新增一层共享路由模块，例如 `src/main/chat-command-router.ts`
- 职责：
  - 对聊天输入做路由归一化
  - 分类命令类型
  - 为 runtime 转发保留原始文本
  - 返回结构化路由结果
- `AgentHub.sendPrompt()` 不再直接把所有以 `/` 开头的输入都当作应用本地命令，而是先委托给路由器分类

建议的结果结构：

```ts
type ChatCommandRoute =
  | { kind: "app_command"; commandText: string; commandName: string; args: string[] }
  | { kind: "runtime_slash"; prompt: string }
  | { kind: "plain_prompt"; prompt: string }
  | { kind: "unsupported_runtime_slash"; prompt: string; reason: string };
```

#### RuntimeCommandPolicy

- 每个 runtime 都应声明自己的命令策略，而不是依赖产品层 scattered branching
- 最低职责：
  - 是否支持 native slash
  - native slash 是否原样透传
  - 不支持时对用户如何解释

建议结构：

```ts
interface RuntimeCommandPolicy {
  runtimeId: AgentId;
  supportsNativeSlash: boolean;
  classify(input: string): "app_command" | "runtime_slash" | "plain_prompt" | "unsupported_runtime_slash";
  unsupportedSlashMessage?(input: string): string;
}
```

#### RuntimeCompletionProvider

- 补全必须是 runtime 可扩展的，并且显式区分权威元数据和启发式建议
- 最低职责：
  - 提供应用命令
  - 在 runtime 公开元数据时提供权威原生命令/参数候选
  - 提供启发式 native suggestions
  - 记录成功历史，并在命令无效时删除学习项

建议结构：

```ts
interface RuntimeCompletionProvider {
  runtimeId: AgentId;
  listAppCommands(): Promise<CompletionItem[]>;
  listNativeMetadata?(context: CompletionContext): Promise<CompletionItem[]>;
  listNativeSuggestions(context: CompletionContext): Promise<CompletionItem[]>;
  recordNativeCommandSuccess?(event: NativeCommandOutcome): Promise<void>;
  recordNativeCommandFailure?(event: NativeCommandOutcome): Promise<void>;
}
```

#### RuntimeLaunchProfile

- runtime 启动兼容层必须与命令路由分离
- 最低职责：
  - 解析命令发现优先级
  - 探测版本
  - 统一 spawn 规格
  - 生成稳定 `cliFingerprint`

建议结构：

```ts
interface RuntimeLaunchProfile {
  runtimeId: AgentId;
  resolveCommand(context: LaunchResolveContext): Promise<ResolvedRuntimeCommand>;
  probeVersion(command: ResolvedRuntimeCommand): Promise<string | null>;
  fingerprint(input: { command: ResolvedRuntimeCommand; version: string | null }): string;
}
```

### 补全策略

#### 补全分组

- UI 中必须把补全拆成三组：
  - `App commands`
  - `Native metadata`
  - `Suggested native commands`
- 分组名称必须反映“可信度”：
  - app 命令是权威的
  - native metadata 只有在来源于 runtime 公开元数据时才是权威的
  - suggested native commands 只是启发式建议

#### 权威补全

- `/app ...` 永远是权威补全
- Codex 的权威原生补全可以基于公开的 App Server list 型元数据：
  - models
  - apps
  - skills
  - plugins
  - experimental features
- Claude 的权威补全可以基于自定义 skills/commands 元数据：
  - 由命令路径导出的命令名
  - `argument-hint`
  - `user-invocable`
- 在没有官方公开发现接口前，不得把 Codex 或 Claude built-in commands 静态表伪装成权威目录

#### 启发式建议

- 对 Codex / Claude 的 built-in commands，只做 best-effort 建议
- 建议来源：
  - 一小组高频 built-in commands
  - 用户真实成功执行过的本地学习历史
- API runtime 不显示任何 native slash 建议

#### 本地学习记忆

- 本地学习建议按以下维度隔离存储：
  - `runtimeId`
  - `cliFingerprint`
- 建议存储字段：
  - `commandStem`
  - `example`
  - `successCount`
  - `lastUsedAt`
- 只有满足以下条件的 native slash 才能被学习：
  - 不是 `/app ...`
  - 是用户真实输入过的 native slash
  - 当前 turn 完成且没有显式 runtime 命令错误

#### 无效命令即时删除

- 只要当前 turn 产出了明确的 runtime-side 命令错误，并能证明该命令对当前 runtime + 当前 CLI fingerprint 无效，就必须立刻把这条 learned native suggestion 从本地建议集中删除
- learned suggestions 不使用“慢慢降权”的策略来处理明确无效命令
- 即时删除只作用于本地学习项，不作用于权威 metadata
- 高频静态建议可以在当前 fingerprint 下做临时抑制，避免反复误导，但不从全局静态默认值里永久删除
- 以下情况不得触发删除：
  - interrupt
  - transport failure
  - process crash
  - network error
  - 与命令本身无关的 runtime failure
- 删除必须由“明确的无效命令证据”驱动，而不是“这轮执行没成功”这种模糊条件驱动

#### 失败分类

- 为了让学习和删除规则稳定，需要把 native slash 结果分类为：
  - `success`
  - `invalid_command`
  - `transport_failure`
  - `runtime_failure`
  - `interrupted`
- 只有 `success` 能正向更新本地学习历史
- 只有 `invalid_command` 会触发 learned suggestion 的即时删除

### Renderer 行为

#### 输入辅助

- renderer 只能承诺应用真正知道的能力
- placeholder 应当按 runtime 变化：
  - Codex：普通 prompt、原生 slash、或 `/app help`
  - Claude：普通 prompt、原生 slash、或 `/app help`
  - API：普通 prompt 或 `/app help`
- renderer 不得暗示自己知道任何 runtime 的完整原生命令目录

#### 建议 UI

- 现有 slash suggestion 菜单可以保留为 UI 外壳，但数据源必须升级为 runtime-aware 且支持分组
- 点击建议只负责把文本插入 composer
- 选中 suggestion 不代表 runtime 一定支持该命令

#### 避免真相复制

- renderer 不能自己复制一份主进程命令路由真相
- 前端任何预提示都只是 advisory
- 命令路由的唯一权威判断点仍然是主进程 router

### CLI 发现与启动兼容层

#### 发现优先级

- runtime 命令解析顺序：
  1. 应用内用户 override
  2. 环境变量 override，例如 `CODEX_PATH` / `CLAUDE_PATH`
  3. PATH 上的默认命令名
  4. macOS GUI 场景下按需做 shell-hydrated PATH fallback
  5. 不可用

#### 安装方式中立

- 应用支持的是“可执行命令”，不是“某一种安装器”
- 不要在路由逻辑中写死 npm、Homebrew 或用户脚本的品牌判断
- 只要最终解析出来的命令能稳定执行，就视为受支持

#### Windows 兼容

- Windows 上继续通过统一 launcher 规范化以下情况：
  - `.cmd`
  - `.bat`
  - bare command name
  统一走 `cmd.exe /d /s /c`
- 原生 `.exe` 继续直接执行
- detect、one-shot、interactive、version probe 必须共用同一套 launch normalization

#### macOS 兼容

- macOS 兼容重点不是命令格式，而是 GUI 启动 Electron 时 PATH 可能与 Terminal 不一致
- 当 GUI 场景下 PATH lookup 失败时，可以在放弃前从登录 shell 获取 PATH 再重试
- 同时必须允许用户显式配置 custom command override

### 持久化与迁移

#### 需要持久化的状态

- runtime command override
- learned native suggestion memory
- learned memory 按 runtime + CLI fingerprint 分桶
- 聊天记录结构不需要为了这次改动做新迁移；历史 slash 消息保留为普通历史即可

#### 旧命令行为

- 旧的 app-local bare slash commands 不保留长期别名
- 改动后：
  - Codex / Claude 的裸 slash 全部归 runtime 所有
  - API runtime 的裸 slash 明确拒绝
- 帮助文案和 placeholder 必须一致地引导用户使用 `/app ...`

### 分阶段实施顺序

#### Phase 1：修正命令边界

- 引入共享 command router
- 把应用本地命令迁移到 `/app ...`
- 对 native slash 做 runtime 透传或 API 显式拒绝

#### Phase 2：收口 UI

- 更新 placeholder、分组补全、API runtime 错误反馈
- 去掉任何还在暗示旧裸应用命令仍然存在的 UI 文案

#### Phase 3：补全 provider 框架

- 引入 runtime completion provider 注册点
- 先落地 `/app ...` 的权威补全

#### Phase 4：增强原生命令补全

- 接入 Codex 基于公开 App Server metadata 的局部权威补全
- 接入 Claude 基于自定义 skills/commands metadata 的权威补全
- 加入高频原生命令建议和本地成功历史学习

#### Phase 5：升级 runtime launch profile

- 补齐 runtime launch profile
- 支持 app-level override
- 支持 macOS shell PATH hydration fallback
- 输出更细粒度的检测错误

### 测试

- `npm run typecheck`
- router 单元测试
- `AgentHub.sendPrompt()` 路由测试
- renderer suggestion-group 测试
- completion provider 测试
- learned-history 持久化测试
- invalid-command 即时删除测试
- CLI launch profile 测试，覆盖：
  - Windows `.cmd`
  - Windows bare command
  - macOS direct executable
  - override 优先级

关键回归证明点：

- `/app help` 在所有 runtime 下都进入应用本地处理
- `/help` 在 Codex / Claude 下进入 runtime 透传
- `/help` 在 API runtime 下被诚实拒绝
- native slash 和 plain prompt 共用同一条 interactive chat 下游发送链
- renderer 只把 `/app ...` 作为应用拥有的命令空间展示
- learned native suggestions 只会在显式成功的 native 命令后加入
- learned native suggestions 在显式 `invalid_command` 失败后立即从当前 runtime fingerprint 的本地建议集中删除
- transport crash 不会删除 learned commands
- 新 runtime 可以只通过注册 command/completion/launch 组件接入，而不扩大 `AgentHub` 产品层分支

### 开放问题

- Codex 第一阶段究竟应该接入哪些 App Server metadata 作为原生命令补全来源？参数级补全在 UI 上如何表达？
- Claude 在本仓库中应优先扫描哪些 custom command / skill 目录与元数据文件？
- 未来 runtime 如果需要比四类 route result 更丰富的命令能力描述，第一阶段的结构是否已经足够承载？
