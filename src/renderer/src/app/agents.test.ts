import { describe, expect, test } from "vitest";
import { agentAccent, agentLabel } from "./agents";

describe("renderer runtime helpers", () => {
  test("renders Hermes label and accent", () => {
    expect(agentLabel("hermes")).toBe("Hermes");
    expect(agentAccent("hermes")).toBe("agent-hermes");
  });

  test("renders OpenCode label and accent", () => {
    expect(agentLabel("opencode")).toBe("OpenCode");
    expect(agentAccent("opencode")).toBe("agent-opencode");
  });
});
