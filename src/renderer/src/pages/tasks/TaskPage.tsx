import { useState, type DragEvent, type KeyboardEvent } from "react";
import { CircleStop, Play, Trash2, Wand2, X } from "lucide-react";
import { Markdown } from "../../Markdown";
import {
  agentAccent,
  agentLabel,
  configuredAgentById,
  configuredAgentModel,
  configuredAgentRuntimeId,
  resolveConfiguredAgentChannel,
} from "../../app/agents";
import { shouldSendComposerKey } from "../../app/composer";
import { formatTime } from "../../app/format";
import { ChatControls } from "../chat/ChatControls";
import { MetaMessage, chatEventDisplayContent } from "../chat/chat-event-display";
import { MarkdownDocument } from "../../ui/MarkdownDocument";
import { TASK_STATUS_FILTERS, TaskMeta, TaskStatusChip, taskProgressLabel } from "./task-status";
import { DEFAULT_MODEL_ID } from "../../../../shared/models";
import type { AgentChannel, AgentId, AgentRuntime, ChatMessage, ConfiguredAgent, TaskProgress, TaskRun } from "../../../../shared/types";

type MaybePromise = void | Promise<void>;

interface TaskPageProps {
  tasks: TaskRun[];
  activeTaskId?: string | undefined;
  prompt: string;
  configuredAgentId: string;
  modelId?: string;
  configuredAgents: ConfiguredAgent[];
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  onPromptChange: (value: string) => void;
  onSelectConfiguredAgent: (configuredAgentId: string) => MaybePromise;
  onSelectModel?: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRunTask: () => MaybePromise;
  onRerunTask: (task: TaskRun) => MaybePromise;
  onSelectTask: (taskId: string) => MaybePromise;
  onCloseTaskDetail: () => void;
  onStopTask: (taskId: string) => MaybePromise;
  onDeleteTask: (taskId: string) => MaybePromise;
  onUpdateTaskProgress: (taskId: string, progress: TaskProgress) => MaybePromise;
}

