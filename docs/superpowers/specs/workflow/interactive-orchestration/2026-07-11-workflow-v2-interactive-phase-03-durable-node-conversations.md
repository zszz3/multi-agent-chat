# Workflow V2 Interactive Phase 03: Durable Node Conversations

## Status

Approved design. Not implemented.

## Objective

Give interactive workflow nodes a persistent, resumable, multi-turn runtime conversation.

## State Model

```ts
export type WorkflowNodeConversationStatus =
  | "starting"
  | "active"
  | "waiting_for_user"
  | "completion_proposed"
  | "closed"
  | "failed";

export interface WorkflowNodeConversation {
  workflowId: string;
  runId: string;
  nodeId: string;
  runtimeConversation: RuntimeConversationRef;
  status: WorkflowNodeConversationStatus;
  messages: WorkflowNodeMessage[];
  completionProposal?: WorkflowNodeCompletionProposal;
  updatedAt: number;
}
```

Conversation identity is `workflowId + runId + nodeId`. The runtime manager creates it once and sends all later user messages to the same runtime conversation. Messages, tool events, partial output, runtime identity, and semantic state transitions are durable events.

## Completion Protocol

1. Agent gathers information over any number of turns.
2. Agent emits a structured completion proposal containing summary, outputs, evidence, unresolved risks, and acceptance-criteria mapping.
3. Node enters `completion_proposed`; descendants remain blocked.
4. User chooses confirm, continue, or reject with instruction.
5. Confirm commits authoritative output and closes the conversation as `completed`.
6. Continue/reject sends a new message into the same conversation and returns to active interaction.

## Runtime Capability Contract

Interactive execution requires create, send, stream-events, interrupt/probe, resume, and close capabilities. Unsupported runtimes fail plan validation or require a pre-run mode override; they never emulate interaction by repeated one-shot execution.

## Recovery

App restart reloads durable conversation metadata and asks the runtime adapter to resume when supported. If resume is unavailable, project a typed intervention requiring user choice; do not silently create a new session.

## Required Tests

- Multiple user turns use one runtime conversation ID.
- Closing and reopening UI does not close the conversation.
- `waiting_for_user` and `completion_proposed` block descendants.
- Confirm commits output exactly once.
- Reject keeps prior history and session identity.
- Restart recovery resumes or produces a typed intervention.

## Forbidden Moves

- Creating a new one-shot task for each user reply.
- Treating UI close, stream end, or runtime idle as conversation completion.
- Confirming completion without the user command.
- Replacing a lost session silently during recovery.

## Fail Fast

Stop implementation if the runtime abstraction cannot expose stable conversation identity, ordered events, send, resume, interrupt, and close semantics without bypassing the runtime driver boundary.
## Acceptance Criteria

An interactive node behaves like a real underlying Agent conversation and remains topology-safe until explicit completion confirmation.
