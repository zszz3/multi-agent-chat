import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { SkillCategoryStore } from "./skill-category-store";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("SkillCategoryStore", () => {
  test("seeds system categories and persists custom skill assignments", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skill-categories-"));
    dirs.push(dir);
    const dbPath = path.join(dir, "app.db");
    const store = new SkillCategoryStore(dbPath);

    expect((await store.list()).map((category) => category.id)).toEqual([
      "explore",
      "coding",
      "writing",
      "productivity",
      "life",
    ]);

    const custom = await store.create("Research");
    await store.assign({ sourceType: "official", skillId: "brainstorming", categoryId: custom.id });
    expect(await store.applyAssignments([
      { id: "brainstorming", name: "Brainstorming", description: "", prompt: "", tags: [], sourceType: "official", categoryId: "explore" },
    ], "official")).toEqual([
      expect.objectContaining({ id: "brainstorming", categoryId: custom.id }),
    ]);
    store.close();

    const reopened = new SkillCategoryStore(dbPath);
    expect((await reopened.list()).at(-1)).toMatchObject({ id: custom.id, name: "Research", system: false });
    expect(await reopened.applyAssignments([
      { id: "brainstorming", name: "Brainstorming", description: "", prompt: "", tags: [], sourceType: "official", categoryId: "explore" },
    ], "official")).toEqual([
      expect.objectContaining({ categoryId: custom.id }),
    ]);
    reopened.close();
  });

  test("rejects empty and duplicate category names", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skill-categories-"));
    dirs.push(dir);
    const store = new SkillCategoryStore(path.join(dir, "app.db"));

    await expect(store.create(" ")).rejects.toThrow("Category name is required");
    await store.create("Research");
    await expect(store.create("research")).rejects.toThrow("already exists");
    store.close();
  });
});
