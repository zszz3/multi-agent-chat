---
plugin: grill
version: 1.2.5
date: 2026-07-17
target: C:\Users\29768\Desktop\multi-agent-chat
style: Select All
addons: [Scale stress, Hidden costs, Principle violations, Strangler fig, Success metrics, Before vs after, Assumptions audit, Compact and optimize]
skills: [grill-recon, grill-architecture, grill-error-handling, grill-security, grill-testing, grill-edge-cases]
---

# Dangerous Behavior Approval — Full Grill Review

## Scope and reconnaissance

The review targets dangerous-behavior approval in Workflow V2 and the adjacent runtime permission paths. The repository is an Electron 42, React 19, strict TypeScript application with main, preload, renderer, MCP, and shared layers. The `src` tree contains 501 files and approximately 82,739 lines. Entry points are `src/main/app/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`, and `src/renderer/src/App.tsx`.

## Consolidated findings

### F1 — Inline TypeScript can bypass approval in the Electron main process

- **File**: `src/main/workflows/v2/workflow-v2-script-analysis.ts:28-42`; `src/main/workflows/v2/workflow-v2-script-executor.ts:32-39`; `src/shared/workflow-v2/definition.ts:122-135`
- **Observation**: Inline code is classified from self-declared capabilities and defaults to `safe`, then runs through `new Function` in the privileged main process.
- **Severity**: `[CRITICAL]`
- **Evidence**: Empty capabilities yield a safe minimum risk; safe/read auto-allow; `new Function("inputs", executable.code)` has ambient main-process globals.
- **Exploit scenario**: A generated workflow declares no capabilities and accesses `globalThis.process` or other ambient authority without any approval.
- **Proposed change**: `[< 1 week]` Fail closed by classifying inline code as dangerous until an isolated capability-enforcing runner exists. `[< 1 month]` Replace privileged in-process evaluation with a constrained worker/process.
- **Tradeoff**: Existing pure transforms require approval until isolation is available, but the UI no longer claims unenforced safety.

### F2 — Runtime adapters auto-approve LLM tool requests

- **File**: `src/main/hub/codex/agent-hub-codex-app.ts:137-166`; `src/main/agents/claude/claude-agent-sdk.ts:83-104`; `src/main/agents/acp/acp-interactive-client.ts:240-276`
- **Observation**: Codex, Claude, and ACP permission requests are approved by adapter code without a human decision. Script-node governance does not cover LLM tool calls.
- **Severity**: `[CRITICAL]`
- **Evidence**: Codex returns `decision: "accept"`; Claude returns `behavior: "allow"`; ACP selects allow-once/allow-always itself.
- **Exploit scenario**: Prompt injection causes an LLM node to request a destructive command and the desktop host silently approves it.
- **Proposed change**: `[< 1 month]` Introduce one main-owned asynchronous Approval Broker used by every runtime adapter and Workflow V2 script execution.
- **Tradeoff**: A real cross-runtime gate adds interruption, cancellation, expiry, and adapter lifecycle work.

### F3 — Generic recovery is incorrectly treated as dangerous-script approval

- **File**: `src/main/workflows/v2/workflow-v2-run-executor.ts:733-778`; `src/main/workflows/workflow-runtime.ts:401-437,558-576`; `src/main/workflows/v2/workflow-v2-execution-contract.ts:8-13`
- **Observation**: `recoveryOverrides.has(nodeId)` becomes `confirmed: true`; generic `continue` therefore mints `allow_once` without a script-specific approval.
- **Severity**: `[CRITICAL]`
- **Evidence**: The recovery override has no request identity or capability binding, while permission code converts the boolean into allow-once.
- **Proposed change**: `[< 1 week]` Split recovery from authorization. Only an explicit approval action for a pending script-permission request may create a request-bound grant.
- **Tradeoff**: Approval contracts become more explicit and old generic resume behavior must be migrated.

### F4 — The renderer intentionally removes the approval surface

