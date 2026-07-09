# Workflow V2 钩子系统

## 作用

钩子用于在节点生命周期的关键阶段插入轻量控制逻辑，而不要求为每个小需求都新增一种节点类型。

## 生命周期位置

```text
beforeExecute
  -> 渲染 prompt / 准备脚本环境
  -> Agent / 脚本执行
  -> afterOutput
  -> 验证流水线
  -> afterComplete
```

## 原语分类

### 流程控制

- `pause`
- `skip`

### 上下文操控

- `readFile`
- `injectContext`
- `writeMemory`
- `readMemory`
- `extract`

### 输出投递

- `writeFile`
- `httpCall`
- `sendSlack`
- `sendEmail`
- `postPRComment`

### LLM 能力

- `llmHook`

## llmHook

`llmHook` 允许 Manager 用自然语言描述轻量校验、转换或判断逻辑。

原则：

- 只读、无副作用
- 使用 fast model
- 可访问当前节点输出和钩子上下文变量

## 钩子执行原则

- 钩子在主进程顺序执行
- Agent 和脚本进程不感知钩子存在
- 钩子链中的变量可以逐步累积

## 来源

- Manager 直接在节点上写
- 模板继承
- 模板基础上追加
- 用户在 UI 上人工添加
