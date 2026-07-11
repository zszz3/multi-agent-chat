# Agent Types and Revisions Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mutable configured-Agent list with explicit execution/composed Agent types and immutable execution configuration revisions while preserving existing Chat, Workflow, Task, and Team behavior.

**Architecture:** Keep `ConfiguredAgent` as the current Agent projection consumed by existing surfaces, add explicit type/base/instructions/current-revision fields, and introduce immutable `AgentRevision` records. Runtime channels synchronize read-only execution Agents one-to-one; composed Agents are created and versioned explicitly. Store Agents and Revisions in normalized SQLite tables rather than `app_aux_state` JSON.

**Tech Stack:** TypeScript, Electron IPC, Node SQLite, React, Vitest.

---

### Task 1: Define Agent contracts and revision helpers

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/agent-revisions.ts`
- Create: `src/shared/agent-revisions.test.ts`

- [ ] Add `AgentType`, `AgentRevision`, explicit `agentType`, `baseAgentId`, `instructions`, `currentRevisionId`, and `revision` fields.
- [ ] Add deterministic execution-hash and revision-construction helpers that exclude display-only fields and secrets.
- [ ] Test that behavioral changes produce a new hash while name/description/tag changes do not.

### Task 2: Synchronize execution Agents and composed revisions in AgentHub

**Files:**
- Modify: `src/main/hub/agent-hub.ts`
- Modify: `src/main/hub/persisted/agent-hub-state-restore.ts`
- Modify: `src/main/hub/persisted/agent-hub-persisted-payload.ts`
- Modify: `src/main/hub/persisted/agent-hub-persistence.ts`
- Modify: `src/main/hub/agent-hub.test.ts`

- [ ] Replace managed-Agent restoration with one read-only execution Agent per Runtime channel.
- [ ] Generate an execution Revision when a channel's behavioral configuration changes.
- [ ] Save composed Agents through a dedicated operation that creates a new Revision only when behavioral configuration changes.
- [ ] Preserve current IDs and migrate legacy managed Agents to execution type and user Agents to composed type.
- [ ] Resolve composed execution through its pinned base execution configuration.
- [ ] Test Runtime synchronization, composed save behavior, display-only updates, and existing selection compatibility.

### Task 3: Normalize Agent persistence

**Files:**
- Modify: `src/main/hub/persisted/sqlite-schema.ts`
- Modify: `src/main/hub/persisted/sqlite-store.ts`
- Modify: `src/main/hub/persisted/sqlite-store.test.ts`

- [ ] Add normalized `agents`, `agent_revisions`, and ordered relation-ready tables.
- [ ] Load Agents/Revisions from normalized tables and remove them from auxiliary JSON on save.
- [ ] Migrate existing auxiliary configured Agents on the first normalized save.
- [ ] Test round-trip persistence and verify the auxiliary payload no longer contains Agent state.

### Task 4: Add explicit IPC operations

**Files:**
- Modify: `src/main/app/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.test.ts`

- [ ] Add create/update composed Agent and list Agent Revision APIs.
- [ ] Keep the legacy bulk-save API temporarily as a compatibility adapter, but reject behavioral edits to execution Agents.
- [ ] Test preload method exposure and IPC wiring.

### Task 5: Reshape the Agent page

**Files:**
- Modify: `src/renderer/src/pages/agent/AgentPage.tsx`
- Modify: `src/renderer/src/pages/agent/hooks/useConfiguredAgentsManager.ts`
- Modify: `src/renderer/src/AppShell.tsx`
- Modify: `src/renderer/src/styles.css`
- Modify: `src/renderer/src/App.layout.test.tsx`

- [ ] Group composed and execution Agents in one left list.
- [ ] Render execution Agents as read-only with a Runtime management hint.
- [ ] Add base execution Agent and Instructions controls for composed Agents.
- [ ] Stop autosaving each keystroke; save composed behavior only from the explicit Save New Version command.
- [ ] Add Revision history summary and preserve responsive layout constraints.

### Task 6: Verify and commit

**Files:**
- Verify all files above.

- [ ] Run focused Agent, persistence, preload, and renderer tests.
- [ ] Run typecheck and production build.
- [ ] Run the full test suite and report pre-existing Runtime failures separately.
- [ ] Inspect the real Electron Agent page and verify both groups, read-only execution state, composed editing, and no overflow.
- [ ] Commit the phase without pushing.