- **File**: `src/renderer/src/pages/workflow/WorkflowPage.test.tsx:72-88`; `src/renderer/src/pages/workflow/workflow-legacy-input-contract.test.ts:14-20`; `src/preload/index.ts:166-167`
- **Observation**: Main and preload expose intervention resolution, but renderer tests prohibit the corresponding service/controller path and assert that intervention details are absent.
- **Severity**: `[CRITICAL]`
- **Evidence**: The test rejects `resolveIntervention` while the workflow page hides Start whenever an intervention exists.
- **Proposed change**: `[< 1 week]` Replace the negative contract with a dedicated Approve once / Reject surface showing risk, capabilities, reason, executable, and scope.
- **Tradeoff**: The renderer gains security-critical state and requires pending/error/duplicate-click tests.

### F5 — Approval has no durable request identity or one-time lifecycle

- **File**: `src/shared/workflow-v2/review.ts:45-67`; `src/shared/workflow-v2/storage.ts:38-61`; `src/main/workflows/workflow-runtime.ts:427-446`
- **Observation**: Resolution records contain action, free-form reason, and time, but no request ID, actor, expiry, operation digest, or consumed state.
- **Severity**: `[HIGH]`
- **Evidence**: The command is workflow/run/node/action/reason and the persisted record is action/reason/resolvedAt.
- **Proposed change**: `[< 1 week]` Add a first-class pending request and an explicit single-use grant bound to workflow, graph version, run, node, request, risk, and operation digest.
- **Tradeoff**: Storage validation and recovery fixtures become more verbose.

### F6 — Capability digest does not bind the approved operation

- **File**: `src/main/workflows/v2/workflow-v2-script-analysis.ts:24-42`; `src/main/workflows/v2/workflow-v2-script-execution.ts:7-12`; `src/main/workflows/v2/workflow-v2-script-executor.ts:6-10`
- **Observation**: The digest covers capability names only; code, command, arguments, input values, work directory, workflow/run identity, and graph version are not validated by the final sink.
- **Severity**: `[HIGH]`
- **Evidence**: The executor validates node ID, allow decision, and a self-consistent capability list.
- **Proposed change**: `[< 1 week]` Define and validate a canonical operation digest at the execution sink.
- **Tradeoff**: Canonical serialization and secret-safe commitments need versioning.

### F7 — Approval state updates are race-prone and not atomic

- **File**: `src/main/workflows/workflow-runtime.ts:371-606`
- **Observation**: Two concurrent resolution IPC calls can both observe no active run and the same paused persisted state, append decisions, register, and launch recovery. The decision event is appended before the resolved state is durably persisted.
- **Severity**: `[HIGH]`
- **Evidence**: The flow performs separate `has`, read, append, register, and execute operations without compare-and-set or a per-request lock.
- **Proposed change**: `[< 1 week]` Atomically transition a pending request to approved/rejected and consume its grant once; reject duplicate or stale decisions idempotently.
- **Tradeoff**: The repository needs conditional update semantics or a main-process mutex plus durable state verification.

### F8 — Approval-sensitive IPC trusts renderer calls as human intent

- **File**: `src/main/app/index.ts:453-465`; `src/preload/index.ts:163-174`; `src/main/workflows/workflow-runtime.ts:260-288`
- **Observation**: Main handlers discard the IPC event and accept renderer-provided identifiers/actions without sender-frame, origin, freshness, or challenge checks.
- **Severity**: `[HIGH]`
- **Evidence**: Handlers use `(_event, request)` and forward the request directly.
- **Exploit scenario**: Renderer XSS or a compromised dependency invokes approval IPC without an actual user gesture.
- **Proposed change**: `[< 1 week]` Validate sender/origin and a main-issued request identity; longer term use a main-owned isolated approval window for high-risk operations.
- **Tradeoff**: Electron window and IPC lifecycle become more complex.

### F9 — Declared capabilities are not enforced after approval

