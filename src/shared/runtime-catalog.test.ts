import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG_CHANNEL_IDS } from "./config-channels";
import { FALLBACK_MODEL_OPTIONS } from "./models";
import { AGENT_PROVIDER_PRESETS } from "./provider-presets";

describe("runtime catalog", () => {
  test("includes Hermes fallback models, default channel, and provider preset", () => {
    expect(FALLBACK_MODEL_OPTIONS.hermes.map((model) => model.id)).toContain("default");
    expect(DEFAULT_CONFIG_CHANNEL_IDS.hermes).toBe("hermes-default");
    expect(AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "hermes-default")).toMatchObject({
      runtimeAgentId: "hermes",
      label: "Default",
      configurableModelId: true,
    });
  });
});
