# Workflow V2 Phase 08: Execution Capabilities And Script Sandbox

## 2026-07-10

### Status

Proposed. Requires completed Phase 07.

### Objective

Make execution capabilities an explicit plan-time and run-time contract, prevent unsupported plans from freezing, enforce no-tool/no-effect LLM policies below the prompt layer, and provide a trusted, cancellable, auditable Script backend.

### Baseline Problem

The product AgentHub currently wires `executeWorkflowV2ScriptWithPolicy`, and that policy rejects every sandbox mode. Script nodes therefore typecheck and plan successfully but fail only after execution begins. `llmHook` also asks the model not to use tools through prompt text rather than a runtime-enforced effect policy.

### Required Preconditions

- Phase 07 service boundaries and characterization tests pass.
- Runtime task creation is isolated behind `WorkflowV2TaskService`.
- Existing script policy tests prove the fail-closed baseline.

### Capability Contracts

Add shared contracts:

```ts
export type WorkflowV2FilesystemCapability = "none" | "read_workspace" | "write_workspace" | "full";
export type WorkflowV2NetworkCapability = "none" | "allowlist" | "full";
export type WorkflowV2ProcessCapability = "none" | "sandboxed" | "host";
export type WorkflowV2ToolCapability = "none" | "read_only" | "allowlist" | "full";

export interface WorkflowV2EffectPolicy {
  filesystem: WorkflowV2FilesystemCapability;
  network: WorkflowV2NetworkCapability;
  processes: WorkflowV2ProcessCapability;
  tools: WorkflowV2ToolCapability;
  allowedTools?: string[];
  allowedNetworkHosts?: string[];
  requiresHumanApproval: boolean;
}

export interface WorkflowV2ExecutionCapabilities {
  runtimeId: string;
  supportsNoToolLlm: boolean;
  supportedScriptLanguages: WorkflowV2ScriptLanguage[];
  supportedSandboxModes: WorkflowV2ScriptSandboxMode[];
  maxStdoutBytes: number;
  maxStderrBytes: number;
  supportsProcessTreeKill: boolean;
  backendId: string;
  backendVersion: string;
}
```

All arrays must be deduplicated, bounded, and validated. Capability detection must report facts; it must not claim support based on configuration intent alone.

### Plan-Time Resolution

Before plan approval:

1. collect capabilities for the selected runtime/backend
2. resolve each node to an effect policy
3. reject unsupported language/sandbox/tool requirements
4. store a capability snapshot hash in the frozen plan
5. display approval requirements before run creation

If no trusted Script backend is available, definitions containing Script nodes fail planning with a typed `capability.script_backend_unavailable` error. They must not create a run that predictably fails later.

At execution, recompute the capability hash. A mismatch pauses before the node starts and requests re-approval; it never silently widens or switches backend.

Until Phase 12, capability snapshots are backward-compatible optional fields inside the frozen plan. Readers must accept their absence for pre-evolution plans, while the new planner requires them for new Script/effect-restricted plans. This phase must not bump core run-state schema version.

### Script Backend Contract

```ts
export interface WorkflowV2ScriptBackend {
  describeCapabilities(): Promise<WorkflowV2ExecutionCapabilities>;
  execute(request: WorkflowV2ScriptExecutionRequest): Promise<WorkflowV2WorkerOutput>;
}
```

`WorkflowV2ScriptExecutionRequest` must include workflow/run/node/attempt identity, language, source, cwd/workspace root, sandbox mode, environment allowlist, timeout, stdout/stderr limits, AbortSignal, and approved effect policy.

Backend rules:

- `sandbox`: use a detected container/isolation backend with network disabled by default, read-only base filesystem, bounded writable workspace, CPU/memory/process/time limits, and process-tree termination
- `workspace`: requires a container or OS policy backend that actually confines filesystem writes to the approved workspace and enforces the declared network policy; setting `cwd` or validating input paths alone is not confinement
- `full`: disabled by default and requires per-attempt approval; approval is bound to source hash, backend hash, workspace, and effect policy
- missing backend/tool/language support fails before spawn
- shell source is passed as data/file input, not interpolated into an outer shell command
- secrets and inherited environment variables are denied unless explicitly allowlisted
- stdout/stderr are bounded and stored as artifacts, not unbounded control-plane state
- AbortSignal kills the entire process tree and waits for termination

