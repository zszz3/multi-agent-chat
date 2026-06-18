import type { AgentChannel, ProviderBalanceItem, ProviderBalanceResult } from "../shared/types";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface BalanceProviderDefinition {
  id: string;
  label: string;
  endpoint: string;
  parse: (body: unknown) => ProviderBalanceItem[];
}

export interface ProviderBalanceQueryOptions {
  fetch?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const BALANCE_PROVIDERS: BalanceProviderDefinition[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/user/balance",
    parse: parseDeepSeekBalance,
  },
  {
    id: "stepfun",
    label: "StepFun",
    endpoint: "https://api.stepfun.com/v1/accounts",
    parse: parseStepFunBalance,
  },
  {
    id: "siliconflow-cn",
    label: "SiliconFlow",
    endpoint: "https://api.siliconflow.cn/v1/user/info",
    parse: (body) => parseSiliconFlowBalance(body, "SiliconFlow", "CNY"),
  },
  {
    id: "siliconflow-en",
    label: "SiliconFlow (EN)",
    endpoint: "https://api.siliconflow.com/v1/user/info",
    parse: (body) => parseSiliconFlowBalance(body, "SiliconFlow (EN)", "USD"),
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1/credits",
    parse: parseOpenRouterBalance,
  },
  {
    id: "novita",
    label: "Novita AI",
    endpoint: "https://api.novita.ai/v3/user/balance",
    parse: parseNovitaBalance,
  },
];

