# Workflow V2 Only Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Workflow V2 definitions and frozen plans the only workflow authoring, persistence, rendering, and execution model, deleting the legacy `WorkflowGraph` runtime and compatibility code.

**Architecture:** `WorkflowV2Definition` becomes the editable canonical document and `WorkflowV2Plan` becomes the only executable snapshot. Manager/MCP authoring creates V2 definitions directly, the renderer projects V2 nodes and edges without a legacy graph adapter, and `WorkflowRuntime` retains only the V2 scheduler. Existing persisted legacy workflows are intentionally unsupported and are not migrated.

**Tech Stack:** TypeScript, Electron, React, Vitest, Workflow V2 scheduler/store/conversation runtime.

---

### Task 1: Replace Authoring Contract

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/main/hub/codex/agent-hub-codex-workflow-tools.ts`
- Modify: `src/shared/workflow-agent.ts`
- Test: `src/mcp/server.test.ts`
- Test: `src/main/hub/agent-hub.test.ts`

- [x] Define workflow create requests around `WorkflowV2Definition`; update/store removal continues in Task 2.
- [x] Publish a strict MCP JSON schema for LLM/script nodes, execution modes, output fields, and dependency edges.
- [x] Require Manager-created LLM nodes to state `executionMode`; user-input-dependent nodes must be `interactive`.
- [x] Remove `workflowGraph.upsert` fallback and legacy graph parser usage.
- [x] Verify MCP and Manager creation preserve interactive execution mode and immediately freeze a V2 plan.

### Task 2: Replace Store And Persistence

**Files:**
- Modify: `src/main/workflow-store.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-draft.ts`
- Modify: `src/main/hub/workflow/agent-hub-workflow-clone.ts`
- Modify: `src/main/hub/state/agent-hub-restore.ts`
- Modify: `src/main/hub/persisted/agent-hub-persistence.ts`
- Test: `src/main/hub/workflow/agent-hub-workflow-restore.test.ts`

- [x] Store editable V2 definitions and optional frozen plans only.
- [x] Delete legacy graph cloning, normalization, and restoration branches.
- [x] Reject old persisted workflow records rather than converting them.
- [x] Ensure graph edits invalidate the frozen plan deterministically.
- [x] Verify save/restore retains execution modes and scripts.

### Task 3: Make V2 The Only Runtime

**Files:**
- Modify: `src/main/workflows/workflow-runtime.ts`
- Delete: `src/shared/workflow-run.ts`
- Delete: `src/shared/workflow-run.test.ts`
- Modify: `src/main/hub/agent-hub.ts`
- Test: `src/main/workflows/workflow-runtime.test.ts`
- Test: `src/main/hub/agent-hub.test.ts`

- [x] Require an approved frozen V2 plan before a run starts.
- [x] Delete legacy `executeRun`, judge, retry, final-review, and gate execution paths.
- [x] Keep only V2 dependency settlement, one-shot, interactive, script, supervision, and recovery paths.
- [x] Ensure `waiting_for_user`, `completion_proposed`, and paused states never release descendants.
- [x] Verify one-shot/interactive/script execution through the main-process boundary.

### Task 4: Replace Renderer Workflow Domain

**Files:**
- Modify: `src/renderer/src/pages/workflow/workflow-domain.ts`
- Modify: `src/renderer/src/pages/workflow/workflow-controller.ts`
- Modify: `src/renderer/src/pages/workflow/hooks/useWorkflowDraft.ts`
- Modify: `src/renderer/src/pages/workflow/WorkflowPage.tsx`
- Modify: `src/renderer/src/pages/workflow/WorkflowCanvasBoard.tsx`
- Test: `src/renderer/src/App.layout.test.tsx`

- [x] Render V2 definitions directly and expose execution mode on every executable node.
- [x] Edit LLM/script-specific fields without legacy node kinds.
- [x] Open the node-agent window for interactive nodes before a run starts.
- [x] Remove legacy gate input and legacy graph assumptions.
- [x] Verify authoring, plan approval, run, and node conversation UX.

### Task 5: Delete Legacy Workflow Surface

**Files:**
- Delete: `src/shared/workflow-graph.ts`
- Delete: `src/shared/workflow-graph.test.ts`
- Update: all remaining imports found by repository search
- Update: workflow documentation and READMEs

- [x] Remove `WorkflowGraph`, `WorkflowGraphNode`, and legacy validation types.
- [x] Remove bundled legacy workflow definitions or rewrite them as V2 definitions.
- [x] Remove compatibility IPC/MCP request shapes and fallback parser code.
- [x] Confirm repository search finds no legacy graph/runtime identifiers.
- [x] Update authoritative docs to state V2-only support.

### Task 6: Completion Verification

**Files:**
- Test: repository-wide

- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Search for `WorkflowGraph`, `workflowGraph.upsert`, `executeRun`, and legacy workflow-run helpers; expect no production hits.
- [x] Create a workflow whose first node asks for mood input and prove the node is frozen as `interactive` before execution.
- [x] Commit each completed migration slice without staging `.idea/workspace.xml`, `memory.md`, or `outputs/`.
