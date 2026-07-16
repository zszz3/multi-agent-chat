# Agent MCP Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Agent-scoped MCP catalog with safe one-click Codex configuration.

**Architecture:** A pure shared catalog/config merger owns deterministic managed TOML blocks. Main-process IPC reads and mutates `~/.codex/config.toml` with timestamped backups. The renderer uses a Skill-library-style master/detail page and never handles filesystem writes directly.

**Tech Stack:** TypeScript, Electron IPC, React, Vitest, Codex TOML configuration.

---

### Task 1: Managed TOML blocks
- [ ] Add catalog and block rendering types in `src/shared/mcp-config.ts`.
- [ ] Add failing merge/remove/conflict tests in `src/shared/mcp-config.test.ts`.
- [ ] Implement deterministic Agent-scoped blocks preserving unrelated TOML.

### Task 2: Main-process installation API
- [ ] Add install/list/uninstall request and result types.
- [ ] Add IPC handlers that read, back up, merge, and atomically write `config.toml`.
- [ ] Expose APIs through `src/preload/index.ts`.

### Task 3: MCP library UI
- [ ] Rename Skills navigation label to `Skill`.
- [ ] Rebuild `McpPage.tsx` with catalog, search, details, parameters, status, install and uninstall controls.
- [ ] Keep installation scoped to the selected configured Agent.

### Task 4: Verification
- [ ] Run focused MCP tests.
- [ ] Run TypeScript typecheck.
- [ ] Run production Electron build.
- [ ] Review diff and exclude user-owned files.
