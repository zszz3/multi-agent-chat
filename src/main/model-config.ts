import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_MODEL_ID, FALLBACK_MODEL_OPTIONS, runtimeModelId } from "../shared/models";
import type { AgentChannel, AgentId, AgentModelOption, AgentPluginConfig, GeneratedConfigFile, ImportedCodexConfig } from "../shared/types";

const execFileAsync = promisify(execFile);
const CONFIG_VERSION = 1;
const BUILT_IN_CODEX_PROVIDER_IDS = new Set(["openai"]);

interface ModelChannelsFile {
  version: typeof CONFIG_VERSION;
  channels: AgentChannel[];
}

function isAgentId(value: unknown): value is AgentId {
  return value === "codex" || value === "claude" || value === "api";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeProfilePart(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "default";
}

function profileNameFromPath(filePath: string): string {
  const basename = path.basename(filePath);
  if (basename.endsWith(".config.toml")) return basename.slice(0, -".config.toml".length);
  if (basename.endsWith(".toml")) return basename.slice(0, -".toml".length);
  return basename;
}

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function quoteInlineTableKey(value: string): string {
  return JSON.stringify(value);
}

function stripInlineComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previous = line[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === "#" && !quote) return line.slice(0, index).trim();
  }
  return line.trim();
}

function unquoteTomlKey(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseTomlString(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

function parseTomlScalar(value: string): string | boolean | undefined {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return parseTomlString(value);
}

function splitTomlCommaList(value: string): string[] {
  const parts: string[] = [];
  let quote: '"' | "'" | null = null;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote ?? char;
      continue;
    }
    if (char === "," && !quote) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function parseTomlInlineTable(value: string): Record<string, string> | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  const body = trimmed.slice(1, -1).trim();
  if (!body) return undefined;

  const table: Record<string, string> = {};
  for (const entry of splitTomlCommaList(body)) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const key = unquoteTomlKey(entry.slice(0, separator));
    const parsedValue = parseTomlString(entry.slice(separator + 1));
    if (key && parsedValue !== undefined) table[key] = parsedValue;
  }
  return Object.keys(table).length > 0 ? table : undefined;
}

function readKnownToml(raw: string): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = { root: {} };
  let activeSection = "root";

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine);
    if (!line) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      activeSection = sectionMatch[1].trim();
      sections[activeSection] ??= {};
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = unquoteTomlKey(line.slice(0, separator));
    const value = line.slice(separator + 1).trim();
    const inlineTable = parseTomlInlineTable(value);
    const section = sections[activeSection] ?? {};
    section[key] = inlineTable ?? parseTomlScalar(value);
    sections[activeSection] = section;
  }

  return sections;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function pluginIdFromSection(section: string): string | undefined {
  if (!section.startsWith("plugins.")) return undefined;
  const id = unquoteTomlKey(section.slice("plugins.".length));
  return id.trim() || undefined;
}

function pluginConfigKey(pluginId: string): string {
  return `plugins.${quoteInlineTableKey(pluginId)}.enabled`;
}

function normalizeModels(models: unknown, fallback: AgentModelOption[]): AgentModelOption[] {
  const normalized: AgentModelOption[] = [];
  if (Array.isArray(models)) {
    for (const item of models) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = asString(record.id);
      if (!id || normalized.some((model) => model.id === id)) continue;
      normalized.push({
        id,
        label: asString(record.label) ?? id,
      });
    }
  }

  const source = normalized.length > 0 ? normalized : fallback;
  if (source.some((model) => model.id === DEFAULT_MODEL_ID)) return source;
  return [{ id: DEFAULT_MODEL_ID, label: "Default" }, ...source];
}

function normalizeHeaders(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function normalizePlugins(raw: unknown): AgentPluginConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const plugins: AgentPluginConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = asString(record.id);
    if (!id || plugins.some((plugin) => plugin.id === id)) continue;
    plugins.push({
      id,
      enabled: asBoolean(record.enabled) ?? true,
    });
  }
  return plugins.length > 0 ? plugins : undefined;
}

