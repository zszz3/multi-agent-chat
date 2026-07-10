# Workflow V2 Phase 01 Authoring Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define one canonical compiled authoring contract for Workflow V2 so later phases never need to infer graph meaning from templates or prompt conventions.

**Architecture:** Introduce explicit Workflow V2 authoring modules under `src/shared/workflow-v2/`. Keep the current graph authoring utilities working, but stop treating legacy `WorkflowGraph` as the only extensibility surface. Template compilation and static validation should happen before runtime execution begins.

**Tech Stack:** TypeScript, shared contracts, Vitest

---

### Task 1: Introduce Workflow V2 Definition Types

**Files:**
- Create: `src/shared/workflow-v2/definition.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add explicit Workflow V2 node and edge contracts**

```ts
export interface WorkflowV2Edge {
  fromNodeId: string;
  toNodeId: string;
}

export type WorkflowV2Node = WorkflowV2LLMNode | WorkflowV2ScriptNode;
```

- [ ] **Step 2: Make `llm` and `script` the only required MVP execution models**

```ts
type WorkflowV2ExecModel = "llm" | "script";
```

- [ ] **Step 3: Keep edge semantics minimal and reject review/control fields at the type boundary**

### Task 2: Compile Templates Into Executable Nodes

**Files:**
- Create: `src/shared/workflow-v2/templates.ts`
- Modify: `src/shared/skill-templates.ts` if shared helpers are reusable

- [ ] **Step 1: Add template reference, registry, and expansion helpers**

```ts
export function resolveWorkflowV2Template(...)
export function compileWorkflowV2Node(...)
```

- [ ] **Step 2: Ensure runtime consumers receive compiled nodes, not template references**

```ts
const compiledNodes = authoredNodes.map((node) => compileWorkflowV2Node(node, registry))
```

- [ ] **Step 3: Define override precedence clearly**

```text
template defaults -> rendered params -> explicit node overrides
```

### Task 3: Add Static Validation

**Files:**
- Create: `src/shared/workflow-v2/validation.ts`
- Create: `src/shared/workflow-v2/validation.test.ts`
- Modify: `src/shared/workflow-graph.ts` only if a shared DAG helper should be reused

- [ ] **Step 1: Validate duplicate ids, missing references, cycles, and execution-model-specific fields**

- [ ] **Step 2: Fail fast on unsupported future semantics instead of passing unknown edge behavior through**

- [ ] **Step 3: Return structured validation results that later planner code can consume**

```ts
export interface WorkflowV2ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### Task 4: Verification

**Files:**
- Modify: tests only as needed

- [ ] **Step 1: Run focused shared tests**

Run:

```bash
npx vitest run src/shared/workflow-v2/validation.test.ts src/shared/workflow-graph.test.ts
```

Expected: all pass

- [ ] **Step 2: Run full typecheck**

Run: `npm run typecheck`
Expected: exit code `0`
