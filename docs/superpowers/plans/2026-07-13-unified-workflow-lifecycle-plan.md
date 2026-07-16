# Unified Workflow Lifecycle Implementation Plan

1. Add failing lifecycle and MCP binding tests.
2. Extend Workflow state with confirmed revision data.
3. Replace create-and-activate with draft materialization.
4. Delete workflow-created migration event handling.
5. Add confirm command through main, IPC, and renderer.
6. Require confirmed current revision before runs.
7. Add confirmation controls and status UI.
8. Verify persistence, tests, typecheck, and build.
