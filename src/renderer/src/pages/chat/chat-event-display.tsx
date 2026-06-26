import { agentLabel } from "../../app/agents";
import type { ChatEvent } from "../../../../shared/types";

export function chatEventDisplayContent(event: ChatEvent): string {
  if (event.type === "tool_call") {
    const name = event.name ?? "tool";
    return event.content ? `→ ${name}\n${event.content}` : `→ ${name}`;
  }
  if (event.type === "tool_result") {
    const name = event.name ?? "tool";
    return event.content ? `✓ ${name}\n${event.content}` : `✓ ${name}`;
  }
  if (event.type === "system") {
    return event.content ? `system\n${event.content}` : "system";
  }
  if (event.type === "handoff") {
    const from = event.fromAgentId ? agentLabel(event.fromAgentId) : "Agent";
    const to = event.toAgentId ? agentLabel(event.toAgentId) : "Agent";
    return event.content ? `${from} → ${to}\n${event.content}` : `${from} → ${to}`;
  }
  if (event.type === "error") {
    return event.content ? `error\n${event.content}` : "error";
  }
  return event.content;
}

export function MetaMessage({ content }: { content: string }) {
  const [summary, ...bodyLines] = content.split("\n");
  const body = bodyLines.join("\n").trim();

  if (!body) {
    return <pre>{summary}</pre>;
  }

  return (
    <details className="cli-meta-details">
      <summary>{summary}</summary>
      <pre>{body}</pre>
    </details>
  );
}
