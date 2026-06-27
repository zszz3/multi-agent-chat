# Shared 模块开发文档

## 作用范围

`src/shared/` 是整个仓库的跨层契约层，供以下模块共同使用：

- main
- preload
- renderer
- mcp

它既包含类型定义，也包含跨层都能安全复用的纯逻辑。

## 核心职责

### 类型定义

`src/shared/types.ts` 是最核心的共享文件。

这里定义了：

- Agent 与 runtime
- configured agents
- channel 和 model
- chat session / event
- task 状态
- workflow graph / workflow store / workflow run
- scheduled workflow 状态
- skills 模板与安装结果
- app snapshot

只要多个层要对同一个数据结构达成一致，通常就应该在这里定义。

### 预设与选择辅助逻辑

关键文件：

- `models.ts`
- `config-channels.ts`
- `provider-presets.ts`

这些文件负责：

- fallback models
- 默认 channel 选择
- provider 预设
- channel 存储归一化

这不是纯展示数据，而是会直接影响配置默认值和执行行为。

### Workflow 图结构逻辑

关键文件：

- `workflow-graph.ts`
- `workflow-agent.ts`

主要负责：

- 从生成文本中解析 workflow graph
- 根据 objective 生成初始 graph
- graph 校验
- workflow planner prompt 生成

如果 workflow 的结构规则要改，应该先改这里，再改 UI。

### Skills 元数据

关键文件：

- `skill-templates.ts`
- `bundled-skill-library.ts`
- `online-skills.ts`
- `bundled-skills/`

这一块负责：

- bundled skill 模板加载
- 在线 skill 搜索
- 元数据归一化
- 用于展示和安装的 prompt 打包

## 为什么这一层重要

这个项目是 snapshot 驱动架构，跨层依赖很强。

一旦 shared 层的契约发生漂移，后果会同时扩散到：

- preload 和 main 对不上
- renderer 渲染假设失效
- MCP payload 不一致

所以这里的修改应当比纯页面代码更保守。

## 修改建议

### 新增字段

新增共享字段时要同时检查：

- 生产这个字段的地方是否已经写入
- 消费这个字段的地方是否能容忍旧数据缺失
- 是否有依赖穷举判断或对象构造的代码要同步更新

### 修改字段语义

如果不是简单新增，而是改变已有字段含义，要重点检查：

- `AgentHub`
- preload 方法签名
- renderer 对数据的假设
- main / renderer 的测试
- mcp 是否也用了同一结构

### 保持纯逻辑

shared 层最适合放纯函数和纯数据。

不建议在这里引入：

- 文件系统操作
- Electron API
- DOM 依赖
- 主进程副作用

如果一段逻辑必须依赖 Node、Electron 或 UI 环境，它大概率不该放在 shared。

## 测试重点

当前已经有的 colocated tests 包括：

- `workflow-graph.test.ts`
- `workflow-agent.test.ts`
- `online-skills.test.ts`

这些测试很适合保护纯逻辑规则，是比集成测试更稳定的一层。

## 开发建议

- 让 shared 文件尽量保持清晰直接
- 优先强调契约明确，而不是抽象花哨
- 能通过 shared 消除 main / renderer 重复逻辑时，优先收敛到这里
- 但不要为了“复用”把带环境依赖的代码硬塞进来
