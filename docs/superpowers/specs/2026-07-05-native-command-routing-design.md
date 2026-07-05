# Native Command Routing Design

## 2026-07-05

### Goal

Introduce a runtime-extensible command-routing architecture for chat input so the app owns only `/app ...`, Codex and Claude keep their native slash semantics, API runtimes reject native slash honestly, and future agent backends can plug into the same routing, completion, and launch framework without widening product-level branching.

### Context

- Branch: `fix/native-command-support`
- Status: Proposed
- Audience: fresh implementation agents with no prior chat context
- Source of truth: this document defines native-command routing and completion boundaries for this repository

### Scope

- Chat input routing in the Electron main process and renderer
- Application command namespace design
- Runtime-native slash forwarding policy
- Native command completion strategy
- Runtime CLI discovery and launch compatibility
- Extensibility boundaries for future local agent runtimes

### Non-Goals

- Reproducing Codex or Claude native TUI behavior exactly
- Owning or redefining the full native slash command space of any runtime
- Adding slash semantics to task, workflow, or runtime-test execution in the first slice
- Simulating native slash commands for API runtimes
- Hard-coding support around specific installers such as npm or Homebrew

### External Constraints

- Codex CLI documents native slash popup and filtering behavior, but the public App Server method set does not currently expose a generic built-in slash command metadata API.
- Codex App Server does expose list-style metadata such as models, apps, skills, plugins, and experimental features, which can back partial authoritative completion.
- Claude Code documents native slash menu behavior, but public docs do not expose a general built-in command discovery API for external clients.
- Claude Code does expose metadata for custom slash commands and skills, including `argument-hint` and `user-invocable`, which can back authoritative completion for user-defined commands.
- Claude built-in command visibility may vary by platform, plan, and environment, so static lists must not be presented as authoritative truth.

### Decisions

#### Command ownership boundary

- The app owns exactly one command namespace: `/app ...`.
- Native slash command space belongs to the active runtime.
- The app must not continue to own bare `/help`, `/status`, `/models`, or `/plugins`.
- Existing app-local slash commands move to:
  - `/app help`
  - `/app status`
  - `/app models`
  - `/app plugins`

#### Routing policy

- Every chat input still enters one shared command router first.
- The router classifies the input into exactly one of:
  - `app_command`
  - `runtime_slash`
  - `plain_prompt`
  - `unsupported_runtime_slash`
- Classification rules:
  - `codex`
    - `/app ...` -> `app_command`
    - any other `/...` -> `runtime_slash`
    - everything else -> `plain_prompt`
  - `claude`
    - `/app ...` -> `app_command`
    - any other `/...` -> `runtime_slash`
    - everything else -> `plain_prompt`
  - `api`
    - `/app ...` -> `app_command`
    - any other `/...` -> `unsupported_runtime_slash`
    - everything else -> `plain_prompt`

#### Runtime execution semantics

- `runtime_slash` must use the same downstream chat-send path as `plain_prompt`.
- The main process must not rewrite, reinterpret, or expand native slash commands before sending them to Codex or Claude.
- Interactive session reuse, resume, interrupt, and runtime status tracking must remain shared between slash and non-slash prompts.
- API runtimes must reject non-`/app` slash honestly with a local error message instead of silently treating slash as plain prompt text.

#### First-slice scope boundary

- Native command routing applies to chat only in the first slice.
- Tasks, workflows, and runtime tests keep current prompt behavior and do not gain slash routing semantics yet.

#### Extensibility model

- Do not encode command behavior with `if runtimeId === "codex"` style branching spread across the renderer and `AgentHub`.
- Introduce runtime-extensible registration points for:
  - `RuntimeCommandPolicy`
  - `RuntimeCompletionProvider`
  - `RuntimeLaunchProfile`
- Future backends must integrate by registering policies and providers, not by widening product-level branching.

### Architecture

#### Main-process command router

- Add one shared router module, for example `src/main/chat-command-router.ts`.
- Responsibilities:
  - normalize chat input for routing
  - classify command type
  - preserve original text for runtime forwarding
  - return structured routing results
- `AgentHub.sendPrompt()` must delegate classification to the router instead of directly treating every leading slash as app-local command input.

Recommended result shape:

```ts
type ChatCommandRoute =
  | { kind: "app_command"; commandText: string; commandName: string; args: string[] }
  | { kind: "runtime_slash"; prompt: string }
  | { kind: "plain_prompt"; prompt: string }
  | { kind: "unsupported_runtime_slash"; prompt: string; reason: string };
```

