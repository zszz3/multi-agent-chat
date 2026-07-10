# Windows Phase 02: CLI, Process, And Filesystem Platform Layer

## 2026-07-10

### Status

In progress. The first executable-discovery slice was implemented on 2026-07-10. Process-tree control, filesystem hardening, full `PlatformServices` composition, and Windows-hosted validation remain pending.

## Goal

Provide one reliable Windows platform layer for executable discovery, structured CLI invocation, cancellation, process-tree cleanup, and filesystem authorization. Runtime drivers consume this layer without introducing Windows branches in `AgentHub`, Chat, Task, or Workflow.

## Implementation Progress

Completed:

- introduced the independently testable `ExecutableResolver` and `ExecutableLocator` contracts;
- added an ordered locator chain for explicit paths, Windows `where.exe`, the user npm shim under `%APPDATA%`, and the existing non-Windows command fallback;
- represented resolved executable path, discovery source, and executable kind as structured data;
- routed Runtime version detection through the locator before invocation;
- kept `detectAgentRuntimes(...)` backward compatible while allowing locator and launcher injection in tests and future platform composition;
- preserved constructor and environment executable overrides when `AgentHub.refreshAgents()` reruns detection;
- added host-independent tests for Windows path normalization, `where.exe` results, npm-shim fallback, and non-Windows behavior;
- verified Codex, Hermes, OpenCode, and OpenClaw detection with injected executable resolution.

Pending:

- compose the locator, process launcher, process-tree controller, path policy, and Phase 01 resource locator behind `createPlatformServices(...)`;
- preserve environment overrides as a separately classified `environment` resolution source instead of only preselecting them in `resolveRuntimeExecutables(...)`;
- add bounded locator caching, ambiguity handling, and classified remediation for unresolved executables;
- replace the remaining hand-written Windows command quoting with the selected mature spawn adapter and complete metacharacter/Unicode fixtures;
- implement process-tree cancellation and forced cleanup for Windows and POSIX;
- harden local-file containment and skill-junction ownership;
- add configuration file-picking and actionable detection states;
- run the integration suite from the Phase 01 installed artifact on Windows.

## Target Files

Modify:

- `src/main/platform/cli-launcher.ts`
- `src/main/platform/cli-launcher.test.ts`
- `src/main/platform/local-file-preview.ts`
- `src/main/platform/local-file-preview.test.ts`
- `src/main/agents/runtime/detect.ts`
- `src/main/agents/runtime/detect.test.ts`
- `src/main/hub/agent-hub.ts`
- `src/main/skills/skill-installer.ts`
- relevant Runtime runners only to consume the shared process API

Add:

- `src/main/platform/platform-services.ts`
- `src/main/platform/platform-services.test.ts`
- `src/main/platform/cli-locator.ts`
- `src/main/platform/cli-locator.test.ts`
- `src/main/platform/executable-resolver.ts`
- `src/main/platform/process-tree.ts`
- `src/main/platform/process-tree.test.ts`
- `src/main/platform/platform-paths.ts`
- `src/main/platform/platform-paths.test.ts`

## Step 1: Define The PlatformServices Composition Boundary

Create the small service contracts before implementing Windows behavior:

```ts
interface PlatformServices {
  executableLocator: ExecutableLocator;
  processLauncher: ProcessLauncher;
  processTreeController: ProcessTreeController;
  pathPolicy: PlatformPathPolicy;
  resourceLocator: AppResourceLocator;
}
```

Add `createPlatformServices(platform, dependencies)` as the only platform strategy selector. Construct it once in Main-process bootstrap and inject it into Runtime infrastructure.

Rules:

- do not introduce a large `WindowsPlatformService` with unrelated methods;
- each field is independently mockable and testable;
- consumers must not call `process.platform` after receiving a platform service;
- macOS and Linux adapters preserve current behavior rather than sharing Windows assumptions;
- resource lookup uses the Phase 01 `AppResourceLocator`;
- Phase 03 builds `PackagedSidecarLauncher` on top of these services instead of adding it to Workflow business logic.

The platform-services contract test must construct `win32`, `darwin`, and `linux` service sets from injected values and prove selection does not depend on the host running the test.

## Step 2: Separate Discovery From Invocation

Create a CLI locator that returns a structured result:

```ts
interface ResolvedExecutable {
  requested: string;
  resolvedPath: string;
  source: "explicit" | "environment" | "path" | "known-location";
  kind: "exe" | "cmd" | "bat" | "script";
}
```

Executable discovery is an ordered provider chain:

```ts
interface ExecutableResolver {
  resolve(request: ExecutableResolutionRequest): Promise<ResolvedExecutable | undefined>;
}
```

The default locator composes explicit-path, environment, PATH, and approved-known-location resolvers. A future package manager or Runtime adds one resolver without editing the resolution algorithm.

Resolution order:

1. application/user configured absolute executable;
2. Runtime-specific environment override such as `CODEX_PATH`;
3. inherited PATH using `where.exe` and PATHEXT;
4. approved user-local package-manager locations discovered from `%APPDATA%`, `%LOCALAPPDATA%`, or tool-specific official locations;
5. unresolved result with classified remediation.

Rules:

- never rewrite machine or user PATH;
- never scan the whole drive;
- never choose between multiple matches silently when versions differ materially;
- return the resolved path in connection diagnostics, but never dump the entire environment;
- cache only for a bounded period and invalidate on explicit refresh.

## Step 3: Replace Hand-Written Shell Quoting

The current `cmd.exe` command-string builder needs stronger proof. Prefer a mature spawn adapter such as `cross-spawn` for `.cmd` and `.bat` handling instead of expanding the custom quoting algorithm.