- **File**: `src/main/workflows/v2/workflow-v2-script-executor.ts:18-28`
- **Observation**: Commands inherit ambient environment, filesystem, network, credentials, and process-spawn authority; capabilities are labels rather than enforced constraints.
- **Severity**: `[HIGH]`
- **Evidence**: `spawn` receives cwd, shell false, windowsHide, and signal only.
- **Exploit scenario**: A workspace-write command reads inherited credentials or writes outside the workspace.
- **Proposed change**: `[< 1 month]` Use an enforceable job/container boundary with a minimal environment, workspace restrictions, network policy, and child cleanup.
- **Tradeoff**: Platform-specific restrictions reduce compatibility with arbitrary local commands.

### F10 — Existing tests prove the pause, not approval or rejection

- **File**: `src/main/workflows/workflow-runtime.test.ts:501-529`; `src/main/workflows/v2/workflow-v2-script-permission.test.ts:4-15`; `src/main/workflows/v2/workflow-v2-script-executor.test.ts:6-40`
- **Observation**: Tests stop at `waiting_for_user`; they do not prove approve-once execution, rejection, replay prevention, stale request rejection, or cross-node/run isolation.
- **Severity**: `[HIGH]`
- **Evidence**: Current integration tests assert only the pause message/status.
- **Proposed change**: `[< 1 week]` Add policy, grant binding, state transition, IPC, renderer, concurrency, and recovery tests.
- **Tradeoff**: Fixtures need deterministic pending-state helpers and richer authorization data.

### F11 — No CI or coverage gate protects the approval boundary

- **File**: `package.json:9-18`; repository root
- **Observation**: No CI configuration, coverage command, or threshold is checked in.
- **Severity**: `[HIGH]`
- **Evidence**: Only local `typecheck`, `test`, and `build` scripts exist.
- **Proposed change**: `[< 1 week]` Add mandatory Windows CI for typecheck, focused approval tests, full tests, coverage, and build.
- **Tradeoff**: Windows CI is slower but exercises the real child-process path.

### F12 — Runtime tests use open-ended real-time polling

- **File**: `src/main/workflows/workflow-runtime.test.ts:509-510,522-523,928-929`
- **Observation**: Repeated `while` loops poll shared arrays with real timers until the outer Vitest timeout.
- **Severity**: `[MEDIUM]`
- **Evidence**: Tests sleep for 5ms until a state appears.
- **Proposed change**: `[< 1 day]` Add deterministic `waitForRunStatus` fixture events with explicit diagnostic timeouts.
- **Tradeoff**: A small fixture abstraction must be maintained.

### F13 — Multi-source risk and frozen governance are good foundations

- **File**: `src/main/workflows/v2/workflow-v2-script-governance.ts:6-16`; `src/main/workflows/v2/workflow-v2-script-execution.ts:7-12`; `src/main/workflows/v2/workflow-v2-script-permission.ts:16-19`
- **Observation**: Manager, reviewer, and static risk use maximum severity; execution rechecks the frozen capability profile.
- **Severity**: `[GOOD]`
- **Evidence**: Effective risk is frozen and safe/read are the only auto-allow levels.
- **Proposed change**: Preserve these invariants while replacing the boolean confirmation and declaration-only analysis.
- **Tradeoff**: None beyond adapting the fields to a real approval domain.

### F14 — Secret audit values are redacted correctly

- **File**: `src/main/workflows/v2/workflow-v2-script-input.ts:62-86`; `src/main/workflows/workflow-runtime.ts:650-666`
- **Observation**: Execution values retain secrets while audit events receive `[REDACTED]`.
- **Severity**: `[GOOD]`
- **Evidence**: Audit serialization uses the redacted value map.
- **Proposed change**: Preserve this split and use secret fingerprints rather than plaintext in operation digests.
- **Tradeoff**: Stable fingerprints require key management if persisted across restarts.

## Architecture Review + Rewrite Plan

