import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_EVALUATION_RUBRICS } from "../shared/built-in-evaluation-rubrics";
import { EvaluationStore } from "./evaluation-store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

async function createStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evaluation-store-"));
  tempDirs.push(dir);
  return new EvaluationStore(path.join(dir, "app.db"));
}

describe("EvaluationStore", () => {
  it("round-trips structured rubrics and score evidence", async () => {
    const store = await createStore();
    const rubric = BUILT_IN_EVALUATION_RUBRICS.conciseness!;
    await store.saveDataset({
      id: "dataset",
      name: "Dataset",
      description: "",
      items: [{ id: "item", input: "Question", metadata: {}, sequence: 0 }],
      createdAt: 1,
      updatedAt: 1,
    });
    await store.saveEvaluator({
      id: "judge",
      name: "Judge",
      kind: "llm_judge",
      rubric,
      threshold: 0.75,
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await store.saveExperiment({
      id: "experiment",
      name: "Experiment",
      datasetId: "dataset",
      agentId: "agent",
      evaluatorIds: ["judge"],
      repetitions: 1,
      createdAt: 1,
      updatedAt: 1,
    });
    await store.saveRun({
      id: "run",
      experimentId: "experiment",
      status: "completed",
      startedAt: 1,
      finishedAt: 2,
      results: [
        {
          id: "result",
          runId: "run",
          datasetItemId: "item",
          repetition: 1,
          input: "Question",
          output: "Answer",
          durationMs: 1,
          scores: [
            {
              evaluatorId: "judge",
              score: 0.75,
              passed: true,
              reason: "Only minor redundancy.",
              evidence: ["The answer is"],
              failedCriteria: ["no-meta"],
              durationMs: 1,
            },
          ],
        },
      ],
    });

    expect((await store.listEvaluators())[0]?.rubric).toEqual(rubric);
    expect(
      (await store.listRuns("experiment"))[0]?.results[0]?.scores[0],
    ).toMatchObject({
      evidence: ["The answer is"],
      failedCriteria: ["no-meta"],
    });
    store.close();
  });
});
