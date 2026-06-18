import { describe, expect, test, vi } from "vitest";
import { queryProviderBalance } from "./provider-balance";
import type { AgentChannel } from "../shared/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("provider balance queries", () => {
  test("queries DeepSeek balance using the configured bearer token", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        is_available: true,
        balance_infos: [{ currency: "CNY", total_balance: "12.34" }],
      }),
    );
    const channel: AgentChannel = {
      id: "deepseek-api",
      agentId: "api",
      label: "DeepSeek API",
      providerName: "DeepSeek",
      baseUrl: "https://api.deepseek.com/v1",
      httpHeaders: { Authorization: "Bearer sk-deepseek" },
      models: [],
    };

    const result = await queryProviderBalance(channel, { fetch: fetchImpl, now: () => 1710000000000 });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.deepseek.com/user/balance",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-deepseek", Accept: "application/json" }),
      }),
    );
    expect(result).toMatchObject({
      channelId: "deepseek-api",
      supported: true,
      status: "success",
      queriedAt: 1710000000000,
      items: [{ label: "CNY", remaining: 12.34, unit: "CNY", isValid: true }],
    });
  });

  test("computes OpenRouter remaining credits from total credits and usage", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: { total_credits: 20, total_usage: 7.5 },
      }),
    );

    const result = await queryProviderBalance(
      {
        id: "openrouter",
        agentId: "api",
        label: "OpenRouter",
        providerName: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        httpHeaders: { Authorization: "Bearer sk-openrouter" },
        models: [],
      },
      { fetch: fetchImpl, now: () => 1710000000000 },
    );

    expect(result).toMatchObject({
      supported: true,
      status: "success",
      items: [{ label: "OpenRouter", remaining: 12.5, total: 20, used: 7.5, unit: "USD", isValid: true }],
    });
  });

  test("returns a missing key state without calling the provider", async () => {
    const fetchImpl = vi.fn();

    const result = await queryProviderBalance(
      {
        id: "deepseek-api",
        agentId: "api",
        label: "DeepSeek API",
        providerName: "DeepSeek",
        baseUrl: "https://api.deepseek.com/v1",
        models: [],
      },
      { fetch: fetchImpl, now: () => 1710000000000 },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      supported: true,
      status: "missing_key",
      message: "API Key is not configured.",
      items: [],
    });
  });

  test("returns unsupported state for providers without a known balance endpoint", async () => {
    const fetchImpl = vi.fn();

    const result = await queryProviderBalance(
      {
        id: "volcengine",
        agentId: "api",
        label: "Volcengine",
        providerName: "Volcengine",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        httpHeaders: { Authorization: "Bearer sk-volc" },
        models: [],
      },
      { fetch: fetchImpl, now: () => 1710000000000 },
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      supported: false,
      status: "unsupported",
      message: "Balance query is not supported for this provider.",
      items: [],
    });
  });
});
