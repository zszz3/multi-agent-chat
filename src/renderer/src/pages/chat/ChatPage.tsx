import { type RefObject } from "react";
import { CircleStop, Plus, Send, Wand2 } from "lucide-react";
import type { AgentChannel, AgentId, AgentRuntime, ChatMessage, ChatSession, ConfiguredAgent } from "../../../../shared/types";
import { agentAccent, agentLabel } from "../../app/agents";
import { shouldSendComposerKey } from "../../app/composer";
import { formatDateTime } from "../../app/format";
import { Markdown } from "../../Markdown";
import { ChatControls } from "./ChatControls";
import { MetaMessage, chatEventDisplayContent } from "./chat-event-display";
import { SlashCommandSuggestions, type SlashCommandSuggestion } from "./chat-utils";

interface ChatPageProps {
  activeChat: ChatSession | undefined;
  activeChatRuntimeId: AgentId;
  activeChatConfiguredAgent: ConfiguredAgent | undefined;
  activeChatConfigTitle: string;
  prompt: string;
  slashCommandSuggestions: SlashCommandSuggestion[];
  slashCommandIndex: number;
  canSend: boolean;
  activeChatLocked: boolean;
  transcriptRef: RefObject<HTMLElement | null>;
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  runtimes: AgentRuntime[];
  workDir: string;
  onTranscriptScroll: () => void;
  onPromptChange: (value: string) => void;
  onSlashCommandIndexChange: (updater: (current: number) => number) => void;
  onCompleteSlashCommand: (command: string) => void;
  onSend: () => Promise<void>;
  onStopActiveChat: () => Promise<void>;
  onSelectConfiguredAgent: (configuredAgentId: string) => void;
  onSelectModel: (modelId: string) => void;
  onChooseWorkDir: () => void | Promise<void>;
}

