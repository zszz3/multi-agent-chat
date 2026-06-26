import { useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";
import { Bot, CircleStop, FileInput, GitBranch, Maximize2, Play, Send, Wand2, X } from "lucide-react";
import { DEFAULT_MODEL_ID } from "../../../../shared/models";
import { WORKFLOW_TOTAL_QUESTION_COUNT } from "../../../../shared/workflow-agent";
import { validateWorkflowGraph } from "../../../../shared/workflow-graph";
import type {
  AgentChannel,
  AgentRuntime,
  ConfiguredAgent,
  LocalFilePreview,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowGrillMessage,
  WorkflowRunProgressItem,
  WorkflowStatus,
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
import {
  WORKFLOW_THINKING_MESSAGE,
  extractWorkflowOutputDocumentsForPlan,
  isMarkdownFilePath,
  truncateWorkflowContext,
  workflowAssistantDisplayContent,
  workflowRunProgressSummary,
  workflowRunStatusLabel,
  workflowStoragePlanFor,
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
    finalReport: "主 Agent 总结",
    completed: "工作流已完成",
    outputDocuments: "产出文档",
    files: "个文件",
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
    finalReport: "Main agent summary",
    completed: "Workflow completed",
    outputDocuments: "Output documents",
    files: "files",
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

interface WorkflowPageProps {
  workflowId?: string;
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
  contextDocument?: string;
  finalReport?: string;
  onObjectiveChange: (value: string) => void;
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
  onRefresh?: () => MaybePromise;
  onReadOutputFile?: (filePath: string) => Promise<LocalFilePreview>;
  language?: Language;
  defaultGraphExpanded?: boolean;
}

export function WorkflowPage({
  workflowId,
  title,
  status = "draft",
  graph,
  graphReady,
  objective,
  messages,
  reply,
  error,
  configuredAgentId,
  modelId = DEFAULT_MODEL_ID,
  runtimes,
  channels,
  configuredAgents = [],
  workDir,
  running,
  runProgress = [],
  contextDocument = "",
  finalReport = "",
  onObjectiveChange,
  onSelectConfiguredAgent,
  onSelectModel = () => undefined,
  onDraftGraph,
  onReplyChange,
  onSendReply,
  onUpdateNode,
  onRunGraph,
  onResetSession,
  onStopGrill = () => undefined,
  onChooseWorkDir = () => undefined,
  onRefresh = () => undefined,
  onReadOutputFile,
  language = "en",
  defaultGraphExpanded = false,
}: WorkflowPageProps) {
  const workflowText = WORKFLOW_TEXT[language];
  const validation = validateWorkflowGraph(graph);
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
  const outputDocuments = workflowId
    ? extractWorkflowOutputDocumentsForPlan(
        workflowStoragePlanFor(workflowId),
        finalReport,
        contextDocument,
        messages.map((message) => message.content).join("\n\n"),
      )
    : [];
  const outputDocumentsVisible = outputDocuments.length > 0;
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
  const [editingWorkflowNodeId, setEditingWorkflowNodeId] = useState<string | undefined>(undefined);
  const [filePreview, setFilePreview] = useState<LocalFilePreview | undefined>(undefined);
  const [filePreviewError, setFilePreviewError] = useState<string | undefined>(undefined);
  const [filePreviewLoadingPath, setFilePreviewLoadingPath] = useState<string | undefined>(undefined);
  const grillTranscriptRef = useRef<HTMLElement>(null);
  const grillStickRef = useRef(true);
  const editingWorkflowNode = graph.nodes.find((node) => node.id === editingWorkflowNodeId);

  useEffect(() => {
    const transcript = grillTranscriptRef.current;
    if (!transcript || !grillStickRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);

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

  function renderWorkflowNodeCard(node: WorkflowGraphNode, compact: boolean): ReactElement {
    const nodeRunProgress = runProgressByNodeId.get(node.id);
    const nodeMeta = node.kind === "agent" ? (
      <div className="workflow-node-meta-row">
        <span>{truncateWorkflowContext(node.prompt || "No node prompt.", compact ? 80 : 140)}</span>
      </div>
    ) : null;

    const NodeKindIcon = node.kind === "start" ? Play : node.kind === "end" ? CircleStop : Bot;
    const openNodeEditor = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setEditingWorkflowNodeId(node.id);
    };
    const cardHead = (
      <div className="workflow-graph-card-head">
        <span className="workflow-node-type-icon" data-kind={node.kind} aria-hidden="true">
          <NodeKindIcon size={15} strokeWidth={2.2} />
        </span>
        <div className="workflow-graph-card-headings">
          <span className="workflow-node-type-label">{node.kind}</span>
          <strong>{node.title}</strong>
        </div>
        {nodeRunProgress ? <em className={`workflow-node-run-pill is-${nodeRunProgress.status}`}>{workflowRunStatusLabel(nodeRunProgress.status)}</em> : null}
      </div>
    );

    if (compact) {
      return (
        <article
          className={`workflow-graph-card workflow-canvas-node-card is-${node.kind} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`}
          onContextMenu={openNodeEditor}
        >
          {cardHead}
          {nodeMeta}
          {nodeRunProgress?.detail ? <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div> : null}
        </article>
      );
    }

    return (
      <article
        className={`workflow-graph-card workflow-canvas-node-card workflow-expanded-node-card is-${node.kind} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`}
        onContextMenu={openNodeEditor}
      >
        {cardHead}
        {nodeMeta}
        {nodeRunProgress?.detail ? <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div> : null}
      </article>
    );
  }

  function renderWorkflowNodeEditor(node: WorkflowGraphNode): ReactElement {
    const disabled = running;

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
            <input aria-label={`Node ${node.id} title`} value={node.title} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { title: event.currentTarget.value })} />
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
            <span>{graphVisible ? `${validation.executableNodeIds.length} ${workflowText.executableNodes}` : status}</span>
            <span>{workDir || workflowText.noWorkDir}</span>
          </div>
        </div>
        <div className="chat-header-actions workflow-page-actions">
          {running && !graphVisible ? (
            <button className="icon-btn danger" onClick={() => onStopGrill()} title="Stop agent">
              <CircleStop size={14} />
            </button>
          ) : null}
          {graphVisible ? (
            <button className="send-btn" onClick={() => void onRunGraph()} disabled={!validation.valid || running}>
              <Play size={14} />
              <span>{running ? workflowText.running : workflowText.runGraph}</span>
            </button>
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
        {running ? (
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
            {runProgressVisible ? (
              <section className="workflow-run-progress" aria-label={workflowText.runProgress}>
                <div className="workflow-run-progress-head">
                  <strong>{workflowText.runProgress}</strong>
                  <span>{workflowRunProgressSummary(runProgress)}</span>
                </div>
                <div className="workflow-run-progress-list">
                  {runProgress.map((item) => (
                    <div key={item.nodeId} className={`workflow-run-progress-item is-${item.status}`}>
                      <span>{workflowRunStatusLabel(item.status)}</span>
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
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
            {graphExpanded ? (
              <>
                <div className="workflow-graph-backdrop" onClick={() => setGraphExpanded(false)} />
                <button className="workflow-graph-close icon-btn" onClick={() => setGraphExpanded(false)} title="Close graph board" aria-label="Close workflow graph board">
                  <X size={15} />
                </button>
                <WorkflowCanvasBoard graph={graph} expanded onNodePositionChange={(nodeId, position) => onUpdateNode(nodeId, { position })} renderNodeCard={(node) => renderWorkflowNodeCard(node, false)} />
                {editingWorkflowNode ? renderWorkflowNodeEditor(editingWorkflowNode) : null}
              </>
            ) : (
              <WorkflowCanvasBoard graph={graph} runProgressByNodeId={runProgressByNodeId} onExpand={() => setGraphExpanded(true)} onNodePositionChange={(nodeId, position) => onUpdateNode(nodeId, { position })} renderNodeCard={(node) => renderWorkflowNodeCard(node, true)} />
            )}
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
              {isMarkdownFilePath(filePreview.path) ? <MarkdownDocument className="workflow-file-preview-body" text={filePreview.content} /> : <pre>{filePreview.content}</pre>}
            </div>
          </article>
        </section>
      ) : null}

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
              onRefresh={onRefresh}
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
