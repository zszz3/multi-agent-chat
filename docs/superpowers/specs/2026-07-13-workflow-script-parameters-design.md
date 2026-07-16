# Workflow Script Parameters

## Goal

Make script inputs first-class, typed, inspectable, and editable through the node conversation window.

## Parameter Contract

Each parameter declares a stable key and label, binding location (`argument`, `environment`, `header`, `query`, `body`, or `stdin`), value type (`string`, `number`, `boolean`, `json`, `secret`, `file`, or `directory`), source (`user`, `workflow`, `upstream`, or `literal`), required state, description, default value, optional scalar `enum`, and any source selector.

Parameters replace `script.input` and ad-hoc argument interpolation.

## Resolution

At node readiness time the runtime resolves non-user sources from frozen workflow context and direct upstream result packets. Missing required user parameters move the node to `awaiting_input`. The request includes every unresolved user parameter for that node, including optional Header, Query, Body, Environment, and stdin fields, so the user can complete the request once instead of being prompted field by field.

An `upstream` parameter must reference a direct predecessor with `upstreamNodeId` and an exact key from that node's `outputFields` with `upstreamOutputKey`. Its value comes from the result packet's `outputs` object, never `summary`. Validation rejects missing nodes, non-direct bindings, and undeclared output keys before execution.

For an Agent node with a direct downstream script, the frozen TaskPacket includes each consumed output key plus the downstream parameter key, location, value type, required flag, and description. The Agent uses this producer-consumer contract to shape its `outputs` before the script runs. Output fields may declare `valueType`; declared types must match all consuming script parameters.

Submitted values are type-validated, stored as run-scoped node input, and shown in node history. Secrets use the secret facility and persist only redacted metadata.

## UI

The script node window uses Apifox-style request tabs for Params, Headers, Body, Environment, and Standard input, alongside Permissions, Script source, and Output schema. JSON bodies use a JSON text editor; other fields use typed row controls; scalar `enum` fields use a select. All visible request fields share one draft and are submitted together.

## Invariants

- Script input exists only in the node window; no legacy inline workflow input panel exists.
- A node cannot start while required parameters are unresolved.
- Resolved input is immutable after execution starts.
- Only direct declared bindings are available; scripts cannot silently consume arbitrary workflow state.
