import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OfficialCatalogStore } from "./official-catalog-store";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("OfficialCatalogStore", () => {
  it("round trips official workflow topology and immutable skills in its own database", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "official-catalog-"));
    dirs.push(dir);
    const store = new OfficialCatalogStore(path.join(dir, "official-catalog.db"));
    await store.rebuild(
      [
        {
          workflowId: "official-release",
          title: "Release",
          objective: "Ship",
          definition: {
            workflowId: "official-release",
            graphVersion: 1,
            objective: "Ship",
            nodes: [{ id: "build", kind: "build", title: "Build", execModel: "llm",
        executionMode: "one-shot", prompt: "Build it", outputFields: [] }],
            edges: [],
          },
        },
      ],
      [{ id: "review", sourceType: "official", name: "Review", description: "Review code", prompt: "review", tags: ["code"], categoryId: "coding" }],
    );

    expect(await store.listWorkflows()).toEqual([
      expect.objectContaining({ workflowId: "official-release", definition: expect.objectContaining({ nodes: expect.any(Array), edges: expect.any(Array) }) }),
    ]);
    expect(await store.listSkills()).toEqual([
      expect.objectContaining({ id: "review", sourceType: "official", prompt: "review", categoryId: "coding" }),
    ]);
    store.close();
  });
});