Container support may be optional by platform, but capability detection and planner rejection are mandatory on every platform.

### Backend And Platform Proof Matrix

No operating system is assumed supported from its name. A backend may advertise a mode only when the current host passes detection for every guarantee in that row:

| Mode | Mandatory proof before advertising | Plain host interpreter allowed | Approval |
| --- | --- | --- | --- |
| `sandbox` | filesystem isolation, declared network denial/allowlist, CPU/memory/process limits, bounded output, timeout, process-tree kill | No | As required by authored effect policy |
| `workspace` | kernel/container-enforced workspace confinement, declared network policy, environment allowlist, bounded output, timeout, process-tree kill | No; `cwd` is not a security boundary | Per attempt |
| `full` | exact interpreter argv, environment allowlist, bounded output, timeout, reliable process-tree kill; policy explicitly acknowledges unconfined filesystem/network/process access | Yes | Per attempt; disabled by default |

For Linux, macOS, and Windows, the completion record contains one row per backend/mode with `supported`, `unsupported`, or `not tested`, the exact enforcement primitive, detection result, and real-backend test evidence. `not tested` is treated as unsupported in production capability reporting. Windows support that claims descendant termination must use a tested Job Object or equivalent; POSIX support must test process-group/session termination. A container binary being installed is not proof that its daemon, isolation flags, mount mode, network policy, or resource limits work.

### Approval And Launch Journal

Script approval uses the existing typed human-intervention boundary, but execution authority is a main-owned durable per-run journal at `workflows/<workflowId>/runs/<runId>/script-executions.json`. Before Phase 12 it has its own `schemaVersion: 1`, generation, atomic writer, and bounded records. It is not embedded into core schema-1 run state.

Each record is keyed by node/attempt and binds plan/source/backend/capability/effect-policy/workspace hashes plus expiry. State is `requested -> approved|rejected|expired -> starting -> running -> settled`; transitions use expected generation. Main persists `starting` immediately before spawn, then `running` with a non-authoritative process identity only after spawn succeeds, and `settled` after bounded output/exit/cancellation is captured. Renderer never creates or advances journal state directly.

An approved record is single-use. Recovery from `starting` or `running` is an ambiguous execution outcome: attempt tracked process-tree cleanup when identity can be proven, then pause with a typed reconciliation intervention. It must not automatically spawn the same node attempt again or infer success from missing PID alone. A user-authorized retry creates a new attempt and a new approval/launch record. Phase 12 migrates this journal into schema-2 envelopes and crash-consistency coverage.

### LLM Effect Enforcement

Extend the task/runtime request boundary so a caller can require `tools: none`, `filesystem: none`, and `network: none`. A runtime that cannot prove enforcement reports unsupported capability. `llmHook` must use this contract; a prompt sentence is defense-in-depth only.

Normal LLM workers retain their declared required tools. Reviewer/supervisor/probe policies must be explicit rather than inherited accidentally from the worker.

### Approval Contract

Approval request includes:

- node/attempt identity
- script/source hash
- backend id/version
- sandbox mode
- workspace
- filesystem/network/process/tool policy
- timeout and output limits
- reason approval is required

The main process validates the approval identity, journal generation, expiry, and all bound hashes before the `approved -> starting` CAS. Renderer state alone is not authority.

### Out Of Scope

- dynamic slot scheduling and global locks
- actual model profile routing
- replan flow
- storage schema migration
- general plugin sandboxing

### Phase Failure Conditions

- planner can approve a Script node with no executable backend
- Script source is interpolated into a shell command
- cancellation leaves descendant processes running
- a plain host process advertises `workspace` confinement based only on cwd/path validation
- output can grow without bound
- inherited environment leaks secrets
- `llmHook` no-tool behavior depends only on prompt text
- full/host execution can start with stale or renderer-only approval
- recovery automatically respawns an ambiguously started Script attempt

### Definition Of Done

- capabilities are validated, frozen, rechecked, and visible
- unsupported Script plans fail before run creation
- at least one documented backend can execute an approved Script node safely in its supported environment
- all other environments fail closed with actionable capability diagnostics
- no-tool LLM execution is enforced below prompts
- cancellation, limits, approval binding, and negative security cases are tested
- typecheck, full tests, and production build pass
