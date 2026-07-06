import { describe, expect, test } from "vitest";
import { agentAccent, agentLabel } from "./agents";

describe("renderer runtime helpers", () => {
  test("renders Hermes label and accent", () => {
    expect(agentLabel("hermes")).toBe("Hermes");
    expect(agentAccent("hermes")).toBe("agent-hermes");
  });
});
