import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";
import { Bot, CircleStop, FileInput, GitBranch, Maximize2, Play, Send, Wand2, X } from "lucide-react";
import { DEFAULT_MODEL_ID } from "../../../../shared/models";
import { WORKFLOW_TOTAL_QUESTION_COUNT } from "../../../../shared/workflow-agent";
import { validateWorkflowV2Definition } from "../../../../shared/workflow-v2/validation";
import type { WorkflowV2Node } from "../../../../shared/workflow-v2/definition";
import type {
  AgentChannel,
  AgentRuntime,
  ConfiguredAgent,
  LocalFilePreview,
  RegisteredArtifact,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGrillMessage,
  WorkflowRunProgressItem,
  WorkflowStatus,
  WorkflowV2InterventionAction,
} from "../../../../shared/types";
import {
  agentAccent,
  agentLabel,
  configuredAgentById,
  configuredAgentModel,
  configuredAgentRuntimeId,
  fallbackRuntime,
  resolveConfiguredAgentChannel,
  runtimeStatus,
} from "../../app/agents";
import { shouldSendComposerKey } from "../../app/composer";
import type { Language } from "../../app/language";
import { Markdown } from "../../Markdown";
import { MarkdownDocument } from "../../ui/MarkdownDocument";
import { ChatControls } from "../chat/ChatControls";
import { TaskStatusChip } from "../tasks/task-status";
import { WorkflowCanvasBoard } from "./WorkflowCanvasBoard";
import { WorkflowNodeAgentWindow } from "./WorkflowNodeAgentWindow";
import type { WorkflowController } from "./workflow-controller";
import {
  WORKFLOW_THINKING_MESSAGE,
  isMarkdownFilePath,
  truncateWorkflowContext,
  workflowAssistantDisplayContent,
  workflowRunProgressSummary,
  workflowRunStatusLabel,
} from "./workflow-utils";

type MaybePromise = void | Promise<void>;

const WORKFLOW_TEXT = {
  zh: {
    runGraph: "运行图",
    running: "运行中...",
    executableNodes: "可执行节点",
    noWorkDir: "未选择工作目录",
    empty: "输入任务描述开始生成工作流。",
    agentWorking: "工作流 Agent 正在处理...",
    result: "工作流图结果",
    ready: "就绪",
    invalid: "无效",
    dagValid: "DAG 有效",
    dagInvalid: "DAG 无效",
    runProgress: "运行进度",
    pauseNode: "暂停节点",
    startNode: "开始节点",
    gateAnswerPlaceholder: "输入你的决定...",
    gateSubmit: "提交决定",
    interventionReasonPlaceholder: "可选：说明本次处理原因...",
    finalReport: "主 Agent 总结",
    completed: "工作流已完成",
    registeredArtifacts: "Agent 登记的产出",
    outputDocuments: "产出文档",
    files: "个文件",
    nodeAgentField: "Agent（本节点）",
    nodeAgentDefault: "跟随工作流默认",
    nodeInfoAgent: "执行 Agent",
    nodeInfoObjective: "总目标",
    nodeInfoInputs: "输入来源",
    nodeInfoNoUpstream: "无上游节点，仅依据总目标和本节点指令",
    nodeInfoOutput: "产出",
    nodeInfoOutputValue: "Work Completion Report + Handoff（写入共享上下文）",
    loading: "读取中",
    closePreview: "关闭文档预览",
    largeFile: "文件较大，仅显示前 512KB。",
    replyToAgent: "回复工作流 Agent",
    replyToQuestion: "回复追问",
    task: "工作流任务",
    modifyPlaceholder: "让工作流 Agent 修改图或解释运行结果...",
    answerPlaceholder: "回答当前问题...",
    taskPlaceholder: "描述工作流任务...",
  },
  en: {
    runGraph: "Run Graph",
    running: "Running...",
    executableNodes: "executable nodes",
    noWorkDir: "No work directory selected",
    empty: "Describe a task to start generating a workflow.",
    agentWorking: "workflow agent is working...",
    result: "Workflow graph result",
    ready: "Ready",
    invalid: "Invalid",
    dagValid: "DAG valid",
    dagInvalid: "DAG invalid",
    runProgress: "Run progress",
    pauseNode: "Pause node",
    startNode: "Start node",
    gateAnswerPlaceholder: "Enter your decision...",
    gateSubmit: "Submit decision",
    interventionReasonPlaceholder: "Optional: explain this intervention decision...",
    finalReport: "Main agent summary",
    completed: "Workflow completed",
    registeredArtifacts: "Agent-published artifacts",
    outputDocuments: "Output documents",
    files: "files",
    nodeAgentField: "Agent (this node)",
    nodeAgentDefault: "Follow workflow default",
    nodeInfoAgent: "Runs with",
    nodeInfoObjective: "Objective",
    nodeInfoInputs: "Inputs from",
    nodeInfoNoUpstream: "No upstream nodes — uses the objective and this node's prompt only",
    nodeInfoOutput: "Produces",
    nodeInfoOutputValue: "Work Completion Report + Handoff (appended to shared context)",
    loading: "Loading",
    closePreview: "Close document preview",
    largeFile: "File is large; showing the first 512KB.",
    replyToAgent: "Reply to workflow agent",
    replyToQuestion: "Reply to grill question",
    task: "Workflow task",
    modifyPlaceholder: "Ask the workflow agent to modify the graph or explain the run...",
    answerPlaceholder: "Answer the current question...",
    taskPlaceholder: "Describe the workflow task...",
  },
} as const;