1. **Decision**: Main owns policy, request state, decision validation, grant consumption, and audit. Renderer is a decision client, not the authority.
2. **Architecture**: Add an approval domain with policy engine, broker, repository, IPC projection, and adapter ports.
3. **Data model**: `ApprovalRequest(pending)` and `ApprovalDecision(approved|rejected|expired)` produce a one-shot `ApprovalGrant(consumed)`.
4. **Integrity**: Bind grants to workflow ID, graph version, run ID, node ID, attempt, request ID, executable/input/workdir digest, risk, capabilities, actor, issue time, and expiry.
5. **Reliability**: Persist request before exposing it; resolve with compare-and-set; default deny on timeout, restart ambiguity, cancellation, or malformed state.
6. **Security**: Remove automatic runtime approvals, classify unenforced inline code as dangerous, and isolate script execution.
7. **Testing**: Contract-test policy, persistence, IPC, UI, runtime adapters, concurrency, replay, and crash boundaries.
8. **Performance**: Queue approvals independently; do not block unrelated safe nodes; use bounded pending-request storage.
9. **Developer experience**: One normalized request/decision DTO and one broker port for Codex, Claude, ACP, and scripts.
10. **Migration**: First repair Workflow V2 script approval; then route provider adapters into the broker; finally add enforced execution sandboxes.

## Hard-Nosed Critique + 80/20 Roadmap

The code already detects risky scripts and pauses them, but it stops one layer before a usable security boundary. The 80/20 fix is to introduce a script-specific pending request, explicit approve/reject actions, an operation-bound one-shot grant, and a real renderer surface. That fixes the reported defect and removes generic-resume authorization. It does not solve provider auto-approval or operating-system containment; those remain explicitly tracked critical work.

### Ranked 15-item backlog

| # | Item | Impact | Risk | Effort |
|---|---|---|---|---|
| 1 | Replace generic confirmation boolean with request-bound approval | Critical | Critical | <1 week |
| 2 | Add Approve once / Reject UI and positive renderer tests | Critical | Critical | <1 week |
| 3 | Make inline code fail closed until isolated | Critical | Critical | <1 week |
| 4 | Persist decision and grant lifecycle atomically | High | High | <1 week |
| 5 | Bind approval to operation digest | High | High | <1 week |
| 6 | Add approve/reject/replay/cross-run tests | High | High | <1 week |
| 7 | Validate approval-sensitive IPC sender/request identity | High | High | <1 week |
| 8 | Introduce cross-runtime Approval Broker | Critical | Critical | <1 month |
| 9 | Remove Codex automatic command approval | Critical | Critical | <1 month |
| 10 | Remove Claude/ACP automatic approval | Critical | Critical | <1 month |
| 11 | Isolate inline and command execution | Critical | High | <1 month |
| 12 | Add Windows CI and coverage gate | High | Medium | <1 week |
| 13 | Add deterministic async test helpers | Medium | Medium | <1 day |
| 14 | Add approval metrics and expiry cleanup | Medium | Medium | <1 week |
| 15 | Version and migrate old persisted run states | Medium | Medium | <1 week |

**Quick wins (<1 day)**: expose the existing IPC through the renderer service/controller, render the immutable risk/capability reason, add explicit actions, and remove the negative source-scanning contract. These must ship with the typed backend authorization fix, not alone.

**Quick wins (<1 week)**: complete items 1–7 and 12–15.

## Multi-Perspective Panel

### Staff backend engineer

1. Split recovery from authorization with separate types and state machines.
2. Use atomic pending-to-resolved transitions and one-shot consumption.
3. Centralize approval ownership in main instead of runtime adapters.

### Security engineer

1. Treat inline code and unenforced capability claims as dangerous.
2. Bind approval to the exact operation and reject replay/stale decisions.
3. Remove all adapter-local automatic approvals.

### SRE

1. Make restart behavior fail closed and auditable.
2. Add approval request IDs to every event and error.
3. Measure pending age, resolution latency, expiry, rejection, and execution failure after approval.

### Performance engineer

1. Pause only the requesting node and preserve unrelated parallel work where safe.
2. Bound approval queues and event retention.
3. Avoid polling; use event-driven state propagation.

