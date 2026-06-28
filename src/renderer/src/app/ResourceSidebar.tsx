import type { MouseEvent } from "react";
import { CalendarClock, ClipboardList, Plus, Search, Settings, SlidersHorizontal, Wand2 } from "lucide-react";
import type {
  AgentChannel,
  ChatSession,
  ConfiguredAgent,
  ScheduledWorkflowSchedule,
  SkillTemplate,
  TaskRun,
  WorkflowDraftState,
} from "../../../shared/types";
import { agentAccent, agentLabel, configuredAgentById, configuredAgentRuntimeId, resolveConfiguredAgentChannel } from "./agents";
import { formatTime } from "./format";
import type { Language } from "./language";
import type { ActiveFeature } from "./shell";
import { ChatHistoryPanel } from "../pages/chat/ChatHistoryPanel";
import { TaskStatusChip, TaskStatusFilter, taskProgressLabel, type TaskStatusFilterValue } from "../pages/tasks/task-status";
import { WorkflowHistoryPanel } from "../pages/workflow/WorkflowHistoryPanel";
import { formatScheduleRecurrence } from "../pages/schedules/schedule-utils";

type MaybePromise = void | Promise<void>;

interface ResourceSidebarText {
  nav: Record<"chat" | "tasks" | "workflow" | "schedules" | "skills" | "runtimes" | "settings" | "configuration", string>;
  chrome: {
    search: string;
    newChat: string;
    skillLibrary: string;
    noSkills: string;
  };
}

export interface ChatSidebarModel {
  chats: ChatSession[];
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  activeChatId: string | undefined;
  contextMenu: { chatId: string; x: number; y: number } | undefined;
}

export interface TaskSidebarModel {
  tasks: TaskRun[];
  visibleTasks: TaskRun[];
  activeTask: TaskRun | undefined;
  taskStatusFilter: TaskStatusFilterValue;
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
}

export interface WorkflowSidebarModel {
  workflows: WorkflowDraftState[];
  activeWorkflowId: string | undefined;
  running: boolean;
  contextMenu: { workflowId: string; x: number; y: number } | undefined;
  renameDraft: { workflowId: string; title: string } | undefined;
}

export interface ScheduleSidebarModel {
  schedules: ScheduledWorkflowSchedule[];
  activeScheduleId: string | undefined;
  mode: "detail" | "create";
}

export interface SkillsSidebarModel {
  skillTemplates: SkillTemplate[];
}

export interface SidebarViewModel {
  chat?: ChatSidebarModel;
  tasks?: TaskSidebarModel;
  workflow?: WorkflowSidebarModel;
  schedules?: ScheduleSidebarModel;
  skills?: SkillsSidebarModel;
}

interface ResourceSidebarProps {
  activeFeature: ActiveFeature;
  language: Language;
  text: ResourceSidebarText;
  model: SidebarViewModel;
  onOpenPalette: () => void;
  onCreateChat: () => MaybePromise;
  onSelectChat: (chatId: string) => MaybePromise;
  onOpenChatContextMenu: (event: MouseEvent, chatId: string) => void;
  onDeleteChat: (chatId: string) => MaybePromise;
  onTaskStatusFilterChange: (value: TaskStatusFilterValue) => void;
  onSelectTask: (taskId: string) => MaybePromise;
  onNewWorkflow: () => MaybePromise;
  onSelectWorkflow: (workflowId: string) => MaybePromise;
  onOpenWorkflowContextMenu: (event: MouseEvent, workflowId: string) => void;
  onStartWorkflowRename: (workflowId: string) => MaybePromise;
  onWorkflowRenameDraftChange: (title: string) => void;
  onConfirmWorkflowRename: () => MaybePromise;
  onCancelWorkflowRename: () => void;
  onDeleteWorkflow: (workflowId: string) => MaybePromise;
  onStartCreatingScheduledWorkflow: () => void;
  onSelectScheduledWorkflowSchedule: (scheduleId: string) => MaybePromise;
}

function resourceFeatureLabel(activeFeature: ActiveFeature, text: ResourceSidebarText): string {
  if (activeFeature === "chat") return text.nav.chat;
  if (activeFeature === "tasks") return text.nav.tasks;
  if (activeFeature === "workflow") return text.nav.workflow;
  if (activeFeature === "schedules") return text.nav.schedules;
  if (activeFeature === "skills") return text.nav.skills;
  if (activeFeature === "configuration") return text.nav.configuration;
  if (activeFeature === "runtimes") return text.nav.runtimes;
  if (activeFeature === "settings") return text.nav.settings;
  return text.nav.chat;
}

