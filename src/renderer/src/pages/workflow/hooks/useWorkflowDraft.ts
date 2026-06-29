import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_MODEL_ID } from "../../../../../shared/models";
import { buildWorkflowAgentPrompt } from "../../../../../shared/workflow-agent";
import { createWorkflowGraphFromObjective, parseWorkflowGraphUpsert } from "../../../../../shared/workflow-graph";
import type { AgentChannel, AppSnapshot, ConfiguredAgent, WorkflowDraftState, WorkflowGraph, WorkflowGraphNode, WorkflowGrillMessage, WorkflowRunProgressItem, WorkflowStatus } from "../../../../../shared/types";
import { configuredAgentModelId, defaultConfiguredAgentId } from "../../../app/agents";
import {
  createWorkflowId as createWorkflowIdFromAppState,
  initialWorkflowMessages as initialWorkflowMessagesFromAppState,
  workflowDraftShouldPersist as workflowDraftShouldPersistFromAppState,
} from "../../../app/app-state";
import type { WorkflowService } from "../../../app/services/workflow-service";
import { WORKFLOW_THINKING_MESSAGE } from "../workflow-utils";

function initialWorkflowMessages(): WorkflowGrillMessage[] {
  return initialWorkflowMessagesFromAppState();
}

function createWorkflowId(): string {
  return createWorkflowIdFromAppState();
}

interface WorkflowDraftPersistInput {
  workflowId: string;
  activeWorkflowId?: string | undefined;
  workflowIds: string[];
  objective: string;
  messages: WorkflowGrillMessage[];
  graphReady: boolean;
  reply: string;
  error: string | undefined;
  runProgress: WorkflowRunProgressItem[];
  runContextDocument: string;
  contextDocument: string;
  finalReport: string;
  agentSessionId: string | undefined;
}

function workflowDraftShouldPersist(input: WorkflowDraftPersistInput): boolean {
  return workflowDraftShouldPersistFromAppState(input);
}

export interface WorkflowDraftController {
  workflowId: string;
  workflowTitle: string;
  workflowStatus: WorkflowStatus;
  workflowRevision: number;
  workflowConfiguredAgentId: string;
  workflowModelId: string;
  workflowObjective: string;
  workflowGraph: WorkflowGraph;
  workflowGraphReady: boolean;
  workflowMessages: WorkflowGrillMessage[];
  workflowReply: string;
  workflowError: string | undefined;
  workflowRunning: boolean;
  workflowRunProgress: WorkflowRunProgressItem[];
  workflowRunContextDocument: string;
  workflowContextDocument: string;
  workflowFinalReport: string;
  workflowRunIds: string[];
  workflowAgentSessionId: string | undefined;
  workflowCreatedAt: number;
  resetWorkflowLocalDraft: () => void;
  abandonWorkflowGrillRequest: () => void;
  stopWorkflowGrill: () => void;
  createNewWorkflow: () => Promise<void>;
  resetWorkflowSession: () => Promise<void>;
  draftWorkflowGraph: () => void;
  sendWorkflowReply: () => Promise<void>;
  updateWorkflowNode: (nodeId: string, update: Partial<WorkflowGraphNode>) => void;
  selectWorkflow: (workflowId: string) => Promise<void>;
  applyPersistedWorkflowDraft: (draft: WorkflowDraftState) => void;
  syncWorkflowGraph: (nextGraph: WorkflowGraph) => void;
  applyWorkflowGraphFromAgentContent: (content: string) => boolean;
  updateWorkflowRunProgress: (nodeId: string, update: Partial<WorkflowRunProgressItem>) => void;
  askWorkflowAgentFor: (promptText: string, sessionId: string | undefined, requestId: string, configuredAgentId: string, modelId: string) => Promise<string>;
  beginWorkflowAssistantRequest: (requestId: string, assistantMessageId: string) => void;
  hasWorkflowAssistantStreamed: () => boolean;
  setWorkflowId: (value: string | ((current: string) => string)) => void;
  setWorkflowTitle: (value: string | ((current: string) => string)) => void;
  setWorkflowStatus: (value: WorkflowStatus | ((current: WorkflowStatus) => WorkflowStatus)) => void;
  setWorkflowRevision: (value: number | ((current: number) => number)) => void;
  setWorkflowConfiguredAgentId: (value: string | ((current: string) => string)) => void;
  setWorkflowModelId: (value: string | ((current: string) => string)) => void;
  setWorkflowObjective: (value: string | ((current: string) => string)) => void;
  setWorkflowGraph: (value: WorkflowGraph | ((current: WorkflowGraph) => WorkflowGraph)) => void;
  setWorkflowGraphReady: (value: boolean | ((current: boolean) => boolean)) => void;
  setWorkflowMessages: (value: WorkflowGrillMessage[] | ((current: WorkflowGrillMessage[]) => WorkflowGrillMessage[])) => void;
  setWorkflowReply: (value: string | ((current: string) => string)) => void;
  setWorkflowError: (value: string | undefined | ((current: string | undefined) => string | undefined)) => void;
  setWorkflowRunning: (value: boolean | ((current: boolean) => boolean)) => void;
  setWorkflowRunProgress: (value: WorkflowRunProgressItem[] | ((current: WorkflowRunProgressItem[]) => WorkflowRunProgressItem[])) => void;
  setWorkflowRunContextDocument: (value: string | ((current: string) => string)) => void;
  setWorkflowContextDocument: (value: string | ((current: string) => string)) => void;
  setWorkflowFinalReport: (value: string | ((current: string) => string)) => void;
  setWorkflowRunIds: (value: string[] | ((current: string[]) => string[])) => void;
  setWorkflowAgentSessionId: (value: string | undefined | ((current: string | undefined) => string | undefined)) => void;
  setWorkflowCreatedAt: (value: number | ((current: number) => number)) => void;
}

