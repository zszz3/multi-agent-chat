# 不同 Agent 接入指南

本文说明如何在不让 Chat、Task、Workflow 等上层业务感知具体 Agent 的前提下，接入新的 CLI、ACP、SDK 或 API Runtime。

## 1. 接入边界

上层只提交统一的 `RuntimeRequest`，并声明需要的 surface、执行模式和续接策略。具体协议、命令参数、会话标识与清理方式都由 Runtime 自己负责。

支持的 surface 为：

| Surface | 用途 | 常用执行模式 |
| --- | --- | --- |
| `chat` | 对话界面 | `interactive`；无会话能力的 API 可用 `oneshot` |
| `task` | 单任务执行 | `oneshot` |
| `workflow` | Workflow 节点执行 | `oneshot` |
| `channel-test` | 配置页测试连接 | `oneshot` |
| `cleanup` | 删除 Runtime 原生会话数据 | `oneshot` |

必须遵守以下边界：

- 不在 `AgentHub`、Chat 或 Workflow 中增加 `if runtimeId === "xxx"`。
- 不为了接口对称而虚构 `resume`、`cleanup` 或模型选择能力。
- 原生 session/thread id 只放在 Runtime codec 管理的不透明 `runtimeConversation` 中。
- 中央装配只注册 `createXxxDriver(options)`，不展开具体 Agent 实现。

## 2. 先选择接入类型

先根据 Agent 的官方协议证据选择最小适配方式。

| 类型 | 适用条件 | 实现重点 | 当前参考 |
| --- | --- | --- | --- |
| Stateless CLI | 每次命令独立完成，没有稳定会话 | runner、one-shot executor、workflow、channel test | 各 Runtime 的 task/workflow 路径 |
| CLI + ACP | CLI 同时提供 one-shot 与 ACP bridge | one-shot + `AcpInteractiveClient` + codec + session | Hermes、OpenCode、OpenClaw |
| Native/SDK session | 官方 SDK 或 RPC 提供会话协议 | 自定义 `InteractiveSession` 适配器与 codec | Codex、Claude |
| HTTP API | 只有请求/响应接口，无原生会话 | virtual Runtime、API executor、provider 配置 | API Runtime |

接入前至少确认：

1. 官方安装方式和 `--version` 行为。
2. one-shot 命令或 API 的输入、输出、超时和取消方式。
3. 是否存在稳定的 session/thread identity，以及是否支持跨进程恢复。
4. interactive 协议是否支持流式事件、取消、审批和用户输入请求。
5. 是否有“精确删除当前会话”的官方操作；只有答案明确时才声明 `cleanup`。
6. Chat 与 one-shot 的模型参数是否一致。例如 OpenClaw ACP Chat 使用 Gateway session model，one-shot 才读取配置模型。

## 3. 公共登记

### 3.1 Runtime catalog

在 `src/shared/runtime-catalog.ts` 的 `RUNTIME_DEFINITIONS` 中增加一项：

```ts
{
  id: "myagent",
  label: "My Agent",
  executable: "myagent",
  executableEnv: "MYAGENT_PATH",
  detection: "cli",
  defaultChannel: {
    id: "myagent-default",
    label: "My Agent Default",
    presetId: "myagent-default",
  },
}
```

`AgentId`、Runtime 检测顺序和配置页 Runtime 顺序都从 catalog 派生，不要再维护第二份枚举。纯 HTTP Runtime 使用 `detection: "virtual"`，不执行 `--version`。

随后补齐：

- `src/shared/models.ts` 中的 fallback model；
- `src/shared/provider-presets.ts` 中确有需要的默认 preset；
- Runtime 特有的 channel/env 归一化逻辑；
- `src/main/agents/runtime/detect.test.ts` 和配置默认值测试。

如果 catalog 已经能驱动 UI，不要为新 Runtime 再加硬编码卡片或排序分支。

### 3.2 Runtime 本地目录

按能力创建文件，不要求每个 Agent 拥有完全相同的文件：

```text
src/main/agents/myagent/
  myagent-runner.ts                 # CLI 协议与进程事件
  myagent-runtime-state-codec.ts    # 仅在有真实会话标识时需要

src/main/hub/runtime/executor/myagent/
  create-myagent-driver.ts          # 唯一注册入口
  myagent-capabilities.ts           # surface/mode/policy 声明
  myagent-executor.ts               # task/one-shot chat
  myagent-workflow.ts               # workflow 与 channel test
  myagent-session.ts                # 仅 interactive Runtime 需要
  myagent-cleanup.ts                # 仅支持精确清理时需要
```

runner 负责底层协议和进程生命周期；executor/session 负责把协议转换为项目统一事件；builder 只组装该 Runtime 的能力。

## 4. 按接入类型实现

### 4.1 Stateless CLI

1. runner 使用 `execCli` 或受控的子进程封装，显式传入 executable、args、cwd、environment、timeout 和 abort signal。
2. executor 实现统一的 `AgentExecutor`，将 stdout/JSONL 转换为 `AgentEvent`。
3. workflow 和 channel test 可以复用 runner，但要分别设置 prompt、输出解析和错误文案。
4. 使用 `createOneShotRuntimeDriver` 组装 driver。
5. 不提供 `runtimeStateCodec`、`createInteractiveSession` 和 `cleanup`，除非上游确实支持。

