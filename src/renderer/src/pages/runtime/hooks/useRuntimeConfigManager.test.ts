import type { MultiAgentChatApi } from "../../../../../preload";
import { missingAppCapabilityMessage } from "../../../app/shell";
import type { AppSnapshot, RuntimeCommandConfig } from "../../../../../shared/types";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  codexRuntimeAvailability,
  runtimeCommandArgsFromText,
  seedRuntimeCommandConfigs,
  upsertRuntimeCommandConfig,
} from "./useRuntimeConfigManager";

function sameDeps(next: unknown[] | undefined, previous: unknown[] | undefined): boolean {
  if (!next || !previous || next.length !== previous.length) return false;
  return next.every((value, index) => Object.is(value, previous[index]));
}

function createWindowMock(): Window {
  const storage = new Map<string, string>();
  return {
    clearInterval,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() {
        return storage.size;
      },
    },
    setInterval,
  } as unknown as Window;
}

function createHookRuntime() {
  const states: Array<{ value: unknown; setValue: (value: unknown | ((current: unknown) => unknown)) => void }> = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{ deps: unknown[] | undefined; value: unknown }> = [];
  const effects: Array<{
    deps: unknown[] | undefined;
    nextDeps: unknown[] | undefined;
    create: (() => void | (() => void)) | undefined;
    cleanup: (() => void) | undefined;
    scheduled: boolean;
  }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let callbackIndex = 0;
  let effectIndex = 0;
  let dirty = false;

  const reactModule = {
    useState<T>(initial: T | (() => T)): [T, (value: T | ((current: T) => T)) => void] {
      const index = stateIndex++;
      if (!states[index]) {
        states[index] = {
          value: typeof initial === "function" ? (initial as () => T)() : initial,
          setValue: (value) => {
            const nextValue = typeof value === "function" ? (value as (current: T) => T)(states[index]!.value as T) : value;
            if (Object.is(nextValue, states[index]!.value)) return;
            states[index]!.value = nextValue;
            dirty = true;
          },
        };
      }
      return [states[index]!.value as T, states[index]!.setValue as (value: T | ((current: T) => T)) => void];
    },
    useRef<T>(initial: T): { current: T } {
      const index = refIndex++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index] as { current: T };
    },
    useCallback<T>(value: T, deps: unknown[] | undefined): T {
      const index = callbackIndex++;
      const current = callbacks[index];
      if (!current || !sameDeps(deps, current.deps)) {
        callbacks[index] = { deps, value };
      }
      return callbacks[index]!.value as T;
    },
    useEffect(create: () => void | (() => void), deps?: unknown[]): void {
      const index = effectIndex++;
      const current = effects[index];
      if (!current) {
        effects[index] = {
          deps: undefined,
          nextDeps: deps,
          create,
          cleanup: undefined,
          scheduled: true,
        };
        return;
      }
      current.create = create;
      current.nextDeps = deps;
      current.scheduled = deps === undefined || !sameDeps(deps, current.deps);
    },
  };

  function flushEffects(): void {
    for (const effect of effects) {
      if (!effect?.scheduled || !effect.create) continue;
      effect.cleanup?.();
      const cleanup = effect.create();
      effect.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      effect.deps = effect.nextDeps;
      effect.scheduled = false;
    }
  }

  function run<TResult>(factory: () => TResult): TResult {
    let current: TResult;
    do {
      dirty = false;
      stateIndex = 0;
      refIndex = 0;
      callbackIndex = 0;
      effectIndex = 0;
      current = factory();
      flushEffects();
    } while (dirty);
    return current;
  }

  function dispose(): void {
    for (const effect of effects) effect?.cleanup?.();
  }

  return { reactModule, run, dispose };
}

function makeSnapshot(overrides: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    detectedAt: 0,
    activeChatId: undefined,
    activeTaskId: undefined,
    activeTeamId: undefined,
    activeTeamRunId: undefined,
    workDir: "C:\\repo",
    runtimes: [],
    runtimeCommandConfigs: [],
    channels: [],
    configuredAgents: [],
    chats: [],
    tasks: [],
    teams: [],
    teamRuns: [],
    workflowStore: {} as AppSnapshot["workflowStore"],
    scheduledWorkflowStore: {} as AppSnapshot["scheduledWorkflowStore"],
    workflowDraft: undefined,
    artifacts: [],
    ...overrides,
  };
}

