# Workflow V2 Interactive Phase 04: Node Agent Window

## Status

Approved design. Not implemented.

## Objective

Provide a dedicated ChatGPT-style sub-agent window for inspecting and interacting with each workflow node.

## Product Contract

Clicking an agent node opens a node-agent floating window without navigating away from the workflow graph. It is not the existing gate textarea and does not share gate draft state.

The window displays:

- node title, execution mode, semantic state, attempt, and blocking reason
- runtime, provider/model, session identity, and capability status
- complete durable message history
- streaming assistant output
- tool calls, approvals, results, errors, and timestamps
- upstream input digest and current acceptance criteria
- completion proposal and unresolved risks

Interactive nodes show a composer while the conversation accepts input. One-shot nodes are read-only by default and expose an explicit pre-completion conversion/revision action rather than silently sending a message to a new task.

At `completion_proposed`, show three primary actions:

- Confirm completion and continue workflow
- Continue providing information
- Reject and request changes

Closing the window changes presentation only. It does not stop, complete, pause, or replace the node conversation.

## Data Flow

The renderer subscribes to backend workflow-node conversation events. Initial opening loads a durable snapshot, then applies ordered events. Renderer state is a projection and cannot authoritatively advance nodes.

## UX Requirements

- Stable node status: streaming text must not cause status flicker.
- Unread indicator when the window is closed.
- Multiple node windows may be inspected, but only valid interactive states accept input.
- Keyboard and accessibility behavior matches the main chat surface where applicable.
- Reopening returns to the previous scroll/message state without losing authoritative history.

## Required Tests

- Open, close, and reopen preserves history and session identity.
- Streaming events append without replacing semantic status.
- Input is disabled for invalid states and enabled for waiting/active interactive states.
- Confirmation actions call distinct backend commands.
- No legacy gate polling or textarea state drives the window.

## Forbidden Moves

- Reusing the current gate textarea as the conversation surface.
- Storing authoritative messages only in renderer state.
- Advancing node state because the floating window closes.
- Allowing a read-only or terminal node to accept messages.

## Fail Fast

Stop if the backend cannot provide a durable snapshot plus ordered event stream. Do not compensate with renderer polling or inferred message history.
## Acceptance Criteria

Users can inspect a node as a real sub-agent conversation, send information into the same session, and explicitly control completion without losing graph context.
