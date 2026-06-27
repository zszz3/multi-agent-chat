# Preload 开发文档

## 作用范围

`src/preload/index.ts` 是 renderer 和主进程之间的安全桥接层。

它负责通过 `contextBridge` 向前端暴露一个受控 API，也就是 `window.multiAgentChat`。

## 这一层做什么

当前 preload 层主要负责：

- 包装 `ipcRenderer.invoke(...)`
- 注册和清理事件监听
- 为 renderer 提供类型明确的方法集合

它的价值在于把 Electron 细节隔离掉，让 React 页面不直接依赖 `ipcRenderer`。

## 当前 API 范围

目前暴露的能力大致包括：

- snapshot 获取与 runtime 刷新
- chat 操作
- model channel 保存、导入、生成
- configured agent 保存与测试
- runtime channel 测试与余额查询
- 本地文件读取与目录定位
- 电源保持唤醒
- skills 搜索、导入、安装、卸载
- workflow agent 请求与 workflow draft 操作
- workflow run 控制
- scheduled workflow runner 与 schedule 管理
- task 操作
- team 操作
- 历史清空
- snapshot、workflow、scheduled workflow、agent test 事件订阅

## 设计原则

### 1. 保持薄

preload 只做桥接，不做业务编排。

适合放在 preload 的代码：

- 转发 IPC
- 包装订阅函数
- 提供 cleanup

不适合放在 preload 的代码：

- 业务规则判断
- 复杂数据变换
- 重复实现 main 或 shared 里的逻辑

### 2. 类型尽量来自 shared

preload 的参数和返回值应尽量复用 `src/shared/types.ts` 中的类型，避免 main / preload / renderer 三层定义漂移。

### 3. 推送事件要成对设计

如果主进程推送了一个事件，例如：

- `snapshot:changed`
- `workflow-agent:event`
- `scheduled-workflows:event`
- `configured-agents:test-event`

那么 preload 层最好提供对应的 `onXxx(...)` 方法，并返回取消监听函数。

## 什么时候需要改这一层

你通常会在这些场景改 preload：

- 新增了一个 renderer 需要调用的 IPC 能力
- 主进程新增了一个需要订阅的推送事件
- 共享契约变了，preload 需要跟着调整方法签名

纯页面样式、纯前端显示逻辑，一般不需要碰这里。

## 测试重点

主要测试文件是 `src/preload/index.test.ts`。

建议重点验证：

- IPC channel 名称是否正确
- 参数是否正确转发
- 监听器是否正确注册和移除
- 暴露的 API 结构是否稳定

## 开发建议

- preload 方法名尽量与业务域保持一致
- 不要让 renderer 直接用 `ipcRenderer`
- 尽量做显式新增，而不是偷偷改已有方法语义
- 如果 preload 开始变“聪明”，说明逻辑大概率放错层了
