import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OfficialCatalogStore } from "./official-catalog-store";

const require = createRequire(import.meta.url);

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

  it("rebuilds legacy workflow template tables into the Workflow V2 catalog schema", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "official-catalog-legacy-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "official-catalog.db");
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void } };
    const legacyDb = new DatabaseSync(dbPath);
    legacyDb.exec(`
      create table workflow_templates (id text primary key, title text not null, objective text not null, graph_title text not null, graph_objective text not null, sequence integer not null);
      create table workflow_template_nodes (template_id text not null, node_id text not null, primary key (template_id, node_id));
      create table workflow_template_edges (template_id text not null, edge_id text not null, primary key (template_id, edge_id));
    `);
    legacyDb.close();

    const store = new OfficialCatalogStore(dbPath);
    await store.rebuild([{
      workflowId: "official-v2",
      title: "Official V2",
      objective: "Load V2",
      definition: {
        workflowId: "official-v2",
        graphVersion: 1,
        objective: "Load V2",
        nodes: [{ id: "answer", kind: "answer", title: "Answer", execModel: "llm", executionMode: "one-shot", prompt: "Answer.", outputFields: [{ key: "answer_markdown", required: true }] }],
        edges: [],
      },
    }], []);

    expect(await store.listWorkflows()).toEqual([
      expect.objectContaining({ workflowId: "official-v2", definition: expect.objectContaining({ graphVersion: 1 }) }),
    ]);
    store.close();
  });
});
