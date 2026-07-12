import { describe, expect, test } from "vitest";
import type { AgentChannel } from "../../../shared/types";
import { migratePersistedAppState } from "./agent-hub-persisted-migrations";

function persistedState(version: 4 | 5, channels: AgentChannel[]) {
  return {
    version,
    activeChatId: null,
    workDir: "/tmp/project",
    channels,
    sessions: [],
    messages: [],
    events: [],
    tasks: [],
    taskMessages: [],
    taskEvents: [],
    teams: [],
    teamRuns: [],
  };
}

const codexChannel: AgentChannel = {
  id: "codex-custom",
  agentId: "codex",
  label: "Custom Codex",
  models: [{ id: "default", label: "Default" }],
};

describe("persisted app state migrations", () => {
  test("adds defaults for runtimes missing from a V4 configuration exactly once", () => {
    const result = migratePersistedAppState(persistedState(4, [codexChannel]));

    expect(result?.migrated).toBe(true);
    expect(result?.payload.version).toBe(5);
    expect(result?.payload.channels?.map((channel) => channel.agentId)).toEqual([
      "codex",
      "claude",
      "api",
      "hermes",
      "opencode",
      "openclaw",
    ]);
    expect(result?.payload.channels?.[0]).toEqual(codexChannel);
  });

  test("does not recreate deliberately removed runtime configs in V5", () => {
    const result = migratePersistedAppState(persistedState(5, [codexChannel]));

    expect(result).toEqual({ payload: persistedState(5, [codexChannel]), migrated: false });
  });
});