interface UseWorkflowDraftOptions {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
  snapshotRef: React.MutableRefObject<AppSnapshot>;
  initialWorkflowGraph: WorkflowGraph;
  workflows: WorkflowService;
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  onCreateNewWorkflow?: () => void;
}

export function useWorkflowDraft({
  snapshot,
  setSnapshot,
  snapshotRef,
  initialWorkflowGraph,
  workflows,
  configuredAgents,
  channels,
  onCreateNewWorkflow,
}: UseWorkflowDraftOptions): WorkflowDraftController {
  const [workflowId, setWorkflowId] = useState(() => createWorkflowId());
  const [workflowTitle, setWorkflowTitle] = useState("Untitled workflow");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft");
  const [workflowRevision, setWorkflowRevision] = useState(1);
  const [workflowConfiguredAgentId, setWorkflowConfiguredAgentId] = useState("");
  const [workflowModelId, setWorkflowModelId] = useState(DEFAULT_MODEL_ID);
  const [workflowObjective, setWorkflowObjective] = useState("");
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowGraph>(initialWorkflowGraph);
  const [workflowGraphReady, setWorkflowGraphReady] = useState(false);
  const [workflowMessages, setWorkflowMessages] = useState<WorkflowGrillMessage[]>(() => initialWorkflowMessages());
  const [workflowReply, setWorkflowReply] = useState("");
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowRunProgress, setWorkflowRunProgress] = useState<WorkflowRunProgressItem[]>([]);
  const [workflowRunContextDocument, setWorkflowRunContextDocument] = useState("");
  const [workflowContextDocument, setWorkflowContextDocument] = useState("");
  const [workflowFinalReport, setWorkflowFinalReport] = useState("");
  const [workflowRunIds, setWorkflowRunIds] = useState<string[]>([]);
  const [workflowAgentSessionId, setWorkflowAgentSessionId] = useState<string | undefined>();
  const [workflowCreatedAt, setWorkflowCreatedAt] = useState(Date.now());

  const workflowRequestIdRef = useRef<string | undefined>(undefined);
  const workflowAssistantMessageIdRef = useRef<string | undefined>(undefined);
  const workflowStreamingStartedRef = useRef(false);
  const workflowAssistantContentRef = useRef("");
  const workflowDraftHydratedRef = useRef(false);
  const workflowDraftHydratingRef = useRef(false);
  const workflowDraftSaveTimerRef = useRef<number | undefined>(undefined);
  const workflowRunningRef = useRef(workflowRunning);
  const workflowStoreIds = snapshot.workflowStore.workflows.map((workflow) => workflow.workflowId).join(":");

  const applyPersistedWorkflowDraft = useCallback((draft: WorkflowDraftState): void => {
    workflowDraftHydratingRef.current = true;
    setWorkflowId(draft.workflowId);
    setWorkflowTitle(draft.title);
    setWorkflowStatus(draft.status);
    setWorkflowRevision(draft.revision);
    setWorkflowConfiguredAgentId(draft.configuredAgentId);
    setWorkflowModelId(draft.modelId);
    setWorkflowObjective(draft.objective);
    setWorkflowGraph(draft.graph);
    setWorkflowGraphReady(draft.graphReady);
    setWorkflowMessages(draft.messages);
    setWorkflowReply(draft.reply);
    setWorkflowError(draft.error);
    setWorkflowRunProgress(draft.runProgress);
    setWorkflowRunContextDocument(draft.runContextDocument);
    setWorkflowContextDocument(draft.contextDocument);
    setWorkflowFinalReport(draft.finalReport ?? "");
    setWorkflowRunIds(draft.runIds);
    setWorkflowAgentSessionId(draft.agentSessionId);
    setWorkflowCreatedAt(draft.createdAt);
    window.setTimeout(() => {
      workflowDraftHydratingRef.current = false;
    }, 0);
  }, []);

  const buildWorkflowDraft = useCallback((): WorkflowDraftState | undefined => {
    if (
      !workflowDraftShouldPersist({
        workflowId,
        activeWorkflowId: snapshot.workflowStore.activeWorkflowId,
        workflowIds: snapshot.workflowStore.workflows.map((workflow) => workflow.workflowId),
        objective: workflowObjective,
        messages: workflowMessages,
        graphReady: workflowGraphReady,
        reply: workflowReply,
        error: workflowError,
        runProgress: workflowRunProgress,
        runContextDocument: workflowRunContextDocument,
        contextDocument: workflowContextDocument,
        finalReport: workflowFinalReport,
        agentSessionId: workflowAgentSessionId,
      })
    ) {
      return undefined;
    }
    return {
      workflowId,
      title: workflowTitle || workflowGraph.title || workflowObjective || "Untitled workflow",
      status: workflowRunning ? "running" : workflowStatus,
      revision: workflowRevision,
      configuredAgentId: workflowConfiguredAgentId || defaultConfiguredAgentId(configuredAgents),
      modelId: configuredAgentModelId(
        workflowConfiguredAgentId || defaultConfiguredAgentId(configuredAgents),
        workflowModelId,
        configuredAgents,
        channels,
      ),
      objective: workflowObjective,
      graph: workflowGraph,
      graphReady: workflowGraphReady,
      messages: workflowMessages,
      reply: workflowReply,
      error: workflowError,
      runProgress: workflowRunProgress,
      runContextDocument: workflowRunContextDocument,
      contextDocument: workflowContextDocument,
      ...(workflowFinalReport.trim() ? { finalReport: workflowFinalReport } : {}),
      runIds: workflowRunIds,
      agentSessionId: workflowAgentSessionId,
      createdAt: workflowCreatedAt,
      updatedAt: Date.now(),
    };
  }, [
    channels,
    configuredAgents,
    snapshot.workflowStore.activeWorkflowId,
    snapshot.workflowStore.workflows,
    workflowAgentSessionId,
    workflowConfiguredAgentId,
    workflowContextDocument,
    workflowCreatedAt,
    workflowError,
    workflowFinalReport,
    workflowGraph,
    workflowGraphReady,
    workflowId,
    workflowMessages,
    workflowModelId,
    workflowObjective,
    workflowReply,
    workflowRevision,
    workflowRunContextDocument,
    workflowRunIds,
    workflowRunProgress,
    workflowRunning,
    workflowStatus,
    workflowTitle,
  ]);

  useEffect(() => {
    if (workflowDraftHydratedRef.current || snapshot.detectedAt === 0) return;
    workflowDraftHydratedRef.current = true;
    if (snapshot.workflowDraft) applyPersistedWorkflowDraft(snapshot.workflowDraft);
  }, [applyPersistedWorkflowDraft, snapshot.detectedAt, snapshot.workflowDraft]);

  useEffect(() => {
    const activeWorkflow = snapshot.workflowDraft;
    if (!workflowDraftHydratedRef.current || !activeWorkflow) return;
    if (activeWorkflow.workflowId === workflowId && activeWorkflow.revision === workflowRevision) return;
    applyPersistedWorkflowDraft(activeWorkflow);
  }, [applyPersistedWorkflowDraft, snapshot.workflowDraft, snapshot.workflowStore.activeWorkflowId, workflowId, workflowRevision]);

  useEffect(() => {
    if (!workflowDraftHydratedRef.current || workflowDraftHydratingRef.current) return;
    if (workflowDraftSaveTimerRef.current) window.clearTimeout(workflowDraftSaveTimerRef.current);
    workflowDraftSaveTimerRef.current = window.setTimeout(() => {
      workflowDraftSaveTimerRef.current = undefined;
      const draft = buildWorkflowDraft();
      if (!draft) return;
      void workflows.updateDraft(draft).then(setSnapshot);
    }, 300);
    return () => {
      if (workflowDraftSaveTimerRef.current) window.clearTimeout(workflowDraftSaveTimerRef.current);
    };
  }, [
    buildWorkflowDraft,
    setSnapshot,
    workflowAgentSessionId,
    workflowConfiguredAgentId,
    workflowContextDocument,
    workflowCreatedAt,
    workflowError,
    workflowFinalReport,
    workflowGraph,
    workflowGraphReady,
    workflowId,
    workflowMessages,
    workflowModelId,
    workflowObjective,
    workflowReply,
    workflowRevision,
    workflowRunContextDocument,
    workflowRunIds,
    workflowRunProgress,
    workflowStatus,
    workflowStoreIds,
    workflowTitle,
    workflows,
  ]);

  useEffect(() => {
    const fallbackId = defaultConfiguredAgentId(configuredAgents);
    if (!fallbackId) return;
    const nextWorkflowAgentId = configuredAgents.some((agent) => agent.id === workflowConfiguredAgentId) ? workflowConfiguredAgentId : fallbackId;
    if (nextWorkflowAgentId !== workflowConfiguredAgentId) setWorkflowConfiguredAgentId(nextWorkflowAgentId);
    setWorkflowModelId((current) => configuredAgentModelId(nextWorkflowAgentId, current, configuredAgents, channels));
  }, [channels, configuredAgents, workflowConfiguredAgentId]);

  useEffect(() => {
    workflowRunningRef.current = workflowRunning;
  }, [workflowRunning]);

  const syncWorkflowGraph = useCallback((nextGraph: WorkflowGraph): void => {
    setWorkflowGraph(nextGraph);
    setWorkflowTitle(nextGraph.title);
    setWorkflowObjective(nextGraph.objective);
    setWorkflowRevision((current) => current + 1);
    setWorkflowStatus("draft");
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowFinalReport("");
  }, []);

  const applyWorkflowGraphFromAgentContent = useCallback((content: string): boolean => {
    const nextGraph = parseWorkflowGraphUpsert(content);
    if (!nextGraph) return false;
    syncWorkflowGraph(nextGraph);
    setWorkflowGraphReady(true);
    setWorkflowError(undefined);
    return true;
  }, [syncWorkflowGraph]);

  useEffect(() => {
    return workflows.onAgentEvent((event) => {
      if (event.requestId !== workflowRequestIdRef.current) return;
      const assistantMessageId = workflowAssistantMessageIdRef.current;
      if (!assistantMessageId) return;
      if (event.type === "delta") {
        workflowAssistantContentRef.current += event.content;
        setWorkflowMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: workflowAssistantContentRef.current } : message)),
        );
        workflowStreamingStartedRef.current = workflowAssistantContentRef.current.length > 0;
        return;
      }
      if (event.type === "completed") {
        setWorkflowAgentSessionId(event.sessionId);
        if (event.content) {
          workflowAssistantContentRef.current = event.content;
          setWorkflowMessages((current) =>
            current.map((message) => (message.id === assistantMessageId ? { ...message, content: event.content } : message)),
          );
        }
        applyWorkflowGraphFromAgentContent(workflowAssistantContentRef.current || event.content);
        return;
      }
      if (event.type === "error") {
        setWorkflowError(event.error);
        setWorkflowMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: `Workflow agent error: ${event.error}` } : message)),
        );
      }
    });
  }, [applyWorkflowGraphFromAgentContent, workflows]);

  const abandonWorkflowGrillRequest = useCallback((): void => {
    workflowRequestIdRef.current = undefined;
    workflowAssistantMessageIdRef.current = undefined;
    workflowStreamingStartedRef.current = false;
    workflowAssistantContentRef.current = "";
  }, []);

  const beginWorkflowAssistantRequest = useCallback((requestId: string, assistantMessageId: string): void => {
    workflowRequestIdRef.current = requestId;
    workflowAssistantMessageIdRef.current = assistantMessageId;
    workflowStreamingStartedRef.current = false;
    workflowAssistantContentRef.current = "";
  }, []);

  const hasWorkflowAssistantStreamed = useCallback((): boolean => workflowStreamingStartedRef.current, []);

  const resetWorkflowLocalDraft = useCallback((): void => {
    abandonWorkflowGrillRequest();
    setWorkflowRunning(false);
    setWorkflowObjective("");
    setWorkflowReply("");
    setWorkflowError(undefined);
    setWorkflowMessages(initialWorkflowMessages());
    setWorkflowGraph(createWorkflowGraphFromObjective(""));
    setWorkflowGraphReady(false);
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowContextDocument("");
    setWorkflowFinalReport("");
    setWorkflowRunIds([]);
    setWorkflowAgentSessionId(undefined);
    setWorkflowId(createWorkflowId());
    setWorkflowTitle("Untitled workflow");
    setWorkflowStatus("draft");
    setWorkflowRevision(1);
    setWorkflowCreatedAt(Date.now());
  }, [abandonWorkflowGrillRequest]);

  const stopWorkflowGrill = useCallback((): void => {
    if (!workflowRunningRef.current) return;
    const assistantMessageId = workflowAssistantMessageIdRef.current;
    const partial = workflowAssistantContentRef.current.trim();
    abandonWorkflowGrillRequest();
    setWorkflowRunning(false);
    setWorkflowError(undefined);
    if (assistantMessageId) {
      setWorkflowMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: partial || "Stopped: workflow agent did not return a complete response yet." }
            : message,
        ),
      );
    }
  }, [abandonWorkflowGrillRequest]);

  const createNewWorkflow = useCallback(async (): Promise<void> => {
    abandonWorkflowGrillRequest();
    setWorkflowRunning(false);
    const now = Date.now();
    const graph = createWorkflowGraphFromObjective("");
    const draft: WorkflowDraftState = {
      workflowId: createWorkflowId(),
      title: "Untitled workflow",
      status: "draft",
      revision: 1,
      configuredAgentId: workflowConfiguredAgentId || defaultConfiguredAgentId(configuredAgents),
      modelId: configuredAgentModelId(
        workflowConfiguredAgentId || defaultConfiguredAgentId(configuredAgents),
        workflowModelId,
        configuredAgents,
        channels,
      ),
      objective: "",
      graph,
      graphReady: false,
      messages: initialWorkflowMessages(),
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      agentSessionId: undefined,
      createdAt: now,
      updatedAt: now,
    };
    applyPersistedWorkflowDraft(draft);
    const next = await workflows.updateDraft(draft);
    setSnapshot(next);
    onCreateNewWorkflow?.();
  }, [
    abandonWorkflowGrillRequest,
    applyPersistedWorkflowDraft,
    channels,
    configuredAgents,
    onCreateNewWorkflow,
    setSnapshot,
    workflowConfiguredAgentId,
    workflowModelId,
    workflows,
  ]);

  const resetWorkflowSession = useCallback(async (): Promise<void> => {
    abandonWorkflowGrillRequest();
    setWorkflowObjective("");
    setWorkflowReply("");
    setWorkflowError(undefined);
    setWorkflowRunning(false);
    setWorkflowMessages(initialWorkflowMessages());
    setWorkflowGraph(createWorkflowGraphFromObjective(""));
    setWorkflowGraphReady(false);
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowAgentSessionId(undefined);
    const next = await workflows.updateDraft(undefined);
    setSnapshot(next);
  }, [abandonWorkflowGrillRequest, setSnapshot, workflows]);

  const draftWorkflowGraph = useCallback((): void => {
    const nextGraph = createWorkflowGraphFromObjective(workflowObjective);
    syncWorkflowGraph(nextGraph);
    setWorkflowGraphReady(true);
    setWorkflowError(undefined);
  }, [syncWorkflowGraph, workflowObjective]);

  const askWorkflowAgentFor = useCallback(async (
    promptText: string,
    sessionId: string | undefined,
    requestId: string,
    configuredAgentId: string,
    modelId: string,
  ): Promise<string> => {
    const request = {
      requestId,
      prompt: promptText,
      configuredAgentId,
      modelId,
      workDir: snapshotRef.current.workDir,
    };
    const response = await workflows.askAgent(sessionId ? { ...request, sessionId } : request);
    setWorkflowAgentSessionId(response.sessionId);
    return response.content.trim() || "Workflow agent returned an empty response.";
  }, [snapshotRef, workflows]);

  const askSelectedWorkflowAgent = useCallback(async (promptText: string, sessionId: string | undefined, requestId: string): Promise<string> => {
    const configuredAgentId = workflowConfiguredAgentId || defaultConfiguredAgentId(configuredAgents);
    return askWorkflowAgentFor(
      promptText,
      sessionId,
      requestId,
      configuredAgentId,
      configuredAgentModelId(configuredAgentId, workflowModelId, configuredAgents, channels),
    );
  }, [askWorkflowAgentFor, channels, configuredAgents, workflowConfiguredAgentId, workflowModelId]);

  const sendWorkflowReply = useCallback(async (): Promise<void> => {
    if (workflowRunningRef.current) return;
    const starting = workflowMessages.length === 0;
    const text = (starting ? workflowObjective : workflowReply).trim();
    if (!text) return;
    setWorkflowReply("");
    setWorkflowError(undefined);
    if (starting) {
      setWorkflowObjective(text);
      setWorkflowGraphReady(false);
      setWorkflowAgentSessionId(undefined);
    }
    const requestId = `workflow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const assistantMessageId = `grill-assistant-${Date.now()}`;
    beginWorkflowAssistantRequest(requestId, assistantMessageId);
    const nextMessages: WorkflowGrillMessage[] = [
      ...workflowMessages,
      { id: `grill-user-${Date.now()}`, role: "user", content: text },
      { id: assistantMessageId, role: "assistant", content: WORKFLOW_THINKING_MESSAGE },
    ];
    setWorkflowMessages(nextMessages);
    setWorkflowRunning(true);
    try {
      const assistantContent = await askSelectedWorkflowAgent(
        starting ? buildWorkflowAgentPrompt({ objective: text }) : text,
        starting ? undefined : workflowAgentSessionId,
        requestId,
      );
      if (workflowRequestIdRef.current !== requestId) return;
      if (!workflowStreamingStartedRef.current && assistantContent) {
        setWorkflowMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: assistantContent } : message)),
        );
      }
      applyWorkflowGraphFromAgentContent(assistantContent);
    } catch (error) {
      if (workflowRequestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : String(error);
      setWorkflowError(message);
      setWorkflowMessages((current) =>
        current.map((item) => (item.id === assistantMessageId ? { ...item, content: `Workflow agent error: ${message}` } : item)),
      );
    } finally {
      if (workflowRequestIdRef.current === requestId) setWorkflowRunning(false);
    }
  }, [
    applyWorkflowGraphFromAgentContent,
    askSelectedWorkflowAgent,
    workflowAgentSessionId,
    workflowMessages,
    workflowObjective,
    workflowReply,
  ]);

  const updateWorkflowNode = useCallback((nodeId: string, update: Partial<WorkflowGraphNode>): void => {
    const nextGraph = {
      ...workflowGraph,
      nodes: workflowGraph.nodes.map((node) => (node.id === nodeId ? { ...node, ...update } : node)),
    };
    syncWorkflowGraph(nextGraph);
  }, [syncWorkflowGraph, workflowGraph]);

  const selectWorkflow = useCallback(async (selectedWorkflowId: string): Promise<void> => {
    const next = await workflows.selectWorkflow(selectedWorkflowId);
    setSnapshot(next);
  }, [setSnapshot, workflows]);

  const updateWorkflowRunProgress = useCallback((nodeId: string, update: Partial<WorkflowRunProgressItem>): void => {
    setWorkflowRunProgress((current) => current.map((item) => (item.nodeId === nodeId ? { ...item, ...update } : item)));
  }, []);

  return useMemo(
    () => ({
      workflowId,
      workflowTitle,
      workflowStatus,
      workflowRevision,
      workflowConfiguredAgentId,
      workflowModelId,
      workflowObjective,
      workflowGraph,
      workflowGraphReady,
      workflowMessages,
      workflowReply,
      workflowError,
      workflowRunning,
      workflowRunProgress,
      workflowRunContextDocument,
      workflowContextDocument,
      workflowFinalReport,
      workflowRunIds,
      workflowAgentSessionId,
      workflowCreatedAt,
      resetWorkflowLocalDraft,
    abandonWorkflowGrillRequest,
    beginWorkflowAssistantRequest,
    stopWorkflowGrill,
      createNewWorkflow,
      resetWorkflowSession,
      draftWorkflowGraph,
      sendWorkflowReply,
      updateWorkflowNode,
      selectWorkflow,
      applyPersistedWorkflowDraft,
      syncWorkflowGraph,
      applyWorkflowGraphFromAgentContent,
      updateWorkflowRunProgress,
    askWorkflowAgentFor,
    hasWorkflowAssistantStreamed,
      setWorkflowId,
      setWorkflowTitle,
      setWorkflowStatus,
      setWorkflowRevision,
      setWorkflowConfiguredAgentId,
      setWorkflowModelId,
      setWorkflowObjective,
      setWorkflowGraph,
      setWorkflowGraphReady,
      setWorkflowMessages,
      setWorkflowReply,
      setWorkflowError,
      setWorkflowRunning,
      setWorkflowRunProgress,
      setWorkflowRunContextDocument,
      setWorkflowContextDocument,
      setWorkflowFinalReport,
      setWorkflowRunIds,
      setWorkflowAgentSessionId,
      setWorkflowCreatedAt,
    }),
    [
      abandonWorkflowGrillRequest,
      applyPersistedWorkflowDraft,
      applyWorkflowGraphFromAgentContent,
      askWorkflowAgentFor,
      beginWorkflowAssistantRequest,
      createNewWorkflow,
      draftWorkflowGraph,
      hasWorkflowAssistantStreamed,
      resetWorkflowLocalDraft,
      resetWorkflowSession,
      selectWorkflow,
      sendWorkflowReply,
      stopWorkflowGrill,
      syncWorkflowGraph,
      updateWorkflowNode,
      updateWorkflowRunProgress,
      workflowAgentSessionId,
      workflowConfiguredAgentId,
      workflowContextDocument,
      workflowCreatedAt,
      workflowError,
      workflowFinalReport,
      workflowGraph,
      workflowGraphReady,
      workflowId,
      workflowMessages,
      workflowModelId,
      workflowObjective,
      workflowReply,
      workflowRevision,
      workflowRunContextDocument,
      workflowRunIds,
      workflowRunProgress,
      workflowRunning,
      workflowStatus,
      workflowTitle,
    ],
  );
}
