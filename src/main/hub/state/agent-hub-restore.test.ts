import { describe, expect, test } from "vitest";
import { restoreWorkflowEvent } from "./agent-hub-restore";

function intervention() {
  return {
    nodeId: "implement",
    source: "supervision_pause" as const,
    reason: "Needs user input.",
    allowedActions: ["continue" as const, "skip" as const],
    requestedAt: 1_000,
    progressReport: {
      nodeId: "implement",
      attempt: 1,
      phase: "blocked",
      completedItems: ["checkpoint captured"],
      remainingItems: ["finish"],
      blockers: ["needs input"],
      evidence: ["checkpoint-1"],
      checkpoint: "checkpoint-1",
      safeToInterrupt: true,
      requestedAction: "need_input" as const,
      reportedAt: 900,
    },
    supervisorDecision: {
      action: "pause" as const,
      question: "Provide input?",
      reason: "Input is required.",
    },
  };
}

describe("agent hub workflow event restore", () => {
  test("restores and clones a valid Workflow V2 intervention payload", () => {
    const rawIntervention = intervention();
    const event = restoreWorkflowEvent({
      type: "node_paused",
      nodeId: "implement",
      at: 1_100,
      intervention: rawIntervention,
    });

    expect(event?.intervention).toEqual(rawIntervention);
    expect(event?.intervention).not.toBe(rawIntervention);
    expect(event?.intervention?.progressReport).not.toBe(rawIntervention.progressReport);
  });

  test("drops an invalid intervention payload without dropping the event", () => {
    const event = restoreWorkflowEvent({
      type: "node_paused",
      nodeId: "implement",
      at: 1_100,
      intervention: { ...intervention(), allowedActions: ["execute-shell"] },
    });

    expect(event).toMatchObject({ type: "node_paused", nodeId: "implement" });
    expect(event?.intervention).toBeUndefined();
  });
});