如果 Chat 也走 one-shot，应只声明 `chat/oneshot/fresh`；不要伪造可恢复会话。

### 4.2 CLI + ACP

1. task、workflow、channel test 仍走官方 one-shot 命令。
2. Chat 使用共享 `AcpInteractiveClient`，根据官方文档设置 ACP 子命令和 cwd 参数。
3. Runtime session 继承共享 ACP 生命周期，处理 attach、prompt、cancel、detach 与 resume。
4. 使用 `createAcpRuntimeStateCodec(runtimeId)` 保存并校验 ACP session id。
5. 显式声明审批、用户输入、取消和恢复能力；不支持的字段保持 `false`。
6. 使用 `createInteractiveRuntimeDriver` 组装 driver。

已有差异不能被抹平：

| Runtime | One-shot | Interactive | Cleanup |
| --- | --- | --- | --- |
| Hermes | `hermes -z` | `hermes acp` | `hermes sessions delete` |
| OpenCode | `opencode run` | `opencode acp --cwd ...` | `opencode session delete` |
| OpenClaw | `openclaw agent --json` | `openclaw acp` | 不声明；官方没有当前 App Chat 的精确 durable session 删除语义 |

更多上游证据见 [Hermes](hermes/README.md)、[OpenCode](opencode/README.md) 和 [OpenClaw](openclaw/README.md)。

### 4.3 Native/SDK session

当官方没有 ACP、但 SDK/RPC 有稳定会话时：

1. 实现 `InteractiveSession` 的 attach、sendPrompt、interrupt、detach 和 snapshot。
2. 把 SDK/RPC 事件映射成统一 `AgentEvent`，不要把原生事件泄漏到上层。
3. codec 只持久化恢复所需的最小原生标识。
4. one-shot task/workflow 与 interactive Chat 可以使用不同官方入口，但必须在同一 driver 中声明真实能力。

Codex 与 Claude 的 driver/session 是这类接入的参考。

### 4.4 HTTP API

1. catalog 使用 virtual detection。
2. channel 保存 base URL、API format、headers 和 key 引用；密钥不能写入日志或持久化为明文调试输出。
3. executor 将不同 provider wire format 归一化为统一事件。
4. 没有原生 continuation identity 时，所有 surface 只声明 `fresh`。
5. provider 特有字段留在 API Runtime 内，不进入 `AgentHub`。

## 5. 声明与注册

在 `myagent-capabilities.ts` 中显式声明 `RuntimeSurfaceSupport[]`。实现了 handler 不等于自动支持某个 surface；声明和 handler 必须一致。

builder 的职责是组装能力，而不是让中央文件知道细节：

```ts
export function createMyAgentDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  return createOneShotRuntimeDriver({
    runtimeId: "myagent",
    surfaceSupport: [...myAgentSurfaceSupport],
    getCapabilities: getMyAgentCapabilities,
    createOneShotExecutor: (context) => new MyAgentExecutor(context, options),
    askWorkflow: (input) => runMyAgentWorkflow(input, options),
    testChannel: (input) => runMyAgentChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
}
```

最后只在 `src/main/hub/runtime/executor/agent-executor.ts`：

1. import `createMyAgentDriver`；
2. 向 `RuntimeDriverRegistry` 数组增加 `createMyAgentDriver(options)`。

不要在 Router、Hub、Chat 或 Workflow 中增加新的 Runtime 分发分支。

## 6. 测试与验收

### 6.1 自动化测试

每个新 Runtime 至少覆盖：

- catalog 默认 channel、fallback model 与 executable env override；
- runner 的命令参数、cwd、环境变量、超时、取消和错误解析；
- driver 的 surface/mode/policy 声明；
- Router 对支持与不支持 surface 的行为；
- one-shot task、workflow 和 channel test；
- interactive attach、流式事件、cancel、detach、resume 与 app restart restore；
- codec 对错误 runtime id、版本和畸形 payload 的拒绝；
- cleanup 的精确 session id；不支持 cleanup 的 Runtime 删除 App Chat 时不能报错；
- Runtime onboarding contract，确保 catalog 与 registry 没有漏项。

常用检查：

```bash
npm run typecheck
npx vitest run src/main/agents/runtime src/main/hub/runtime/executor
npm run build
```

### 6.2 真实环境 Smoke Test

Mock 通过后仍需使用官方安装包验证：

1. `<command> --version` 能被检测。
2. 配置页“测试连接”通过，并能看到可理解的失败信息。
3. Task 返回最终文本并能取消。
4. Workflow 节点使用 one-shot 路径运行，不误用 Chat interactive session。
5. Chat 能连续发送两轮、取消、关闭后恢复；声明 app restart resume 时必须真的重启验证。
6. 删除 Chat 时，支持 cleanup 的 Runtime 删除正确原生会话；不支持的 Runtime 只删除 App 状态。
7. 自定义 executable env（如 `MYAGENT_PATH`）能覆盖 PATH 检测。

## 7. 完成标准

接入完成必须同时满足：

- 上层业务没有新增 Runtime 特判；
- catalog、默认配置、driver registry 和测试中的 Runtime 集合一致；
- surface、mode、continuation、interactive capability 与官方能力一致；
- CLI/SDK/API 细节全部收敛在 Runtime 本地目录；
- 自动化测试、构建和真实连接测试通过；
- 本文或对应 Agent 资料记录关键官方证据和已知限制。
