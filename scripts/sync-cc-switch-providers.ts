import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type JsonRecord = Record<string, unknown>;

interface SourcePreset extends JsonRecord {
  name: string;
  websiteUrl?: string;
  apiKeyUrl?: string;
  category?: string;
  apiFormat?: string;
  apiKeyField?: string;
  auth?: JsonRecord;
  config?: string;
  modelCatalog?: Array<JsonRecord>;
  settingsConfig?: { env?: Record<string, string> };
  providerType?: string;
  requiresOAuth?: boolean;
  hidden?: boolean;
}

const root = path.resolve(import.meta.dirname, "..");
const ccSwitchRoot = path.resolve(process.argv[2] ?? path.join(root, "..", "cc-switch"));
const outputPath = path.join(root, "src", "shared", "cc-switch-provider-presets.generated.ts");
const CURRENT_CODEX_MODELS = [
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6-Sol",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    defaultReasoningEffort: "low",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6-Terra",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6-Luna",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
  },
];
const CODEX_PROVIDER_NAMES = new Set([
  "OpenAI Official", "Shengsuanyun", "PatewayAI", "火山Agentplan", "BytePlus", "DouBaoSeed", "Qiniu",
  "Azure OpenAI", "DeepSeek", "Zhipu GLM", "Baidu Qianfan Coding Plan", "Bailian", "Kimi",
  "Kimi For Coding", "StepFun", "ModelScope", "Longcat", "MiniMax", "BaiLing", "Xiaomi MiMo",
  "SiliconFlow", "Novita AI", "Nvidia", "OpenCode Go", "AiHubMix", "PackyCode", "OpenRouter",
]);
const CLAUDE_PROVIDER_NAMES = new Set([
  "Claude Official", "Shengsuanyun", "PatewayAI", "火山Agentplan", "BytePlus", "DouBaoSeed", "Qiniu",
  "DeepSeek", "Zhipu GLM", "Baidu Qianfan Coding Plan", "Bailian",
  "Bailian For Coding", "Kimi", "Kimi For Coding", "StepFun", "ModelScope", "Longcat", "MiniMax",
  "BaiLing", "SiliconFlow", "PackyCode", "OpenRouter", "Novita AI", "Xiaomi MiMo",
  "AWS Bedrock (API Key)",
]);

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "provider";
}

function stringMatch(value: string, pattern: RegExp): string | undefined {
  return value.match(pattern)?.[1]?.trim() || undefined;
}

function modelOptions(ids: Array<string | undefined>): Array<{ id: string; label: string }> {
  const unique = ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id));
  return [
    { id: "default", label: "Default" },
    ...[...new Set(unique)].filter((id) => id !== "default").map((id) => {
      const current = CURRENT_CODEX_MODELS.find((model) => model.id === id);
      return current ? { ...current } : { id, label: id };
    }),
  ];
}

function knownId(runtime: "codex" | "claude", name: string): string | undefined {
  const key = name.toLowerCase();
  if (runtime === "codex") {
    if (key === "openai official") return "codex-default";
    if (key === "deepseek") return "deepseek";
    if (key === "zhipu glm") return "glm";
    if (key === "kimi") return "kimi";
    if (key === "longcat") return "longcat";
    if (key === "xiaomi mimo") return "mimo";
    if (key === "doubaoseed") return "codex-volcengine";
    if (key === "custom") return "custom";
  } else {
    if (key === "claude official") return "claude-code";
    if (key === "deepseek") return "claude-code-deepseek";
    if (key === "zhipu glm") return "claude-code-glm";
    if (key === "kimi") return "claude-code-kimi";
    if (key === "openrouter") return "claude-code-openrouter";
    if (key === "siliconflow") return "claude-code-siliconflow";
    if (key === "bailian") return "claude-code-bailian";
    if (key === "doubaoseed") return "claude-code-volcengine";
    if (key === "custom") return "claude-code-custom";
  }
  return undefined;
}

