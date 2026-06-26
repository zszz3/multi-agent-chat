import { DEFAULT_MODEL_ID } from "../../../../shared/models";
import type { AgentChannel, AgentPluginConfig, ProviderBalanceResult } from "../../../../shared/types";
import type { AgentProviderPreset } from "../../../../shared/provider-presets";
import type { Language } from "../../app/language";
import type { AgentTestUiState } from "./runtime-types";

export function formatBalanceNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

export function formatBalanceValue(item: ProviderBalanceResult["items"][number]): string {
  if (typeof item.remaining !== "number") return item.invalidMessage ?? "Unavailable";
  return `${formatBalanceNumber(item.remaining)}${item.unit ? ` ${item.unit}` : ""}`;
}

export function formatBalanceDetail(item: ProviderBalanceResult["items"][number], language: Language): string {
  const detailParts: string[] = [];
  if (typeof item.total === "number") detailParts.push(`${language === "zh" ? "总额" : "Total"} ${formatBalanceNumber(item.total)}`);
  if (typeof item.used === "number") detailParts.push(`${language === "zh" ? "已用" : "Used"} ${formatBalanceNumber(item.used)}`);
  if (item.invalidMessage) detailParts.push(item.invalidMessage);
  return detailParts.join(" · ");
}

export function agentTestEventLabel(type: AgentTestUiState["transcript"][number]["type"]): string {
  if (type === "user") return "You";
  if (type === "assistant" || type === "assistant_delta") return "Agent";
  if (type === "tool") return "Tool";
  if (type === "warning") return "warning";
  if (type === "stderr") return "stderr";
  if (type === "error") return "error";
  return "system";
}

export function applyProviderPresetToChannel(channel: AgentChannel, preset: AgentProviderPreset, apiKey = ""): AgentChannel {
  const presetModelIds = new Set(preset.models.map((model) => model.id));
  const customModels = channel.models.filter((model) => model.id !== DEFAULT_MODEL_ID && !presetModelIds.has(model.id));
  const next: AgentChannel = {
    ...channel,
    agentId: preset.runtimeAgentId,
    models: [...preset.models.map((model) => ({ ...model })), ...customModels.map((model) => ({ ...model }))],
  };
  delete next.providerName;
  delete next.modelProvider;
  delete next.baseUrl;
  delete next.wireApi;
  delete next.modelReasoningEffort;
  delete next.modelCatalogJson;
  delete next.httpHeaders;
  if (preset.providerName) next.providerName = preset.providerName;
  if (preset.modelProvider) next.modelProvider = preset.modelProvider;
  if (preset.baseUrl) next.baseUrl = preset.baseUrl;
  if (preset.wireApi) next.wireApi = preset.wireApi;
  if (preset.modelReasoningEffort) next.modelReasoningEffort = preset.modelReasoningEffort;
  if (preset.extraHeaders) next.httpHeaders = { ...preset.extraHeaders };
  const normalizedApiKey = apiKey.trim();
  if (preset.usesApiKey && normalizedApiKey) {
    const headerName = preset.apiKeyHeaderName ?? "Authorization";
    const prefix = preset.apiKeyPrefix ?? "Bearer ";
    next.httpHeaders = {
      ...(next.httpHeaders ?? {}),
      [headerName]: `${prefix}${normalizedApiKey}`,
    };
  }
  return next;
}

function headerValue(headers: Record<string, string> | undefined, headerName: string): string {
  if (!headers) return "";
  const target = headerName.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return match?.[1] ?? "";
}

export function apiKeyFromChannelHeaders(channel: AgentChannel | undefined, preset: AgentProviderPreset | undefined): string {
  if (!channel || !preset?.usesApiKey) return "";
  const rawValue = headerValue(channel.httpHeaders, preset.apiKeyHeaderName ?? "Authorization").trim();
  const prefix = preset.apiKeyPrefix ?? "Bearer ";
  if (!rawValue || !prefix) return rawValue;
  return rawValue.toLowerCase().startsWith(prefix.toLowerCase()) ? rawValue.slice(prefix.length).trim() : rawValue;
}

export function providerKeyValue(providerKeys: Record<string, string>, preset: AgentProviderPreset | undefined, channel: AgentChannel | undefined): string {
  if (!preset) return "";
  return apiKeyFromChannelHeaders(channel, preset) || providerKeys[preset.id] || "";
}

export function rememberProviderKeyFromChannel(
  providerKeys: Record<string, string>,
  preset: AgentProviderPreset | undefined,
  channel: AgentChannel | undefined,
): Record<string, string> {
  if (!preset?.usesApiKey) return providerKeys;
  const apiKey = apiKeyFromChannelHeaders(channel, preset);
  if (!apiKey || providerKeys[preset.id] === apiKey) return providerKeys;
  return { ...providerKeys, [preset.id]: apiKey };
}

export function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function headersFromText(value: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const headerValue = trimmed.slice(separator + 1).trim();
    if (key) headers[key] = headerValue;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function withOptionalString(channel: AgentChannel, key: keyof AgentChannel, value: string): AgentChannel {
  const next: AgentChannel = { ...channel, models: channel.models.map((model) => ({ ...model })) };
  const trimmed = value.trim();
  if (trimmed) {
    (next as unknown as Record<string, unknown>)[key] = trimmed;
  } else {
    delete (next as unknown as Record<string, unknown>)[key];
  }
  return next;
}

export function withOptionalHeaders(channel: AgentChannel, value: string): AgentChannel {
  const next: AgentChannel = { ...channel, models: channel.models.map((model) => ({ ...model })) };
  const headers = headersFromText(value);
  if (headers) next.httpHeaders = headers;
  else delete (next as unknown as Record<string, unknown>).httpHeaders;
  return next;
}

export function updatePluginAt(channel: AgentChannel, index: number, updater: (plugin: AgentPluginConfig) => AgentPluginConfig): AgentChannel {
  const plugins = [...(channel.plugins ?? [])];
  const current = plugins[index];
  if (!current) return channel;
  plugins[index] = updater(current);
  return { ...channel, plugins };
}

export function removePluginAt(channel: AgentChannel, index: number): AgentChannel {
  const plugins = (channel.plugins ?? []).filter((_, itemIndex) => itemIndex !== index);
  const next = { ...channel };
  if (plugins.length > 0) next.plugins = plugins;
  else delete next.plugins;
  return next;
}

export function addPluginToChannel(channel: AgentChannel, pluginId: string): AgentChannel {
  const id = pluginId.trim();
  if (!id) return channel;
  const plugins = [...(channel.plugins ?? [])];
  const existingIndex = plugins.findIndex((plugin) => plugin.id === id);
  if (existingIndex >= 0) {
    const existingPlugin = plugins[existingIndex];
    if (!existingPlugin) return channel;
    plugins[existingIndex] = { ...existingPlugin, enabled: true };
    return { ...channel, plugins };
  }
  return { ...channel, plugins: [...plugins, { id, enabled: true }] };
}
