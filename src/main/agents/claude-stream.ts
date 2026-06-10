import type { AgentEvent } from "../../shared/types";

export interface ClaudeStreamState {
  lastText: string;
}

export function createClaudeStreamState(): ClaudeStreamState {
  return {
    lastText: "",
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as Record<string, unknown>;
  const content = record.content;

  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const item = part as Record<string, unknown>;
        return asString(item.text) || asString(item.output_text) || asString(item.content);
      })
      .join("")
      .trim();
  }

  return "";
}

function consumeTextDelta(text: string, state: ClaudeStreamState): string {
  if (!text) return "";
  if (!state.lastText) {
    state.lastText = text;
    return text;
  }
  if (text === state.lastText || state.lastText.endsWith(text)) return "";
  if (text.startsWith(state.lastText)) {
    const delta = text.slice(state.lastText.length);
    state.lastText = text;
    return delta;
  }

  state.lastText += text;
  return text;
}

export function normalizeClaudeStreamEvent(raw: unknown, state?: ClaudeStreamState): AgentEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const type = asString(record.type);

  if (type === "assistant" || type === "message") {
    const text = extractText(record.message ?? record);
    const delta = state ? consumeTextDelta(text, state) : text;
    return delta ? [{ type: "delta", content: delta }] : [];
  }

  if (type === "result") {
    const events: AgentEvent[] = [];
    const sessionId = asString(record.session_id);
    if (sessionId) events.push({ type: "session", sessionId });

    const text = asString(record.result) || extractText(record);
    if (text && state?.lastText && text.startsWith(state.lastText) && text !== state.lastText) {
      const delta = consumeTextDelta(text, state);
      if (delta) events.push({ type: "delta", content: delta });
      events.push({ type: "completed" });
    } else if (text && !state?.lastText) {
      if (state) state.lastText = text;
      events.push({ type: "completed", content: text });
    } else {
      events.push({ type: "completed" });
    }
    return events;
  }

  if (type === "system") {
    return [];
  }

  if (type === "error") {
    const text = asString(record.message) || asString(record.error) || "Claude Code error";
    return [{ type: "error", error: text }];
  }

  return [];
}