Required invocation API:

```ts
interface PlatformSpawnRequest {
  executable: ResolvedExecutable | string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  windowsHide?: boolean;
  signal?: AbortSignal;
}
```

Security rules:

- arguments remain an array until the platform adapter;
- prompts, model ids, work directories, and headers never enter a raw shell template;
- ordinary `.exe` files run without a shell;
- `.cmd`/`.bat` shims use the adapter's tested escape rules;
- `shell: true`, PowerShell strings, and `cmd /c` strings are prohibited outside the platform adapter;
- inherited environment is filtered only when a Runtime requires it; secrets are never logged.

Add tests for:

- spaces and trailing backslashes;
- double quotes;
- `%`, `!`, `^`, `&`, `|`, `<`, `>`, and parentheses;
- CRLF output;
- non-ASCII executable, argument, cwd, and profile paths;
- `.exe`, `.cmd`, `.bat`, and bare command names;
- missing `%COMSPEC%` fallback.

## Step 4: Add Process-Tree Lifecycle Management

Create `process-tree.ts` with an explicit two-stage termination contract:

1. ask the Runtime protocol to cancel when supported;
2. wait a bounded grace period;
3. terminate the operating-system process tree;
4. wait a second bounded period;
5. force termination if still alive;
6. close streams and resolve exactly once.

On Windows, a signal sent to the `cmd.exe` wrapper is insufficient. Use a proven tree-termination mechanism. The implementation may use Windows Job Objects through a maintained dependency or a carefully wrapped `taskkill.exe /PID <pid> /T` fallback. Do not assemble the PID from untrusted text.

Expose a platform-neutral `ProcessTreeController` and provide separate Windows and POSIX strategies. Runtime code calls the interface; it must not know whether cleanup uses Job Objects, `taskkill`, process groups, or signals.

The API must distinguish:

- user cancellation;
- timeout;
- application shutdown;
- child process exit;
- forced termination failure.

Update these callers to use the shared lifecycle rather than direct `.kill(...)`:

- ACP interactive client;
- Codex RPC client;
- Hermes, OpenCode, and OpenClaw runners;
- generic channel-test CLI helper.

Add fake process-tree tests and a Windows integration fixture that spawns a parent plus child and proves both disappear.

## Step 5: Normalize Output And Error Handling

- normalize CRLF to logical lines without mutating JSON string contents;
- keep byte-buffer limits for exec-style calls;
- stream long-running output;
- classify `ENOENT`, access denied, timeout, invalid cwd, command failure, and forced termination separately;
- include Runtime id, executable basename, and run/request id in diagnostics;
- omit prompt bodies, API keys, tokens, and full environments.

If an upstream CLI can emit a legacy Windows code page, configure its documented UTF-8 mode where possible. Do not guess-decode arbitrary bytes silently; report a classified encoding failure with remediation.

## Step 6: Harden Windows Paths

Create pure helpers for:

- `~/` and `~\` expansion;
- drive-letter normalization;
- UNC paths;
- case-insensitive comparisons where appropriate;
- packaged resource paths versus mutable user-data paths.

Update local-file containment checks:

1. resolve the allowed root;
2. resolve the requested path;
3. use `realpath` for existing paths so junctions cannot escape the root;
4. compare with Windows path semantics;
5. reject cross-drive relative results and device paths unless explicitly supported.

Test:

- `C:\repo` and `c:\repo`;
- `C:\repo with spaces`;
- Unicode directory names;
- `..` escape;
- junction escape;
- UNC root;
- a different drive;
- `~\Documents`.

## Step 7: Verify Skill Junction Ownership

The existing installer uses Windows directory junctions. Add Windows tests proving:

- a managed junction is recognized and replaced safely;
- a real user directory is never overwritten;
- a junction pointing to another target is never removed;
- uninstall removes only the owned junction;
- source and target paths with spaces work;
- no Developer Mode or administrator privilege is required.

If Node reports junction metadata differently from symbolic links, update ownership checks through one platform helper rather than weakening the safety rule.

## Step 8: Integrate Detection And Configuration UX

Runtime detection consumes `ResolvedExecutable` and reports classified states:

- available;
- not installed;
- installed but not discoverable;
- unsupported on Windows;
- execution denied;
- version command failed.

These are dynamic availability reasons. They must not replace the static Runtime platform-support declaration introduced in Phase 04.

Provide a file-picker route for selecting an executable manually. Persist only the selected path; do not copy third-party executables into application storage.

## Automated Validation

```powershell
npm run typecheck
npx vitest run src/main/platform src/main/agents/runtime/detect.test.ts
npm test
```

Windows integration tests must run on `windows-latest` and include a `.cmd` fixture plus a parent/child process-tree fixture.

## Exit Criteria

- executable discovery works from Explorer-launched installed app state;
- `.exe`, `.cmd`, and `.bat` invocation passes metacharacter and Unicode tests;
- no Runtime runner directly performs Windows shell quoting;
- cancellation and app shutdown leave no owned child process tree;
- file authorization resists junction and traversal escape;
- skill junction install/uninstall works without elevated privileges;
- errors are classified and actionable;
- all platform strategy selection occurs through `createPlatformServices(...)`;
- adding a test-only platform strategy requires no changes to `AgentHub`, Chat, Task, Workflow, or Runtime protocol implementations;
- existing macOS Runtime tests stay green.

## Handoff

Phase 03 uses platform resource and process APIs to launch MCP. Phase 04 certifies every Runtime through the same locator and lifecycle rather than adding Runtime-local Windows process code.
