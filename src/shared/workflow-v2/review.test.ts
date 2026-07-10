import { describe, expect, test } from "vitest";
import { isWorkflowV2HumanIntervention, isWorkflowV2ReviewVerdict } from "./review";

describe("workflow-v2 review contracts", () => {
  test("validates a durable supervision intervention with a resume conversation", () => {
    expect(isWorkflowV2HumanIntervention({
      nodeId: "implement",
      source: "supervision_pause",
      reason: "Needs user input.",
      allowedActions: ["continue", "skip", "escalate", "replan", "increase_review_strength"],
      requestedAt: 1_000,
      progressReport: {
        nodeId: "implement",
        attempt: 1,
        phase: "blocked",
        completedItems: ["captured checkpoint"],
        remainingItems: ["finish implementation"],
        blockers: ["needs user input"],
        evidence: ["checkpoint exists"],
        checkpoint: "checkpoint-1",
        safeToInterrupt: true,
        requestedAction: "need_input",
        reportedAt: 900,
      },
      supervisorDecision: {
        action: "pause",
        question: "Provide the missing input?",
        reason: "The task requested input.",
      },
      resumeConversation: {
        runtimeId: "codex",
        codecVersion: "1",
        payload: { native: { threadId: "thread-1" } },
      },
    })).toBe(true);
  });

  test("rejects malformed nested intervention payloads", () => {
    expect(isWorkflowV2HumanIntervention({
      nodeId: "implement",
      source: "supervision_pause",
      reason: "Needs user input.",
      allowedActions: ["continue"],
      requestedAt: 1_000,
      resumeConversation: { runtimeId: "codex", codecVersion: "1" },
    })).toBe(false);
  });

  test("validates structured reviewer verdicts at the shared persistence boundary", () => {
    expect(isWorkflowV2ReviewVerdict({
      decision: "reject",
      reasons: ["Tests are missing."],
      requiredFixes: ["Add tests."],
      riskLevel: "high",
      confidence: "high",
    })).toBe(true);
    expect(isWorkflowV2ReviewVerdict({ decision: "reject", reasons: "missing tests" })).toBe(false);
  });
});