function normalizeChannel(raw: unknown): AgentChannel | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  if (!id || !isAgentId(record.agentId)) return null;

  const channel: AgentChannel = {
    id,
    agentId: record.agentId,
    label: asString(record.label) ?? id,
    models: normalizeModels(record.models, FALLBACK_MODEL_OPTIONS[record.agentId]),
  };

  const profileName = asString(record.profileName);
  if (profileName) channel.profileName = profileName;
  const modelProvider = asString(record.modelProvider);
  if (modelProvider) channel.modelProvider = modelProvider;
  const providerName = asString(record.providerName);
  if (providerName) channel.providerName = providerName;
  const baseUrl = asString(record.baseUrl);
  if (baseUrl) channel.baseUrl = baseUrl;
  const wireApi = asString(record.wireApi);
  if (wireApi) channel.wireApi = wireApi;
  const modelCatalogJson = asString(record.modelCatalogJson);
  if (modelCatalogJson) channel.modelCatalogJson = modelCatalogJson;
  const modelReasoningEffort = asString(record.modelReasoningEffort);
  if (modelReasoningEffort) channel.modelReasoningEffort = modelReasoningEffort;
  const httpHeaders = normalizeHeaders(record.httpHeaders);
  if (httpHeaders) channel.httpHeaders = httpHeaders;
  const plugins = normalizePlugins(record.plugins);
  if (plugins) channel.plugins = plugins;

  return channel;
}

export function normalizeChannels(channels: unknown): AgentChannel[] {
  const normalized = Array.isArray(channels)
    ? channels.map((channel) => normalizeChannel(channel)).filter((channel): channel is AgentChannel => Boolean(channel))
    : [];

  const unique: AgentChannel[] = [];
  for (const channel of normalized) {
    if (!unique.some((item) => item.id === channel.id)) unique.push(channel);
  }

  return unique.length > 0 ? unique : createDefaultChannels();
}

export function parseCodexModelCatalog(raw: string): AgentModelOption[] {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const models = Array.isArray(parsed.models) ? parsed.models : [];
  return models
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const id = asString(record.slug) ?? asString(record.id);
      if (!id || record.visibility === "hidden") return null;
      const priority = typeof record.priority === "number" && Number.isFinite(record.priority) ? record.priority : 9999;
      return {
        id,
        label: asString(record.display_name) ?? asString(record.label) ?? id,
        priority,
      };
    })
    .filter((item): item is AgentModelOption & { priority: number } => Boolean(item))
    .sort((left, right) => left.priority - right.priority)
    .map(({ id, label }) => ({ id, label }));
}

export async function detectCodexModels(command = "codex"): Promise<AgentModelOption[]> {
  const { stdout } = await execFileAsync(command, ["debug", "models"], { timeout: 5_000, maxBuffer: 1024 * 1024 });
  return parseCodexModelCatalog(stdout);
}

export function createDefaultChannels(codexModels = FALLBACK_MODEL_OPTIONS.codex.filter((model) => model.id !== DEFAULT_MODEL_ID)): AgentChannel[] {
  return [
    {
      id: "codex-openai",
      agentId: "codex",
      label: "Codex OpenAI",
      modelProvider: "openai",
      providerName: "OpenAI",
      models: normalizeModels(codexModels, FALLBACK_MODEL_OPTIONS.codex),
    },
    {
      id: "claude-code",
      agentId: "claude",
      label: "Claude Code",
      models: FALLBACK_MODEL_OPTIONS.claude,
    },
    {
      id: "api-openai",
      agentId: "api",
      label: "OpenAI API",
      providerName: "OpenAI",
      modelProvider: "openai-api",
      baseUrl: "https://api.openai.com/v1",
      models: FALLBACK_MODEL_OPTIONS.api,
    },
  ];
}

export async function loadModelChannels(configPath: string, codexCommand = "codex"): Promise<AgentChannel[]> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ModelChannelsFile>;
    return normalizeChannels(parsed.channels);
  } catch (error) {
    const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
    if (code !== "ENOENT") console.warn(`Failed to load model channel config from ${configPath}:`, error);
  }

  try {
    const detected = await detectCodexModels(codexCommand);
    return createDefaultChannels(detected);
  } catch {
    return createDefaultChannels();
  }
}

export async function saveModelChannels(configPath: string, channels: AgentChannel[]): Promise<AgentChannel[]> {
  const normalized = normalizeChannels(channels);
  const payload: ModelChannelsFile = {
    version: CONFIG_VERSION,
    channels: normalized,
  };
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return normalized;
}

