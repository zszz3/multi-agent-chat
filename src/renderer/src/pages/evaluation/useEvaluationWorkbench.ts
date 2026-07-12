import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  EvaluationDataset,
  EvaluationEvaluator,
  EvaluationExperiment,
  EvaluationRun,
} from "../../../../shared/types";
import {
  instantiateEvaluatorTemplate,
  type EvaluationEvaluatorTemplate,
} from "../../../../shared/evaluation-templates";

export type EvaluationView =
  | "overview"
  | "datasets"
  | "evaluators"
  | "experiments";

export function useEvaluationWorkbench() {
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [evaluators, setEvaluators] = useState<EvaluationEvaluator[]>([]);
  const [experiments, setExperiments] = useState<EvaluationExperiment[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [view, setView] = useState<EvaluationView>("overview");
  const [selectedIds, setSelectedIds] = useState<
    Partial<Record<EvaluationView, string>>
  >({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<
    "save" | "delete" | "run" | "load" | undefined
  >("load");
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    setBusy("load");
    setError(undefined);
    try {
      const [nextDatasets, nextEvaluators, nextExperiments, nextRuns] =
        await Promise.all([
          window.multiAgentChat.listEvaluationDatasets(),
          window.multiAgentChat.listEvaluationEvaluators(),
          window.multiAgentChat.listEvaluationExperiments(),
          window.multiAgentChat.listEvaluationRuns(),
        ]);
      setDatasets(nextDatasets);
      setEvaluators(nextEvaluators);
      setExperiments(nextExperiments);
      setRuns(nextRuns);
      setDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => (current === "load" ? undefined : current));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selectedDataset =
    datasets.find((item) => item.id === selectedIds.datasets) ?? datasets[0];
  const selectedEvaluator =
    evaluators.find((item) => item.id === selectedIds.evaluators) ??
    evaluators[0];
  const selectedExperiment =
    experiments.find((item) => item.id === selectedIds.experiments) ??
    experiments[0];

  const select = useCallback((targetView: EvaluationView, id?: string) => {
    setView(targetView);
    if (id) setSelectedIds((current) => ({ ...current, [targetView]: id }));
  }, []);

  const createDataset = useCallback(() => {
    const now = Date.now();
    const value: EvaluationDataset = {
      id: `dataset-${now}`,
      name: "新数据集",
      description: "",
      items: [{ id: `item-${now}`, input: "", metadata: {}, sequence: 0 }],
      createdAt: now,
      updatedAt: now,
    };
    setDatasets((items) => [value, ...items]);
    setSelectedIds((ids) => ({ ...ids, datasets: value.id }));
    setView("datasets");
    setDirty(true);
  }, []);
  const createEvaluator = useCallback(
    (template?: EvaluationEvaluatorTemplate) => {
      const now = Date.now();
      const value: EvaluationEvaluator = template
        ? instantiateEvaluatorTemplate(template, now)
        : {
            id: `evaluator-${now}`,
            name: "包含匹配",
            kind: "contains",
            threshold: 1,
            enabled: true,
            createdAt: now,
            updatedAt: now,
          };
      setEvaluators((items) => [value, ...items]);
      setSelectedIds((ids) => ({ ...ids, evaluators: value.id }));
      setView("evaluators");
      setDirty(true);
    },
    [],
  );
  const createExperiment = useCallback(
    (agentId = "") => {
      const now = Date.now();
      const value: EvaluationExperiment = {
        id: `experiment-${now}`,
        name: "新实验",
        datasetId: datasets[0]?.id ?? "",
        agentId,
        evaluatorIds: evaluators
          .filter((item) => item.enabled)
          .map((item) => item.id),
        repetitions: 1,
        createdAt: now,
        updatedAt: now,
      };
      setExperiments((items) => [value, ...items]);
      setSelectedIds((ids) => ({ ...ids, experiments: value.id }));
      setView("experiments");
      setDirty(true);
    },
    [datasets, evaluators],
  );

  const saveDataset = useCallback(async (value: EvaluationDataset) => {
    setBusy("save");
    setError(undefined);
    try {
      await window.multiAgentChat.saveEvaluationDataset({ ...value, updatedAt: Date.now() });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => (current === "save" ? undefined : current));
    }
  }, [reload]);

  const saveEvaluator = useCallback(async (value: EvaluationEvaluator) => {
    setBusy("save");
    setError(undefined);
    try {
      await window.multiAgentChat.saveEvaluationEvaluator({ ...value, updatedAt: Date.now() });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => (current === "save" ? undefined : current));
    }
  }, [reload]);

  const saveExperiment = useCallback(async (value: EvaluationExperiment) => {
    setBusy("save");
    setError(undefined);
    try {
      await window.multiAgentChat.saveEvaluationExperiment({ ...value, updatedAt: Date.now() });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => (current === "save" ? undefined : current));
    }
  }, [reload]);

  const deleteCurrent = useCallback(async () => {
    setBusy("delete");
    setError(undefined);
    try {
      if (view === "datasets" && selectedDataset)
        await window.multiAgentChat.deleteEvaluationDataset(selectedDataset.id);
      if (view === "evaluators" && selectedEvaluator)
        await window.multiAgentChat.deleteEvaluationEvaluator(
          selectedEvaluator.id,
        );
      if (view === "experiments" && selectedExperiment)
        await window.multiAgentChat.deleteEvaluationExperiment(
          selectedExperiment.id,
        );
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => (current === "delete" ? undefined : current));
    }
  }, [reload, selectedDataset, selectedEvaluator, selectedExperiment, view]);

  const runExperiment = useCallback(async (value: EvaluationExperiment) => {
    setBusy("run");
    setError(undefined);
    try {
      await window.multiAgentChat.saveEvaluationExperiment({
        ...value,
        updatedAt: Date.now(),
      });
      await window.multiAgentChat.runEvaluationExperiment(
        value.id,
      );
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy((current) => (current === "run" ? undefined : current));
    }
  }, [reload]);

  const experimentRuns = useMemo(
    () =>
      selectedExperiment
        ? runs.filter((run) => run.experimentId === selectedExperiment.id)
        : [],
    [runs, selectedExperiment],
  );
  return {
    datasets,
    evaluators,
    experiments,
    runs,
    view,
    selectedDataset,
    selectedEvaluator,
    selectedExperiment,
    experimentRuns,
    dirty,
    busy,
    error,
    select,
    setDirty,
    createDataset,
    createEvaluator,
    createExperiment,
    saveDataset,
    saveEvaluator,
    saveExperiment,
    deleteCurrent,
    runExperiment,
  };
}