const WORKFLOW_INTERVENTION_ACTION_TEXT: Record<Language, Record<WorkflowV2InterventionAction, string>> = {
  zh: {
    continue: "继续",
    skip: "跳过",
    escalate: "升级处理",
    replan: "重新规划",
    increase_review_strength: "加强审查",
  },
  en: {
    continue: "Continue",
    skip: "Skip",
    escalate: "Escalate",
    replan: "Replan",
    increase_review_strength: "Strengthen review",
  },
};

interface WorkflowPageLegacyProps {
  workflowId?: string;
  sourceType?: "official" | "user";
  topologyLocked?: boolean;
  title?: string;
  status?: WorkflowStatus;
  graph: WorkflowGraph;
  graphReady: boolean;
  objective: string;
  messages: WorkflowGrillMessage[];
  reply: string;
  error: string | undefined;
  configuredAgentId: string;
  modelId?: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents?: ConfiguredAgent[];
  workDir: string;
  running: boolean;
  runProgress?: WorkflowRunProgressItem[];
  activeRunId?: string | undefined;
  artifacts?: RegisteredArtifact[];
  contextDocument?: string;
  finalReport?: string;
  nodeConversations?: WorkflowController["nodeConversations"];
  nodeTasks?: WorkflowController["nodeTasks"];
  workflowV2Plan?: WorkflowController["workflowV2Plan"];
  onObjectiveChange: (value: string) => void;
  onPauseNode?: (nodeId: string) => MaybePromise;
  onStopRun?: () => MaybePromise;
  onResolveIntervention?: (nodeId: string, action: WorkflowV2InterventionAction, reason?: string) => MaybePromise;
  onStartNode?: (nodeId: string) => MaybePromise;
  onAnswerGate?: (nodeId: string, answer: string) => MaybePromise;
  onSendNodeMessage?: WorkflowController["onSendNodeMessage"];
  onCompleteNodeConversation?: WorkflowController["onCompleteNodeConversation"];
  onRejectNodeCompletion?: WorkflowController["onRejectNodeCompletion"];
  onInterruptNodeConversation?: WorkflowController["onInterruptNodeConversation"];
  onSelectConfiguredAgent: (configuredAgentId: string) => void;
  onSelectModel?: (modelId: string) => void;
  onDraftGraph: () => void;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onUpdateNode: (nodeId: string, update: Partial<WorkflowGraphNode>) => void;
  onRunGraph: () => MaybePromise;
  onResetSession: () => MaybePromise;
  onStopGrill?: () => void;
  onChooseWorkDir?: () => MaybePromise;
  onReadOutputFile?: (filePath: string) => Promise<LocalFilePreview>;
  onListOutputs?: () => Promise<Array<{ name: string; path: string }>>;
  language?: Language;
  defaultGraphExpanded?: boolean;
}

export type WorkflowPageProps = WorkflowPageLegacyProps | { controller: WorkflowController };

function resolveWorkflowPageSource(props: WorkflowPageProps): WorkflowController | WorkflowPageLegacyProps {
  return "controller" in props ? props.controller : props;
}

