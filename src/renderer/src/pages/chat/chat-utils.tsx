import type { AgentId, ChatSession } from "../../../../shared/types";

export interface SlashCommandSuggestion {
  command: string;
  description: string;
  agentIds?: AgentId[];
}

const SLASH_COMMANDS: SlashCommandSuggestion[] = [
  { command: "/status", description: "Read Codex app-server config, models, plugins, and MCP status.", agentIds: ["codex"] },
  { command: "/models", description: "List models from Codex app-server.", agentIds: ["codex"] },
  { command: "/plugins", description: "List Codex plugins from all app-server marketplaces.", agentIds: ["codex"] },
  { command: "/help", description: "Show available slash commands." },
];

export function slashCommandSuggestionsFor(value: string, agentId: AgentId): SlashCommandSuggestion[] {
  const input = value.trimStart();
  if (!input.startsWith("/") || input.includes("\n")) return [];
  if (/\s/.test(input)) return [];
  const query = input.toLowerCase();
  return SLASH_COMMANDS.filter((item) => {
    if (item.agentIds && !item.agentIds.includes(agentId)) return false;
    return item.command.toLowerCase().startsWith(query);
  });
}

export function SlashCommandSuggestions({
  suggestions,
  activeIndex,
  onSelect,
}: {
  suggestions: SlashCommandSuggestion[];
  activeIndex: number;
  onSelect: (suggestion: SlashCommandSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="slash-command-menu" role="listbox" aria-label="Slash commands">
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.command}
          type="button"
          className={`slash-command-option ${index === activeIndex ? "is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
          role="option"
          aria-selected={index === activeIndex}
        >
          <span>{suggestion.command}</span>
          <small>{suggestion.description}</small>
        </button>
      ))}
    </div>
  );
}

function hasAgentConversationMessages(messages: ChatSession["messages"]): boolean {
  return messages.some((message) => !message.local);
}

export function chatConfigLocked(chat: ChatSession): boolean {
  return chat.running || Boolean(chat.runtimeConversation) || hasAgentConversationMessages(chat.messages);
}
