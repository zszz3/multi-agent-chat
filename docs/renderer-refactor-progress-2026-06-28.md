# Renderer Refactor Progress

Date: 2026-06-28
Last updated: 2026-06-29
Branch: `refactor/workflow-main-runner-boundaries`
Scope: renderer shell decomposition, app-level provider/service boundaries, and workflow/runtime boundary cleanup

## Goal

Shrink the renderer from a monolithic `App.tsx` container into:

- `App.tsx` compatibility entry
- `AppShell.tsx` composition layer
- `app/state`, `app/providers`, `app/services` for app-level boundaries
- feature-owned `pages/<feature>` modules for domain orchestration

This is an incremental structural refactor. The preload IPC contract is intentionally preserved for now.

## Completed Work

### 1. Shell split and compatibility layer

Committed in `43c5e9c` (`重构 renderer 壳层并建立应用级分层骨架`):

- `src/renderer/src/App.tsx` is now a thin compatibility wrapper.
- `src/renderer/src/AppShell.tsx` holds the mounted shell implementation.
- Existing tests that import helpers from `./App` are still supported through re-export compatibility.

### 2. App-level state/provider skeleton

Added:

- `src/renderer/src/app/state/snapshot-store.tsx`
- `src/renderer/src/app/state/preferences-store.tsx`
- `src/renderer/src/app/state/navigation-store.tsx`
- `src/renderer/src/app/providers/AppProviders.tsx`
- `src/renderer/src/app/app-state.ts`
- `src/renderer/src/app/constants.ts`

Current effect:

- app-level concepts now have explicit homes
- `AppShell` no longer needs to be the only architectural place for shared state boundaries

### 3. Workflow/domain helper extraction

Added:

- `src/renderer/src/pages/workflow/workflow-domain.ts`

Current effect:

- workflow prompt/judge/final-review style helpers have a dedicated module boundary
- this is the first step toward moving workflow orchestration out of `AppShell`

### 4. Configuration promoted to a top-level feature

Implemented in the first refactor commit:

- `configuration` is now a first-class `ActiveFeature`
- `FeatureRail` includes a dedicated configuration entry
- `CommandPalette` supports configuration navigation
- `AppShell` mounts `ConfigPage` directly when `activeFeature === "configuration"`

### 5. Sidebar view-model boundary

Implemented in the first refactor commit:

- `ResourceSidebar` now consumes feature-scoped view-models instead of a raw snapshot plus many loose props
- `AppShell` builds the sidebar model and passes `model={sidebarModel}`

### 6. Providers and service entrypoints wired into AppShell

Committed in `59fe16f` (`接入应用 providers 并收口 renderer IPC 服务入口`):

- `AppShell` now wraps the rendered shell with `AppProviders`
- `snapshot`, `preferences`, and `navigation` provider values are assembled in the shell and mounted through `AppProviders`
- new services were added:
  - `src/renderer/src/app/services/snapshot-service.ts`
  - `src/renderer/src/app/services/workflow-service.ts`
- `AppShell` no longer directly references `window.multiAgentChat`
- renderer-side IPC access now flows through:
  - `multiAgentChatService()`
  - `snapshotService()`
  - `workflowService()`

Current effect:

- the service layer is now a real boundary, not just an empty directory
- snapshot subscription and workflow IPC are routed through services
- most future feature extraction can happen without expanding direct preload coupling again

### 7. Workflow runner hook extraction

Committed in `598761a` (`refactor: extract workflow runner hook`):

- `src/renderer/src/pages/workflow/hooks/useWorkflowRunner.ts` now owns `runWorkflowGraphInternal`
- `AppShell` now consumes the workflow runner through a dedicated hook boundary instead of keeping the full runner implementation inline
- `useScheduledWorkflowRunner` continues to trigger workflow execution through the extracted runner interface

Current effect:

- the longest imperative workflow execution path no longer lives directly inside `AppShell`
- workflow execution behavior now has a concrete feature hook boundary that can be reduced further without re-expanding the shell

### 8. Compatibility helper reuse started

Committed incrementally in:

- `6bd0198` (`refactor: reuse app state helpers in shell exports`)
- `4784aa2` (`refactor: reuse workflow domain helpers in shell exports`)
- `e919445` (`refactor: reuse workflow artifact helpers in shell exports`)
- `05be3f7` (`refactor: reuse workflow draft state helpers in shell exports`)
- `4243272` (`refactor: narrow app compatibility helper exports`)

Current effect:

- `AppShell` compatibility exports have started delegating to `src/renderer/src/app/app-state.ts` and `src/renderer/src/pages/workflow/workflow-domain.ts` instead of keeping duplicate implementations inline
- `App.tsx` still preserves the legacy `./App` surface, but a subset of pure helpers now explicitly re-export from their real ownership modules
- this reduces duplicate logic while preserving the current test/import compatibility layer

## Files Most Affected So Far