export function codexHome(): string {
  return process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");
}

function generatedProfileNameFor(channel: AgentChannel, modelId: string): string {
  return `multi-agent-${sanitizeProfilePart(channel.id)}-${sanitizeProfilePart(modelId)}`;
}

export function profileNameFor(channel: AgentChannel, modelId: string): string {
  if (channel.profileName && modelId === DEFAULT_MODEL_ID) return channel.profileName;
  return generatedProfileNameFor(channel, modelId);
}

export function codexProfileArgs(channel: AgentChannel | undefined, modelId: string): string[] {
  if (!channel || channel.agentId !== "codex") return [];
  return ["--profile", profileNameFor(channel, modelId)];
}

function pushConfigOverride(args: string[], key: string, value: string): void {
  args.push("-c", `${key}=${quoteToml(value)}`);
}

function pushBooleanConfigOverride(args: string[], key: string, value: boolean): void {
  args.push("-c", `${key}=${value ? "true" : "false"}`);
}

export function codexAppServerConfigArgs(channel: AgentChannel | undefined, modelId: string): string[] {
  if (!channel || channel.agentId !== "codex") return [];

  const args: string[] = [];
  if (channel.modelProvider) pushConfigOverride(args, "model_provider", channel.modelProvider);

  const model = runtimeModelId(modelId);
  if (model) pushConfigOverride(args, "model", model);

  if (channel.modelReasoningEffort) pushConfigOverride(args, "model_reasoning_effort", channel.modelReasoningEffort);
  if (channel.modelCatalogJson) pushConfigOverride(args, "model_catalog_json", channel.modelCatalogJson);
  for (const plugin of channel.plugins ?? []) {
    pushBooleanConfigOverride(args, pluginConfigKey(plugin.id), plugin.enabled);
  }

  if (channel.modelProvider && !BUILT_IN_CODEX_PROVIDER_IDS.has(channel.modelProvider)) {
    const prefix = `model_providers.${channel.modelProvider}`;
    if (channel.providerName) pushConfigOverride(args, `${prefix}.name`, channel.providerName);
    if (channel.baseUrl) pushConfigOverride(args, `${prefix}.base_url`, channel.baseUrl);
    if (channel.wireApi) pushConfigOverride(args, `${prefix}.wire_api`, channel.wireApi);
    if (channel.httpHeaders && Object.keys(channel.httpHeaders).length > 0) {
      const headers = Object.entries(channel.httpHeaders)
        .map(([key, value]) => `${quoteInlineTableKey(key)} = ${quoteToml(value)}`)
        .join(", ");
      args.push("-c", `${prefix}.http_headers={ ${headers} }`);
    }
  }

  return args;
}

export function parseCodexProfileConfig(sourcePath: string, raw: string): ImportedCodexConfig | null {
  const sections = readKnownToml(raw);
  const root = sections.root ?? {};
  const profileName = profileNameFromPath(sourcePath);
  const modelProvider = asString(root.model_provider);
  const providerSectionName = modelProvider
    ? `model_providers.${modelProvider}`
    : Object.keys(sections).find((section) => section.startsWith("model_providers."));
  const providerSection = providerSectionName ? sections[providerSectionName] ?? {} : {};
  const model = asString(root.model);

  const models: AgentModelOption[] = [{ id: DEFAULT_MODEL_ID, label: "Default" }];
  if (model) models.push({ id: model, label: model });

  const channel: AgentChannel = {
    id: `codex-${sanitizeProfilePart(profileName)}`,
    agentId: "codex",
    label: `Codex ${profileName}`,
    profileName,
    models,
  };

  if (modelProvider) channel.modelProvider = modelProvider;
  const providerName = asString(providerSection.name);
  if (providerName) channel.providerName = providerName;
  const baseUrl = asString(providerSection.base_url);
  if (baseUrl) channel.baseUrl = baseUrl;
  const wireApi = asString(providerSection.wire_api);
  if (wireApi) channel.wireApi = wireApi;
  const modelCatalogJson = asString(root.model_catalog_json);
  if (modelCatalogJson) channel.modelCatalogJson = modelCatalogJson;
  const modelReasoningEffort = asString(root.model_reasoning_effort);
  if (modelReasoningEffort) channel.modelReasoningEffort = modelReasoningEffort;
  const headers = normalizeHeaders(providerSection.http_headers);
  if (headers) channel.httpHeaders = headers;
  const plugins: AgentPluginConfig[] = [];
  for (const [sectionName, section] of Object.entries(sections)) {
    const id = pluginIdFromSection(sectionName);
    if (!id) continue;
    plugins.push({ id, enabled: asBoolean(section.enabled) ?? true });
  }
  if (plugins.length > 0) channel.plugins = plugins;

  return {
    sourcePath,
    channel,
  };
}

