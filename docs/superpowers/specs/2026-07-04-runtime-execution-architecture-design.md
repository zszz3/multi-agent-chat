# Runtime Execution Architecture Design

## 2026-07-04

### Goal

Unify main-process runtime execution around two product-facing styles, `oneshot` and `interactive`, so Codex and Claude chat share one orchestration model, API remains stateless, and future local runtimes can be added without widening top-level branching in `AgentHub`.

### Context

- Branch: `feat/claude-interactive-runtime`
- Status: Phase 2 implemented on top of the completed shared interactive-session slice, including structured Claude approval and user-input events plus staged interactive reconfigure behavior
- Audience: fresh implementation agents with no prior chat context
- Source of truth: this document defines the runtime-execution boundaries for this repository; current checkout state wins over historical branch assumptions

### Scope

- Main-process runtime execution architecture
- Chat execution first; workflow, task, and runtime-test interactivity stay out of scope for the first slice unless explicitly expanded later
- API runtime remains one-shot in this version
- Shared lifecycle, capability, and event handling are in scope
- Low-level transport unification is not in scope

### Non-Goals

- Forcing every runtime onto one transport such as RPC, PTY, or HTTP
- Redesigning API runtime request semantics
- Making workflow, task, or runtime-test execution interactive in the first slice
- Requiring a storage migration before the style abstraction exists

### Decisions

#### Product-facing execution styles

- The app exposes exactly two runtime styles:
  - `oneshot`: start, stream, complete or fail, then release resources
  - `interactive`: keep one logical chat session, lazily attach a runtime process, send multiple prompts over time, and allow detach or reattach without deleting the chat
- `AgentHub` must reason in terms of capabilities and execution style, not hard-coded runtime IDs.

#### Protocol strategy

- Codex keeps native app-server RPC.
- Claude interactive execution defaults to the package-backed `stream-json` compatibility transport.
- `CLAUDE_INTERACTIVE_TRANSPORT=runner` remains the conservative compatibility fallback.
- A true official programmatic SDK backend remains future work until the installed package exposes a verified programmatic surface.
- API stays HTTP-based and one-shot.
- The shared boundary unifies lifecycle and orchestration, not wire protocol details.

#### Session model

- Separate logical chat-session lifetime from runtime attachment lifetime.
- A logical chat exists until the user deletes it.
- Opening, restoring, or listing a chat must not eagerly spawn a child process.
- The first execution-triggering action, such as `sendPrompt(...)` or `continue(...)`, lazily attaches the runtime.
- Attached processes idle for more than one hour are eligible for detach.
- Idle detach removes the process attachment, not the logical chat session.

#### Continuation and resume

- Resume is structured capability data, not a single boolean.
- Distinguish:
  - in-process conversation resume
  - resume after detach
  - resume after app restart
  - turn resume for interrupted or partial in-flight work
- When native resume is unavailable or fails, fall back to product-owned history-based continuation if policy allows.
- History-based continuation must never be mislabeled as native runtime resume.

#### Concurrency and correctness

- Interactive correctness lives in the main process, not in renderer button disabling.
- Per-chat control operations must be serialized through a lightweight queue or mailbox.
- Every attachment owns a monotonically increasing `attachmentGeneration`.
- Every active interactive turn owns a monotonically increasing `turnId`.
- Runtime events are accepted only when:
  - the logical chat still exists
  - `attachmentGeneration` matches the active attachment
  - `turnId` matches when the event is turn-scoped
- Idle sweep must enqueue conditional detach work instead of mutating live session state out-of-band.
- Interrupt targets the active turn, not just the logical chat ID.

#### Reconfigure policy

- Treat `reconfigure(context)` as a controlled session operation.
- Persist per-chat channel overrides separately from configured-agent defaults.
- Reconfiguration fields fall into three buckets:
  - hot-safe metadata
  - attach-boundary fields that apply on next attach or reattach
  - session-identity-breaking fields that invalidate native resume assumptions
- While a turn is running, attach-boundary changes are staged instead of mutating the live turn in place.
- If reconfiguration invalidates native resume, the app must explicitly downgrade to history-based continuation or fail honestly.

#### Persistence and recovery

- Persist logical session state separately from ephemeral attachment state.
- Persisted session state should be versioned.
- Persist:
  - logical chat identity
  - runtime selection
  - committed message history
  - native resume handle when available
  - product-owned continuation context
  - durable approval, user-input, and tool-result outcomes that affect future turns
