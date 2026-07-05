import type { AgentEvent } from "../../shared/types";
import type { NativeCommandFailureClassification } from "../runtime-command-store";

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

function isTransportFailureMessage(message: string): boolean {
  return /\b(?:enoent|econnrefused|econnreset|timed out|timeout|connection|spawn)\b/i.test(message);
}

export function classifyClaudeNativeCommandFailure(input: {
  prompt: string;
  error: string;
}): NativeCommandFailureClassification {
  if (!input.prompt.trimStart().startsWith("/")) return "runtime_failure";
  if (/\b(?:unknown|unsupported|invalid)\s+slash\s+command\b/i.test(input.error)) return "invalid_command";
  if (isTransportFailureMessage(input.error)) return "transport_failure";
  return "runtime_failure";
}

export function normalizeClaudeStreamEvent(raw: unknown, state?: ClaudeStreamState): AgentEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const record = raw as Record<string, unknown>;
  const type = asString(record.type);

  if (type === "stream_event") {
    const event = record.event;
    if (!event || typeof event !== "object") return [];
    const eventRecord = event as Record<string, unknown>;
    if (asString(eventRecord.type) !== "content_block_delta") return [];
    const delta = eventRecord.delta;
    if (!delta || typeof delta !== "object") return [];
    const deltaRecord = delta as Record<string, unknown>;
    if (asString(deltaRecord.type) !== "text_delta") return [];
    const text = asString(deltaRecord.text);
    if (!text) return [];
    if (state) state.lastText += text;
    return [{ type: "delta", content: text }];
  }

  if (type === "assistant" || type === "message") {
    const text = extractText(record.message ?? record);
    const delta = state ? consumeTextDelta(text, state) : text;
    return delta ? [{ type: "delta", content: delta }] : [];
  }

  if (type === "result") {
    const events: AgentEvent[] = [];
    const sessionId = asString(record.session_id);
    if (sessionId) events.push({ type: "session", sessionId });

    const subtype = asString(record.subtype);
    if (subtype && subtype !== "success") {
      const error = asString(record.error) || asString(record.result) || extractText(record) || "Claude Code error";
      events.push({ type: "error", error });
      return events;
    }

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