export function TaskPage({
  tasks,
  activeTaskId,
  prompt,
  configuredAgentId,
  modelId = DEFAULT_MODEL_ID,
  configuredAgents,
  workDir,
  runtimes,
  channels,
  onPromptChange,
  onSelectConfiguredAgent,
  onSelectModel = () => undefined,
  onChooseWorkDir,
  onRunTask,
  onRerunTask,
  onSelectTask,
  onCloseTaskDetail,
  onStopTask,
  onDeleteTask,
  onUpdateTaskProgress,
}: TaskPageProps) {
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const activeTaskConfiguredAgent = activeTask ? configuredAgentById(activeTask.configuredAgentId, configuredAgents) : undefined;
  const activeChannel = resolveConfiguredAgentChannel(activeTaskConfiguredAgent, channels);
  const activeRuntimeId = configuredAgentRuntimeId(activeTaskConfiguredAgent, activeChannel);
  const activeModel = configuredAgentModel(activeTaskConfiguredAgent, activeChannel, activeTask?.modelId);
  const canRun = Boolean(prompt.trim());
  const [draggingTaskId, setDraggingTaskId] = useState<string | undefined>();
  const kanbanColumns = TASK_STATUS_FILTERS.filter((filter): filter is { id: TaskProgress; label: string } => filter.id !== "all");

  function startTaskDrag(event: DragEvent<HTMLElement>, taskId: string): void {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multi-agent-task", taskId);
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  }

  function dropTaskOnProgress(event: DragEvent<HTMLElement>, progress: TaskProgress): void {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("application/x-multi-agent-task") || event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === taskId);
    setDraggingTaskId(undefined);
    if (!task || task.progress === progress) return;
    void onUpdateTaskProgress(task.id, progress);
  }

  return (
    <section className="tasks-page">
      <section className="task-board-shell">
        <section className="task-kanban-board" aria-label="Task board">
          {kanbanColumns.map((column) => {
            const columnTasks = tasks.filter((task) => task.progress === column.id);
            return (
              <section
                key={column.id}
                className={`task-kanban-column ${draggingTaskId ? "is-drop-ready" : ""}`}
                data-progress={column.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => dropTaskOnProgress(event, column.id)}
              >
                <div className="task-kanban-column-head">
                  <span>{column.label}</span>
                  <strong>{columnTasks.length}</strong>
                </div>
                <div className="task-kanban-stack">
                  {column.id === "backlog" ? (
                    <TaskInlineCreateCard
                      prompt={prompt}
                      configuredAgentId={configuredAgentId}
                      modelId={modelId}
                      configuredAgents={configuredAgents}
                      workDir={workDir}
                      runtimes={runtimes}
                      channels={channels}
                      canRun={canRun}
                      onPromptChange={onPromptChange}
                      onSelectConfiguredAgent={onSelectConfiguredAgent}
                      onSelectModel={onSelectModel}
                      onChooseWorkDir={onChooseWorkDir}
                      onRunTask={onRunTask}
                    />
                  ) : null}
                  {columnTasks.length === 0 && column.id !== "backlog" ? (
                    <div className="task-kanban-empty">Drop tasks here</div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskKanbanCard
                        key={task.id}
                        task={task}
                        configuredAgents={configuredAgents}
                        channels={channels}
                        active={task.id === activeTask?.id}
                        onSelect={onSelectTask}
                        onDragStart={startTaskDrag}
                        onDragEnd={() => setDraggingTaskId(undefined)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </section>
      </section>

      {activeTask ? (
        <section className="task-detail-overlay" role="dialog" aria-modal="true" aria-label="Task detail" onClick={onCloseTaskDetail}>
          <article className="task-detail-page task-surface-card" onClick={(event) => event.stopPropagation()}>
            <div className="task-section-heading">
              <div>
                <h2>Task detail</h2>
                <span>{formatTime(activeTask.updatedAt)}</span>
              </div>
              <div className="task-detail-page-actions">
                <TaskStatusChip label={taskProgressLabel(activeTask.progress)} tone={activeTask.progress} />
                <button className="icon-btn flat" onClick={onCloseTaskDetail} title="Close task detail" aria-label="Close task detail">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="task-detail-title">
              <h3>{activeTask.title}</h3>
              <span>{activeTask.id}</span>
            </div>
            <div className="task-detail-status-row">
              <span className={`agent-badge mini ${agentAccent(activeRuntimeId)}`}>{activeTaskConfiguredAgent?.name || agentLabel(activeRuntimeId)}</span>
              <TaskStatusChip label={activeTask.running ? "Running" : activeTask.status} tone={activeTask.running ? "running" : activeTask.status} />
              <TaskStatusChip
                label={activeTask.runtimeConversation ? "Conversation linked" : "No conversation"}
                tone={activeTask.runtimeConversation ? "done" : "backlog"}
              />
            </div>
            <div className="task-section-divider">
              <span>Metadata</span>
              <i />
            </div>
            <div className="task-detail-meta task-meta-grid">
              <TaskMeta label="Agent" value={activeTaskConfiguredAgent?.name || agentLabel(activeRuntimeId)} />
              <TaskMeta label="Channel" value={activeChannel?.label ?? "No config"} />
              <TaskMeta label="Model" value={activeModel?.label ?? activeTaskConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID} />
              <TaskMeta label="Run status" value={activeTask.status} />
              <TaskMeta label="Progress" value={taskProgressLabel(activeTask.progress)} />
              <TaskMeta label="Work dir" value={activeTask.workDir} />
              <TaskMeta label="Conversation" value={activeTask.runtimeConversation ? "linked" : "not started"} />
            </div>
            <div className="task-section-divider">
              <span>Full prompt</span>
              <i />
            </div>
            <div className="task-prompt-block">
              <MarkdownDocument text={activeTask.prompt} />
            </div>
            <div className="task-detail-actions">
              <label className="task-progress-select-wrap">
                <span>Progress</span>
                <select
                  className="composer-select task-progress-select"
                  aria-label="Task progress"
                  value={activeTask.progress}
                  onChange={(event) => void onUpdateTaskProgress(activeTask.id, event.currentTarget.value as TaskProgress)}
                >
                  {TASK_STATUS_FILTERS.filter((filter): filter is { id: TaskProgress; label: string } => filter.id !== "all").map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeTask.running ? (
                <button className="control-btn compact secondary" onClick={() => void onStopTask(activeTask.id)}>
                  <CircleStop size={14} />
                  <span>Stop</span>
                </button>
              ) : (
                <button className="control-btn compact" onClick={() => void onRerunTask(activeTask)}>
                  <Play size={14} />
                  <span>Run Agent</span>
                </button>
              )}
              <button className="icon-btn danger" onClick={() => void onDeleteTask(activeTask.id)} title="Delete task">
                <Trash2 size={14} />
              </button>
            </div>

            <section className="task-run-timeline" aria-label="Execution timeline">
              <div className="task-section-divider">
                <span>Execution timeline</span>
                <i />
              </div>
              <div className="task-log-stream">
                {activeTask.messages.length === 0 ? (
                  <div className="empty-state terminal-empty">
                    <Wand2 size={17} />
                    <span>Waiting for task output.</span>
                  </div>
                ) : (
                  activeTask.messages.map((message) => (
                    <TaskTimelineMessage key={message.id} message={message} agentId={activeRuntimeId} />
                  ))
                )}
                {activeTask.running ? (
                  <div className="task-log-running">
                    <span className={`runtime-dot ${agentAccent(activeRuntimeId)}`} />
                    <span>{agentLabel(activeRuntimeId)} is running this task</span>
                  </div>
                ) : null}
              </div>
            </section>
          </article>
        </section>
      ) : null}
    </section>
  );
}

function TaskKanbanCard({
  task,
  configuredAgents,
  channels,
  active,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRun;
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  active: boolean;
  onSelect: (taskId: string) => MaybePromise;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd: () => void;
}) {
  const agent = configuredAgentById(task.configuredAgentId, configuredAgents);
  const channel = resolveConfiguredAgentChannel(agent, channels);
  const runtimeId = configuredAgentRuntimeId(agent, channel);

  function selectTask(): void {
    void onSelect(task.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectTask();
  }

  return (
    <article
      className={`task-kanban-card ${active ? "is-active" : ""}`}
      role="button"
      tabIndex={0}
      draggable
      data-task-id={task.id}
      onClick={selectTask}
      onKeyDown={handleKeyDown}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="task-kanban-card-head">
        <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{agent?.name || agentLabel(runtimeId)}</span>
        <TaskStatusChip label={task.running ? "Running" : task.status} tone={task.running ? "running" : task.status} />
      </div>
      <strong>{task.title}</strong>
      <p>{task.prompt}</p>
      <div className="task-kanban-card-meta">
        <span>{task.messages.length} messages</span>
        <span>{formatTime(task.updatedAt)}</span>
      </div>
    </article>
  );
}

function TaskInlineCreateCard({
  prompt,
  configuredAgentId,
  modelId,
  configuredAgents,
  workDir,
  runtimes,
  channels,
  canRun,
  onPromptChange,
  onSelectConfiguredAgent,
  onSelectModel,
  onChooseWorkDir,
  onRunTask,
}: {
  prompt: string;
  configuredAgentId: string;
  modelId: string;
  configuredAgents: ConfiguredAgent[];
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  canRun: boolean;
  onPromptChange: (value: string) => void;
  onSelectConfiguredAgent: (configuredAgentId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRunTask: () => MaybePromise;
}) {
  return (
    <article className="task-inline-create-card task-surface-card">
      <div className="task-section-heading">
        <div>
          <h2>New task</h2>
          <span>{workDir || "No work directory selected"}</span>
        </div>
        <TaskStatusChip label={canRun ? "Ready" : "Draft"} tone={canRun ? "todo" : "backlog"} />
      </div>
      <textarea
        aria-label="Task prompt"
        className="task-create-input"
        value={prompt}
        onChange={(event) => onPromptChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (shouldSendComposerKey({
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            isComposing: event.nativeEvent.isComposing,
          })) {
            event.preventDefault();
            void onRunTask();
          }
        }}
        placeholder="Describe a task..."
        rows={3}
      />
      <div className="task-create-chipbar">
        <ChatControls
          configuredAgentId={configuredAgentId}
          modelId={modelId}
          configuredAgents={configuredAgents}
          channels={channels}
          locked={false}
          running={false}
          workDir={workDir}
          runtimes={runtimes}
          onSelectConfiguredAgent={onSelectConfiguredAgent}
          onSelectModel={onSelectModel}
          onChooseWorkDir={onChooseWorkDir}
        />
      </div>
      <button className="send-btn task-run-btn" onClick={() => void onRunTask()} disabled={!canRun}>
        <Play size={14} />
        <span>Run Agent</span>
      </button>
    </article>
  );
}

function TaskTimelineMessage({ message, agentId }: { message: ChatMessage; agentId: AgentId }) {
  const label =
    message.role === "user"
      ? "Prompt"
      : message.role === "assistant"
        ? agentLabel(agentId)
        : message.role === "error"
          ? "Error"
          : "Event";

  return (
    <article className={`task-log-entry ${message.role}`}>
      <div className="task-log-marker" />
      <div className="task-log-body">
        <div className="task-log-meta">
          <span>{label}</span>
          <time>{formatTime(message.timestamp)}</time>
        </div>
        {message.events && message.events.length > 0 ? (
          <div className="task-log-events">
            {message.events.map((event) => (
              <MetaMessage key={event.id} content={chatEventDisplayContent(event)} />
            ))}
          </div>
        ) : null}
        {message.content ? (
          message.role === "assistant" || message.role === "user" ? (
            <div className="cli-markdown">
              <Markdown text={message.content} />
            </div>
          ) : (
            <pre>{message.content}</pre>
          )
        ) : null}
      </div>
    </article>
  );
}
