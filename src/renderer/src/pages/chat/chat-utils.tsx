import type { AgentId, ChatSession, SlashCompletionGroup, SlashCompletionItem } from "../../../../shared/types";

export function chatPlaceholder(agentId: AgentId, label: string): string {
  if (agentId === "api") return `Message ${label} or type /app help...`;
  return `Message ${label}, use a native slash command, or type /app help...`;
}

export function slashCommandSuggestionsFor(): SlashCompletionItem[] {
  return [];
}

export function flattenSlashCompletionItems(groups: SlashCompletionGroup[]): SlashCompletionItem[] {
  return groups.flatMap((group) => group.items);
}

export function SlashCommandSuggestions({
  groups,
  activeIndex,
  onSelect,
}: {
  groups: SlashCompletionGroup[];
  activeIndex: number;
  onSelect: (suggestion: SlashCompletionItem) => void;
}) {
  const items = flattenSlashCompletionItems(groups);
  if (items.length === 0) return null;
  let offset = 0;
  return (
    <div className="slash-command-menu" role="listbox" aria-label="Slash commands">
      {groups.map((group) => {
        const start = offset;
        offset += group.items.length;
        return (
          <div key={group.id} className="slash-command-group">
            <div className="slash-command-group-label">{group.label}</div>
            {group.items.map((item, index) => {
              const flatIndex = start + index;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`slash-command-option ${flatIndex === activeIndex ? "is-active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(item)}
                  role="option"
                  aria-selected={flatIndex === activeIndex}
                >
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function hasAgentConversationMessages(messages: ChatSession["messages"]): boolean {
  return messages.some((message) => !message.local);
}

export function chatConfigLocked(chat: ChatSession): boolean {
  return chat.running || Boolean(chat.sessionId) || hasAgentConversationMessages(chat.messages);
}
