# Evaluation Workbench UI Design

## Goal

Replace the provisional MCP and evaluation screens with a cohesive operational UI matching the existing Runtime and Agent pages. The result should feel compact, calm, and purpose-built for repeated configuration and evaluation work.

## Navigation

- Keep MCP as its own top-level feature.
- Replace the three top-level Dataset, Evaluator, and Experiment entries with one Evaluation entry.
- Evaluation owns four internal views: Overview, Datasets, Evaluators, and Experiments.
- Internal view changes preserve the selected resource and loaded data where practical.

## Evaluation Workbench

The page uses three stable horizontal layers:

1. A compact feature header with title, current-view description, and the primary action.
2. A restrained tab row for Overview, Datasets, Evaluators, and Experiments.
3. A working area with a fixed-width resource browser and a flexible detail surface.

Datasets and Evaluators use a list/editor pattern. Experiments use a list plus an execution-focused detail surface. Experiment detail prioritizes the current Agent revision, dataset, evaluators, repetition count, and Run action. After a run, the first visible content is a four-metric strip for average score, minimum score, pass rate, and duration, followed by a dense case result table and run history.

Overview summarizes existing data rather than showing decorative charts with insufficient history. It displays resource counts, recent runs, failing cases, and Agent quality summaries only when underlying results exist.

## MCP Workbench

MCP remains independent because it is an Agent capability registry, not evaluation data. It adopts the same header, resource browser, editor toolbar, section headings, form controls, status treatment, and empty-state language as Evaluation.

The editor separates connection configuration from discovered tools. Connection status is a compact inline state, not a large alert. Tool discovery results use a scannable table/list with tool name and description.

## Visual System

- Reuse existing application colors, Geist typography, buttons, inputs, and surface tokens.
- Use square operational surfaces with existing small radii; avoid floating nested cards.
- Use borders, spacing, and section labels for hierarchy instead of decorative backgrounds.
- Keep headings compact and data text aligned for scanning.
- Reserve the accent color for selection, primary actions, and positive state.
- Use status colors only for connected/pass/fail/error semantics.
- All icon actions use Lucide icons with accessible labels and tooltips.

## Responsive Behavior

- Desktop keeps the resource browser and detail surface side by side.
- Narrow layouts reduce the browser width before stacking.
- At mobile widths, resource selection becomes a full-width row above the editor.
- Tables scroll inside their own surface and never expand the application viewport.
- Long IDs, tool names, errors, prompts, and outputs wrap or truncate with explicit detail access.

## Component Boundaries

- `EvaluationWorkbench`: data loading, active internal view, and shared shell.
- `EvaluationOverview`: aggregate summaries and recent activity.
- `DatasetWorkspace`: dataset list and case editor.
- `EvaluatorWorkspace`: evaluator list and evaluator form.
- `ExperimentWorkspace`: experiment setup, run metrics, case results, and history.
- Shared workbench primitives: header, tabs, browser, toolbar, section, metric strip, status indicator, and empty state.
- `McpPage` reuses the shared primitives without coupling MCP state to Evaluation state.

## Behavior And Feedback

- Save, run, test, and delete actions expose busy and disabled states.
- Destructive actions retain confirmation.
- API failures render next to the relevant toolbar or section.
- Empty states state the next action directly.
- Switching evaluation tabs does not silently discard edited values; dirty editors request confirmation before leaving.

## Verification

- Add layout tests for the single Evaluation navigation entry and all four internal tabs.
- Add interaction tests for resource selection, empty states, and experiment result rendering.
- Run typecheck, focused tests, full build, and desktop rendering checks.
- Inspect desktop and narrow viewport screenshots for overflow, clipping, and navigation density.