async function createRuntimeConfigManagerHarness(options: {
  snapshot: AppSnapshot;
  chatApi?: Partial<MultiAgentChatApi>;
}) {
  vi.resetModules();
  const hookRuntime = createHookRuntime();
  vi.doMock("react", () => hookRuntime.reactModule);
  (globalThis as { window?: Window }).window = createWindowMock();

  const snapshotHolder = { current: options.snapshot };
  const setSnapshot = vi.fn((next: AppSnapshot) => {
    snapshotHolder.current = next;
  });
  const chatApi = {
    onAgentTestEvent: () => () => undefined,
    saveModelChannels: vi.fn(async (channels) => ({ ...snapshotHolder.current, channels })),
    listCodexPlugins: vi.fn(async () => []),
    queryRuntimeChannelBalance: vi.fn(async () => ({
      channelId: "unused",
      supported: false,
      status: "unsupported" as const,
      message: "unused",
      items: [],
      queriedAt: 0,
    })),
    ...options.chatApi,
  } as unknown as MultiAgentChatApi;

  const module = await import("./useRuntimeConfigManager");
  let current = hookRuntime.run(() =>
    module.useRuntimeConfigManager({
      chatApi,
      snapshot: snapshotHolder.current,
      setSnapshot,
      runtimeViewActive: false,
    }),
  );

  return {
    chatApi,
    module,
    setSnapshot,
    get current() {
      return current;
    },
    rerender() {
      current = hookRuntime.run(() =>
        module.useRuntimeConfigManager({
          chatApi,
          snapshot: snapshotHolder.current,
          setSnapshot,
          runtimeViewActive: false,
        }),
      );
      return current;
    },
    async act(action: () => void | Promise<void>) {
      await action();
      return this.rerender();
    },
    dispose() {
      hookRuntime.dispose();
      vi.doUnmock("react");
      delete (globalThis as { window?: Window }).window;
    },
  };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("react");
  delete (globalThis as { window?: Window }).window;
});

describe("codexRuntimeAvailability", () => {
  test("returns undetected before runtime probing completes", () => {
    expect(codexRuntimeAvailability([])).toEqual({
      detected: false,
      available: false,
      message: "",
    });
  });

  test("returns a friendly unavailable message when Codex CLI detection fails", () => {
    expect(
      codexRuntimeAvailability([
        {
          id: "codex",
          label: "Codex",
          command: "codex",
          version: null,
          available: false,
          error: "spawn codex ENOENT",
        },
      ]),
    ).toEqual({
      detected: true,
      available: false,
      message: "Codex CLI unavailable: spawn codex ENOENT",
    });
  });
});

describe("runtime command config helpers", () => {
  test("preserves unquoted Windows path args", () => {
    expect(runtimeCommandArgsFromText("--config C:\\tmp\\team-a")).toEqual(["--config", "C:\\tmp\\team-a"]);
  });

  test("preserves quoted Windows path args with spaces", () => {
    expect(runtimeCommandArgsFromText('--config "C:\\Program Files\\Codex"')).toEqual(["--config", "C:\\Program Files\\Codex"]);
  });

  test("preserves quoted args with spaces", () => {
    expect(runtimeCommandArgsFromText('--profile "team space" --sandbox workspace-write')).toEqual([
      "--profile",
      "team space",
      "--sandbox",
      "workspace-write",
    ]);
  });

  test("seed runtime executor drafts from snapshot configs and update them per runtime", () => {
    const snapshotConfigs: RuntimeCommandConfig[] = [
      {
        runtimeId: "claude",
        override: {
          executable: "/custom/bin/claude",
          fixedArgs: ["--dangerously-skip-permissions"],
        },
      },
    ];

    const seeded = seedRuntimeCommandConfigs(snapshotConfigs);
    const next = upsertRuntimeCommandConfig(seeded, "codex", () => ({
      runtimeId: "codex",
      override: {
        executable: "/custom/bin/codex",
        fixedArgs: runtimeCommandArgsFromText('--profile "team space" --sandbox workspace-write'),
      },
    }));

    expect(seeded).toEqual(snapshotConfigs);
    expect(seeded).not.toBe(snapshotConfigs);
    expect(next).toEqual([
      {
        runtimeId: "claude",
        override: {
          executable: "/custom/bin/claude",
          fixedArgs: ["--dangerously-skip-permissions"],
        },
      },
      {
        runtimeId: "codex",
        override: {
          executable: "/custom/bin/codex",
          fixedArgs: ["--profile", "team space", "--sandbox", "workspace-write"],
        },
      },
    ]);
  });
});

