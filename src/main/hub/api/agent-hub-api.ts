import { DEFAULT_MODEL_ID, runtimeModelId } from "../../../shared/models";
import type {
  AgentChannel,
  RuntimeConversation,
  WorkflowAgentEvent,
  WorkflowAgentResponse,
} from "../../../shared/types";

export function resolveApiModel(channel: AgentChannel, modelId: string): string | undefined {
  const model = runtimeModelId(modelId);
  if (model) return model;
  return channel.models.find((item) => item.id !== DEFAULT_MODEL_ID)?.id;
}

export function apiRequestUrl(channel: AgentChannel): string {
  if (channel.modelProvider === "anthropic-api") {
    const normalized = (channel.baseUrl ?? "").replace(/\/+$/, "");
    if (normalized.endsWith("/messages")) return normalized;
    return `${normalized}/messages`;
  }
  return chatCompletionsUrl(channel.baseUrl ?? "");
}

export function apiRequestBody(
  channel: AgentChannel,
  model: string,
  prompt: string,
  system?: string,
): Record<string, unknown> {
  if (channel.modelProvider === "anthropic-api") {
    return {
      model,
      max_tokens: 4096,
      system: system || undefined,
      messages: [{ role: "user", content: prompt }],
    };
  }
  return {
    model,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      { role: "user", content: prompt },
    ],
    stream: false,
  };
}

export function extractApiContent(channel: AgentChannel, text: string): string {
  if (channel.modelProvider === "anthropic-api") {
    const parsed = JSON.parse(text) as { content?: Array<{ type?: string; text?: unknown }> };
    const content = parsed.content
      ?.map((item) => (typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("");
    if (content) return content;
    return JSON.stringify(parsed, null, 2);
  }
  const parsed = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>;
    output_text?: unknown;
  };
  const first = parsed.choices?.[0];
  const content = first?.message?.content ?? first?.text ?? parsed.output_text;
  return typeof content === "string" ? content : JSON.stringify(parsed, null, 2);
}

export async function testApiAgent(input: {
  channel: AgentChannel;
  modelId: string;
  timeoutMs: number;
  testPrompt: string;
  systemPrompt: string;
  emit: (event: { type: "phase" | "assistant"; content: string }) => void;
}): Promise<string> {
  if (!input.channel.baseUrl) throw new Error("API agent requires a provider base URL.");
  const model = resolveApiModel(input.channel, input.modelId);
  if (!model) throw new Error("API agent requires a model.");
  input.emit({ type: "phase", content: `Sending HTTP request to ${apiRequestUrl(input.channel)} with model ${model}.` });
  const response = await fetch(apiRequestUrl(input.channel), {
    method: "POST",
    signal: AbortSignal.timeout(input.timeoutMs),
    headers: {
      "content-type": "application/json",
      ...(input.channel.httpHeaders ?? {}),
    },
    body: JSON.stringify(apiRequestBody(input.channel, model, input.testPrompt, input.systemPrompt)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`API test failed (${response.status}): ${text.slice(0, 800)}`);
  const output = extractApiContent(input.channel, text).trim();
  if (!output) throw new Error("API returned an empty response.");
  input.emit({ type: "assistant", content: output });
  return output;
}

export async function askApiWorkflowAgent(input: {
  requestId: string;
  prompt: string;
  channel: AgentChannel;
  modelId: string;
  runtimeConversation: RuntimeConversation | undefined;
  workflowDeveloperInstructions: string;
  onEvent: ((event: WorkflowAgentEvent) => void) | undefined;
}): Promise<WorkflowAgentResponse> {
  if (!input.channel.baseUrl) throw new Error("API workflow agent requires a provider base URL");
  const model = resolveApiModel(input.channel, input.modelId);
  if (!model) throw new Error("API workflow agent requires a model");

  const response = await fetch(apiRequestUrl(input.channel), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(input.channel.httpHeaders ?? {}),
    },
    body: JSON.stringify(apiRequestBody(input.channel, model, input.prompt, input.workflowDeveloperInstructions)),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`API workflow request failed (${response.status}): ${text.slice(0, 800)}`);
  const content = extractApiContent(input.channel, text).trim();
  input.onEvent?.({ requestId: input.requestId, type: "delta", content });
  input.onEvent?.({
    requestId: input.requestId,
    type: "completed",
    content,
    ...(input.runtimeConversation ? { runtimeConversation: input.runtimeConversation } : {}),
  });
  return { content, ...(input.runtimeConversation ? { runtimeConversation: input.runtimeConversation } : {}) };
}

function chatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}
