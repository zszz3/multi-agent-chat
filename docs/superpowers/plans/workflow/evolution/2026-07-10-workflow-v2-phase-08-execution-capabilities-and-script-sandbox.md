# Workflow V2 Phase 08 Execution Capabilities And Script Sandbox Implementation Plan

> Requires verified Phase 07. Read the [Phase 08 spec](../../../specs/workflow/evolution/2026-07-10-workflow-v2-phase-08-execution-capabilities-and-script-sandbox.md) completely before editing.

**Status:** Proposed; not implemented.

**Goal:** Reject unsupported plans early, enforce effect policies below prompts, and execute Script nodes only through approved bounded backends.

**Primary files:**

- Create shared capability/effect contracts under `src/shared/workflow-v2/`
- Modify `src/shared/types.ts`
- Modify runtime driver/task request contracts under `src/main/agents/runtime/` and executor factories
- Modify `src/main/workflows/v2/workflow-v2-planner.ts`
- Replace `src/main/workflows/v2/workflow-v2-script-policy.ts`
- Create `src/main/workflows/v2/workflow-v2-script-backend.ts`
- Create backend/detection modules under `src/main/workflows/v2/script-backends/`
- Modify main/preload/renderer only for typed approval/capability projection

---

## Task 1: Shared Capability Contracts

- [ ] Add validated effect policy, execution capability, resolved node policy, backend descriptor, and approval-token types exactly as defined by the spec.
- [ ] Add bounds for ids, arrays, hosts, tools, output sizes, timeout, and backend version.
- [ ] Extend task request with an optional explicit effect policy; undefined preserves legacy behavior outside V2.
- [ ] Add shared tests rejecting duplicates, unknown enum values, unbounded limits, empty backend ids, unsafe hosts/tools, and inconsistent policies.
- [ ] Re-export only types needed cross-layer.
- [ ] Commit: `feat(workflow): define execution capability contracts`.

## Task 2: Runtime Enforcement Surface

- [ ] Extend `RuntimeDriver` capabilities so drivers report whether tools/filesystem/network/process restrictions are enforceable.
- [ ] Update every registered runtime driver. Unsupported restrictions must return false/unsupported, not pretend compliance.
- [ ] Ensure task execution rejects a required policy before starting when the driver cannot enforce it.
- [ ] Add conformance tests for each runtime and one test proving prompt text cannot substitute for capability support.
- [ ] Preserve non-V2 chat/task behavior when no effect policy is requested.
- [ ] Commit: `feat(runtime): enforce workflow effect policies`.

## Task 3: Plan Capability Preflight

- [ ] Add a planner input containing a capability snapshot and resolved Script backend.
- [ ] Resolve required policy for each node/control task.
- [ ] Reject Script language/mode/backend and LLM tool-policy mismatches with typed errors before plan creation.
- [ ] Store capability/backend hashes in plan node/task packet fields and validate plan consistency.
- [ ] Add tests for no backend, unsupported language, unsupported sandbox mode, stale capability hash, and supported plan.
- [ ] Update AgentHub draft/plan path to supply detected capabilities.
- [ ] Commit: `feat(workflow): validate capabilities before plan freeze`.

## Task 4: Script Backend Abstraction

- [ ] Create `WorkflowV2ScriptBackend` and a registry keyed by stable backend id.
- [ ] Implement capability detection separately from execution.
- [ ] Implement a fake backend for deterministic unit tests only; production registry must never select it.
- [ ] Add a container backend for `sandbox` with:
  - argv-based spawn, no outer shell interpolation
  - network disabled by default
  - read-only base and bounded workspace mount
  - CPU/memory/process/time/output limits
  - allowlisted environment
  - process-tree kill and awaited shutdown
- [ ] If container tooling is missing, report unavailable and let planning fail early.
- [ ] Add an OS-policy or container backend for approved `workspace` execution; prove kernel/container filesystem confinement and declared network policy. Never treat cwd/path input validation as confinement.
- [ ] Add a plain host backend only for approved `full` execution with interpreter detection by argv, environment allowlist, timeout/output/process limits, process-tree kill, and no outer-shell source interpolation.
- [ ] Register a mode only when the current platform can enforce every declared guarantee; otherwise report it unsupported. `full` remains disabled by default.
- [ ] Test missing interpreter, unsupported language, cwd escape, environment denial, timeout, output cap, descendant kill, approval mismatch, and successful bounded host execution.
- [ ] Add a CI/integration job that runs a tiny supported-language script on the real backend and tests timeout, output cap, network denial, filesystem escape denial, and descendant termination.
- [ ] Commit: `feat(workflow): add bounded script backend`.

## Task 5: Approval Binding

- [ ] Add typed approval request/response through shared types, main IPC, preload service, renderer controller, and minimal approval UI.
- [ ] Bind approval to workflow/run/node/attempt, source hash, backend hash, workspace, policy, and expiration.
- [ ] Use the existing human-intervention boundary for the decision and create a main-owned, self-versioned per-run `script-executions.json` approval/launch journal.
- [ ] Implement generation-CAS transitions `requested -> approved|rejected|expired -> starting -> running -> settled`; verify identity, expiry, and all hashes immediately before `approved -> starting` and spawn.
- [ ] Reject stale, changed, cross-run, cross-node, expired, replayed, or renderer-invented approval.
- [ ] Persist approval/launch events without credentials/source body; renderer cannot create or advance journal records.
- [ ] On restart from `starting`/`running`, attempt provable process-tree cleanup and pause for reconciliation; never respawn the same ambiguous attempt automatically.
- [ ] Test workspace/full modes, cancellation while awaiting approval, crash before/after spawn, PID-reuse-safe cleanup, single-use approval, and user-authorized new-attempt retry.
- [ ] Commit: `feat(workflow): bind script execution approval`.

## Task 6: Product Integration And llmHook Isolation

- [ ] Replace always-failing AgentHub script policy with registry resolution and backend execution.
- [ ] Keep unsupported environments fail-closed with actionable planning diagnostics.
- [ ] Pass AbortSignal, timeout, output limits, and approved policy from coordinator to backend.
- [ ] Parse bounded Script result into the declared output packet and keep mechanical validation afterward.
- [ ] Run `llmHook` with tools/filesystem/network/process `none`; reject if selected runtime cannot enforce it.
- [ ] Assign explicit policies to reviewer/probe/supervisor tasks and add regression tests.
- [ ] Commit: `feat(workflow): execute capability-safe nodes`.

## Task 7: Verification

Run:

```bash
git diff --check
npm run typecheck
npm test -- --run src/shared/workflow-v2 src/main/workflows/v2 src/main/agents/runtime src/main/workflows/workflow-runtime.test.ts src/main/hub/agent-hub.test.ts src/preload/index.test.ts src/renderer/src/App.layout.test.tsx
npm test
npm run build
```

- [ ] Unit/fake-backend tests pass on all platforms.
- [ ] Real-backend CI proves successful execution and negative isolation cases.
- [ ] Linux/macOS/Windows matrix records enforcement primitive and evidence for every advertised backend/mode; `not tested` reports unsupported.
- [ ] Product plan with no backend fails before run creation.
- [ ] No-tool LLM policy is runtime enforced.
- [ ] No environment/output/process leaks remain.
- [ ] Update docs with platform/backend capability matrix and exact evidence.
- [ ] Commit and push before Phase 09.
