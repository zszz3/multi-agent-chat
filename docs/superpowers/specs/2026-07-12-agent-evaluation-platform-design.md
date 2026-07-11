# Agent Evaluation Platform Design

## Summary

Build a local-first, offline Agent evaluation subsystem inspired by Langfuse's datasets, experiments, evaluators, and scores. The subsystem remains separate from `AgentHub`: it reuses Runtime execution but owns its own normalized persistence, run scheduler, score pipeline, artifact storage, and UI.

The first release evaluates curated datasets before users run Agents in Chat or Workflow. Online trace monitoring, production sampling, annotation queues, Docker sandboxes, and hosted collaboration are excluded.

## Domain Boundaries

### Runtime

Runtime owns executable infrastructure:

- Provider/channel configuration and credentials.
- Runtime implementation and capability declaration.
- Model catalog and reasoning settings.
- Connection testing and runtime-specific setup.

Runtime does not own Instructions, Skills, MCP bindings, datasets, or evaluation results.

### Agent

All business surfaces select an Agent. Agents have two explicit types:

- `execution`: a read-only Agent generated one-to-one from each saved Runtime configuration.
- `composed`: a user-managed Agent built on one execution Agent with Instructions, Skills, and MCP tools.

The Agent page shows both types in one list grouped by type. Execution Agents are read-only and link back to Runtime. Composed Agents expose the assembly editor.

### Evaluation

Evaluation owns:

- Dataset definitions and revisions.
- Evaluator definitions and revisions.
- Experiment drafts and immutable runs.
- Case attempts, outputs, scores, quality gates, logs, and artifact indexes.
- Run scheduling, retry, interruption, resume, and comparison.

Evaluation calls Agent execution through a narrow service contract. It must not access `AgentHub` maps or renderer state directly.

## Agent Assembly

### Execution Agents

Saving a Runtime configuration synchronizes a read-only execution Agent and creates a new Agent Revision when execution behavior changes. Display-only changes do not create revisions.

An execution Agent Revision contains:

- Runtime and channel identifiers.
- Model and reasoning settings.
- A non-secret configuration snapshot and hash.
- Secret references, never secret values.

### Composed Agents

A composed Agent contains:

- Name, description, tags.
- `baseAgentId` referencing an execution Agent.
- Instructions used during execution.
- Ordered Skill bindings.
- MCP Server bindings with per-tool allowlists.

Edits remain in renderer draft state until the user selects **Save new version**. Switching Agent or leaving the page with dirty state prompts the user to save or discard.

When the base execution Agent changes, dependent composed Agents show an update notice. They keep their previous Revision until the user confirms the new base configuration and saves a new version.

### Revision Selection

- New Chat sessions pin the latest Agent Revision at creation.
- Workflow runs pin the latest selected Agent Revision at run start.
- Experiments require an explicit Agent Revision.
- Execution and composed Agents are both valid Experiment targets.

Referenced Revisions cannot be deleted. The system retains the current Revision, all referenced Revisions, and the five newest unreferenced Revisions. Older unreferenced Revisions may be garbage-collected with their unreferenced Skill snapshots.

## Skill Sources And Snapshots

The Skill Registry exposes:

- Official bundled Skills.
- User-managed Skills installed or created in the application.
- Locally discovered Skills from Codex, Claude, Agents, and user-added directories.

Users do not need to download or copy local Skills into the application before selecting them. Saving a composed Agent Revision captures the effective Skill files so the Revision remains reproducible after local files change.

The first storage implementation uses normalized SQLite rows:

- `skill_revisions`
- `skill_revision_files`, one BLOB row per relative file
- `agent_revision_skills`

It must enforce per-file and per-Skill size limits, reject paths outside the Skill root, and ignore unsafe symlinks. A later migration may move file BLOBs to content-addressed storage without changing Agent Revision references.

## MCP Registry

Add `MCP` as a top-level page. The first release supports:

- stdio and HTTP Server definitions.
- Create, edit, delete, and import from existing Runtime configuration.
- Connection tests and tool discovery.
- Environment variable names mapped to Secret references.
- Full discovered tool schemas.
- Tool enablement controls.

