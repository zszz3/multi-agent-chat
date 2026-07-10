import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UserSkillStore } from "./user-skill-store";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("UserSkillStore", () => {
  it("stores, replaces, and deletes user skills in app.db", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "user-skills-"));
    dirs.push(dir);
    const store = new UserSkillStore(path.join(dir, "app.db"));
    await store.upsert({ id: "review", sourceType: "user", name: "Review", description: "One", prompt: "first", tags: ["code"] });
    await store.upsert({ id: "review", sourceType: "user", name: "Review", description: "Two", prompt: "second", tags: ["code"] });
    expect(await store.list()).toEqual([expect.objectContaining({ id: "review", sourceType: "user", prompt: "second" })]);
    expect(await store.delete("review")).toBe(true);
    expect(await store.list()).toEqual([]);
    store.close();
  });
});