#### Runtime command policy

- Each runtime must declare a command policy rather than relying on top-level branching.
- Minimum responsibilities:
  - whether native slash is supported
  - whether native slash is forwarded unchanged
  - how unsupported slash should be explained to the user

Recommended shape:

```ts
interface RuntimeCommandPolicy {
  runtimeId: AgentId;
  supportsNativeSlash: boolean;
  classify(input: string): "app_command" | "runtime_slash" | "plain_prompt" | "unsupported_runtime_slash";
  unsupportedSlashMessage?(input: string): string;
}
```

#### Runtime completion provider

- Completion must be runtime-extensible and split into authoritative metadata versus heuristic suggestions.
- Minimum responsibilities:
  - provide app-owned commands
  - provide runtime-native authoritative metadata when public APIs exist
  - provide heuristic native suggestions
  - record success and remove invalid learned suggestions

Recommended shape:

```ts
interface RuntimeCompletionProvider {
  runtimeId: AgentId;
  listAppCommands(): Promise<CompletionItem[]>;
  listNativeMetadata?(context: CompletionContext): Promise<CompletionItem[]>;
  listNativeSuggestions(context: CompletionContext): Promise<CompletionItem[]>;
  recordNativeCommandSuccess?(event: NativeCommandOutcome): Promise<void>;
  recordNativeCommandFailure?(event: NativeCommandOutcome): Promise<void>;
}
```

#### Runtime launch profile

- Runtime launch compatibility must be abstracted away from command routing.
- Minimum responsibilities:
  - resolve executable preference order
  - probe version
  - normalize spawn invocation
  - expose a stable CLI fingerprint for suggestion memory partitioning

Recommended shape:

```ts
interface RuntimeLaunchProfile {
  runtimeId: AgentId;
  resolveCommand(context: LaunchResolveContext): Promise<ResolvedRuntimeCommand>;
  probeVersion(command: ResolvedRuntimeCommand): Promise<string | null>;
  fingerprint(input: { command: ResolvedRuntimeCommand; version: string | null }): string;
}
```

### Completion Strategy

#### Completion groups

- Completion UI must separate three groups:
  - `App commands`
  - `Native metadata`
  - `Suggested native commands`
- Group labels must reflect certainty:
  - app-owned commands are authoritative
  - native metadata is authoritative only when sourced from runtime-public metadata
  - suggested native commands are heuristic only

#### Authoritative completion

- `/app ...` is always authoritative.
- Codex authoritative metadata may be sourced from public App Server list methods such as:
  - models
  - apps
  - skills
  - plugins
  - experimental features
- Claude authoritative metadata may be sourced from custom skills and command metadata such as:
  - command path-derived names
  - `argument-hint`
  - `user-invocable`
- Do not present Codex or Claude built-in command lists as authoritative unless a public supported discovery interface exists.

#### Heuristic suggestions

- For Codex and Claude built-in native slash commands, use best-effort suggestions only.
- Suggestion sources:
  - curated high-frequency built-in commands
  - learned local history from commands the user actually executed successfully
- API runtimes must not display native slash suggestions.

#### Learned suggestion memory

- Learned native suggestions are stored per:
  - `runtimeId`
  - `cliFingerprint`
- Suggested storage fields:
  - `commandStem`
  - `example`
  - `successCount`
  - `lastUsedAt`
- Only learn native slash commands that:
  - are not `/app ...`
  - were actually entered by the user
  - completed without explicit runtime command error

#### Immediate invalid-command eviction

- Learned native suggestions must be removed immediately when the current turn produces an explicit runtime-side command error that shows the command is invalid for the current runtime and CLI fingerprint.
- Do not use slow decay for learned invalid commands.
- Immediate eviction applies only to learned local suggestions, not to authoritative metadata.
- Curated high-frequency suggestions may be temporarily suppressed for the current fingerprint after explicit command error, but they are not globally deleted from static defaults.
- Do not evict on:
  - interrupt
  - transport failure
  - process crash
  - network error
  - unrelated runtime failure
- Eviction must be driven by explicit invalid-command evidence, not by generic unsuccessful turns.

#### Failure classification

- Suggestion learning and eviction require structured outcome classification for native slash turns:
  - `success`
  - `invalid_command`
  - `transport_failure`
  - `runtime_failure`
  - `interrupted`
- Only `success` updates learned history positively.
- Only `invalid_command` triggers immediate learned-suggestion deletion.