export function ResourceSidebar({
  activeFeature,
  language,
  text,
  model,
  onOpenPalette,
  onCreateChat,
  onSelectChat,
  onOpenChatContextMenu,
  onDeleteChat,
  onTaskStatusFilterChange,
  onSelectTask,
  onNewWorkflow,
  onSelectWorkflow,
  onOpenWorkflowContextMenu,
  onStartWorkflowRename,
  onWorkflowRenameDraftChange,
  onConfirmWorkflowRename,
  onCancelWorkflowRename,
  onDeleteWorkflow,
  onStartCreatingScheduledWorkflow,
  onSelectScheduledWorkflowSchedule,
}: ResourceSidebarProps) {
  const chatModel = model.chat;
  const taskModel = model.tasks;
  const workflowModel = model.workflow;
  const scheduleModel = model.schedules;
  const skillsModel = model.skills;

  return (
    <aside className="resource-sidebar">
      <div className="brand resource-brand">
        <div>
          <h1>Multi Agent Chat</h1>
          <p>{resourceFeatureLabel(activeFeature, text)}</p>
        </div>
      </div>

      <button className="sidebar-search-btn" onClick={onOpenPalette} aria-label="Open command palette">
        <Search size={13} />
        <span>{text.chrome.search}</span>
        <kbd>Ctrl/Cmd+K</kbd>
      </button>

      {activeFeature === "chat" && chatModel ? (
        <ChatHistoryPanel
          chats={chatModel.chats}
          configuredAgents={chatModel.configuredAgents}
          channels={chatModel.channels}
          activeChatId={chatModel.activeChatId}
          contextMenu={chatModel.contextMenu}
          newChatLabel={text.chrome.newChat}
          runningLabel={language === "zh" ? "运行中" : "Running"}
          onCreateChat={onCreateChat}
          onSelectChat={onSelectChat}
          onOpenContextMenu={onOpenChatContextMenu}
          onDeleteChat={onDeleteChat}
        />
      ) : activeFeature === "tasks" && taskModel ? (
        <TaskResourcePanel
          tasks={taskModel.tasks}
          visibleTasks={taskModel.visibleTasks}
          activeTask={taskModel.activeTask}
          taskStatusFilter={taskModel.taskStatusFilter}
          configuredAgents={taskModel.configuredAgents}
          channels={taskModel.channels}
          onTaskStatusFilterChange={onTaskStatusFilterChange}
          onSelectTask={onSelectTask}
        />
      ) : activeFeature === "workflow" && workflowModel ? (
        <WorkflowHistoryPanel
          workflows={workflowModel.workflows}
          activeWorkflowId={workflowModel.activeWorkflowId}
          running={workflowModel.running}
          contextMenu={workflowModel.contextMenu}
          renameDraft={workflowModel.renameDraft}
          onNewWorkflow={onNewWorkflow}
          onSelectWorkflow={onSelectWorkflow}
          onOpenContextMenu={onOpenWorkflowContextMenu}
          onStartRename={onStartWorkflowRename}
          onRenameDraftChange={onWorkflowRenameDraftChange}
          onConfirmRename={onConfirmWorkflowRename}
          onCancelRename={onCancelWorkflowRename}
          onDeleteWorkflow={onDeleteWorkflow}
        />
      ) : activeFeature === "schedules" && scheduleModel ? (
        <ScheduledResourcePanel
          language={language}
          schedules={scheduleModel.schedules}
          activeScheduleId={scheduleModel.activeScheduleId}
          scheduledWorkflowMode={scheduleModel.mode}
          label={text.nav.schedules}
          onStartCreatingScheduledWorkflow={onStartCreatingScheduledWorkflow}
          onSelectScheduledWorkflowSchedule={onSelectScheduledWorkflowSchedule}
        />
      ) : activeFeature === "skills" && skillsModel ? (
        <section className="resource-panel skills-nav-panel">
          <div className="panel-header">
            <span>{text.chrome.skillLibrary}</span>
            <Wand2 size={14} />
          </div>
          <div className="skills-nav-list">
            {skillsModel.skillTemplates.length === 0 ? (
              <div className="empty-state config-empty">{text.chrome.noSkills}</div>
            ) : (
              skillsModel.skillTemplates.map((template) => (
                <div key={template.id} className="skills-nav-row">
                  <strong>{template.name}</strong>
                  <span>{template.tags.join(", ")}</span>
                </div>
              ))
            )}
          </div>
        </section>
      ) : activeFeature === "configuration" ? (
        <section className="resource-panel settings-nav-panel">
          <div className="panel-header">
            <span>{text.nav.configuration}</span>
            <SlidersHorizontal size={14} />
          </div>
          <button className="settings-nav-row is-active" type="button">
            <SlidersHorizontal size={13} />
            <span>{language === "zh" ? "Agent 组装" : "Agent assembly"}</span>
          </button>
        </section>
      ) : activeFeature === "settings" ? (
        <section className="resource-panel settings-nav-panel">
          <div className="panel-header">
            <span>{text.nav.settings}</span>
            <Settings size={14} />
          </div>
          <button className="settings-nav-row is-active" type="button">
            <Settings size={13} />
            <span>{language === "zh" ? "语言" : "Language"}</span>
          </button>
        </section>
      ) : null}
    </aside>
  );
}