### Product engineer

1. Show exact operation, scope, risk, targets, and rationale.
2. Use explicit Approve once and Reject language.
3. Make stale, duplicate, expired, and failed decisions understandable.

### Junior developer advocate

1. Provide one shared approval DTO and one adapter interface.
2. Add end-to-end examples and fixtures.
3. Keep generic workflow intervention separate from security approval.

**Unified decision**: implement a narrow, first-class script approval vertical slice now; use the same contract as the seed for the later broker rather than adding another generic gate.

## ADR Set

### ADR-1: Main-process ownership
**Decision**: Main validates and persists approval. **Alternative**: renderer-owned state. **Consequence**: renderer compromise cannot invent state solely through UI mutation.

### ADR-2: Default deny
**Decision**: Unknown, stale, malformed, expired, or ambiguous approvals deny execution. **Alternative**: best-effort resume. **Consequence**: more user retries, safer failure behavior.

### ADR-3: Explicit actions
**Decision**: Security approval uses `approve_once` and `reject`; generic `continue` never authorizes. **Alternative**: reuse intervention actions. **Consequence**: clearer APIs and migration work.

### ADR-4: Operation granularity
**Decision**: Approval covers one concrete operation, not an entire node or workflow. **Alternative**: approve node/run. **Consequence**: more prompts but less authority.

### ADR-5: Content binding
**Decision**: Grants bind to an operation digest. **Alternative**: capability-only digest. **Consequence**: changed inputs/code require reapproval.

### ADR-6: One-time consumption
**Decision**: A grant is atomically consumed immediately before execution. **Alternative**: reusable boolean. **Consequence**: retry needs fresh approval.

### ADR-7: Restart behavior
**Decision**: Pending requests may be rehydrated; approved-but-unconsumed ambiguity expires and asks again. **Alternative**: replay. **Consequence**: fail-closed recovery.

### ADR-8: Renderer trust
**Decision**: Renderer submits a decision for a main-issued request; it is not the authority. **Alternative**: arbitrary workflow/run/node action. **Consequence**: request IDs and sender validation are required.

### ADR-9: Unified future broker
**Decision**: Codex, Claude, ACP, and scripts converge on one broker port. **Alternative**: provider-specific UI/logic. **Consequence**: larger migration but consistent safety.

### ADR-10: Capability enforcement honesty
**Decision**: Do not label authority safe unless the runtime enforces it. **Alternative**: trust declarations. **Consequence**: temporary over-classification until sandboxing exists.

## Paranoid Mode: Edge Case Risk Matrix

| # | Scenario | Likelihood | Impact | Risk | Component | File |
|---|---|---|---|---|---|---|
| 1 | Inline script claims safe and executes ambient main authority | High | High | CRITICAL | Script executor | `workflow-v2-script-executor.ts:32-39` |
| 2 | Prompt-injected LLM command is auto-approved | High | High | CRITICAL | Runtime adapters | `agent-hub-codex-app.ts:137-166` |
| 3 | Generic continue authorizes dangerous script | Medium | High | CRITICAL | Recovery/authorization | `workflow-v2-run-executor.ts:757` |
| 4 | Two simultaneous approvals launch the same script twice | Medium | High | HIGH | Runtime resolution | `workflow-runtime.ts:371-606` |
| 5 | Decision event persists but resolved state does not before crash | Medium | High | HIGH | Persistence | `workflow-runtime.ts:427-606` |
| 6 | Approved capability list remains while executable changes | Medium | High | HIGH | Digest validation | `workflow-v2-script-analysis.ts:24-42` |
| 7 | Renderer compromise calls approval IPC | Medium | High | HIGH | IPC trust boundary | `app/index.ts:453-465` |
| 8 | Approved workspace-write command reads credentials or writes elsewhere | Medium | High | HIGH | Process isolation | `workflow-v2-script-executor.ts:18-28` |
| 9 | App restarts after approval and replays ambiguous execution | Low | High | HIGH | Recovery | `workflow-runtime.ts:558-606` |
| 10 | Approval for node A is reused for node B/run B | Low | High | HIGH | Grant binding | `workflow-v2-execution-contract.ts:8-13` |
| 11 | User double-clicks Approve while UI has no pending state | Medium | Medium | MEDIUM | Renderer | `WorkflowPage.tsx:464-505` |
| 12 | Test waits forever for a state that never arrives | Medium | Low | MEDIUM | Test harness | `workflow-runtime.test.ts:509-510` |