### Renderer Behavior

#### Input affordances

- Renderer must only promise what the app actually knows.
- Placeholder guidance should be runtime-specific:
  - Codex: prompt, native slash, or `/app help`
  - Claude: prompt, native slash, or `/app help`
  - API: prompt or `/app help`
- Renderer should not claim to know the complete native command catalog of any runtime.

#### Suggestion UI

- The existing slash suggestion menu remains a UI shell, but its data source must become runtime-aware and grouped.
- Suggestion selection only inserts text into the composer.
- Selection does not guarantee the runtime command is valid.

#### Duplication avoidance

- Renderer must not reimplement routing truth separately from the main process.
- Frontend pre-hints are advisory only.
- The main-process router remains the only authoritative routing decision point.

### CLI Discovery and Launch Compatibility

#### Discovery priority

- Resolve runtime commands with this preference order:
  1. app-level user override
  2. environment override such as `CODEX_PATH` or `CLAUDE_PATH`
  3. PATH lookup using runtime default command name
  4. GUI shell hydration fallback on macOS when needed
  5. unavailable

#### Installation neutrality

- The app must support executable commands, not installer brands.
- Do not special-case npm versus Homebrew versus user-managed scripts in routing logic.
- If the final resolved command is executable, it is supported.

#### Windows compatibility

- Windows launch normalization must continue routing:
  - `.cmd`
  - `.bat`
  - bare command names
  through `cmd.exe /d /s /c`
- Native executables such as `.exe` should continue to launch directly.
- Detection, one-shot execution, interactive execution, and version probing must all use the same launcher normalization layer.

#### macOS compatibility

- macOS support must account for GUI-launched Electron apps seeing a different PATH than interactive shells.
- When PATH lookup fails in GUI context, the app may hydrate PATH from the login shell before giving up.
- Users must also be able to set an explicit custom command override.

### Persistence and Migration

#### Persisted state

- Persist runtime command overrides.
- Persist learned native suggestion memory.
- Partition learned memory by runtime and CLI fingerprint.
- Chat history remains unchanged; no new structured migration is required for historical slash messages.

#### Old command behavior

- Old app-local bare slash commands are not kept as long-lived aliases.
- After the change:
  - Codex and Claude bare slash commands are runtime-owned
  - API bare slash commands are rejected with explicit guidance
- Help and placeholder text must consistently point users to `/app ...`.

### Rollout Plan

#### Phase 1: command boundary correction

- Add the shared command router.
- Move app-local commands under `/app ...`.
- Route native slash to runtime or explicit API rejection.

#### Phase 2: renderer convergence

- Update placeholders, grouped slash suggestions, and API runtime error feedback.
- Remove UI text that implies old bare app commands still exist.

#### Phase 3: completion provider framework

- Add runtime completion provider registration.
- Ship authoritative `/app ...` completion first.

#### Phase 4: native completion enhancement

- Add Codex metadata-backed completion where public App Server lists exist.
- Add Claude custom command and skill metadata-backed completion.
- Add curated high-frequency suggestions and learned history.

#### Phase 5: launch-profile upgrade

- Add runtime launch profiles, app-level overrides, macOS shell hydration fallback, and richer runtime detection errors.

### Testing

- `npm run typecheck`
- router unit tests
- `AgentHub.sendPrompt()` routing tests
- renderer suggestion-group tests
- completion provider tests
- learned-history persistence tests
- invalid-command immediate-eviction tests
- CLI launch profile tests on:
  - Windows `.cmd`
  - Windows bare command
  - macOS direct executable
  - override priority

Critical behaviors to prove:

- `/app help` routes to app-local handling on every runtime.
- `/help` routes to runtime forwarding on Codex and Claude.
- `/help` is rejected honestly on API runtime.
- Native slash and plain prompt share the same downstream interactive chat path.
- The renderer shows only `/app ...` as app-owned commands.
- Learned native suggestions are added only after explicit successful native command execution.
- Learned native suggestions are deleted immediately after explicit invalid-command failure for the current runtime fingerprint.
- Transport crashes do not delete learned commands.
- New runtimes can register command, completion, and launch behavior without widening `AgentHub` product-level branching.

### Open Questions

- Which exact Codex App Server metadata should back first-slice native completion, and how should parameter-level completion be surfaced in UI?
- Which Claude custom command directories and metadata files should be read first in this repository integration?
- Do future runtimes need richer command capability descriptors than the four-way route result in the first slice?
