# Workflow Script Parameters

## Goal

Make script inputs first-class, typed, inspectable, and editable through the node conversation window.

## Parameter Contract

Each parameter declares a stable key and label, binding location (`argument`, `environment`, `header`, `query`, `body`, or `stdin`), value type (`string`, `number`, `boolean`, `json`, `secret`, `file`, or `directory`), source (`user`, `workflow`, `upstream`, or `literal`), required state, description, default value, and any source selector.

Parameters replace `script.input` and ad-hoc argument interpolation.

## Resolution

At node readiness time the runtime resolves non-user sources from frozen workflow context and direct upstream result packets. Missing required user parameters move the node to `awaiting_input` and use the same node conversation surface as interactive Agent nodes.

Submitted values are type-validated, stored as run-scoped node input, and shown in node history. Secrets use the secret facility and persist only redacted metadata.

## UI

The script node window uses Apifox-style sections for Parameters, Headers, Query, Body, Environment, Standard input, Permissions, Script source, and Output schema. Controls are selected by value type.

## Invariants

- Script input exists only in the node window; no legacy inline workflow input panel exists.
- A node cannot start while required parameters are unresolved.
- Resolved input is immutable after execution starts.
- Only direct declared bindings are available; scripts cannot silently consume arbitrary workflow state.