- `src/renderer/src/App.tsx`
- `src/renderer/src/AppShell.tsx`
- `src/renderer/src/CommandPalette.tsx`
- `src/renderer/src/app/FeatureRail.tsx`
- `src/renderer/src/app/ResourceSidebar.tsx`
- `src/renderer/src/app/shell.ts`
- `src/renderer/src/app/app-state.ts`
- `src/renderer/src/app/constants.ts`
- `src/renderer/src/app/providers/AppProviders.tsx`
- `src/renderer/src/app/services/multi-agent-chat-service.ts`
- `src/renderer/src/app/services/snapshot-service.ts`
- `src/renderer/src/app/services/workflow-service.ts`
- `src/renderer/src/app/state/*.tsx`
- `src/renderer/src/pages/workflow/hooks/useWorkflowDraft.ts`
- `src/renderer/src/pages/workflow/hooks/useWorkflowRunner.ts`
- `src/renderer/src/pages/workflow/hooks/useScheduledWorkflowRunner.ts`
- `src/renderer/src/pages/workflow/workflow-domain.ts`
- `src/renderer/src/ARCHITECTURE.md`

## Validation Status

### Passed

- `npm run typecheck`
  - re-run and passing after the workflow runner extraction and each compatibility-helper reuse slice through `05be3f7`

### Still Failing

- `npm test -- --runInBand src/renderer/src/App.layout.test.tsx`

Current failure count: 12

Observed failure shape:

- mostly style/content expectation mismatches
- not a TypeScript or compile-time breakage from the provider/service wiring

This focused layout test run should not currently be treated as green.

## Remaining Work

This section is intended to cover the remaining work for the current renderer refactor goal, not just the next broad direction.

### A. App-level boundaries still incomplete

Current state:

- providers are mounted
- provider values are still created from `AppShell` local state
- `AppShell` still owns too much application state directly

Still pending:

- move snapshot ownership behind `app/state/snapshot-store.tsx`
- move snapshot refresh and `onSnapshot` subscription ownership behind `snapshot-store` / `snapshot-service`
- add common snapshot selectors so pages do not derive shared state ad hoc inside `AppShell`
- move theme / language / keep-awake / provider-key persistence behind `preferences-store`
- move top-level navigation state such as `activeFeature` and command palette open state behind `navigation-store`
- stop treating `AppProviders` as a thin wrapper over `AppShell` state and turn it into the real app-level ownership boundary

### B. Service layer is only partially built

Current state:

- `multi-agent-chat-service.ts` exists
- `snapshot-service.ts` and `workflow-service.ts` exist
- `AppShell` no longer directly references `window.multiAgentChat`

Still pending:

- add `runtime-service.ts` for channel tests, provider balance queries, and plugin catalog access
- add `chat-service.ts` for chat/session actions
- add `task-service.ts` for task CRUD and run actions
- add `team-service.ts` for team CRUD and run actions
- decide whether `config` gets a dedicated service or continues sharing runtime/config service helpers
- make feature hooks and pages consume services rather than reaching upward into shell-local orchestration
- keep preload IPC semantics unchanged while moving renderer ownership

### C. Workflow extraction is still the largest unfinished slice

Current state:

- workflow pure/domain helpers have started moving into dedicated modules
- `useWorkflowDraft`, `useWorkflowRunner`, and `useScheduledWorkflowRunner` now exist and are wired into `AppShell`
- workflow sidebar rename/context-menu state already has its own hook boundary in `useWorkflowSidebarState`
- workflow IPC now has a dedicated service entrypoint
- `runWorkflowGraphInternal` no longer lives directly in `AppShell`
- some compatibility-only workflow helpers in `AppShell` now delegate to `app/app-state.ts` and `workflow-domain.ts`
- `AppShell` still owns too much workflow composition and too many workflow controller inputs/outputs

Still pending:

- keep shrinking `useWorkflowDraft` / `useWorkflowRunner` / `useScheduledWorkflowRunner` option surfaces so they stop depending on large shell-local setter bags
- move any remaining workflow-only interaction state that is still local to `AppShell` behind feature-owned hooks/controllers
- reduce the amount of workflow orchestration state that is still assembled in `AppShell` before being passed down
- reduce `WorkflowPage` props from a large primitive/callback surface toward `controller` or `viewModel + actions`
- decide whether the workflow hooks should collapse into a higher-level workflow controller boundary for the page and sidebar

Reason this remains first priority:

- workflow is still the heaviest domain in `AppShell`
- even after the hook extraction, it still contains the most renderer-owned orchestration and the widest shell-to-feature prop surface

### D. Runtime and configuration are only split at the navigation level

Current state:

- `configuration` is a top-level feature in navigation
- `RuntimePage` and `ConfigPage` are mounted separately
- ownership is still centralized in `AppShell`

Still pending:

- create `pages/config/hooks/useChannelConfigEditor`
- move config channel editing, dirty tracking, save/load/reset, and selected-channel state out of `AppShell`
- move config-specific local UI state such as config context menu out of `AppShell`
- create `pages/runtime/hooks/useRuntimeDiagnostics`
- move agent test state, test transcript updates, periodic tick state, provider balance refresh, and plugin catalog loading out of `AppShell`
- explicitly define which runtime/config data belongs to app-level preference state versus feature-local editor/diagnostic state

