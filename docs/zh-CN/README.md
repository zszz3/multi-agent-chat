# Multi Agent Chat 文档

这个目录是 `Multi Agent Chat` 的中文文档入口，对应英文文档结构，便于中英文并行维护。

## 文档列表

- `architecture-overview.md`：项目整体架构、运行流程、SDK-backed `oneshot` / `interactive` 执行边界和数据流
- `runtime-execution-architecture-spec.md`：runtime boundary reset 总纲与 phase spec 指针文档
- `modules/main.md`：Electron 主进程、应用状态中心、官方 Claude SDK runtime 接线和 interactive session 编排文档
- `modules/preload.md`：preload 桥接层开发文档
- `modules/renderer.md`：React 渲染层和页面模块开发文档
- `modules/shared.md`：共享类型、预设、工作流图辅助逻辑和技能元数据文档
- `modules/mcp.md`：MCP 服务与 bridge 集成开发文档

## 建议阅读顺序

如果你第一次接触这个仓库，建议先读：

1. `README.md`
2. `docs/zh-CN/architecture-overview.md`
3. `docs/zh-CN/runtime-execution-architecture-spec.md`
4. `src/shared/types.ts`
5. `src/main/index.ts`
6. `src/main/agent-hub.ts`

如果你在做 runtime execution 相关工作，优先读：

- `docs/zh-CN/runtime-execution-architecture-spec.md`
- `docs/superpowers/specs/2026-07-08-runtime-boundary-reset-design.md`
- 对应的 `docs/superpowers/specs/2026-07-08-runtime-phase-0x-*.md`

## 按改动范围选文档

- 改桌面生命周期、IPC、持久化、runtime 附着或恢复行为：看 `modules/main.md`
- 改 renderer 可调用 API：看 `modules/preload.md`
- 改页面、布局、交互、前端状态组织：看 `modules/renderer.md`
- 改跨层数据结构、共享辅助逻辑：看 `modules/shared.md`
- 改 MCP 对外工具能力：看 `modules/mcp.md`
