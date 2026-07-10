# Multi Agent Chat 文档

这个目录是 `Multi Agent Chat` 的中文文档入口，对应英文文档结构，便于中英文并行维护。

## 文档列表

- `architecture-overview.md`：项目整体架构、运行流程、SDK-backed `oneshot` / `interactive` 执行边界和数据流
- `runtime-execution-architecture-spec.md`：runtime boundary reset 总纲与 phase spec 指针文档
- `../workflow-v2-design.md`：Workflow V2 总纲文档
- `../superpowers/README.md`：设计规格与实施计划文档归档入口
- `../progress/README.md`：阶段性进展与重构记录归档入口
- `topics/README.md`：中文专题说明文档入口
- `topics/runtime-control-gateway-proposal.md`：控制面网关拆分草案，面向多底座接入的运行时管理能力收敛方案
- `modules/main.md`：Electron 主进程、应用状态中心、官方 Claude SDK runtime 接线和 interactive session 编排文档
- `modules/preload.md`：preload 桥接层开发文档
- `modules/renderer.md`：React 渲染层和页面模块开发文档
- `modules/shared.md`：共享类型、预设、工作流图辅助逻辑和技能元数据文档
- `modules/mcp.md`：MCP 服务与 bridge 集成开发文档

顶层只保留少数总入口文档；专题细节、设计归档和进展记录会放到对应子目录里。

## 建议阅读顺序

如果你第一次接触这个仓库，建议先读：

1. `README.md`
2. `docs/zh-CN/architecture-overview.md`
3. `docs/zh-CN/runtime-execution-architecture-spec.md`
4. `src/shared/types.ts`
5. `src/main/app/index.ts`
6. `src/main/hub/agent-hub.ts`

如果你在做 runtime execution 相关工作，优先读：

- `docs/zh-CN/runtime-execution-architecture-spec.md`
- `docs/superpowers/specs/runtime/2026-07-08-runtime-boundary-reset-design.md`
- 对应的 `docs/superpowers/specs/runtime/2026-07-08-runtime-phase-0x-*.md`

如果你要查设计稿或实施计划归档，优先看：

- `docs/superpowers/README.md`
- `docs/superpowers/specs/README.md`
- `docs/superpowers/plans/README.md`

如果你要查阶段性进展或重构记录，优先看：

- `docs/progress/README.md`

如果你要查 Workflow V2 设计，优先看：

- `docs/workflow-v2-design.md`
- `docs/workflow-v2/README.md`

如果你要看中文专题展开，优先看：

- `docs/zh-CN/topics/README.md`

## 按改动范围选文档

- 改桌面生命周期、IPC、持久化、runtime 附着或恢复行为：看 `modules/main.md`
- 改 renderer 可调用 API：看 `modules/preload.md`
- 改页面、布局、交互、前端状态组织：看 `modules/renderer.md`
- 改跨层数据结构、共享辅助逻辑：看 `modules/shared.md`
- 改 MCP 对外工具能力：看 `modules/mcp.md`