- Do not trust across restart:
  - process handle or pid
  - `attachmentGeneration`
  - active `turnId`
  - in-memory queue state
  - pending interrupt bookkeeping
  - liveness-only state
- After restart, every interactive session boots as `detached`.
- Resume attempts stay lazy and execution-triggered.

#### History truth source

- History-based continuation must rely on:
  - ordered committed chat messages
  - stable product-owned continuation context such as cwd, model, and developer instructions
  - structured committed outcomes such as approval decisions, user-input responses, and tool results
- It must not rely on:
  - heartbeats or probes
  - transport keepalive artifacts
  - uncommitted partial deltas
  - side effects that were never durably acknowledged

### Architecture

#### Layering

1. `AgentHub`
   - owns orchestration, persistence, state mutation, and UI-facing event application
   - must not own runtime-specific launch branching
2. Shared runtime dispatch boundary
   - resolves the runtime driver
   - delegates by capability and execution style
   - may continue to live in `src/main/runtime-adapter.ts` or an equivalent successor
3. Runtime driver and session layer
   - declares capabilities
   - creates one-shot runners and optional interactive sessions
   - owns session lifecycle behavior
4. Transport layer
   - owns subprocess, RPC, SDK, CLI, PTY, or HTTP glue

#### Shared contracts

The exact filenames may change, but the design should converge on these responsibilities:

- `ExecutionStyle = "oneshot" | "interactive"`
- `RuntimeCapabilities`
  - chat, task, workflow, and test execution style
  - interrupt support
  - continue support
  - resume capabilities
  - approval and user-input support
- `RuntimeDriver`
  - declares runtime identity and capabilities
  - creates a one-shot runner
  - optionally creates an interactive session
  - may own workflow invocation, runtime-channel testing, and session-artifact cleanup hooks
- `InteractiveSession`
  - `ensureAttached()`
  - `sendPrompt(...)`
  - `interrupt()`
  - `detach(...)`
  - `snapshot()`
  - `reconfigure(...)`
- `InteractiveSessionManager`
  - `getOrCreate(...)`
  - `touch(...)`
  - `sweepExpiredSessions(...)`
  - `delete(...)`

#### Attachment lifecycle

- Shared lifecycle vocabulary:
  - `detached`
  - `idle`
  - `running`
  - `interrupted`
- Recommended transitions:
  - `detached -> idle` on lazy attach
  - `idle -> running` when a turn starts
  - `running -> idle` when a turn completes
  - `running -> interrupted` on user interrupt
  - `idle -> detached` on idle reclamation
  - `interrupted -> detached` on idle reclamation
- The idle sweeper runs centrally in the main process every 30 minutes.
- It only detaches sessions in `idle` or `interrupted` whose `lastMeaningfulActivityAt` is older than one hour.
- Liveness-only probe traffic must not refresh the idle timer.

#### Runtime mapping

- Codex
  - chat becomes `interactive`
  - one logical resume handle and at most one attached `CodexRpcClient` per chat
  - follow-up prompts reuse the same process and thread
  - task, workflow, and runtime test remain `oneshot`
- Claude
  - chat stays `interactive`
  - default backend is the package-backed `stream-json` compatibility transport
  - `runner` remains an explicit compatibility backend behind the same session boundary
  - a true official programmatic SDK backend stays reserved for a future slice once the package surface is verified
  - PTY stays experimental and opt-in
  - task, workflow, and runtime test remain `oneshot`
- API
  - chat, task, workflow, and runtime test all remain `oneshot`
- Future runtimes such as Hermes
  - Hermes now exists as a minimal one-shot proof runtime
  - workflow invocation, runtime-channel testing, and session-artifact cleanup now dispatch through driver-owned hooks
  - future runtimes add a driver, declare capabilities, and add one-shot and or interactive implementations without widening top-level `AgentHub` branches

#### Default implementation targets

- Keep or re-establish:
  - `src/main/agent-hub.ts`
  - `src/main/agents/`
  - one shared runtime dispatch boundary such as `src/main/runtime-adapter.ts`
- Add or evolve:
  - `src/main/agents/runtime-driver.ts`
  - `src/main/agents/runtime-capabilities.ts`
  - `src/main/agents/interactive-session-manager.ts`