MCP Servers are mutable and are not versioned. A composed Agent Revision stores the Server ID and explicit tool allowlist. Newly discovered tools are disabled for existing Agent bindings until selected.

Each Experiment Run stores a non-secret MCP audit snapshot containing transport, command or URL, arguments, configuration hash, selected tool schemas, and allowlist. This snapshot is for diagnosis, not restoration.

## Evaluation Resources

Add three independent top-level pages:

- `Datasets`
- `Evaluators`
- `Experiments`

### Datasets

A Dataset contains metadata, ordered Cases, default Evaluators, and default quality gates. Creating an Experiment copies these defaults into the Experiment Draft, where users can add, remove, or adjust them.

A Dataset Case supports:

- Name, prompt, tags, and metadata.
- Fixture files or a fixture directory.
- Optional expected text or structured output.
- Optional expected artifacts.
- Timeout.
- Deterministic evaluator overrides.

Content changes create an automatic Dataset Revision. Name, description, and display tags do not. Experiments pin one Dataset Revision.

Datasets support UI management and repository-friendly import/export:

```text
dataset-name/
├── dataset.json
├── cases.jsonl
└── fixtures/
    └── case-id/
```

No official Starter Datasets ship in the first release.

### Evaluators

Evaluators are independent from Agents. They reuse existing Provider/Channel and Model configuration but run with Skills, MCP, and tools disabled. Runtime capability declarations determine whether a model can provide reliable structured Judge output.

Evaluator types:

- LLM Judge with Numeric, Boolean, or Categorical Score schemas and required reasoning.
- Deterministic checks: exact match, contains, regex, valid JSON, file existence, and command exit status.
- Custom local commands are allowed without a sandbox. The UI must display imported commands and record argv, cwd, environment variable names, exit code, bounded stdout/stderr, duration, and timeout.

Behavioral changes to model selection, rubric, input mapping, or Score schema create an Evaluator Revision. Display-only changes do not.

Ship copyable official Evaluator templates for instruction following, correctness, completeness, tool-use quality, and safety. Templates do not bind a Judge model.

### Experiments

An Experiment Draft selects:

- One Dataset Revision.
- One Agent Revision.
- One or more Evaluator Revisions.
- Case-level and Run-level quality gates.
- Repetitions from 1 through 5, default 1.
- Concurrency from 1, 2, 4, or 8, default 2.

Starting a Draft creates an immutable Experiment Run with a fully resolved configuration snapshot. The Draft remains editable for later Runs.

The UI shows expected execution volume before start:

```text
case count × repetitions = Agent executions
Agent outputs × LLM evaluators = Judge calls
```

The first release records latency, tokens, and estimated cost but does not enforce budgets. Unavailable usage values remain `unknown`.

## Run Scheduler

Runs execute in isolated local temporary workspaces, one per Case repetition. Docker is not supported in the first release, but `executionBackend: "local"` is explicit in the run manifest to preserve an extension boundary.

The scheduler must:

- Copy fixtures into an isolated workspace.
- Materialize the pinned Agent and Skill Revision.
- Expose only the Agent's allowed MCP tools.
- Capture final text, tool summary, files, logs, usage, latency, and errors.
- Execute independent Evaluators after successful Agent output.
- Persist Case state after every transition.
- Support cancellation and manual resume.

Infrastructure failures such as rate limits, network failures, and process errors retry automatically once. Quality failures do not retry. Repetitions are statistical samples, not retries. Manual Case reruns create new Attempts and never overwrite old data.

After application restart:

- Completed Cases remain completed.
- Running Attempts become interrupted.
- Pending Cases remain pending.
- The application does not automatically resume model calls.
- Users may resume pending and interrupted Cases in the same Run.

## Scores And Quality Gates

Every Score records:

- Evaluator Revision.
- Score name and type.
- Value.
- Reasoning or deterministic evidence.
- Source Attempt and timestamps.
- Evaluation status, including `evaluation_error`.

There is no weighted universal score. Quality gates support:

- Case gates for hard requirements such as safety and valid output.
- Run gates for aggregates such as average score, minimum score, success rate, and Boolean pass rate.

Judge failure is an evaluation error, not an Agent quality failure.

