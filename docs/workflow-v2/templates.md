# Workflow V2 模板系统

## 定位

模板是**可选的快捷方式**，不是约束。Manager 可以：

- 不使用模板，直接写节点完整定义
- 引用模板，快速生成节点
- 在模板基础上覆盖部分字段

这意味着 Workflow V2 的中心始终是“自由编排”，不是“在预设类型里做选择题”。

## 模板定义结构

模板可以提供：

- `kind`
- `category`
- `description`
- `whenToUse`
- `execModel`
- `params`
- `prompt`
- `outputFields`
- `judgeDimensions`
- `constraints`
- `hooks`
- 默认的重试与失败策略

示意：

```json
{
  "kind": "信息收集",
  "category": "research",
  "execModel": "llm",
  "params": [
    { "key": "topic", "type": "string", "required": true },
    { "key": "scope", "type": "string[]", "required": false }
  ],
  "prompt": "你需要调研以下主题：{{params.topic}}",
  "outputFields": [
    { "key": "summary", "required": true },
    { "key": "findings", "required": true }
  ],
  "judgeDimensions": [
    { "key": "sources", "passThreshold": "must" }
  ]
}
```

## 三种使用方式

### 完全自由

Manager 直接写所有字段，模板系统完全不参与。

### 引用模板

Manager 选择模板，填参数，运行时展开为完整节点。

### 模板加覆盖

Manager 在模板基础上改 `prompt`、`judgeDimensions`、`hooks` 等字段。

## 展开规则

建议展开顺序：

1. 根据 `typeRef` 查模板
2. 用 `params` 渲染模板变量
3. 将模板字段作为默认值
4. 用节点显式字段覆盖模板默认值
5. 如有 `{{templatePrompt}}`，展开为模板原始 prompt

## 注册表

优先级建议：

`会话级 > 用户级 > 内置`

| 层级 | 存放位置 | 生命周期 |
|------|---------|---------|
| 会话级 | `~/.multi-agent-chat/workflows/<id>/node-types/` | 跟随 workflow |
| 用户级 | `~/.multi-agent-chat/node-types/` | 持久 |
| 内置 | 应用自带 | 随应用更新 |

同名 `kind` 由更高优先级层完全替换，不做深度 merge。

## 保存为模板

用户应可以把当前节点完整定义保存为模板，写入用户级注册表，用于后续复用。
