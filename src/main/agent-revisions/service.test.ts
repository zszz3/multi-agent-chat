import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { AgentRevisionRepository } from "./repository";
import { AgentRevisionService } from "./service";

describe("AgentRevisionService", () => {
  test("creates immutable revisions only when composed agent behavior changes", async () => {
    const repository = new AgentRevisionRepository(path.join(await mkdtemp(path.join(os.tmpdir(), "agent-revisions-")), "app.db"));
    const service = new AgentRevisionService(repository);
    const agent = { id: "writer", name: "Writer", description: "", runtimeAgentId: "codex" as const, channelId: "codex-openai", modelId: "default", tags: [], instructions: "Draft", createdAt: 1, updatedAt: 1 };
    const first = await service.saveComposedAgent(agent);
    const unchanged = await service.saveComposedAgent(first.agent);
    const changed = await service.saveComposedAgent({ ...first.agent, instructions: "Review" });
    expect(unchanged.revision.id).toBe(first.revision.id);
    expect(changed.revision.revision).toBe(2);
    expect(await service.list("writer")).toHaveLength(2);
    repository.close();
  });
});