### E. Chat / tasks / teams / skills / schedules still need feature-owned controllers

Still pending:

- create `useChatSession`
  - send
  - stop
  - slash command state
  - active chat selection and config switching behavior
- create `useTaskBoard`
  - filters
  - detail selection
  - rerun / stop / delete / update progress
- create `useTeamWorkspace`
  - team member editing
  - team run selection
  - execute / stop team run flow
- keep `skills` self-contained by moving discovery/import interaction state fully into `SkillsPage` or a dedicated `useSkillDiscovery`
- create `useScheduledWorkflowManager`
  - draft
  - create/detail mode
  - runner connect / disconnect
  - selected schedule handling

### F. Sidebar and page interfaces are not fully normalized yet

Current state:

- `ResourceSidebar` already consumes feature-scoped models

Still pending:

- finish defining explicit feature models such as:
  - `chatSidebarModel`
  - `taskSidebarModel`
  - `workflowSidebarModel`
  - `configSidebarModel`
- move model construction closer to feature hooks/controllers instead of assembling everything in `AppShell`
- reduce page props that are still passed as large primitive/callback bags
- make page interfaces converge on:
  - `controller`
  - or `viewModel + actions`

### G. Tests still need structural migration, not just reruns

Current state:

- `npm run typecheck` passes
- focused `App.layout.test.tsx` still has 12 failures
- those failures currently look like style/content expectation mismatches rather than provider/service wiring regressions

Still pending:

- split `src/renderer/src/App.layout.test.tsx` by feature instead of continuing to grow one legacy test file
- keep only a small `AppShell` integration surface for provider wiring and feature switching
- move helper tests next to feature/domain modules
- cover the originally targeted workflow scenarios:
  - draft hydrate / persist / reset
  - run success
  - node failure
  - final review failure
  - scheduled run ack
- cover runtime/config scenarios:
  - config edit and save
  - preset switching
  - plugin add/remove behavior
  - provider key cache behavior
  - runtime test transcript
  - balance refresh
  - plugin catalog load
- cover chat/task/sidebar scenarios:
  - chat send / stop / slash command completion
  - task filtering and detail switching
  - sidebar model switching by active feature
- remove direct test dependence on `App.tsx` compatibility exports once equivalent feature-local test entrypoints exist

### H. Style and documentation closeout still remain

Still pending:

- split `src/renderer/src/styles.css` after JSX boundaries stabilize
- target structure remains:
  - `styles/app.css`
  - `styles/chat.css`
  - `styles/workflow.css`
  - `styles/runtime.css`
- decide whether config/schedules/styles need their own files or stay grouped with adjacent feature styles
- keep `src/renderer/src/ARCHITECTURE.md` synchronized with actual ownership changes
- decide whether this progress note also needs a mirrored `docs/zh-CN/` version after the refactor direction stabilizes

### I. Compatibility layer exit criteria are not finished

Current state:

- `App.tsx` remains a compatibility wrapper and re-export surface for tests and existing imports
- `AppShell` still contains compatibility exports for a number of helpers, but several pure helpers now delegate to `app/app-state.ts` and `pages/workflow/workflow-domain.ts`
- `App.tsx` has started explicitly re-exporting a subset of pure helpers from those real ownership modules while still keeping `export * from "./AppShell"` for broad compatibility

Still pending:

- identify every remaining helper still imported from `./App`
- migrate those imports to feature-local or app-local modules
- replace broad star-based compatibility exposure with a smaller explicit export surface once replacement imports and tests are in place
- remove the remaining duplicate compatibility wrappers from `AppShell` after direct `./App` consumers stop depending on them
- keep `App.tsx` thin until the migration is complete, then simplify it further

## Recommended Next Sequence

1. Keep shrinking the remaining workflow composition surface in `AppShell` now that the workflow hooks exist.
2. Split runtime diagnostics and config editor ownership into dedicated hooks/controllers.
3. Extract chat, task, team, and schedules feature controllers.
4. Migrate tests off the legacy `App.tsx` surface and then replace broad compatibility re-exports with an explicit minimal surface.
5. Split feature styles after JSX/controller boundaries stabilize.

## Definition Of Done For This Goal

The current renderer refactor goal should be treated as complete only when all of the following are true:

- `AppShell` owns composition, navigation mounting, and provider/service assembly only
- feature-local state and orchestration no longer live primarily in `AppShell`
- pages do not directly depend on `window.multiAgentChat`
- app-level state is owned behind the provider/store boundary instead of plain shell-local state
- sidebar and page interfaces are feature-shaped rather than loose primitive bags
- legacy `App.tsx` compatibility exports are reduced to the minimum still required by migrated tests
- targeted refactor tests exist at the feature/domain level, with only a small shell integration surface remaining

## Current Working Tree Note

At the time of writing:

- source changes described above are committed
- only `.idea/` remains as untracked local noise and should stay excluded from commits
