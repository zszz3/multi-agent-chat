# MCP 模块开发文档

## 作用范围

`src/mcp/server.ts` 是这个项目的独立 MCP Server 入口，通过 stdio 对外提供工具能力。

启动方式：

```bash
npm run mcp
```

它本身不保存桌面应用状态，而是作为“对外适配层”连接已经运行中的桌面应用。

## 运行模型

MCP 的工作流程是：

1. 读取本地 discovery 文件
2. 获得 desktop app bridge 的 host、port 和 token
3. 向 MCP 客户端暴露 tools
4. 把 tool 调用转成对本地 bridge 的 HTTP 请求

如果桌面应用没启动，MCP 调用会直接报错。

## 当前职责

`src/mcp/server.ts` 主要负责：

- MCP tool 定义
- JSON-RPC 请求处理
- discovery 路径解析
- bridge 鉴权请求
- 将 bridge 返回值转回 MCP 响应

## 当前 tool 范围

当前主要工具域包括：

- skill / agent template 列表
- configured agent 的增删改查
- agent 测试
- channel / model 列表
- workflow 的创建、读取、更新、校验
- workflow context 追加
- workflow run context 追加

tool 名称与 bridge route 的映射集中定义在 `TOOL_ROUTES` 中。

## 设计原则

### MCP 是适配层，不是业务层

不要在这里重写一遍业务逻辑。

正确方向是：

1. 先在 main-process bridge 或后端能力层把能力做好
2. 再在 `src/mcp/server.ts` 里把它映射成 MCP tool

### Schema 要和真实能力一致

`inputSchema` 是 MCP 调用方看到的契约，如果 route 或参数变了，要同步更新：

- schema
- tool 描述
- bridge 请求 payload

### 错误要可读

当前代码已经区分了几种典型失败：

- 桌面应用未运行
- discovery 文件无效
- 未知 MCP tool
- bridge 请求失败

这些错误提示要尽量保持明确，因为 MCP 客户端无法像 UI 那样给出额外上下文。

## 和 bridge 的关系

MCP 模块依赖主进程提供的本地 bridge，所以相关改动常常也要同时检查：

- `src/main/mcp-bridge.ts`
- 主进程启动时的 discovery 文件写入
- shared 类型是否需要补充

换句话说，MCP 这层通常不是单独改得完的。

## 测试重点

主要测试文件是：

- `src/mcp/server.test.ts`

建议重点保护：

- tool 定义是否稳定
- discovery 读取逻辑
- 参数转发是否正确
- 当桌面应用不可用时错误是否清晰

## 开发建议

- 新能力优先走后端扩展，再加 MCP 映射
- tool 命名尽量贴近应用真实领域概念
- 避免做隐式 payload 变换
- schema 和描述要足够清楚，方便外部客户端理解这个 tool 到底做什么
