import { describe, expect, it, vi } from "vitest";
import { runEvaluation } from "./evaluation-runner";

describe("runEvaluation", () => {
  it("repeats cases and aggregates deterministic scores", async () => {
    const execute = vi.fn(async () => ({ output: "expected answer", durationMs: 4 }));
    const run = await runEvaluation({
      experiment: { id: "experiment", name: "Experiment", datasetId: "dataset", agentId: "agent", evaluatorIds: ["contains"], repetitions: 2, createdAt: 1, updatedAt: 1 },
      dataset: { id: "dataset", name: "Dataset", description: "", createdAt: 1, updatedAt: 1, items: [{ id: "case", input: "question", expectedOutput: "expected", metadata: {}, sequence: 0 }] },
      evaluators: [{ id: "contains", name: "Contains", kind: "contains", threshold: 1, enabled: true, createdAt: 1, updatedAt: 1 }],
      agentRevisionId: "agent:v2",
      execute,
    });
    expect(run.status).toBe("completed");
    expect(run.results).toHaveLength(2);
    expect(run.averageScore).toBe(1);
    expect(run.minimumScore).toBe(1);
    expect(run.passRate).toBe(1);
    expect(run.agentRevisionId).toBe("agent:v2");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("uses a separate agent for an LLM judge", async () => {
    const execute = vi.fn(async (agentId: string) => agentId === "judge" ? { output: '{"score":0.8,"reason":"good"}', durationMs: 2 } : { output: "answer", durationMs: 3 });
    const run = await runEvaluation({
      experiment: { id: "experiment", name: "Experiment", datasetId: "dataset", agentId: "subject", evaluatorIds: ["judge-eval"], repetitions: 1, createdAt: 1, updatedAt: 1 },
      dataset: { id: "dataset", name: "Dataset", description: "", createdAt: 1, updatedAt: 1, items: [{ id: "case", input: "question", metadata: {}, sequence: 0 }] },
      evaluators: [{ id: "judge-eval", name: "Judge", kind: "llm_judge", agentId: "judge", threshold: 0.7, enabled: true, createdAt: 1, updatedAt: 1 }],
      execute,
    });
    expect(run.results[0]?.scores[0]).toMatchObject({ score: 0.8, passed: true, reason: "good" });
    expect(execute.mock.calls.map(([agentId]) => agentId)).toEqual(["subject", "judge"]);
  });
});
