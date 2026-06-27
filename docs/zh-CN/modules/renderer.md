# Renderer 开发文档

## 作用范围

`src/renderer/src/` 是 Electron 窗口里的 React 应用，负责用户实际看到和操作的界面。

它负责：

- 页面布局与导航
- 交互流程
- 本地 UI 状态
- 调用 preload API
- 把 snapshot 渲染成具体界面

## 当前目录结构

```text
src/renderer/src/
  app/
  pages/
  ui/
  App.tsx
  main.tsx
  styles.css
```

### `main.tsx`

负责挂载 React 应用、加载字体和全局样式，并启动 `App`。

### `App.tsx`

这是当前 renderer 的总装配入口，也是最重的文件之一。

它现在承担的职责包括：

- 拉取初始 snapshot
- 接收 snapshot 更新
- 维护主壳层状态
- 管理 active feature
- 组装各页面
- 连接 `window.multiAgentChat`

虽然项目已经在按页面拆分，但 `App.tsx` 仍然是跨功能改动最容易落点的地方。

### `app/`

放跨页面共享的前端辅助模块。

例如：

- `FeatureRail.tsx`：左侧功能导航
- `ResourceSidebar.tsx`：资源/上下文侧栏
- `format.ts`：时间和文本格式化
- `language.ts`：语言辅助
- `storage.ts`：localStorage 相关
- `shell.ts`、`text.ts`、`agents.ts`、`composer.ts`：壳层和跨页面辅助逻辑

### `pages/`

按功能拆分的页面模块都在这里。

当前主要页面有：

- `chat/`
- `config/`
- `runtime/`
- `skills/`
- `tasks/`
- `teams/`
- `workflow/`
- `schedules/`
- `settings/`

一个 page 目录通常包含：

- 页面组件
- 该功能私有的辅助函数
- 功能内局部类型或工具

### `ui/`

放更通用的 UI 组件或渲染块，不直接绑定到某个 feature。

当前代表文件：

- `MarkdownDocument.tsx`

## 状态组织原则

renderer 不是业务真源，业务状态主要来自主进程推送的 `AppSnapshot`。

适合保存在 renderer 本地的状态：

- 面板开关
- 当前 tab
- 拖拽过程中的临时状态
- 尚未提交的表单草稿

不适合长期只留在 renderer 的业务状态：

- chats
- tasks
- configured agents
- workflow store
- scheduled workflow runner 状态

这些应该由 main 维护，renderer 负责展示和触发。

## 主要页面职责

### Chat

`pages/chat/` 负责：

- 聊天消息展示
- 聊天控制区
- slash command 辅助
- chat 配置锁定逻辑

### Config / Runtime

这两块都和“Agent 可运行性”有关，但职责不同：

- `config` 偏可复用 Agent 定义
- `runtime` 偏运行通道、provider 配置和诊断

这里会频繁和：

- `shared/provider-presets.ts`
- `shared/models.ts`
- `main/model-config.ts`

联动。

### Skills

`pages/skills/` 负责：

- 浏览 bundled skills
- 查看已导入技能
- 搜索在线技能
- 触发导入、安装、卸载

注意这里尽量只负责 UI，不要在 renderer 里做文件系统逻辑。

### Tasks / Teams

这两块主要是把 main 层的运行状态可视化。很多逻辑并不在 renderer，而是已经体现在 snapshot 里。

### Workflow / Schedules

这是当前前端里最复杂的区域之一。

Workflow 相关负责：

- workflow draft 编辑
- DAG 画布和布局
- 运行历史
- 上下文与产物展示

Schedule 相关负责：

- 定时任务编辑
- runner 配置
- 云端 schedule 同步和触发事件显示

## 样式组织

当前全局样式主要还在 `src/renderer/src/styles.css` 中。

这意味着：

- 页面已经部分拆分
- 样式还比较集中
- 样式修改的影响面可能较大

改样式时建议：

- 尽量按 feature 命名 class
- 少用影响范围过大的宽泛选择器
- 保持和现有应用壳层一致的视觉结构

## 测试重点

renderer 这层当前已有的关键测试之一是：

- `App.layout.test.tsx`

由于 `App.tsx` 还是集成热点，很多问题会先在这里暴露。后续如果继续拆分页面逻辑，优先把逻辑拆成更容易单测的 helper，减少巨型集成测试压力。

## 开发建议

- 能改 page 目录就尽量别继续堆大 `App.tsx`
- 能抽成 helper 的业务判断不要埋在 JSX 里
- 可复用的前端逻辑移动到 `app/` 或 `ui/`
- 只要改动跨 main / renderer 边界，优先先改 `shared` 类型
