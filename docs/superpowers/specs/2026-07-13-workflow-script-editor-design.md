# Workflow Script Editor

## Goal

Provide one coherent script-node authoring and runtime-input surface without restoring legacy workflow-level input controls.

## Layout

The node window has tabs for Activity, Inputs, Contract, Permissions, Script, and Output. Activity shows runtime messages, input requests, permission decisions, execution, and outputs. Inputs groups run-time values by parameter location. Contract edits parameter definitions and bindings. Permissions compares Manager, Reviewer, static, and effective risk. Script edits executable source. Output shows schema and rendered results.

Authoring controls are enabled only for a mutable draft. Runtime values are enabled only while the node awaits input. Completed and running nodes remain inspectable.

## Interaction

Key-value groups follow an Apifox-style table with enable state, key, value or binding, type, required state, description, and row actions. Body and stdin use dedicated editors. Permission confirmation names the exact side effects being authorized.

## Invariants

- All Agent and script nodes can open the node window in every lifecycle state.
- Script runtime input and authoring are visually distinct.
- JSON values render structurally, not as escaped JSON strings.
- The page contains no second input surface for the same node.