export async function queryProviderBalance(channel: AgentChannel, options: ProviderBalanceQueryOptions = {}): Promise<ProviderBalanceResult> {
  const now = options.now ?? Date.now;
  const provider = balanceProviderForChannel(channel);
  if (!provider) {
    return {
      channelId: channel.id,
      ...optionalProviderName(channel.providerName),
      supported: false,
      status: "unsupported",
      message: "Balance query is not supported for this provider.",
      items: [],
      queriedAt: now(),
    };
  }

  const apiKey = apiKeyFromChannel(channel);
  if (!apiKey) {
    return {
      channelId: channel.id,
      providerName: channel.providerName ?? provider.label,
      supported: true,
      status: "missing_key",
      message: "API Key is not configured.",
      items: [],
      queriedAt: now(),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const fetchImpl = options.fetch ?? fetch;
  try {
    const response = await fetchImpl(provider.endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return {
        channelId: channel.id,
        providerName: channel.providerName ?? provider.label,
        supported: true,
        status: "error",
        message: `Authentication failed (HTTP ${response.status}).`,
        items: [
          {
            label: provider.label,
            isValid: false,
            invalidMessage: `Authentication failed (HTTP ${response.status}).`,
          },
        ],
        queriedAt: now(),
      };
    }

    if (!response.ok) {
      return {
        channelId: channel.id,
        providerName: channel.providerName ?? provider.label,
        supported: true,
        status: "error",
        message: `Balance API error (HTTP ${response.status}): ${await response.text()}`,
        items: [],
        queriedAt: now(),
      };
    }

    const body = (await response.json()) as unknown;
    return {
      channelId: channel.id,
      providerName: channel.providerName ?? provider.label,
      supported: true,
      status: "success",
      message: "Balance query succeeded.",
      items: provider.parse(body),
      queriedAt: now(),
    };
  } catch (error) {
    return {
      channelId: channel.id,
      providerName: channel.providerName ?? provider.label,
      supported: true,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      items: [],
      queriedAt: now(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function balanceProviderForChannel(channel: AgentChannel): BalanceProviderDefinition | undefined {
  const identity = `${channel.providerName ?? ""} ${channel.modelProvider ?? ""} ${channel.baseUrl ?? ""}`.toLowerCase();
  if (identity.includes("api.deepseek.com") || identity.includes("deepseek")) return providerById("deepseek");
  if (identity.includes("api.stepfun.ai") || identity.includes("api.stepfun.com") || identity.includes("stepfun")) return providerById("stepfun");
  if (identity.includes("api.siliconflow.com")) return providerById("siliconflow-en");
  if (identity.includes("api.siliconflow.cn") || identity.includes("siliconflow")) return providerById("siliconflow-cn");
  if (identity.includes("openrouter.ai") || identity.includes("openrouter")) return providerById("openrouter");
  if (identity.includes("api.novita.ai") || identity.includes("novita")) return providerById("novita");
  return undefined;
}

function providerById(providerId: string): BalanceProviderDefinition | undefined {
  return BALANCE_PROVIDERS.find((provider) => provider.id === providerId);
}

function apiKeyFromChannel(channel: AgentChannel): string | undefined {
  const headers = channel.httpHeaders ?? {};
  const entry = Object.entries(headers).find(([key]) => {
    const normalized = key.toLowerCase();
    return normalized === "authorization" || normalized === "api-key" || normalized === "x-api-key";
  });
  const rawValue = entry?.[1]?.trim();
  if (!rawValue) return undefined;
  return rawValue.replace(/^bearer\s+/i, "").trim() || undefined;
}

function parseDeepSeekBalance(body: unknown): ProviderBalanceItem[] {
  const record = asRecord(body);
  const isAvailable = asBoolean(record?.is_available) ?? true;
  const infos = asArray(record?.balance_infos);
  return infos.flatMap((item) => {
    const info = asRecord(item);
    if (!info) return [];
    const currency = asString(info.currency) ?? "CNY";
    const remaining = numericField(info, "total_balance");
    return [
      {
        label: currency,
        ...optionalNumber("remaining", remaining),
        unit: currency,
        isValid: isAvailable,
        ...(isAvailable ? {} : { invalidMessage: "Insufficient balance." }),
      },
    ];
  });
}

function parseStepFunBalance(body: unknown): ProviderBalanceItem[] {
  const record = asRecord(body);
  return [
    {
      label: "StepFun",
      remaining: numericField(record, "balance") ?? 0,
      unit: "CNY",
      isValid: true,
    },
  ];
}

function parseSiliconFlowBalance(body: unknown, label: string, unit: string): ProviderBalanceItem[] {
  const record = asRecord(body);
  const data = asRecord(record?.data) ?? record;
  return [
    {
      label,
      remaining: numericField(data, "totalBalance") ?? numericField(data, "balance") ?? 0,
      unit,
      isValid: true,
    },
  ];
}

function parseOpenRouterBalance(body: unknown): ProviderBalanceItem[] {
  const record = asRecord(body);
  const data = asRecord(record?.data) ?? record;
  const total = numericField(data, "total_credits") ?? 0;
  const used = numericField(data, "total_usage") ?? 0;
  const remaining = total - used;
  return [
    {
      label: "OpenRouter",
      remaining,
      total,
      used,
      unit: "USD",
      isValid: remaining > 0,
      ...(remaining > 0 ? {} : { invalidMessage: "No credits remaining." }),
    },
  ];
}

function parseNovitaBalance(body: unknown): ProviderBalanceItem[] {
  const record = asRecord(body);
  const remaining = (numericField(record, "availableBalance") ?? 0) / 10_000;
  return [
    {
      label: "Novita AI",
      remaining,
      unit: "USD",
      isValid: remaining > 0,
      ...(remaining > 0 ? {} : { invalidMessage: "No balance remaining." }),
    },
  ];
}

function numericField(record: Record<string, unknown> | undefined, field: string): number | undefined {
  if (!record) return undefined;
  const value = record[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function optionalProviderName(providerName: string | undefined): Pick<ProviderBalanceResult, "providerName"> | Record<string, never> {
  return providerName ? { providerName } : {};
}

function optionalNumber(key: "remaining" | "total" | "used", value: number | undefined): Pick<ProviderBalanceItem, typeof key> | Record<string, never> {
  return typeof value === "number" ? { [key]: value } as Pick<ProviderBalanceItem, typeof key> : {};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
