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
          graph: {
            title: "Release graph",
            objective: "Ship",
            nodes: [
              { id: "start", kind: "start", title: "Start", prompt: "" },
              { id: "build", kind: "agent", title: "Build", prompt: "Build it", position: { x: 20, y: 30 } },
            ],
            edges: [{ id: "start-build", fromNodeId: "start", toNodeId: "build" }],
          },
        },
      ],
      [{ id: "review", sourceType: "official", name: "Review", description: "Review code", prompt: "review", tags: ["code"] }],
    );

    expect(await store.listWorkflows()).toEqual([
      expect.objectContaining({ workflowId: "official-release", graph: expect.objectContaining({ nodes: expect.any(Array), edges: expect.any(Array) }) }),
    ]);
    expect(await store.listSkills()).toEqual([
      expect.objectContaining({ id: "review", sourceType: "official", prompt: "review" }),
    ]);
    store.close();
  });
});