export async function importCodexConfigs(home = codexHome()): Promise<ImportedCodexConfig[]> {
  let entries: string[];
  try {
    entries = await readdir(home);
  } catch (error) {
    const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }

  const imported: ImportedCodexConfig[] = [];
  for (const entry of entries.sort()) {
    if (entry !== "config.toml" && !entry.startsWith("config_") && !entry.endsWith(".config.toml")) continue;
    if (!entry.endsWith(".toml")) continue;
    const sourcePath = path.join(home, entry);
    const raw = await readFile(sourcePath, "utf8");
    const parsed = parseCodexProfileConfig(sourcePath, raw);
    if (parsed) imported.push(parsed);
  }
  return imported;
}

function renderProviderConfig(channel: AgentChannel): string[] {
  if (!channel.modelProvider) return [];
  if (BUILT_IN_CODEX_PROVIDER_IDS.has(channel.modelProvider)) return [];
  if (!channel.providerName && !channel.baseUrl && !channel.wireApi && !channel.httpHeaders) return [];

  const lines = ["", `[model_providers.${channel.modelProvider}]`];
  if (channel.providerName) lines.push(`name = ${quoteToml(channel.providerName)}`);
  if (channel.baseUrl) lines.push(`base_url = ${quoteToml(channel.baseUrl)}`);
  if (channel.wireApi) lines.push(`wire_api = ${quoteToml(channel.wireApi)}`);
  if (channel.httpHeaders && Object.keys(channel.httpHeaders).length > 0) {
    const entries = Object.entries(channel.httpHeaders).map(([key, value]) => `${quoteInlineTableKey(key)} = ${quoteToml(value)}`);
    lines.push(`http_headers = { ${entries.join(", ")} }`);
  }
  return lines;
}

function renderPluginConfig(channel: AgentChannel): string[] {
  if (!channel.plugins || channel.plugins.length === 0) return [];
  const lines: string[] = [];
  for (const plugin of channel.plugins) {
    lines.push("", `[plugins.${quoteInlineTableKey(plugin.id)}]`, `enabled = ${plugin.enabled ? "true" : "false"}`);
  }
  return lines;
}

function renderCodexProfile(channel: AgentChannel, modelId: string): string {
  const lines: string[] = [
    "# Generated by Multi Agent Chat. Edit model-channels.json and regenerate instead of editing this file.",
  ];
  if (channel.modelProvider) lines.push(`model_provider = ${quoteToml(channel.modelProvider)}`);

  const model = runtimeModelId(modelId);
  if (model) lines.push(`model = ${quoteToml(model)}`);
  if (channel.modelReasoningEffort) lines.push(`model_reasoning_effort = ${quoteToml(channel.modelReasoningEffort)}`);
  if (channel.modelCatalogJson) lines.push(`model_catalog_json = ${quoteToml(channel.modelCatalogJson)}`);

  lines.push(...renderProviderConfig(channel));
  lines.push(...renderPluginConfig(channel));
  return `${lines.join("\n")}\n`;
}

export async function generateCodexConfigs(channels: AgentChannel[], home = codexHome()): Promise<GeneratedConfigFile[]> {
  const generated: GeneratedConfigFile[] = [];
  await mkdir(home, { recursive: true });

  for (const channel of normalizeChannels(channels)) {
    if (channel.agentId !== "codex") continue;
    for (const model of channel.models) {
      const profileName = generatedProfileNameFor(channel, model.id);
      const filePath = path.join(home, `${profileName}.config.toml`);
      await writeFile(filePath, renderCodexProfile(channel, model.id), "utf8");
      generated.push({
        channelId: channel.id,
        modelId: model.id,
        profileName,
        path: filePath,
      });
    }
  }

  return generated;
}