- `src/main/agents/process-lease.ts`
- `src/main/agents/codex-interactive-session.ts`
- `src/main/agents/claude-interactive-session.ts`
- `src/main/agents/claude-transport-selection.ts`
- `src/main/agents/claude-stream-json-interactive-transport.ts`
- `src/main/agents/claude-runner-interactive-transport.ts`
- `src/main/agents/claude-stream-json-bindings.ts`
- `src/main/agents/claude-stream-json-events.ts`
- `src/main/agents/hermes-runner.ts`

### Implementation slices

#### Slice 1: style abstraction and capability cleanup

- Introduce shared runtime capability contracts.
- Remove Claude-only interactive checks from `AgentHub`.
- Add a shared interactive-session manager.
- Keep current event and persistence shapes stable where practical.

Acceptance criteria:

- `AgentHub` no longer decides continue or interrupt behavior by hard-coded Claude checks.
- Interactive affordances derive from capability and session snapshot state.
- Viewing or restoring a chat does not spawn an interactive child process.

#### Slice 2: Codex interactive chat session

- Add `CodexInteractiveSession`.
- Keep one live `CodexRpcClient` per chat.
- Reuse thread ID and process across follow-up prompts.

Acceptance criteria:

- Opening or restoring a Codex chat does not spawn an app-server process.
- A second prompt in the same Codex chat does not spawn a second process.
- Stop and continue behavior matches the shared interactive model.
- Idle timeout detaches the process but preserves the thread for later resume.

#### Slice 3: Claude interactive backend consolidation

- Keep the shared Claude interactive-session boundary.
- Keep the package-backed `stream-json` compatibility transport as the default backend.
- Keep `runner` only as the explicit compatibility transport during this phase.
- Reserve a true official programmatic SDK transport for a later slice once the package surface is verified.
- Leave PTY experimental.

Acceptance criteria:

- Claude transport can swap without changing `AgentHub` or the shared runtime boundary.
- Structured approval and user-input events are normalized into the shared `AgentEvent` surface.
- Pending approval and user-input requests degrade to non-live state after stop, detach, or app restart.
- Idle timeout detaches the process while preserving logical session continuity.
- Explicit `CLAUDE_INTERACTIVE_TRANSPORT=sdk` requests fail honestly until a verified official programmatic API exists.

#### Slice 4: future-runtime onboarding path

- Prove the future-runtime onboarding path with a concrete Hermes driver.
- Keep the diff runtime-local plus shared driver tests.

Acceptance criteria:

- Hermes exists as a minimal one-shot proof runtime on this branch.
- Workflow invocation, runtime-channel testing, and session-artifact cleanup dispatch through `RuntimeDriver` hooks.
- A new runtime can be added without widening product-level branching in `AgentHub`.

### Testing

- `npm run typecheck`
- Shared dispatch-boundary tests plus `src/main/agent-hub.test.ts`
- Runtime-focused tests such as:
  - `src/main/agents/codex-interactive-session.test.ts`
  - `src/main/agents/codex-rpc.test.ts`
  - `src/main/agents/claude-interactive-session.test.ts`
  - `src/main/agents/claude-transport-selection.test.ts`
  - `src/main/agents/claude-stream-json-events.test.ts`
  - `src/main/agents/claude-stream-json-interactive-transport.test.ts`
  - `src/main/agents/claude-runner.test.ts`
  - `src/main/agents/claude-stream.test.ts`
  - `src/main/agents/detect.test.ts`
  - `src/main/agents/hermes-runner.test.ts`

Critical behaviors to prove:

- Restoring or viewing an interactive chat does not eagerly spawn a process.
- The first prompt lazily attaches a process.
- Follow-up prompts reuse the same interactive attachment.
- Idle timeout detaches inactive processes and the next prompt can recreate them.
- Liveness-only probes do not prevent detach.
- Native resume is preferred when supported.
- History-based continuation is used honestly when native resume is unavailable.
- Duplicate prompt delivery does not create two attachments or two active turns.
- Late events from obsolete attachments are discarded.
- Interrupt affects only the targeted active turn.
- Idle sweep cannot detach an attachment that has already been superseded or reactivated.
- Reconfigure stages attach-boundary changes and clears invalid native handles when identity changes.
- App restart resets every interactive attachment to `detached`.
- History-based continuation uses stable persisted truth instead of pretending unresolved work completed.
- API runtime remains unchanged and stateless.

### Open Questions

- What Codex protocol-level interrupt contract should be preferred over process shutdown?
- If a future runtime needs more than a string resume handle, should the repo widen session references immediately or in a later slice?