**Worst case verdict**: The single scariest failure is a generated “safe” inline script executing arbitrary main-process behavior without any approval; the next is an LLM tool request appearing to pass an approval protocol while being automatically accepted by the host.

## Pressure Tests

### Scale stress

At 100x concurrent runs, the current read-check-register sequence permits duplicate decisions and executions; unbounded pending interventions and polling amplify load. Use per-request atomic transitions, bounded queues, and event-driven UI updates.

### Hidden costs

1. False approval events make incident reconstruction unreliable.
2. Generic intervention semantics increase debugging time.
3. Provider-specific auto-approval multiplies onboarding complexity.
4. Unenforced capability labels create legal/security review debt.
5. Missing CI makes every approval refactor a manual regression risk.

### Principle violations

- **Least privilege**: command and inline execution inherit ambient desktop authority.
- **Single responsibility**: generic intervention resolution also acts as security authorization.
- **Dependency inversion**: adapters decide policy instead of depending on a central policy port.
- **Defense in depth**: the final executor does not validate the full operation identity.

### Strangler fig migration

1. Add the script-specific request/grant types beside generic intervention.
2. Route Workflow V2 risky scripts through them and remove boolean confirmation.
3. Add a broker facade matching those types.
4. Move Codex, Claude, and ACP one adapter at a time.
5. Delete automatic-approval code after contract tests pass.

### Success metrics

- 0 executions before an explicit matching decision.
- 0 successful stale, duplicate, cross-node, or cross-run approvals.
- 100% dangerous-script decisions have request ID, operation digest, actor, and outcome.
- p95 approval UI propagation below 250ms locally.
- 100% focused approval tests and typecheck/build green on Windows CI.
- Measured rejection, expiry, cancellation, and post-approval execution failure rates.

### Before vs after

```text
Before
manager/reviewer/static risk
          -> generic pause -> no renderer action
          -> generic recovery override -> allow_once -> privileged execution

After
operation analysis -> durable ApprovalRequest(pending)
          -> immutable renderer projection -> approve_once / reject
          -> bound single-use grant -> sink validation + consume
          -> execution outcome and audit event
```

### Assumptions audit

- Inline code with no declared capabilities is pure: **false**.
- Provider approval events represent a human decision: **false**.
- `allow_once` is consumed once: **false in the current recovery implementation**.
- Capability digest protects code integrity: **false**.
- Renderer IPC calls prove user intent: **false**.
- Approved capabilities constrain OS authority: **false**.
- Risk label and node title are enough for informed approval: **false**.

### Compact and optimize

- Replace generic confirmation branching with one `scriptApproval` contract.
- Reuse the existing intervention projection and preload IPC, but give security approval dedicated semantics.
- Preserve shared risk maximum and secret redaction helpers.
- Remove negative renderer source-scanning tests after positive behavior tests exist.
- Later delete adapter-local approval logic behind one broker port.

## Executive Summary

The reported defect is real and architectural: risky scripts are paused, but the renderer deliberately offers no resolution surface, and a generic recovery override is incorrectly treated as authorization. The immediate fix must create explicit script approval semantics and a usable UI, while failing closed for untrusted inline code. The largest remaining platform risk is outside script nodes: Codex, Claude, and ACP currently auto-approve native runtime permission requests.

### Top 3 actions

