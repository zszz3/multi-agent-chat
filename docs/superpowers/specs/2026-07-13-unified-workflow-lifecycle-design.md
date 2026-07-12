# Unified Workflow Lifecycle Design

## Goal

Represent planning conversation, editable DAG draft, confirmed executable revision, and runs as one Workflow aggregate identified by one `workflowId`.

## Model

- A Workflow owns the persistent Manager conversation.
- The same Workflow owns one mutable draft definition.
- User confirmation freezes the current draft as an immutable executable revision.
- Runs reference the confirmed revision that they execute.
- Creating or updating a draft never creates or selects another top-level Workflow.

## Lifecycle

1. Create a Workflow in `draft` phase and start its Manager conversation.
2. `workflow_create` writes the proposed definition into that Workflow's mutable draft.
3. The current page renders the editable DAG beside the same conversation.
4. User edits the DAG or asks the Manager to revise it; both update the same draft.
5. User confirms the draft, creating the next immutable confirmed revision.
6. Run is enabled only when the current draft matches the confirmed revision.
7. Editing after confirmation returns the Workflow to an unconfirmed draft without deleting prior run history.

## Commands

- `workflow_create` requires the current planning `workflowId` from the MCP launch context and updates that Workflow draft.
- `workflow_update` updates the same draft and does not publish it.
- `workflow_confirm` freezes the current draft and returns its confirmed revision.
- `workflow_run` rejects unconfirmed or changed drafts.

## Removed Design

- No tool-created second Workflow record.
- No `workflow_created` event carrying a new `workflowId`.
- No source-to-target message, runtime conversation, work directory, or selection migration.
- No `parentWorkflowId`, legacy fallback, or compatibility conversion.

## Persistence

The Workflow record persists conversation messages, mutable draft, confirmed revision metadata, and run IDs together. A run stores the exact confirmed revision number used at start.

## UI

- The planning conversation and DAG remain on one Workflow page.
- A visible `Confirm workflow` action freezes the draft.
- `Run workflow` is disabled until confirmation and becomes disabled again after any draft edit.
- Confirmation state and revision are visible near graph validation status.

## Invariants

- A Manager tool call cannot change `activeWorkflowId`.
- A Manager tool call cannot allocate a Workflow ID.
- Every run references an existing confirmed revision.
- Draft mutation invalidates current confirmation.
- Conversation history remains owned by the same Workflow before and after confirmation.
