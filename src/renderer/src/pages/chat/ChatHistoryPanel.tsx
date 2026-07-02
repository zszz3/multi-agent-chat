import type { MouseEvent } from "react";
import { SquarePen, Trash2 } from "lucide-react";
import { agentAccent, configuredAgentById, configuredAgentRuntimeId, resolveConfiguredAgentChannel } from "../../app/agents";
import { formatTime } from "../../app/format";
import type { AgentChannel, ChatSession, ConfiguredAgent } from "../../../../shared/types";

type MaybePromise = void | Promise<void>;

interface ChatHistoryPanelProps {
  chats: ChatSession[];
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  activeChatId?: string | undefined;
  contextMenu?: { chatId: string; x: number; y: number } | undefined;
  runningLabel?: string;
  idleLabel?: string;
  onSelectChat: (chatId: string) => MaybePromise;
  onOpenContextMenu: (event: MouseEvent, chatId: string) => void;
  onDeleteChat: (chatId: string) => MaybePromise;
}

export function ChatHistoryPanel({
  chats,
  configuredAgents,
  channels,
  activeChatId,
  contextMenu,
  runningLabel = "Running",
  idleLabel = "Idle",
  onSelectChat,
  onOpenContextMenu,
  onDeleteChat,
}: ChatHistoryPanelProps) {
  return (
    <section className="resource-panel chat-list-panel">
      <div className="panel-header">
        <span>Chats</span>
        <SquarePen size={14} />
      </div>
      <div className="chat-list">
        {[...chats].sort((left, right) => right.updatedAt - left.updatedAt).map((chat) => {
          const agent = configuredAgentById(chat.configuredAgentId, configuredAgents);
          const channel = resolveConfiguredAgentChannel(agent, channels);
          const runtimeId = configuredAgentRuntimeId(agent, channel);
          const status = chatRowStatus(chat, {
            running: runningLabel,
            idle: idleLabel,
          });
          return (
            <button
              key={chat.id}
              className={`chat-row ${chat.id === activeChatId ? "is-active" : ""}`}
              onClick={() => void onSelectChat(chat.id)}
              onContextMenu={(event) => onOpenContextMenu(event, chat.id)}
              title={chat.title}
            >
              <span className={`runtime-dot ${agentAccent(runtimeId)} ${chat.running ? "is-pulsing" : ""}`} />
              <strong>{chat.title}</strong>
              <span className={`chat-row-status ${status.className}`} title={status.title}>
                {status.label}
              </span>
            </button>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="agent-context-menu chat-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" className="agent-context-menu-item danger is-stacked" onClick={() => void onDeleteChat(contextMenu.chatId)}>
            <Trash2 size={13} />
            <div>
              <strong>Delete chat</strong>
              <small>Delete session and data</small>
            </div>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function chatRowStatus(
  chat: ChatSession,
  labels: { running: string; idle: string },
): { className: string; label: string; title: string } {
  const time = formatTime(chat.updatedAt);
  if (chat.running) {
    const label = `${labels.running} · ${time}`;
    return {
      className: "is-running",
      label,
      title: label,
    };
  }

  const label = `${labels.idle} · ${time}`;
  return {
    className: "is-idle",
    label,
    title: label,
  };
}
