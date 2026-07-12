import { describe, expect, test } from "vitest";
import type { ConfiguredAgent } from "./types";
import { agentBehaviorConfig, configuredAgentType, createAgentRevision, createExecutionAgentRevision, stableConfigHash } from "./agent-revisions";

function agent(overrides: Partial<ConfiguredAgent> = {}): ConfiguredAgent {
  return {
    id: "reviewer",
    agentType: "composed",
    name: "Reviewer",
    description: "Reviews code",
    instructions: "Review correctness.",
    baseAgentId: "default-agent",
    runtimeAgentId: "codex",
    channelId: "codex-openai",
    modelId: "gpt-5.6",
    tags: ["code"],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("agent revisions", () => {
  test("infers legacy managed agents as execution agents", () => {
    const managed = agent({ managed: true });
    const user = agent();
    delete managed.agentType;
    delete user.agentType;
    expect(configuredAgentType(managed)).toBe("execution");
    expect(configuredAgentType(user)).toBe("composed");
  });

  test("ignores display-only changes in the behavior hash", () => {
    const original = stableConfigHash(agentBehaviorConfig(agent()));
    const renamed = stableConfigHash(agentBehaviorConfig(agent({ name: "Renamed", description: "New", tags: ["new"] })));
    expect(renamed).toBe(original);
  });

  test("changes the behavior hash for instructions or execution config", () => {
    const original = stableConfigHash(agentBehaviorConfig(agent()));
    expect(stableConfigHash(agentBehaviorConfig(agent({ instructions: "Review security." })))).not.toBe(original);
    expect(stableConfigHash(agentBehaviorConfig(agent({ modelId: "gpt-5.6-mini" })))).not.toBe(original);
  });

  test("creates an immutable revision identity", () => {
    expect(createAgentRevision(agent(), 3, 42)).toMatchObject({
      id: expect.stringMatching(/^reviewer:v3:/),
      agentId: "reviewer",
      agentType: "composed",
      revision: 3,
      baseAgentId: "default-agent",
      instructions: "Review correctness.",
      createdAt: 42,
    });
  });

  test("versions execution agents when the channel behavior changes", () => {
    const execution = agent({ agentType: "execution", managed: true, instructions: "" });
    delete execution.baseAgentId;
    const channel = { id: "codex-openai", agentId: "codex" as const, label: "OpenAI", models: [{ id: "gpt-5.6", label: "GPT-5.6" }] };
    const original = createExecutionAgentRevision(execution, channel, 1, 1);
    const changed = createExecutionAgentRevision(execution, { ...channel, baseUrl: "https://example.test" }, 2, 2);
    expect(changed.configHash).not.toBe(original.configHash);
  });
});