1. Implement request-bound Approve once / Reject for Workflow V2 scripts and remove generic recovery authorization.
2. Fail closed for inline code and bind approval to the exact operation.
3. Build the shared Approval Broker and migrate runtime adapters away from automatic approval.

### Confidence

- Root cause of the reported Workflow V2 approval failure: **High**, confirmed across main, preload, renderer, and tests.
- Generic recovery authorization risk: **High**, direct control-flow evidence.
- Inline main-process bypass: **High**, direct executor evidence.
- Full provider migration effort: **Medium**, adapter lifecycle behavior needs implementation spikes.

### Paranoid verdict

The platform currently has two security systems that look stronger than they are: script capabilities are advisory around privileged execution, and provider approval events can be emitted after automatic host acceptance. Fixing the UI alone would leave both failure modes intact.

## Fixing Plan

### Phase 1: Critical fixes (do immediately)

- **Finding**: F3/F4 — explicit Workflow V2 dangerous-script approval is missing.
  - **Fix**: Add script-permission request metadata, `approve_once`/`reject`, bound ephemeral grant, renderer surface, and positive end-to-end tests.
  - **Effort**: `< 1 week`
  - **Files to modify**: shared review/commands/storage types; Workflow V2 executor/runtime; renderer workflow service/controller/page/panel/tests.
- **Finding**: F1 — inline code bypasses declared safety.
  - **Fix**: Classify inline execution as dangerous until isolated.
  - **Effort**: `< 1 day` fail-closed policy; `< 1 month` isolation.
  - **Files to modify**: script analysis, tests, executor in the isolation phase.
- **Finding**: F2 — provider adapters auto-approve.
  - **Fix**: Design and implement the shared Approval Broker, then migrate adapters.
  - **Effort**: `< 1 month`
  - **Files to modify**: main approval domain, Codex/Claude/ACP adapters, shared types, preload, renderer.

### Phase 2: High-priority fixes (this sprint)

- **Finding**: F5/F6/F7/F8 — request lifecycle, operation binding, atomicity, and IPC trust are incomplete.
  - **Fix**: Persist main-issued request IDs and actors; compute operation digests; add atomic resolution/consumption; validate IPC sender and challenge.
  - **Effort**: `< 1 week`
  - **Files to modify**: shared definition/review/storage/commands; workflow runtime/store; app IPC; preload.
- **Finding**: F10/F11 — verification automation is incomplete.
  - **Fix**: Add the focused matrix and Windows CI with coverage.
  - **Effort**: `< 1 week`
  - **Files to modify**: workflow/runtime/renderer tests, package scripts, `.github/workflows`.

### Phase 3: Medium-priority improvements (next sprint)

- **Finding**: F9 — capabilities are not OS-enforced.
  - **Fix**: Add isolated process execution with minimal environment and resource policy.
  - **Effort**: `< 1 month`
  - **Files to modify**: script executor/runtime ports and platform-specific isolation modules.
- **Finding**: F12 — async tests poll nondeterministically.
  - **Fix**: Add deterministic state waiters.
  - **Effort**: `< 1 day`
  - **Files to modify**: workflow runtime test fixtures.

### Phase 4: Low-priority cleanup (when touching these files)

- Consolidate intervention labels and action rendering by source in renderer workflow files.
- Remove adapter-local approval event wording once the broker owns decisions.
- Version canonical digest serialization and document migrations beside shared Workflow V2 storage.

### Dependency graph

- Operation-bound grants depend on first-class request identity.
- Atomic one-time consumption depends on durable request state.
- Provider adapter migration depends on the Approval Broker port and UI projection.
- Accurate safe/read auto-allow depends on real sandbox enforcement.
- Windows CI should land before or with provider migration.

### Estimated total effort

- Phase 1: 3–15 days depending on whether the broker migration is included immediately.
- Phase 2: 3–5 days.
- Phase 3: 5–15 days.
- Phase 4: 1–3 opportunistic days.
- **Total**: approximately 12–38 engineering days for the complete cross-runtime program; the reported Workflow V2 script approval vertical slice is targeted within Phase 1.
