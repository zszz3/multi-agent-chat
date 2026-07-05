import { describe, expect, test, vi } from "vitest";
import type { SlashCompletionGroup } from "../../../../shared/types";
import { listSlashCompletionsFromApi } from "./useSlashCommandCompletions";

describe("listSlashCompletionsFromApi", () => {
  test("returns an empty list when the preload API is unavailable", async () => {
    await expect(listSlashCompletionsFromApi({}, "chat-1", "/")).resolves.toEqual([]);
  });

  test("returns an empty list when the preload API rejects", async () => {
    const listSlashCompletions = vi.fn(async () => {
      throw new Error("stale preload");
    });

    await expect(listSlashCompletionsFromApi({ listSlashCompletions }, "chat-1", "/")).resolves.toEqual([]);
    expect(listSlashCompletions).toHaveBeenCalledWith("chat-1", "/");
  });

  test("forwards successful grouped completions", async () => {
    const groups: SlashCompletionGroup[] = [
      {
        id: "app_commands",
        label: "App commands",
        items: [
          {
            id: "app:help",
            label: "/app help",
            insertText: "/app help ",
            description: "Show app-local commands.",
            authoritative: true,
          },
        ],
      },
    ];
    const listSlashCompletions = vi.fn(async () => groups);

    await expect(listSlashCompletionsFromApi({ listSlashCompletions }, "chat-1", "/")).resolves.toBe(groups);
  });
});
