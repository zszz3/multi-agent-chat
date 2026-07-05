import { useEffect, useState } from "react";
import type { AgentId, SlashCompletionGroup } from "../../../../shared/types";

interface UseSlashCommandCompletionsInput {
  chatId: string | undefined;
  prompt: string;
  runtimeId: AgentId;
}

export async function listSlashCompletionsFromApi(
  api: {
    listSlashCompletions?: (chatId: string, input: string) => Promise<SlashCompletionGroup[]>;
  },
  chatId: string,
  input: string,
): Promise<SlashCompletionGroup[]> {
  if (typeof api.listSlashCompletions !== "function") return [];
  try {
    return await api.listSlashCompletions(chatId, input);
  } catch {
    return [];
  }
}

export function useSlashCommandCompletions(input: UseSlashCommandCompletionsInput): SlashCompletionGroup[] {
  const [groups, setGroups] = useState<SlashCompletionGroup[]>([]);

  useEffect(() => {
    const trimmed = input.prompt.trimStart();
    if (!input.chatId || !trimmed.startsWith("/") || trimmed.includes("\n") || /\s/.test(trimmed)) {
      setGroups([]);
      return;
    }

    let cancelled = false;
    void listSlashCompletionsFromApi(window.multiAgentChat, input.chatId, input.prompt)
      .then((next) => {
        if (!cancelled) setGroups(next);
      });

    return () => {
      cancelled = true;
    };
  }, [input.chatId, input.prompt, input.runtimeId]);

  return groups;
}
