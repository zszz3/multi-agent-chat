import { useEffect, useState } from "react";
import type { AgentId, SlashCompletionGroup } from "../../../../shared/types";

interface UseSlashCommandCompletionsInput {
  chatId: string | undefined;
  prompt: string;
  runtimeId: AgentId;
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
    void window.multiAgentChat
      .listSlashCompletions(input.chatId, input.prompt)
      .then((next) => {
        if (!cancelled) setGroups(next);
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      });

    return () => {
      cancelled = true;
    };
  }, [input.chatId, input.prompt, input.runtimeId]);

  return groups;
}