export function ChatPage({
  activeChat,
  activeChatRuntimeId,
  activeChatConfiguredAgent,
  activeChatConfigTitle,
  prompt,
  slashCommandSuggestions,
  slashCommandIndex,
  canSend,
  activeChatLocked,
  transcriptRef,
  configuredAgents,
  channels,
  runtimes,
  workDir,
  onTranscriptScroll,
  onPromptChange,
  onSlashCommandIndexChange,
  onCompleteSlashCommand,
  onSend,
  onStopActiveChat,
  onSelectConfiguredAgent,
  onSelectModel,
  onChooseWorkDir,
}: ChatPageProps) {
  if (!activeChat) {
    return (
      <div className="empty-state page-empty">
        <Plus size={18} />
        <span>Create a chat to start.</span>
      </div>
    );
  }

  return (
    <>
      <header className="chat-header">
        <div className="chat-title-block">
          <h2>{activeChat.title}</h2>
          <div className="chat-subtitle">
            <span className={`agent-badge mini ${agentAccent(activeChatRuntimeId)}`} title={activeChatConfigTitle}>
              {activeChatConfiguredAgent?.name || agentLabel(activeChatRuntimeId)}
            </span>
            {activeChat.runtimeConversation ? (
              <span className="chat-session-id" title="Runtime conversation linked">
                Conversation linked
              </span>
            ) : (
              <span>No provider conversation yet</span>
            )}
          </div>
        </div>
        <div className="chat-header-actions" />
      </header>

      <section className="cli-transcript" ref={transcriptRef} onScroll={onTranscriptScroll}>
        {activeChat.messages.length === 0 ? (
          <div className="empty-state terminal-empty">
            <Wand2 size={17} />
            <span>Start this {activeChatConfiguredAgent?.name || agentLabel(activeChatRuntimeId)} chat.</span>
          </div>
        ) : (
          activeChat.messages.map((message) => (
            <CliMessage
              key={message.id}
              message={message}
              agentId={activeChatRuntimeId}
              streaming={activeChat.running && message.id === activeChat.pendingAssistantMessageId}
            />
          ))
        )}
        {activeChat.running ? (
          <div className="cli-status-line">
            <span className="stream-pill compact" title="Running" aria-label="Running">
              <span className="stream-spinner" aria-hidden="true" />
            </span>
            <button className="icon-btn cli-status-stop" onClick={() => void onStopActiveChat()} title="Stop" aria-label="Stop response">
              <CircleStop size={14} />
            </button>
          </div>
        ) : null}
      </section>

      <section className="composer">
        <SlashCommandSuggestions
          suggestions={slashCommandSuggestions}
          activeIndex={slashCommandIndex}
          onSelect={(suggestion) => onCompleteSlashCommand(suggestion.command)}
        />
        <div className="composer-box">
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (slashCommandSuggestions.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  onSlashCommandIndexChange((current) => (current + 1) % slashCommandSuggestions.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  onSlashCommandIndexChange((current) => (current - 1 + slashCommandSuggestions.length) % slashCommandSuggestions.length);
                  return;
                }
                if (event.key === "Tab") {
                  event.preventDefault();
                  onCompleteSlashCommand(slashCommandSuggestions[slashCommandIndex]?.command ?? slashCommandSuggestions[0]!.command);
                  return;
                }
              }
              if (shouldSendComposerKey({
                key: event.key,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                isComposing: event.nativeEvent.isComposing,
              })) {
                event.preventDefault();
                void onSend();
              }
            }}
            placeholder={`Message ${activeChatConfiguredAgent?.name || agentLabel(activeChatRuntimeId)} or type /help...`}
            rows={2}
          />
          <div className="composer-footer">
            <ChatControls
              configuredAgentId={activeChat.configuredAgentId}
              modelId={activeChat.modelId}
              configuredAgents={configuredAgents}
              channels={channels}
              locked={activeChatLocked}
              running={activeChat.running}
              workDir={workDir}
              runtimes={runtimes}
              onSelectConfiguredAgent={onSelectConfiguredAgent}
              onSelectModel={onSelectModel}
              onChooseWorkDir={onChooseWorkDir}
            />
            <button className="send-btn" onClick={() => void onSend()} disabled={!canSend}>
              <Send size={14} />
              <span>{activeChat.running ? "Running" : "Send"}</span>
            </button>
          </div>
        </div>
        <div className="composer-hint">
          <kbd>↵</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · <kbd>⌘K</kbd> 命令面板
        </div>
      </section>
    </>
  );
}

function CliMessage({ message, agentId, streaming = false }: { message: ChatMessage; agentId: AgentId; streaming?: boolean }) {
  if (message.role === "user") {
    return (
      <div className="cli-message user">
        <div className="cli-prompt-mark">›</div>
        <div className="cli-agent-line">
          <span>{`You · ${formatDateTime(message.timestamp)}`}</span>
        </div>
        <div className="cli-markdown">
          <Markdown text={message.content} />
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="cli-message assistant">
        <div className="cli-agent-line">
          <span className={`runtime-dot ${agentAccent(agentId)}`} />
          <span>{`${agentLabel(agentId)} · ${formatDateTime(message.timestamp)}`}</span>
        </div>
        {message.events && message.events.length > 0 ? (
          <div className="cli-message-events">
            {message.events.map((event) => (
              <MetaMessage key={event.id} content={chatEventDisplayContent(event)} />
            ))}
          </div>
        ) : null}
        {message.content ? (
          <div className={`cli-markdown ${streaming ? "is-streaming" : ""}`}>
            <Markdown text={message.content} />
            {streaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
          </div>
        ) : streaming ? (
          <div className="cli-markdown is-streaming">
            <span className="stream-cursor" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="cli-message error">
        <div className="cli-agent-line">error</div>
        <pre>{message.content}</pre>
      </div>
    );
  }

  return (
    <div className="cli-message meta">
      <MetaMessage content={message.content} />
    </div>
  );
}
