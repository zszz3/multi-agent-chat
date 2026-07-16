# MCP Agent Management Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an agent-scoped MCP management console with installed-server diagnostics, details, and contextual installation drawer.

**Architecture:** Extend the managed MCP configuration contract with diagnostic data derived from the current managed block and catalog requirements. Expose it through Electron IPC, then replace the catalog-first renderer with an installed-first dashboard and a drawer that reuses the existing install bridge.

**Tech Stack:** Electron IPC, TypeScript, React 19, Vitest, lucide-react, existing CSS token system.

---

### Task 1: Add diagnostic contract

**Files:**
- Modify: `src/shared/mcp-config.ts`
- Test: `src/shared/mcp-config.test.ts`

- [ ] Write tests for required-path, required-token, healthy, and missing-block diagnostic states.
- [ ] Add a parser for managed MCP block fields and a catalog-aware diagnostic function.
- [ ] Run `npm test -- --run src/shared/mcp-config.test.ts`.

### Task 2: Expose agent-scoped diagnostics

**Files:**
- Modify: `src/main/app/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/src/global.d.ts`

- [ ] Add an IPC request that reads the current config and returns diagnostics for one agent.
- [ ] Add the preload and renderer API types.
- [ ] Test the shared configuration contract and type-check the IPC boundary.

### Task 3: Replace the MCP page layout

**Files:**
- Modify: `src/renderer/src/pages/agent/McpPage.tsx`
- Modify: `src/renderer/src/styles.css`

- [ ] Render header agent selection and status summary.
- [ ] Render installed MCP search/filter/list and default Overview detail tab.
- [ ] Implement Tools, Configuration, and Activity tabs.
- [ ] Implement Add MCP drawer using current installation IPC and required setup fields.
- [ ] Preserve uninstall, config-folder, and restart-session messaging.

### Task 4: Verify the interface

**Files:**
- Test: `src/shared/mcp-config.test.ts`

- [ ] Run targeted tests and `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --check` and ensure no user-owned artifacts are staged.