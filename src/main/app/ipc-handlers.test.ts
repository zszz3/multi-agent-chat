import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("main IPC handler registry", () => {
  test("registers every invoke channel exactly once", async () => {
    const sourcePath = fileURLToPath(new URL("./index.ts", import.meta.url));
    const source = await readFile(sourcePath, "utf8");
    const channels = [...source.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map((match) => match[1]!);
    const duplicates = channels.filter((channel, index) => channels.indexOf(channel) !== index);

    expect(duplicates).toEqual([]);
  });
});