## Comparison

Users can compare up to four Runs when they use the same Dataset Revision. One Run may be selected as Baseline.

- Matching Evaluator Revisions compare directly.
- Different Evaluator Revisions render in separate columns and are never aggregated together.
- Repetition count differences are visible.
- Summary comparison includes gates, scores, success rate, latency, tokens, and cost.
- Case comparison includes output diff, Score differences, Judge reasoning, errors, and artifacts.

## Persistence And Files

Use normalized SQLite tables for Agent and Skill Revisions, MCP definitions, Dataset Revisions and Cases, Evaluator Revisions, Experiment Drafts and Runs, Attempts, Scores, and artifact metadata. Do not introduce aggregate JSON state rows.

Store large and user-inspectable data outside SQLite:

```text
evaluation-artifacts/
└── experiment-run-id/
    └── case-attempt-id/
        ├── workspace-output/
        ├── logs/
        └── manifest.json
```

Artifacts never expire automatically. Users delete them explicitly by Run or Experiment after reviewing the affected Runs and disk usage.

## Error Handling

- Missing Runtime, Secret, Skill file, or MCP Server prevents a new run from starting and identifies the missing dependency.
- A changed local Skill requires saving a new composed Agent Revision before use in a new pinned run.
- A changed MCP Server does not invalidate an Agent Revision; the Run records the actual audit snapshot.
- Partial Case or Evaluator failures do not erase successful Attempts.
- SQLite and artifact writes use temporary paths and atomic rename where needed; database rows never point to a partially written artifact as complete.
- Imported Dataset commands are visibly marked as local code execution. The first release does not claim sandbox security.

## UI Requirements

### Agent Page

- One left list grouped into composed and execution Agents.
- Composed Agents show editable identity, Instructions, base execution Agent, Skills, MCP Server bindings, tool allowlists, and Revision history.
- Execution Agents show read-only Runtime, Provider, Model, reasoning, and Revision history with a link to Runtime.
- Dirty navigation prompts to save or discard.

### MCP Page

- Server list and configuration editor.
- Connection status and explicit test command.
- Tool discovery table with schemas and enablement state.
- Import flow for existing Runtime MCP definitions.

### Dataset, Evaluator, Experiment Pages

- Each is an independent top-level navigation item.
- Dataset editor supports Case list, fixture management, defaults, revisions, and import/export.
- Evaluator editor supports type, Provider/Model, rubric or deterministic rule, Score schema, test preview, templates, and revisions.
- Experiment page supports Draft configuration, start confirmation, live progress, cancellation, resume, Run history, case details, artifacts, gates, and comparison.

## Official Templates

Provide copyable official composed Agent templates, initially:

- Code Reviewer.
- Frontend Builder.
- Research Analyst.

Template creation checks local Runtime, Skill, and MCP availability and lets users resolve missing dependencies before creating their editable Agent.

Provide the five official Evaluator templates listed above. Do not provide official Datasets in the first release.

## Delivery Program

This design spans several ownership boundaries and must be delivered in independently testable phases:

1. **Agent model and Revisions**: execution/composed types, Runtime synchronization, Skill snapshots, selectors, persistence migration.
2. **MCP Registry**: Server persistence, import, tests, discovery, tool allowlists, Agent integration.
3. **Evaluation resources**: Dataset/Evaluator/Experiment schemas, stores, IPC, import/export, templates.
4. **Evaluation runtime**: local workspace runner, scheduler, retries, persistence, resume, deterministic checks, LLM Judges, quality gates.
5. **Evaluation UI**: three top-level pages, progress, results, artifacts, comparison.

Each phase requires focused unit and integration tests. Existing Chat, Workflow, Runtime, and Agent flows must remain operable at the end of every phase.

## Explicit Non-Goals

- Online or production trace evaluation.
- Observation sampling and dashboards.
- Human annotation queues.
- Docker, Kubernetes, or cloud sandboxes.
- Hosted multi-user collaboration.
- Automatic artifact expiration.
- MCP version history.
- Official Dataset templates.
- Multi-Agent execution inside one Agent Experiment; multi-Agent behavior remains a Workflow concern.
