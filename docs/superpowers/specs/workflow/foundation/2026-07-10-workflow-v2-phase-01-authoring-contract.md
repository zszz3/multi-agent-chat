# Workflow V2 Phase 01: Authoring Contract

## 2026-07-10

### Status

Implemented and verified on 2026-07-10. The canonical definition, template compiler, and structured static validator are used before plan freezing and runtime execution.

### This File Is Self-Contained

A fresh agent may execute this phase using only:

- this file
- `docs/superpowers/specs/workflow/foundation/2026-07-10-workflow-v2-implementation-program.md`
- the current repository state

The agent must not assume prior chat history.

### Objective

Define the authoring-time contract for Workflow V2 before any runtime scheduling or review behavior is implemented.

This phase is responsible for one thing only:

- what a valid executable workflow definition is

### Why This Phase Exists

Workflow V2 cannot be executed safely if the repository lacks a stable answer to these questions:

- what fields a node must contain
- what an edge means
- how templates become executable nodes
- what must be rejected before execution starts

Without that contract, later phases are forced to invent runtime-local compatibility rules.

### Required Preconditions

None beyond the repository state and the master program contract.

### Non-Negotiable Invariants

This phase must enforce all of the following:

- the executable unit is `WorkflowDefinition`
- edges express dependency only
- node ids are unique
- only `llm` and `script` execution models are required for MVP
- templates are authoring conveniences and must expand into plain executable node definitions before runtime
- static validation must happen before planning output is accepted for execution

### In Scope

- `WorkflowDefinition` shape
- node and edge contracts
- template reference and expansion contract
- authoring-time schema validation
- DAG and reference integrity checks
- static rejection of unsupported edge or node semantics

### Out Of Scope

- role routing policy
- planner behavior
- runtime scheduling
- reviewer execution
- persistence and recovery
- hook execution runtime

### Required End State

#### 1. WorkflowDefinition Must Be Executable Without Hidden Expansion

The repository must have one canonical workflow-definition shape that can be serialized, persisted, and handed to runtime execution.

Minimum required fields:

- `workflowId`
- `graphVersion`
- `objective`
- `nodes`
- `edges`

The runtime must not require hidden shell-local defaults to understand the graph.

#### 2. Node Contracts Must Express Execution And Validation Intent

Every executable node must state:

- what it does
- how it runs
- what it outputs
- how output is validated

For MVP, the authoring contract must support:

- `LLMNode`
- `ScriptNode`

The phase must not widen the MVP by coupling implementation to future node kinds.

#### 3. Edge Semantics Must Stay Minimal

Edge shape must support:

- upstream node id
- downstream node id

The validator must reject attempts to encode:

- review loops on edges
- branch semantics on edges
- aggregate policy on edges
- hidden control messages on edges

#### 4. Templates Must Compile Away Before Runtime

If a workflow author uses templates, the system must expand them into explicit node definitions before execution.

That means later phases may assume they receive:

- compiled nodes
- explicit prompts or scripts
- explicit output-field requirements

and do not need to understand authoring-time template indirection.

#### 5. Static Validation Must Fail Early

The validator must reject invalid workflow definitions before the graph enters execution.

At minimum this includes:

- duplicate node ids
- edges that reference missing nodes
- cycles if the runtime assumes DAG execution
- invalid execution-model-specific fields
- unsupported sandbox values
- missing required output-field definitions

#### 6. Unsupported Future Semantics Must Fail Explicitly

This phase must not silently accept future-looking authoring constructs under a generic "extra fields" posture if runtime cannot interpret them.

If the repository accepts arbitrary graph metadata, it must either:

- validate and ignore it intentionally with an explicit contract
- or reject it clearly

It must not leave meaning ambiguous.

### Phase Failure Conditions

This phase is incomplete if any of the following remain true:

- runtime code must still infer executable shape from templates directly
- node validation is split across random feature code with no canonical contract
- invalid edges can pass authoring validation
- authoring accepts more node semantics than runtime can safely interpret

### Definition Of Done

This phase is complete only when:

- a canonical authoring contract exists for Workflow V2 graphs
- templates expand to explicit node definitions before runtime
- invalid graph structure is rejected deterministically
- later phases can rely on validated compiled definitions instead of raw authoring input

### Verification Evidence

- `validation.test.ts` covers duplicate ids, missing references, cycles, unsupported fields, execution-model fields, budgets, templates, leases, and hooks.
- `templates.test.ts` covers executable expansion, rendered parameters, override precedence, and hook composition.
- The final repository-wide typecheck and 766-test suite pass.