describe("useRuntimeConfigManager runtime command saves", () => {
  test("keeps incomplete quoted fixed-args text visible while editing", async () => {
    const saveRuntimeCommandConfigs = vi.fn();
    const harness = await createRuntimeConfigManagerHarness({
      snapshot: makeSnapshot({
        runtimes: [
          {
            id: "codex",
            label: "Codex",
            command: "codex",
            version: "0.1.0",
            available: true,
          },
        ],
      }),
      chatApi: { saveRuntimeCommandConfigs },
    });

    await harness.act(() => {
      harness.current.updateRuntimeCommandArgs("codex", '--profile "team red');
    });
    await harness.act(() => harness.current.saveRuntimeCommandConfigs());

    expect(harness.current.runtimeCommandArgsDrafts.codex).toBe('--profile "team red');
    expect(saveRuntimeCommandConfigs).not.toHaveBeenCalled();
    expect(harness.current.configStatus).toBe("Complete the fixed args input before saving for Codex.");
    expect(harness.current.runtimeCommandConfigs).toEqual([
      {
        runtimeId: "codex",
        override: {
          executable: "",
          fixedArgs: ["--profile", "team red"],
        },
      },
    ]);
    expect(harness.current.runtimeCommandConfigDirty).toBe(true);

    harness.dispose();
  });

  test("keeps Windows path fixed-args text unchanged while editing", async () => {
    const harness = await createRuntimeConfigManagerHarness({
      snapshot: makeSnapshot({
        runtimes: [
          {
            id: "codex",
            label: "Codex",
            command: "codex",
            version: "0.1.0",
            available: true,
          },
        ],
      }),
      chatApi: {},
    });

    await harness.act(() => {
      harness.current.updateRuntimeCommandArgs("codex", '--config C:\\Program Files\\Codex');
    });

    expect(harness.current.runtimeCommandArgsDrafts.codex).toBe('--config C:\\Program Files\\Codex');
    expect(harness.current.runtimeCommandConfigs).toEqual([
      {
        runtimeId: "codex",
        override: {
          executable: "",
          fixedArgs: ["--config", "C:\\Program", "Files\\Codex"],
        },
      },
    ]);

    harness.dispose();
  });

  test("keeps args-only drafts local and reports that executable is required before saving fixed args", async () => {
    const saveRuntimeCommandConfigs = vi.fn();
    const harness = await createRuntimeConfigManagerHarness({
      snapshot: makeSnapshot({
        runtimes: [
          {
            id: "codex",
            label: "Codex",
            command: "codex",
            version: "0.1.0",
            available: true,
          },
        ],
      }),
      chatApi: { saveRuntimeCommandConfigs },
    });

    await harness.act(() => {
      harness.current.updateRuntimeCommandArgs("codex", '--profile "team red"');
    });
    await harness.act(() => harness.current.saveRuntimeCommandConfigs());

    expect(saveRuntimeCommandConfigs).not.toHaveBeenCalled();
    expect(harness.current.configStatus).toBe("Provide an executable before saving fixed args for Codex.");
    expect(harness.current.runtimeCommandConfigDirty).toBe(true);
    expect(harness.current.runtimeCommandConfigs).toEqual([
      {
        runtimeId: "codex",
        override: {
          executable: "",
          fixedArgs: ["--profile", "team red"],
        },
      },
    ]);

    harness.dispose();
  });

  test("successful save clears dirty executor drafts and syncs the saved snapshot state", async () => {
    const nextSnapshot = makeSnapshot({
      runtimes: [
        {
          id: "codex",
          label: "Codex",
          command: "/custom/bin/codex",
          fixedArgs: ["--profile", "team blue"],
          version: "0.2.0",
          available: true,
          source: "app_override",
        },
      ],
      runtimeCommandConfigs: [
        {
          runtimeId: "codex",
          override: {
            executable: "/custom/bin/codex",
            fixedArgs: ["--profile", "team blue"],
          },
        },
      ],
    });
    const saveRuntimeCommandConfigs = vi.fn(async () => nextSnapshot);
    const harness = await createRuntimeConfigManagerHarness({
      snapshot: makeSnapshot({
        runtimes: [
          {
            id: "codex",
            label: "Codex",
            command: "codex",
            version: "0.1.0",
            available: true,
          },
        ],
      }),
      chatApi: { saveRuntimeCommandConfigs },
    });

    await harness.act(() => {
      harness.current.updateRuntimeCommandConfig("codex", () => ({
        runtimeId: "codex",
        override: {
          executable: "/custom/bin/codex",
          fixedArgs: ["--profile", "team blue"],
        },
      }));
    });
    await harness.act(() => harness.current.saveRuntimeCommandConfigs());

    expect(saveRuntimeCommandConfigs).toHaveBeenCalledWith([
      {
        runtimeId: "codex",
        override: {
          executable: "/custom/bin/codex",
          fixedArgs: ["--profile", "team blue"],
        },
      },
    ]);
    expect(harness.setSnapshot).toHaveBeenCalledWith(nextSnapshot);
    expect(harness.current.runtimeCommandConfigDirty).toBe(false);
    expect(harness.current.runtimeCommandConfigs).toEqual(nextSnapshot.runtimeCommandConfigs);
    expect(harness.current.configStatus).toBe("Executor settings saved");

    harness.dispose();
  });

  test("reports the restart-needed fallback when preload save support is unavailable", async () => {
    const harness = await createRuntimeConfigManagerHarness({
      snapshot: makeSnapshot({
        runtimes: [
          {
            id: "codex",
            label: "Codex",
            command: "codex",
            version: "0.1.0",
            available: true,
          },
        ],
      }),
      chatApi: {},
    });

    await harness.act(() => {
      harness.current.updateRuntimeCommandConfig("codex", () => ({
        runtimeId: "codex",
        override: {
          executable: "/custom/bin/codex",
        },
      }));
    });
    await harness.act(() => harness.current.saveRuntimeCommandConfigs());

    expect(harness.current.configStatus).toBe(missingAppCapabilityMessage("Save executor settings"));
    expect(harness.current.runtimeCommandConfigDirty).toBe(true);

    harness.dispose();
  });
});
