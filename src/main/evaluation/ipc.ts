import type { IpcMain } from "electron";
import type { ConfiguredAgent } from "../../shared/types";
import type { EvaluationDataset, EvaluationEvaluator, EvaluationExperiment } from "../../shared/evaluation/types";
import { runEvaluation } from "../evaluation-runner";
import type { EvaluationStore } from "../evaluation-store";

type AgentExecution = (configuredAgentId: string, prompt: string) => Promise<{ output: string; durationMs: number }>;

export function registerEvaluationIpc(input: {
  ipc: Pick<IpcMain, "handle">;
  store: EvaluationStore;
  agents: () => ConfiguredAgent[];
  executeAgent: AgentExecution;
}): void {
  const { ipc, store } = input;
  ipc.handle("evaluation:datasets:list", () => store.listDatasets());
  ipc.handle("evaluation:datasets:save", (_event, value: EvaluationDataset) => store.saveDataset(value));
  ipc.handle("evaluation:datasets:delete", (_event, id: string) => store.deleteDataset(id));
  ipc.handle("evaluation:evaluators:list", () => store.listEvaluators());
  ipc.handle("evaluation:evaluators:save", (_event, value: EvaluationEvaluator) => store.saveEvaluator(value));
  ipc.handle("evaluation:evaluators:delete", (_event, id: string) => store.deleteEvaluator(id));
  ipc.handle("evaluation:experiments:list", () => store.listExperiments());
  ipc.handle("evaluation:experiments:save", (_event, value: EvaluationExperiment) => store.saveExperiment(value));
  ipc.handle("evaluation:experiments:delete", (_event, id: string) => store.deleteExperiment(id));
  ipc.handle("evaluation:runs:list", (_event, experimentId?: string) => store.listRuns(experimentId));
  ipc.handle("evaluation:runs:delete", (_event, id: string) => store.deleteRun(id));
  ipc.handle("evaluation:experiments:run", async (_event, experimentId: string) => {
    const experiment = (await store.listExperiments()).find((item) => item.id === experimentId);
    if (!experiment) throw new Error(`Evaluation experiment not found: ${experimentId}`);
    const dataset = (await store.listDatasets()).find((item) => item.id === experiment.datasetId);
    if (!dataset) throw new Error(`Evaluation dataset not found: ${experiment.datasetId}`);
    const evaluators = await store.listEvaluators();
    const agent = input.agents().find((item) => item.id === experiment.agentId);
    const run = await runEvaluation({
      experiment, dataset, evaluators,
      ...(agent?.currentRevisionId ? { agentRevisionId: agent.currentRevisionId } : {}),
      execute: input.executeAgent,
      executeJudge: (runtimeId, prompt) => {
        const judge = input.agents().find((item) => item.channelId === runtimeId && (item.agentType === "execution" || item.managed));
        if (!judge) throw new Error(`Runtime ${runtimeId} does not have an execution agent`);
        return input.executeAgent(judge.id, prompt);
      },
    });
    return store.saveRun(run);
  });
}
