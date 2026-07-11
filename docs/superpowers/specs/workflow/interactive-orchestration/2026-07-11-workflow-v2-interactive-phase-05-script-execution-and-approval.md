# Workflow V2 Interactive Phase 05: Script Execution And Approval

## Status

Implemented and verified on 2026-07-11.

## Objective

Enable deterministic script nodes safely instead of routing simple mechanical work through an Agent.

## Contract

Script plans use a typed executable specification, not an interpolated shell string:

```ts
export interface WorkflowV2ScriptSpec {
  command: string;
  args: string[];
  cwdPolicy: "workflow";
  access: "read-only" | "workspace-write";
  timeoutMs: number;
  outputSchema: JsonSchema;
}
```

The capability resolver validates the command, argument policy, working directory, filesystem access, timeout, platform support, and approval requirement before plan approval and again before execution.

## Approval Policy

- Read-only allowlisted operations may run without a per-run approval.
- Workspace-write operations require an explicit approval node/intervention unless covered by a frozen trusted policy.
- Network, process spawning beyond the declared command, destructive operations, privilege escalation, and unrestricted shell execution fail closed unless a later approved sandbox contract explicitly supports them.

## Runtime And UI

Script nodes are visible in the graph with a distinct node kind and capability summary. They do not create Agent sessions. Their detail window shows spec, approval state, stdout/stderr, structured output, duration, and failure reason.

## Required Tests

- Planner emits script mode for deterministic tasks.
- Safe read-only script executes and produces validated output.
- Workspace-write script pauses for approval and blocks descendants.
- Rejected approval prevents execution.
- Invalid output schema fails the node.
- Free-form shell strings and unsupported commands fail before side effects.

## Forbidden Moves

- Passing a free-form shell line to a shell interpreter.
- Downgrading a script node into an Agent node when policy rejects execution.
- Executing workspace writes before durable approval.
- Accepting unvalidated stdout as the authoritative structured output.

## Fail Fast

Stop execution before side effects when command, arguments, cwd, access, timeout, approval, or output schema cannot be validated against the frozen capability policy.
## Acceptance Criteria

At least one useful read-only and one approved workspace-write script path operate end to end, while unsafe or unsupported capabilities remain fail-closed.