function TaskResourcePanel({
  tasks,
  visibleTasks,
  activeTask,
  taskStatusFilter,
  configuredAgents,
  channels,
  onTaskStatusFilterChange,
  onSelectTask,
}: {
  tasks: TaskRun[];
  visibleTasks: TaskRun[];
  activeTask: TaskRun | undefined;
  taskStatusFilter: TaskStatusFilterValue;
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  onTaskStatusFilterChange: (value: TaskStatusFilterValue) => void;
  onSelectTask: (taskId: string) => MaybePromise;
}) {
  return (
    <section className="resource-panel task-list-panel">
      <div className="panel-header">
        <span>Tasks</span>
        <ClipboardList size={14} />
      </div>
      <TaskStatusFilter tasks={tasks} value={taskStatusFilter} onChange={onTaskStatusFilterChange} />
      <div className="task-card-stack">
        {visibleTasks.length === 0 ? (
          <div className="empty-state config-empty">{tasks.length === 0 ? "No tasks" : "No tasks in this progress"}</div>
        ) : (
          visibleTasks.map((task) => {
            const agent = configuredAgentById(task.configuredAgentId, configuredAgents);
            const channel = resolveConfiguredAgentChannel(agent, channels);
            const runtimeId = configuredAgentRuntimeId(agent, channel);
            return (
              <button key={task.id} className={`task-nav-card ${task.id === activeTask?.id ? "is-active" : ""}`} onClick={() => void onSelectTask(task.id)}>
                <div className="task-nav-card-head">
                  <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{agent?.name || agentLabel(runtimeId)}</span>
                  <TaskStatusChip label={task.running ? "Running" : taskProgressLabel(task.progress)} tone={task.running ? "running" : task.progress} />
                </div>
                <strong>{task.title}</strong>
                <span>{`${task.status} · ${formatTime(task.updatedAt)}`}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function ScheduledResourcePanel({
  language,
  schedules,
  activeScheduleId,
  scheduledWorkflowMode,
  label,
  onStartCreatingScheduledWorkflow,
  onSelectScheduledWorkflowSchedule,
}: {
  language: Language;
  schedules: ScheduledWorkflowSchedule[];
  activeScheduleId: string | undefined;
  scheduledWorkflowMode: "detail" | "create";
  label: string;
  onStartCreatingScheduledWorkflow: () => void;
  onSelectScheduledWorkflowSchedule: (scheduleId: string) => MaybePromise;
}) {
  return (
    <section className="resource-panel scheduled-nav-panel">
      <div className="panel-header">
        <span>{label}</span>
        <CalendarClock size={14} />
      </div>
      <div className="scheduled-nav-summary">
        <strong>{schedules.length}</strong>
        <span>{language === "zh" ? "个计划" : "schedules"}</span>
      </div>
      <div className="new-chat-menu-wrap">
        <button
          className={`new-chat-compact-btn ${scheduledWorkflowMode === "create" ? "is-active" : ""}`}
          type="button"
          onClick={onStartCreatingScheduledWorkflow}
        >
          <Plus size={13} />
          <span>{language === "zh" ? "新建定时任务" : "New schedule"}</span>
        </button>
      </div>
      <div className="config-nav-list">
        {schedules.length === 0 ? (
          <div className="empty-state config-empty">{language === "zh" ? "暂无定时任务" : "No schedules"}</div>
        ) : (
          schedules.map((schedule) => (
            <button
              key={schedule.scheduleId}
              className={`config-nav-row ${schedule.scheduleId === activeScheduleId ? "is-active" : ""}`}
              onClick={() => void onSelectScheduledWorkflowSchedule(schedule.scheduleId)}
            >
              <span className={`agent-badge mini ${schedule.enabled ? "agent-api" : "agent-claude"}`}>
                {schedule.enabled ? (language === "zh" ? "启用" : "On") : language === "zh" ? "暂停" : "Off"}
              </span>
              <strong>{schedule.title}</strong>
              <span>{formatScheduleRecurrence(schedule, language)}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
