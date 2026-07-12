# Workflow Script Security Architecture

## Goal

Replace the temporary command allowlist with one explicit script contract covering parameters, side effects, risk, permission decisions, execution, and audit.

## Non-Goals

- No compatibility conversion for `sandboxMode`, `script.access`, or `approved: boolean`.
- No command-name allowlist as the primary security boundary.
- No implicit user input inferred from free-form script text.
- No hidden execution fallback when required input or permission is missing.

## Canonical Script Node

A script node declares executable source, typed parameters, capabilities, Manager risk and rationale, Reviewer risk and rationale, statically inferred side effects, effective risk, output schema, and expected exit behavior.

The old `sandboxMode` and `script.access` fields are deleted. Isolation is derived from capabilities and effective risk rather than being a second permission vocabulary.

## Risk Levels

Risk ordering is `safe < read < write < dangerous`.

- `safe`: deterministic in-memory computation without file, network, process, environment, or credential access.
- `read`: workspace reads and side-effect-free network reads. Runs automatically and is audited.
- `write`: workspace writes or external mutations. Requires an explicit user confirmation for the run.
- `dangerous`: destructive operations, workspace-external access, credentials, arbitrary shell execution, system mutation, or high-impact remote actions. Requires confirmation for every execution.

## Side-Effect Model

Capabilities are semantic, not command-specific: workspace and external file read/write/delete, network read/mutation, subprocess spawn, shell interpretation, environment and credential read, and system configuration mutation.

Static analysis reports detected capabilities and a minimum risk. Unknown or dynamically constructed behavior fails closed at `dangerous` unless the executable is a restricted in-process transform.

## Permission Decision

The permission engine emits `auto_allow`, `require_confirmation`, `allow_once`, or `deny`. The script runner receives a frozen authorization object, not a boolean.

## Invariants

- Effective risk is never lower than Manager, Reviewer, or static analysis risk.
- A grant is scoped to workflow, confirmed revision, run, node, and capability digest.
- Editing a script, parameter, or capability invalidates confirmation and all prior grants.
- Secrets never enter ordinary messages, persisted node output, or audit text.
- The runner executes only fully resolved parameters and a valid authorization.
