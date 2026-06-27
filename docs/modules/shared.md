# Shared Module Development Guide

## Scope

`src/shared/` contains code reused across process boundaries.

This module is the contract and domain-helper layer shared by:

- main process
- preload
- renderer
- MCP server

## Core Responsibilities

### Types

`src/shared/types.ts` defines the main domain contracts for the whole app.

Important areas include:

- agent and runtime definitions
- configured agents
- channels and models
- chat session and event shapes
- task state
- workflow graph, workflow store, and workflow runs
- scheduled workflow state
- skill template and install result types
- app snapshot

If multiple layers need to agree on shape, the definition should usually live here.

### Presets and Selection Helpers

Key files:

- `models.ts`
- `config-channels.ts`
- `provider-presets.ts`

These files define:

- fallback models
- default channel selection behavior
- provider presets for Codex, Claude, and API runtimes
- storage normalization rules for channels

This logic is not just display metadata. It directly affects configuration defaults and runtime wiring.

### Workflow Graph Logic

Key files:

- `workflow-graph.ts`
- `workflow-agent.ts`

These handle:

- workflow graph parsing from generated text
- graph creation from objectives
- graph validation
- prompt construction for workflow planning

If workflow structure changes, update shared graph logic before patching UI behavior around it.

### Skills Metadata

Key files:

- `skill-templates.ts`
- `bundled-skill-library.ts`
- `online-skills.ts`
- `bundled-skills/`

This area provides:

- bundled skill template loading
- online skill search request helpers
- metadata normalization
- prompt text packaging for installation and display

## Why This Layer Matters

The codebase depends on a snapshot-driven architecture. If shared contracts drift, the breakage spreads everywhere:

- preload no longer matches main
- renderer assumptions become stale
- MCP tool responses become inconsistent

That is why `src/shared` should stay conservative and explicit.

## Change Guidelines

### Adding Fields

When adding a field to shared types:

- make sure the producer sets it
- make sure the consumer can tolerate it being absent in older persisted state
- update all layers that rely on exhaustive narrowing or object construction

### Changing Semantics

If you change the meaning of an existing field, audit:

- `AgentHub`
- preload method signatures
- renderer page assumptions
- tests in main and renderer
- MCP server payload handling

### Keeping Helpers Pure

Prefer pure functions in shared modules. This keeps them:

- easy to test
- safe to reuse in any layer
- independent of Electron and DOM concerns

Avoid introducing:

- filesystem access
- Electron APIs
- renderer-only assumptions
- main-process side effects

## Testing Focus

Current colocated tests include:

- `workflow-graph.test.ts`
- `workflow-agent.test.ts`
- `online-skills.test.ts`

These are the right place for deterministic logic checks that should not require Electron or React.

## Development Advice

- keep shared files boring and explicit
- prioritize contract clarity over clever abstractions
- use this layer to remove duplication between main and renderer
- if logic needs Node, Electron, or UI state, it probably does not belong here