export function WorkflowPage(props: WorkflowPageProps) {
  const source = resolveWorkflowPageSource(props);
  const workflowId = source.workflowId;
  const topologyLocked = source.topologyLocked === true;
  const title = source.title;
  const status = source.status ?? "draft";
  const graph = source.graph;
  const graphReady = source.graphReady;
  const objective = source.objective;
  const messages = source.messages;
  const reply = source.reply;
  const error = source.error;
  const configuredAgentId = source.configuredAgentId;
  const modelId = source.modelId ?? DEFAULT_MODEL_ID;
  const runtimes = source.runtimes;
  const channels = source.channels;
  const configuredAgents = source.configuredAgents ?? [];
  const workDir = source.workDir;
  const running = source.running;
  const runProgress = source.runProgress ?? [];
  const activeRunId = source.activeRunId;
  const artifacts = source.artifacts ?? [];
  const contextDocument = source.contextDocument ?? "";
  const finalReport = source.finalReport ?? "";
  const nodeConversations = source.nodeConversations ?? [];
  const nodeTasks = source.nodeTasks ?? [];
  const workflowV2Plan = source.workflowV2Plan;
  const onObjectiveChange = source.onObjectiveChange;
  const onPauseNode = source.onPauseNode;
  const onStopRun = source.onStopRun;
  const onResolveIntervention = source.onResolveIntervention;
  const onStartNode = source.onStartNode;
  const onAnswerGate = source.onAnswerGate;
  const onSendNodeMessage = source.onSendNodeMessage;
  const onCompleteNodeConversation = source.onCompleteNodeConversation;
  const onRejectNodeCompletion = source.onRejectNodeCompletion;
  const onInterruptNodeConversation = source.onInterruptNodeConversation;
  const onSelectConfiguredAgent = source.onSelectConfiguredAgent;
  const onSelectModel = source.onSelectModel ?? (() => undefined);
  const onDraftGraph = source.onDraftGraph;
  const onReplyChange = source.onReplyChange;
  const onSendReply = source.onSendReply;
  const onUpdateNode = source.onUpdateNode;
  const onRunGraph = source.onRunGraph;
  const onStopGrill = source.onStopGrill ?? (() => undefined);
  const onChooseWorkDir = source.onChooseWorkDir ?? (() => undefined);
  const onReadOutputFile = source.onReadOutputFile;
  const onListOutputs = source.onListOutputs;
  const language = source.language ?? "en";
  const defaultGraphExpanded = source.defaultGraphExpanded ?? false;
  const workflowText = WORKFLOW_TEXT[language];
  const definition = workflowV2Plan?.definition;
  const validation = definition ? validateWorkflowV2Definition(definition) : { valid: false, errors: ["Workflow V2 plan is required."], warnings: [], topologicalNodeIds: [] };
  const workflowStarted = messages.length > 0;
  const grillComplete = Math.max(0, messages.filter((message) => message.role === "user").length - 1) >= WORKFLOW_TOTAL_QUESTION_COUNT;
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const workflowConfiguredAgent = configuredAgentById(configuredAgentId, configuredAgents);
  const workflowChannel = resolveConfiguredAgentChannel(workflowConfiguredAgent, channels);
  const workflowRuntimeId = configuredAgentRuntimeId(workflowConfiguredAgent, workflowChannel);
  const workflowRuntime = runtimeMap.get(workflowRuntimeId) ?? fallbackRuntime(workflowRuntimeId);
  const workflowModel = configuredAgentModel(workflowConfiguredAgent, workflowChannel, modelId);
  const workflowConfigTitle = [
    workflowConfiguredAgent?.name,
    workflowChannel?.label,
    workflowModel?.label ?? workflowConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID,
    runtimeStatus(workflowRuntime),
  ]
    .filter(Boolean)
    .join(" · ");
  const runProgressByNodeId = new Map(runProgress.map((item) => [item.nodeId, item]));
  const runProgressVisible = runProgress.length > 0;
  const contextDocumentVisible = contextDocument.trim().length > 0;
  const finalReportVisible = finalReport.trim().length > 0;
  const runProgressSignature = runProgress.map((item) => `${item.nodeId}:${item.status}`).join("|");
  const graphVisible = graphReady || runProgressVisible || contextDocumentVisible || finalReportVisible;
  const workflowDisplayTitle = title?.trim() || (graphReady ? graph.title : "New workflow");
  const composerValue = workflowStarted ? reply : objective;
  const composerPlaceholder = workflowStarted
    ? graphVisible
      ? workflowText.modifyPlaceholder
      : workflowText.answerPlaceholder
    : workflowText.taskPlaceholder;
  const composerCanSend = Boolean(composerValue.trim()) && !running;
  const composerLocked = workflowStarted || running;
  const [graphExpanded, setGraphExpanded] = useState(defaultGraphExpanded);
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>({});
  const [interventionReasons, setInterventionReasons] = useState<Record<string, string>>({});
  const [interventionPendingNodeId, setInterventionPendingNodeId] = useState<string | undefined>(undefined);
  const [outputFiles, setOutputFiles] = useState<Array<{ name: string; path: string }>>([]);
  const [editingWorkflowNodeId, setEditingWorkflowNodeId] = useState<string | undefined>(undefined);
  const [openNodeAgentNodeId, setOpenNodeAgentNodeId] = useState<string | undefined>(undefined);
  const [filePreview, setFilePreview] = useState<LocalFilePreview | undefined>(undefined);
  const [filePreviewError, setFilePreviewError] = useState<string | undefined>(undefined);
  const [filePreviewLoadingPath, setFilePreviewLoadingPath] = useState<string | undefined>(undefined);
  const outputDocuments = outputFiles.map((file) => ({ path: file.path, title: file.name }));
  const outputDocumentsVisible = outputDocuments.length > 0;
  const grillTranscriptRef = useRef<HTMLElement>(null);
  const grillStickRef = useRef(true);
  const editingWorkflowNode = graph.nodes.find((node) => node.id === editingWorkflowNodeId);
  const openNodeConversation = nodeConversations.find((conversation) => conversation.nodeId === openNodeAgentNodeId);
  const openNodeConversationGraphNode = graph.nodes.find((node) => node.id === openNodeAgentNodeId);
  const openNodeTaskId = openNodeAgentNodeId ? runProgressByNodeId.get(openNodeAgentNodeId)?.taskId : undefined;
  const openNodeTask = nodeTasks.find((task) => task.id === openNodeTaskId);
  const nodePositionProps = topologyLocked
    ? {}
    : { onNodePositionChange: (nodeId: string, position: { x: number; y: number }) => onUpdateNode(nodeId, { position }) };

  useEffect(() => {
    const waitingConversation = nodeConversations.find((conversation) => conversation.status === "waiting_for_user" || conversation.status === "active");
    if (waitingConversation && !openNodeAgentNodeId) setOpenNodeAgentNodeId(waitingConversation.nodeId);
  }, [nodeConversations, openNodeAgentNodeId]);

  useEffect(() => {
    const transcript = grillTranscriptRef.current;
    if (!transcript || !grillStickRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);

  // List actual files in the workflow's outputs directory, so produced documents
  // are always visible regardless of run state (not scraped from run text).
  useEffect(() => {
    if (typeof onListOutputs !== "function") {
      setOutputFiles([]);
      return;
    }
    let cancelled = false;
    void onListOutputs()
      .then((files) => {
        if (!cancelled) setOutputFiles(files);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, status, finalReport, runProgressSignature]);

  useEffect(() => {
    if (!graphExpanded) return;
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        setEditingWorkflowNodeId(undefined);
        setGraphExpanded(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [graphExpanded]);

  useEffect(() => {
    if (!graphExpanded) setEditingWorkflowNodeId(undefined);
  }, [graphExpanded]);

  useEffect(() => {
    if (!filePreview) return;
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") setFilePreview(undefined);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filePreview]);

  function handleGrillTranscriptScroll(): void {
    const transcript = grillTranscriptRef.current;
    if (!transcript) return;
    grillStickRef.current = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
  }

  async function openOutputDocument(filePath: string): Promise<void> {
    if (!onReadOutputFile) {
      setFilePreviewError("当前环境不支持应用内文件预览。");
      return;
    }
    setFilePreviewError(undefined);
    setFilePreviewLoadingPath(filePath);
    try {
      setFilePreview(await onReadOutputFile(filePath));
    } catch (error) {
      setFilePreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setFilePreviewLoadingPath(undefined);
    }
  }

  function renderWorkflowNodeCard(node: WorkflowV2Node, compact: boolean): ReactElement {
    const nodeRunProgress = runProgressByNodeId.get(node.id);
    const nodeAgentId = configuredAgentId;
    const nodeAgentConfig = configuredAgentById(nodeAgentId, configuredAgents);
    const nodeAgentName = nodeAgentConfig?.name || nodeAgentId || "default";
    const nodeModelId = node.execModel === "llm" ? node.modelProfile ?? modelId : "script";
    const nodeAgentRow =
      node.execModel === "llm" ? (
        <div className="workflow-node-agent-row" title={`Agent: ${nodeAgentName} · Model: ${nodeModelId}`}>
          <span className="workflow-node-agent-name">{nodeAgentName}</span>
          <span className="workflow-node-agent-model">{nodeModelId}</span>
        </div>
      ) : null;

    const NodeKindIcon = node.execModel === "script" ? FileInput : Bot;
    const openNodeEditor = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const executionMode = node.executionMode ?? workflowV2Plan?.nodes.find((candidate) => candidate.nodeId === node.id)?.executionMode;
      if (node.execModel === "llm" && (Boolean(activeRunId) || executionMode === "interactive" || nodeConversations.some((candidate) => candidate.nodeId === node.id))) {
        setOpenNodeAgentNodeId(node.id);
        return;
      }
      setEditingWorkflowNodeId(node.id);
    };
    const cardHead = (
      <div className="workflow-graph-card-head">
        <span className="workflow-node-type-icon" data-kind={node.execModel} aria-hidden="true">
          <NodeKindIcon size={15} strokeWidth={2.2} />
        </span>
        <div className="workflow-graph-card-headings">
          <span className="workflow-node-type-label">{node.execModel}</span>
          <strong>{node.title}</strong>
        </div>
        {nodeRunProgress ? <em className={`workflow-node-run-pill is-${nodeRunProgress.status}`}>{workflowRunStatusLabel(nodeRunProgress.status)}</em> : null}
      </div>
    );

    if (compact) {
      return (
        <article
          className={`workflow-graph-card workflow-canvas-node-card is-${node.execModel} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`}
          onClick={openNodeEditor}
          onContextMenu={openNodeEditor}
          title="Click to view details"
        >
          {cardHead}
          {nodeAgentRow}
          {nodeRunProgress?.detail ? <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div> : null}
        </article>
      );
    }

    return (
      <article
        className={`workflow-graph-card workflow-canvas-node-card workflow-expanded-node-card is-${node.execModel} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`}
        onClick={openNodeEditor}
        onContextMenu={openNodeEditor}
        title="Click to view details"
      >
        {cardHead}
        {nodeAgentRow}
        {nodeRunProgress?.detail ? <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div> : null}
      </article>
    );
  }

  function renderWorkflowNodeEditor(node: WorkflowGraphNode): ReactElement {
    const disabled = running;
    const editorAgentId = node.configuredAgentId || configuredAgentId;
    const editorAgentConfig = configuredAgentById(editorAgentId, configuredAgents);
    const editorAgentName = editorAgentConfig?.name || editorAgentId || "default";
    const editorModelId = node.modelId || (node.configuredAgentId ? editorAgentConfig?.modelId : modelId) || modelId;
    const upstreamTitles = graph.edges
      .filter((edge) => edge.toNodeId === node.id)
      .map((edge) => graph.nodes.find((item) => item.id === edge.fromNodeId))
      .filter((item): item is WorkflowGraphNode => Boolean(item && item.kind === "agent"))
      .map((item) => item.title);

    return (
      <section className="workflow-node-edit-overlay" role="dialog" aria-modal="true" aria-label="Edit workflow node" onClick={() => setEditingWorkflowNodeId(undefined)}>
        <article className="workflow-node-edit-modal" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
          <header>
            <div>
              <strong>{node.title}</strong>
              <span>{node.kind === "agent" ? "Agent node" : node.kind === "start" ? "Start node" : "End node"}</span>
            </div>
            <button className="icon-btn" type="button" onClick={() => setEditingWorkflowNodeId(undefined)} aria-label="Close workflow node editor">
              <X size={15} />
            </button>
          </header>
          <label className="workflow-node-edit-field">
            <span>Title</span>
            <input aria-label={`Node ${node.id} title`} value={node.title} disabled={disabled || topologyLocked} onChange={(event) => onUpdateNode(node.id, { title: event.currentTarget.value })} />
          </label>
          {node.kind === "agent" ? (
            <label className="workflow-node-edit-field">
              <span>Prompt</span>
              <textarea
                aria-label={`Node ${node.id} prompt`}
                value={node.prompt}
                disabled={disabled}
                onChange={(event) => onUpdateNode(node.id, { prompt: event.currentTarget.value })}
                rows={8}
              />
            </label>
          ) : null}
          {node.kind === "agent" ? (
            <label className="workflow-node-edit-field">
              <span>{workflowText.nodeAgentField}</span>
              <select
                aria-label={`Node ${node.id} agent`}
                value={node.configuredAgentId ?? ""}
                disabled={disabled}
                onChange={(event) => onUpdateNode(node.id, { configuredAgentId: event.currentTarget.value || undefined })}
              >
                <option value="">{`${workflowText.nodeAgentDefault}（${configuredAgentById(configuredAgentId, configuredAgents)?.name || configuredAgentId || "default"}）`}</option>
                {configuredAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {node.kind === "agent" ? (
            <div className="workflow-node-edit-info" aria-label="Node runtime inputs and outputs">
              <div className="workflow-node-edit-info-row">
                <span>{workflowText.nodeInfoAgent}</span>
                <strong>{editorAgentName} · {editorModelId}</strong>
              </div>
              <div className="workflow-node-edit-info-row">
                <span>{workflowText.nodeInfoObjective}</span>
                <strong>{objective || "—"}</strong>
              </div>
              <div className="workflow-node-edit-info-row">
                <span>{workflowText.nodeInfoInputs}</span>
                <strong>{upstreamTitles.length > 0 ? upstreamTitles.join("、") : workflowText.nodeInfoNoUpstream}</strong>
              </div>
              <div className="workflow-node-edit-info-row">
                <span>{workflowText.nodeInfoOutput}</span>
                <strong>{workflowText.nodeInfoOutputValue}</strong>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <>
      <header className="chat-header workflow-chat-header">
        <div className="chat-title-block">
          <h2>{workflowDisplayTitle}</h2>
          <div className="chat-subtitle">
            <span className={`agent-badge mini ${agentAccent(workflowRuntimeId)}`} title={workflowConfigTitle}>
              {workflowConfiguredAgent?.name || agentLabel(workflowRuntimeId)}
            </span>
            <span>{graphVisible ? `${definition?.nodes.length ?? 0} ${workflowText.executableNodes}` : status}</span>
            <button
              type="button"
              className="workflow-workdir-button"
              onClick={() => void onChooseWorkDir()}
              disabled={running}
              title={workDir || workflowText.noWorkDir}
            >
              {workDir || workflowText.noWorkDir}
            </button>
          </div>
        </div>
        <div className="chat-header-actions workflow-page-actions">
          {running && !graphVisible ? (
            <button className="icon-btn danger" onClick={() => onStopGrill()} title="Stop agent">
              <CircleStop size={14} />
            </button>
          ) : null}
          {graphVisible ? (
            running && activeRunId && onStopRun ? (
              <button className="control-btn danger" onClick={() => { if (window.confirm("Stop this workflow run? Completed work and history will be preserved, but this run cannot resume.")) void onStopRun(); }}>
                <CircleStop size={14} />
                <span>Stop workflow</span>
              </button>
            ) : (
              <button className="send-btn" onClick={() => void onRunGraph()} disabled={!validation.valid || running}>
                <Play size={14} />
                <span>{workflowText.runGraph}</span>
              </button>
            )
          ) : null}
        </div>
      </header>

      <section className="cli-transcript workflow-transcript" aria-label="Workflow transcript" ref={grillTranscriptRef} onScroll={handleGrillTranscriptScroll}>
        {!workflowStarted && !graphVisible ? (
          <div className="empty-state terminal-empty">
            <GitBranch size={17} />
            <span>{workflowText.empty}</span>
          </div>
        ) : workflowStarted ? (
          messages.map((message) => (
            <div key={message.id} className={`cli-message ${message.role}`}>
              <div className="cli-agent-line">
                {message.role === "assistant" ? <span className={`runtime-dot ${agentAccent(workflowRuntimeId)}`} /> : null}
                <span>{message.role === "assistant" ? "Workflow agent" : "You"}</span>
              </div>
              {message.role === "user" ? (
                <div className="cli-markdown">
                  <Markdown text={message.content} />
                </div>
              ) : (
                <div className={`cli-markdown ${running && message.content === WORKFLOW_THINKING_MESSAGE ? "is-streaming" : ""}`}>
                  <Markdown text={workflowAssistantDisplayContent(message.content)} />
                  {running && message.content === WORKFLOW_THINKING_MESSAGE ? <span className="stream-cursor" aria-hidden="true" /> : null}
                </div>
              )}
            </div>
          ))
        ) : null}
        {running && !graphVisible ? (
          <div className="cli-status-line">
            <span className="stream-pill">
              <span className="stream-spinner" aria-hidden="true" />
              <span>{`${workflowConfiguredAgent?.name || agentLabel(workflowRuntimeId)} ${workflowText.agentWorking}`}</span>
            </span>
          </div>
        ) : null}
        {error ? <div className="workflow-error workflow-inline-error">{error}</div> : null}
        {graphVisible ? (
          <section className="workflow-result-card" aria-label={workflowText.result}>
            <div className="workflow-result-card-head">
              <div>
                <strong>{graph.title}</strong>
                <span>{validation.valid ? workflowText.dagValid : workflowText.dagInvalid}</span>
              </div>
              <div className="workflow-validation-row-actions">
                <TaskStatusChip label={validation.valid ? workflowText.ready : workflowText.invalid} tone={validation.valid ? "done" : "failed"} />
                <button className="icon-btn flat" onClick={() => setGraphExpanded(true)} title="Expand graph board" aria-label="Expand workflow graph board">
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            {validation.errors.length > 0 ? (
              <div className="workflow-validation-errors">
                {validation.errors.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            ) : null}
            {graphExpanded ? (
              <>
                <div className="workflow-graph-backdrop" onClick={() => setGraphExpanded(false)} />
                <button className="workflow-graph-close icon-btn" onClick={() => setGraphExpanded(false)} title="Close graph board" aria-label="Close workflow graph board">
                  <X size={15} />
                </button>
                {definition ? <WorkflowCanvasBoard definition={definition} expanded renderNodeCard={(node) => renderWorkflowNodeCard(node, false)} /> : null}
                {editingWorkflowNode ? renderWorkflowNodeEditor(editingWorkflowNode) : null}
              </>
            ) : (
              definition ? <WorkflowCanvasBoard definition={definition} runProgressByNodeId={runProgressByNodeId} onExpand={() => setGraphExpanded(true)} renderNodeCard={(node) => renderWorkflowNodeCard(node, true)} /> : null
            )}
            {runProgressVisible ? (
              <section className="workflow-run-progress" aria-label={workflowText.runProgress}>
                <div className="workflow-run-progress-head">
                  <strong>{workflowText.runProgress}</strong>
                  <span>{workflowRunProgressSummary(runProgress)}</span>
                </div>
                <div className="workflow-run-progress-list">
                  {runProgress.map((item) => {
                    const controllable = Boolean(activeRunId);
                    const canPause = controllable && item.status === "running" && typeof onPauseNode === "function";
                    const canStart = controllable
                      && (item.status === "paused" || item.status === "failed")
                      && !item.intervention
                      && typeof onStartNode === "function";
                    return (
                      <div key={item.nodeId} className={`workflow-run-progress-item is-${item.status}`}>
                        <span>{workflowRunStatusLabel(item.status)}</span>
                        <strong>{item.title}</strong>
                        {item.detail ? <small>{item.detail}</small> : null}
                        {canPause ? (
                          <button
                            type="button"
                            className="workflow-node-control icon-btn"
                            onClick={() => void onPauseNode?.(item.nodeId)}
                            title={workflowText.pauseNode}
                            aria-label={`${workflowText.pauseNode}: ${item.title}`}
                          >
                            <CircleStop size={14} />
                          </button>
                        ) : null}
                        {canStart ? (
                          <button
                            type="button"
                            className="workflow-node-control icon-btn"
                            onClick={() => void onStartNode?.(item.nodeId)}
                            title={workflowText.startNode}
                            aria-label={`${workflowText.startNode}: ${item.title}`}
                          >
                            <Play size={14} />
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {runProgress
                  .filter((item) => item.status === "paused" && item.intervention && typeof onResolveIntervention === "function")
                  .map((item) => {
                    const intervention = item.intervention!;
                    const reason = interventionReasons[item.nodeId] ?? "";
                    const resolve = async (action: WorkflowV2InterventionAction): Promise<void> => {
                      setInterventionPendingNodeId(item.nodeId);
                      try {
                        await onResolveIntervention?.(item.nodeId, action, reason);
                        setInterventionReasons((current) => ({ ...current, [item.nodeId]: "" }));
                      } finally {
                        setInterventionPendingNodeId(undefined);
                      }
                    };
                    return (
                      <div key={`intervention-${item.nodeId}`} className="workflow-intervention-panel">
                        <div className="workflow-gate-panel-head">
                          <span className="workflow-gate-panel-badge">{workflowRunStatusLabel("paused")}</span>
                          <strong>{item.title}</strong>
                        </div>
                        <p className="workflow-gate-panel-question">{intervention.reason}</p>
                        <textarea
                          className="workflow-gate-panel-input"
                          value={reason}
                          placeholder={workflowText.interventionReasonPlaceholder}
                          rows={2}
                          onChange={(event) => setInterventionReasons((current) => ({
                            ...current,
                            [item.nodeId]: event.target.value,
                          }))}
                        />
                        <div className="workflow-intervention-actions">
                          {intervention.allowedActions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="workflow-node-gate-submit"
                              disabled={interventionPendingNodeId === item.nodeId}
                              onClick={() => void resolve(action)}
                            >
                              {WORKFLOW_INTERVENTION_ACTION_TEXT[language][action]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                {runProgress
                  .filter((item) => item.status === "awaiting_input" && typeof onAnswerGate === "function")
                  .map((item) => {
                    const gateDraft = gateAnswers[item.nodeId] ?? "";
                    const submitGate = (): void => {
                      const answer = gateDraft.trim();
                      if (!answer) return;
                      void onAnswerGate?.(item.nodeId, answer);
                      setGateAnswers((current) => ({ ...current, [item.nodeId]: "" }));
                    };
                    return (
                      <div key={`gate-${item.nodeId}`} className="workflow-gate-panel">
                        <div className="workflow-gate-panel-head">
                          <span className="workflow-gate-panel-badge">{workflowRunStatusLabel("awaiting_input")}</span>
                          <strong>{item.title}</strong>
                        </div>
                        {item.detail ? <p className="workflow-gate-panel-question">{item.detail}</p> : null}
                        <textarea
                          className="workflow-gate-panel-input"
                          value={gateDraft}
                          placeholder={workflowText.gateAnswerPlaceholder}
                          rows={3}
                          onChange={(event) => setGateAnswers((current) => ({ ...current, [item.nodeId]: event.target.value }))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                              event.preventDefault();
                              submitGate();
                            }
                          }}
                        />
                        <div className="workflow-gate-panel-actions">
                          <button type="button" className="workflow-node-gate-submit" onClick={submitGate} disabled={!gateDraft.trim()}>
                            {workflowText.gateSubmit}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </section>
            ) : null}
            {runProgressVisible ? <section className="workflow-leader-activity" aria-label="Leader Activity">
              <header><strong>Leader Activity</strong><span>{runProgress.some((item) => item.status === "failed") ? "blocked" : runProgress.some((item) => item.status === "paused" || item.status === "awaiting_input") ? "at-risk" : "healthy"}</span></header>
              <div><b>Priorities</b><p>{runProgress.filter((item) => item.status === "running" || item.status === "queued").map((item) => item.title).join(" ? ") || "No runnable priority"}</p></div>
              <div><b>Blocked / user action</b><p>{runProgress.filter((item) => item.status === "paused" || item.status === "awaiting_input").map((item) => `${item.title}: ${item.detail || "waiting for input"}`).join(" ? ") || "None"}</p></div>
            </section> : null}
            {finalReportVisible ? (
              <section className="workflow-final-report" aria-label="Workflow final report">
                <div className="workflow-final-report-head">
                  <strong>{workflowText.finalReport}</strong>
                  <span>{workflowText.completed}</span>
                </div>
                <div className="workflow-final-report-body">
                  <Markdown text={finalReport} />
                </div>
              </section>
            ) : null}
            {artifacts.length > 0 ? (
              <section className="workflow-output-documents" aria-label="Registered artifacts">
                <div className="workflow-output-documents-head">
                  <strong>{workflowText.registeredArtifacts}</strong>
                  <span>{`${artifacts.length} ${workflowText.files}`}</span>
                </div>
                <div className="workflow-output-document-list">
                  {artifacts.map((artifact) =>
                    artifact.kind === "file" && artifact.path ? (
                      <button
                        key={artifact.id}
                        className="workflow-output-document"
                        onClick={() => void openOutputDocument(artifact.path as string)}
                        disabled={filePreviewLoadingPath === artifact.path}
                        title={artifact.description || artifact.path}
                      >
                        <FileInput size={14} />
                        <span>{artifact.title}</span>
                        <small>{artifact.description || artifact.path}</small>
                      </button>
                    ) : artifact.kind === "url" && artifact.url ? (
                      <a
                        key={artifact.id}
                        className="workflow-output-document"
                        href={artifact.url}
                        target="_blank"
                        rel="noreferrer"
                        title={artifact.description || artifact.url}
                      >
                        <FileInput size={14} />
                        <span>{artifact.title}</span>
                        <small>{artifact.description || artifact.url}</small>
                      </a>
                    ) : (
                      <div key={artifact.id} className="workflow-output-document" title={artifact.description || artifact.title}>
                        <FileInput size={14} />
                        <span>{artifact.title}</span>
                        {artifact.description ? <small>{artifact.description}</small> : null}
                      </div>
                    ),
                  )}
                </div>
              </section>
            ) : null}
            {outputDocumentsVisible ? (
              <section className="workflow-output-documents" aria-label="Workflow output documents">
                <div className="workflow-output-documents-head">
                  <strong>{workflowText.outputDocuments}</strong>
                  <span>{`${outputDocuments.length} ${workflowText.files}`}</span>
                </div>
                <div className="workflow-output-document-list">
                  {outputDocuments.map((document) => (
                    <button
                      key={document.path}
                      className="workflow-output-document"
                      onClick={() => void openOutputDocument(document.path)}
                      disabled={filePreviewLoadingPath === document.path}
                      title={document.path}
                    >
                      <FileInput size={14} />
                      <span>{document.title}</span>
                      <small>{filePreviewLoadingPath === document.path ? workflowText.loading : document.path}</small>
                    </button>
                  ))}
                </div>
                {filePreviewError ? <div className="workflow-error">{filePreviewError}</div> : null}
              </section>
            ) : null}
          </section>
        ) : null}
      </section>

      {filePreview ? (
        <section className="workflow-file-preview-overlay" role="dialog" aria-modal="true" aria-label="Workflow output document preview" onClick={() => setFilePreview(undefined)}>
          <article className="workflow-file-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>{filePreview.title}</strong>
                <span>{filePreview.path}</span>
              </div>
              <button className="icon-btn" onClick={() => setFilePreview(undefined)} title={workflowText.closePreview} aria-label={workflowText.closePreview}>
                <X size={15} />
              </button>
            </header>
            {filePreview.truncated ? <div className="workflow-file-preview-note">{workflowText.largeFile}</div> : null}
            <div className="workflow-file-preview-content">
              {/\.html?$/i.test(filePreview.path) ? (
                <iframe className="workflow-file-preview-frame" title={filePreview.title} sandbox="" srcDoc={filePreview.content} />
              ) : isMarkdownFilePath(filePreview.path) ? (
                <MarkdownDocument className="workflow-file-preview-body" text={filePreview.content} />
              ) : (
                <pre>{filePreview.content}</pre>
              )}
            </div>
          </article>
        </section>
      ) : null}

      {openNodeConversationGraphNode ? <WorkflowNodeAgentWindow
        {...(openNodeConversation ? { conversation: openNodeConversation } : {})}
        {...(openNodeTask ? { task: openNodeTask } : {})}
        nodeTitle={openNodeConversationGraphNode.title}
        onClose={() => setOpenNodeAgentNodeId(undefined)}
        {...(onSendNodeMessage && openNodeConversation ? { onSend: (message: string) => onSendNodeMessage(openNodeConversation.conversationId, message) } : {})}
        {...(onCompleteNodeConversation && openNodeConversation ? { onConfirm: () => onCompleteNodeConversation(openNodeConversation.conversationId) } : {})}
        {...(onRejectNodeCompletion && openNodeConversation ? { onReject: (instruction: string) => onRejectNodeCompletion(openNodeConversation.conversationId, instruction) } : {})}
        {...(onInterruptNodeConversation && openNodeConversation ? { onInterrupt: () => onInterruptNodeConversation(openNodeConversation.conversationId) } : {})}
      /> : null}

      <section className="composer workflow-composer">
        <div className="composer-box">
          <textarea
            aria-label={workflowStarted ? (graphVisible ? workflowText.replyToAgent : workflowText.replyToQuestion) : workflowText.task}
            value={composerValue}
            onChange={(event) => {
              if (workflowStarted) onReplyChange(event.currentTarget.value);
              else onObjectiveChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (shouldSendComposerKey({
                key: event.key,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                isComposing: event.nativeEvent.isComposing,
              })) {
                event.preventDefault();
                if (composerCanSend) void onSendReply();
              }
            }}
            placeholder={composerPlaceholder}
            rows={2}
          />
          <div className="composer-footer">
            <ChatControls
              configuredAgentId={configuredAgentId}
              modelId={modelId}
              configuredAgents={configuredAgents}
              channels={channels}
              locked={composerLocked}
              running={running}
              workDir={workDir}
              runtimes={runtimes}
              onSelectConfiguredAgent={onSelectConfiguredAgent}
              onSelectModel={onSelectModel}
              onChooseWorkDir={onChooseWorkDir}
            />
            <div className="workflow-composer-actions">
              {!graphVisible && grillComplete ? (
                <button className="control-btn compact secondary" onClick={onDraftGraph} disabled={running}>
                  <Wand2 size={14} />
                  <span>Generate Graph</span>
                </button>
              ) : null}
              <button className="send-btn" onClick={onSendReply} disabled={!composerCanSend}>
                <Send size={14} />
                <span>{running ? "Running" : workflowStarted ? "Send" : "Start"}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="composer-hint">
          <kbd>↵</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · {graphVisible ? "继续对话可修改 workflow" : "先对话生成 workflow"}
        </div>
      </section>
    </>
  );
}