function uniqueId(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function codexPreset(source: SourcePreset, used: Set<string>): JsonRecord {
  const config = source.config ?? "";
  const providerName = stringMatch(config, /^name\s*=\s*["']([^"']+)["']/m) ?? source.name;
  const baseUrl = stringMatch(config, /^base_url\s*=\s*["']([^"']+)["']/m);
  const model = stringMatch(config, /^model\s*=\s*["']([^"']+)["']/m);
  const catalogModels = source.modelCatalog?.map((item) => typeof item.model === "string" ? item.model : undefined) ?? [];
  const id = uniqueId(knownId("codex", source.name) ?? `codex-${slug(source.name)}`, used);
  return {
    id,
    label: source.name,
    runtimeAgentId: "codex",
    providerName,
    modelProvider: id === "codex-default" ? "openai" : slug(providerName),
    ...(baseUrl ? { baseUrl } : {}),
    wireApi: "responses",
    apiFormat: source.apiFormat ?? "openai_responses",
    modelReasoningEffort: "high",
    models: modelOptions([...(id === "codex-default" ? CURRENT_CODEX_MODELS.map((item) => item.id) : []), model, ...catalogModels]),
    usesApiKey: id !== "codex-default",
    ...(id === "codex-default" ? { requiresOAuth: true } : {}),
    ...(source.websiteUrl ? { websiteUrl: source.websiteUrl } : {}),
    ...(source.apiKeyUrl ? { apiKeyUrl: source.apiKeyUrl } : {}),
    ...(source.category ? { category: source.category } : {}),
  };
}

function claudePreset(source: SourcePreset, used: Set<string>): JsonRecord {
  const env = Object.fromEntries(
    Object.entries(source.settingsConfig?.env ?? {}).map(([key, value]) => [key, String(value)]),
  );
  const baseUrl = env.ANTHROPIC_BASE_URL;
  const apiKeyField = source.apiKeyField ?? (Object.hasOwn(env, "ANTHROPIC_API_KEY") ? "ANTHROPIC_API_KEY" : "ANTHROPIC_AUTH_TOKEN");
  const models = modelOptions([env.ANTHROPIC_MODEL]);
  delete env.ANTHROPIC_BASE_URL;
  delete env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_API_KEY;
  const id = uniqueId(knownId("claude", source.name) ?? `claude-code-${slug(source.name)}`, used);
  return {
    id,
    label: source.name,
    runtimeAgentId: "claude",
    providerName: source.name,
    modelProvider: `${slug(source.name)}-anthropic`,
    ...(baseUrl ? { baseUrl } : {}),
    apiFormat: source.apiFormat ?? "anthropic",
    apiKeyField,
    models,
    usesApiKey: source.requiresOAuth !== true && id !== "claude-code",
    ...(Object.keys(env).length > 0 ? { environment: env } : {}),
    ...(source.websiteUrl ? { websiteUrl: source.websiteUrl } : {}),
    ...(source.apiKeyUrl ? { apiKeyUrl: source.apiKeyUrl } : {}),
    ...(source.category ? { category: source.category } : {}),
    ...(source.requiresOAuth ? { requiresOAuth: true } : {}),
    ...(source.providerType ? { providerType: source.providerType } : {}),
  };
}

const codexModule = await import(pathToFileURL(path.join(ccSwitchRoot, "src", "config", "codexProviderPresets.ts")).href);
const claudeModule = await import(pathToFileURL(path.join(ccSwitchRoot, "src", "config", "claudeProviderPresets.ts")).href);
const codexSources = (codexModule.codexProviderPresets as SourcePreset[]).filter((preset) => CODEX_PROVIDER_NAMES.has(preset.name));
const claudeSources = (claudeModule.providerPresets as SourcePreset[])
  .filter((preset) => preset.hidden !== true && CLAUDE_PROVIDER_NAMES.has(preset.name));
const used = new Set<string>();
const presets = [
  ...codexSources.map((preset) => codexPreset(preset, used)),
  ...claudeSources.map((preset) => claudePreset(preset, used)),
];

const output = `// Generated from CC Switch v3.16.5. Run scripts/sync-cc-switch-providers.ts to refresh.\n` +
  `import type { AgentProviderPreset } from "./provider-presets";\n\n` +
  `export const CC_SWITCH_PROVIDER_PRESETS = ${JSON.stringify(presets, null, 2)} satisfies AgentProviderPreset[];\n`;
await writeFile(outputPath, output, "utf8");
console.log(`Wrote ${presets.length} provider presets to ${outputPath}`);
