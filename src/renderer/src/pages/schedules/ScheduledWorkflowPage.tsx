import { useEffect, useState, type ReactElement } from "react";
import { CheckCircle2, CircleStop, Play, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type {
  ScheduledWorkflowFrequency,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  WorkflowDraftState,
} from "../../../../shared/types";
import type { WorkflowV2Node } from "../../../../shared/workflow-v2/definition";
import { formatTime } from "../../app/format";
import type { Language } from "../../app/language";
import { WorkflowCanvasBoard } from "../workflow/WorkflowCanvasBoard";
import {
  formatScheduleRecurrence,
  intervalSecondsForFrequency,
  normalizeScheduleDayOfMonth,
  normalizeScheduleTimeOfDay,
  normalizeScheduleWeekdays,
  WEEKDAY_OPTIONS,
  type ScheduledWorkflowDraft,
} from "./schedule-utils";

type MaybePromise = void | Promise<void>;

interface ScheduledWorkflowPageProps {
  language?: Language;
  mode?: "detail" | "create";
  workflows: WorkflowDraftState[];
  store: ScheduledWorkflowStoreState;
  draft: ScheduledWorkflowDraft;
  onDraftChange: (draft: ScheduledWorkflowDraft) => void;
  onConnectRunner: () => MaybePromise;
  onDisconnectRunner: () => MaybePromise;
  onRefreshSchedules: () => MaybePromise;
  onCreateSchedule: () => MaybePromise;
  onUpdateSchedule: (
    schedule: ScheduledWorkflowSchedule,
    update: Partial<Pick<ScheduledWorkflowSchedule, "enabled" | "title" | "intervalSeconds" | "frequency" | "timeOfDay" | "timezone" | "weekdays" | "dayOfMonth">>,
  ) => MaybePromise;
  onDeleteSchedule: (scheduleId: string) => MaybePromise;
  onTriggerSchedule: (scheduleId: string) => MaybePromise;
}

export function ScheduledWorkflowPage({
  language = "en",
  mode = "detail",
  workflows,
  store,
  draft,
  onDraftChange,
  onConnectRunner,
  onDisconnectRunner,
  onRefreshSchedules,
  onCreateSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
}: ScheduledWorkflowPageProps) {
  const zh = language === "zh";
  const draftWorkflow = workflows.find((workflow) => workflow.workflowId === draft.workflowId) ?? workflows[0];
  const selectedSchedule = mode === "detail" ? (store.schedules.find((schedule) => schedule.scheduleId === store.activeScheduleId) ?? store.schedules[0]) : undefined;
  const selectedScheduleWorkflow = selectedSchedule ? workflows.find((workflow) => workflow.workflowId === selectedSchedule.workflowId) : undefined;
  const [scheduleEditDraft, setScheduleEditDraft] = useState(() => ({
    scheduleId: selectedSchedule?.scheduleId ?? "",
    frequency: selectedSchedule?.frequency ?? "daily",
    timeOfDay: normalizeScheduleTimeOfDay(selectedSchedule?.timeOfDay),
    weekdays: normalizeScheduleWeekdays(selectedSchedule?.weekdays),
    dayOfMonth: normalizeScheduleDayOfMonth(selectedSchedule?.dayOfMonth),
  }));
  const runnerConnected = store.runnerStatus.connected;
  const runnerStatusText = store.runnerStatus.connecting
    ? zh ? "本机连接中" : "Local app connecting"
    : runnerConnected
      ? zh ? "本机已连接" : "Local app connected"
      : zh ? "本机未连接" : "Local app disconnected";
  const runnerDetail = runnerConnected
    ? zh ? "定时任务到期后会在这台电脑上执行。" : "Due schedules will run on this computer."
    : zh ? "连接后会自动注册本机，并接收云端定时事件。" : "Connect to register this computer and receive cloud schedule events.";
  const sortedRuns = store.runs.slice().sort((left, right) => right.startedAt - left.startedAt);

  useEffect(() => {
    setScheduleEditDraft({
      scheduleId: selectedSchedule?.scheduleId ?? "",
      frequency: selectedSchedule?.frequency ?? "daily",
      timeOfDay: normalizeScheduleTimeOfDay(selectedSchedule?.timeOfDay),
      weekdays: normalizeScheduleWeekdays(selectedSchedule?.weekdays),
      dayOfMonth: normalizeScheduleDayOfMonth(selectedSchedule?.dayOfMonth),
    });
  }, [selectedSchedule?.dayOfMonth, selectedSchedule?.frequency, selectedSchedule?.scheduleId, selectedSchedule?.timeOfDay, selectedSchedule?.weekdays]);

  const scheduleEditDirty = Boolean(
    selectedSchedule &&
      (scheduleEditDraft.frequency !== selectedSchedule.frequency ||
        scheduleEditDraft.timeOfDay !== normalizeScheduleTimeOfDay(selectedSchedule.timeOfDay) ||
        scheduleEditDraft.dayOfMonth !== normalizeScheduleDayOfMonth(selectedSchedule.dayOfMonth) ||
        normalizeScheduleWeekdays(scheduleEditDraft.weekdays).join(",") !== normalizeScheduleWeekdays(selectedSchedule.weekdays).join(",")),
  );

  function applyScheduleEdit(): void {
    if (!selectedSchedule) return;
    void onUpdateSchedule(selectedSchedule, {
      frequency: scheduleEditDraft.frequency,
      intervalSeconds: intervalSecondsForFrequency(scheduleEditDraft.frequency),
      timeOfDay: normalizeScheduleTimeOfDay(scheduleEditDraft.timeOfDay),
      ...(scheduleEditDraft.frequency === "weekly" ? { weekdays: normalizeScheduleWeekdays(scheduleEditDraft.weekdays) } : {}),
      ...(scheduleEditDraft.frequency === "monthly" ? { dayOfMonth: normalizeScheduleDayOfMonth(scheduleEditDraft.dayOfMonth) } : {}),
    });
  }

  const createForm = (
    <section className="scheduled-panel scheduled-create-panel scheduled-workflow-detail-panel" aria-label={zh ? "新增定时任务" : "Create scheduled task"}>
      <div className="scheduled-panel-head">
        <h3>{zh ? "新增定时任务" : "New schedule"}</h3>
        <p>{draftWorkflow?.title ?? (zh ? "先在 Workflow 页配置好流程" : "Create and save a workflow first")}</p>
      </div>
      <label className="scheduled-field">
        <span>{zh ? "运行 Workflow" : "Workflow to run"}</span>
        <select
          value={draft.workflowId}
          onChange={(event) => onDraftChange({ ...draft, workflowId: event.currentTarget.value })}
          disabled={workflows.length === 0}
        >
          {workflows.length === 0 ? <option value="">{zh ? "暂无 Workflow" : "No workflows"}</option> : null}
          {workflows.map((workflow) => (
            <option key={workflow.workflowId} value={workflow.workflowId}>
              {workflow.title}
            </option>
          ))}
        </select>
      </label>
      <label className="scheduled-field">
        <span>{zh ? "标题" : "Title"}</span>
        <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.currentTarget.value })} />
      </label>
      <div className="scheduled-field-row">
        <label className="scheduled-field">
          <span>{zh ? "周期" : "Frequency"}</span>
          <select
            value={draft.frequency}
            onChange={(event) => {
              const frequency = event.currentTarget.value as ScheduledWorkflowFrequency;
              onDraftChange({ ...draft, frequency, intervalSeconds: intervalSecondsForFrequency(frequency) });
            }}
          >
            <option value="daily">{zh ? "每天" : "Daily"}</option>
            <option value="weekly">{zh ? "每周" : "Weekly"}</option>
            <option value="monthly">{zh ? "每月" : "Monthly"}</option>
          </select>
        </label>
        <label className="scheduled-field">
          <span>{zh ? "执行时间" : "Run time"}</span>
          <input
            type="time"
            value={normalizeScheduleTimeOfDay(draft.timeOfDay)}
            onChange={(event) => onDraftChange({ ...draft, timeOfDay: normalizeScheduleTimeOfDay(event.currentTarget.value) })}
          />
        </label>
      </div>
      {draft.frequency === "weekly" ? (
        <div className="scheduled-weekday-picker" aria-label={zh ? "选择星期" : "Choose weekdays"}>
          {WEEKDAY_OPTIONS.map((day) => {
            const active = normalizeScheduleWeekdays(draft.weekdays).includes(day.value);
            return (
              <button
                key={day.value}
                className={`control-btn compact ${active ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  const current = normalizeScheduleWeekdays(draft.weekdays);
                  const nextDays = active ? current.filter((item) => item !== day.value) : [...current, day.value];
                  onDraftChange({ ...draft, weekdays: normalizeScheduleWeekdays(nextDays) });
                }}
              >
                <span>{zh ? day.zh : day.en}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {draft.frequency === "monthly" ? (
        <label className="scheduled-field">
          <span>{zh ? "每月几号" : "Day of month"}</span>
          <input
            type="number"
            min={1}
            max={31}
            value={normalizeScheduleDayOfMonth(draft.dayOfMonth)}
            onChange={(event) => onDraftChange({ ...draft, dayOfMonth: normalizeScheduleDayOfMonth(Number(event.currentTarget.value)) })}
          />
        </label>
      ) : null}
      <label className="settings-toggle-row scheduled-toggle-row">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onDraftChange({ ...draft, enabled: event.currentTarget.checked })}
        />
        <span>
          <strong>{zh ? "云端到点触发" : "Trigger on schedule"}</strong>
          <small>{zh ? "开启后服务器到点会通知本机执行；关闭后只保存计划，不触发。" : "When enabled, the server notifies this computer when due; disabled schedules are saved but do not trigger."}</small>
        </span>
      </label>
      <button className="send-btn compact" type="button" disabled={!draft.workflowId || workflows.length === 0} onClick={() => void onCreateSchedule()}>
        <Plus size={13} />
        <span>{zh ? "创建定时任务" : "Create schedule"}</span>
      </button>
    </section>
  );
  const scheduleEditor = selectedSchedule ? (
    <section className="scheduled-panel scheduled-time-panel" aria-label={zh ? "编辑定时任务时间" : "Edit schedule time"}>
      <div className="scheduled-panel-head">
        <h3>{zh ? "计划时间" : "Schedule time"}</h3>
        <p>{formatScheduleRecurrence(selectedSchedule, language)}</p>
      </div>
      <label className="scheduled-field">
        <span>{zh ? "周期" : "Frequency"}</span>
        <select
          value={scheduleEditDraft.frequency}
          onChange={(event) => {
            const frequency = event.currentTarget.value as ScheduledWorkflowFrequency;
            setScheduleEditDraft((current) => ({ ...current, frequency }));
          }}
        >
          <option value="daily">{zh ? "每天" : "Daily"}</option>
          <option value="weekly">{zh ? "每周" : "Weekly"}</option>
          <option value="monthly">{zh ? "每月" : "Monthly"}</option>
        </select>
      </label>
      <label className="scheduled-field">
        <span>{zh ? "执行时间" : "Run time"}</span>
        <input
          type="time"
          value={normalizeScheduleTimeOfDay(scheduleEditDraft.timeOfDay)}
          onChange={(event) => setScheduleEditDraft((current) => ({ ...current, timeOfDay: normalizeScheduleTimeOfDay(event.currentTarget.value) }))}
        />
      </label>
      {scheduleEditDraft.frequency === "weekly" ? (
        <div className="scheduled-field" aria-label={zh ? "选择星期" : "Choose weekdays"}>
          <span>{zh ? "星期" : "Weekdays"}</span>
          <div className="scheduled-weekday-checks">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = normalizeScheduleWeekdays(scheduleEditDraft.weekdays).includes(day.value);
              return (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => {
                      const current = normalizeScheduleWeekdays(scheduleEditDraft.weekdays);
                      const nextDays = active ? current.filter((item) => item !== day.value) : [...current, day.value];
                      setScheduleEditDraft((currentDraft) => ({ ...currentDraft, weekdays: normalizeScheduleWeekdays(nextDays) }));
                    }}
                  />
                  <span>{zh ? day.zh : day.en}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      {scheduleEditDraft.frequency === "monthly" ? (
        <label className="scheduled-field">
          <span>{zh ? "每月几号" : "Day of month"}</span>
          <input
            type="number"
            min={1}
            max={31}
            value={normalizeScheduleDayOfMonth(scheduleEditDraft.dayOfMonth)}
            onChange={(event) => setScheduleEditDraft((current) => ({ ...current, dayOfMonth: normalizeScheduleDayOfMonth(Number(event.currentTarget.value)) }))}
          />
        </label>
      ) : null}
      <button className="send-btn compact scheduled-apply-btn" type="button" onClick={applyScheduleEdit} disabled={!scheduleEditDirty}>
        <Save size={13} />
        <span>{zh ? "应用" : "Apply"}</span>
      </button>
    </section>
  ) : null;

  return (
    <section className="scheduled-page">
      <header className="scheduled-page-header scheduled-toolbar">
        <div>
          <h2>{zh ? "定时任务" : "Scheduled tasks"}</h2>
          <p>{zh ? "云端保存计划，到点后通知本机执行 Workflow。" : "The cloud stores schedules and asks this computer to run workflows when due."}</p>
        </div>
        <div className="scheduled-toolbar-actions">
          <div className={`scheduled-runner-pill ${runnerConnected ? "is-connected" : ""}`}>
            <CheckCircle2 size={13} />
            <span>{runnerStatusText}</span>
            <small>{zh ? "云端调度服务" : "Cloud scheduler"}</small>
          </div>
          <button className="send-btn compact" type="button" onClick={() => void onConnectRunner()}>
            <RefreshCw size={13} />
            <span>{zh ? "连接" : "Connect"}</span>
          </button>
          <button className="control-btn compact" type="button" onClick={() => void onDisconnectRunner()}>
            <CircleStop size={13} />
            <span>{zh ? "断开" : "Disconnect"}</span>
          </button>
          <button className="icon-btn" type="button" onClick={() => void onRefreshSchedules()} aria-label="Refresh schedules">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>
      {store.runnerStatus.lastError ? <div className="workflow-error">{store.runnerStatus.lastError}</div> : null}

      <div className="scheduled-layout">
        {mode === "create" ? (
          createForm
        ) : (
          <section className="scheduled-panel scheduled-workflow-detail-panel" aria-label={zh ? "定时任务 Workflow 详情" : "Scheduled workflow detail"}>
            <div className="scheduled-panel-head inline scheduled-workflow-detail-head">
              <div>
                <h3>{selectedSchedule?.title ?? (zh ? "Workflow 详情" : "Workflow detail")}</h3>
                <p>
                  {selectedSchedule
                    ? `${formatScheduleRecurrence(selectedSchedule, language)} · ${zh ? "Workflow" : "Workflow"}: ${selectedScheduleWorkflow?.title ?? selectedSchedule.workflowId}${
                        selectedSchedule.nextRunAt ? ` · ${zh ? "下次" : "Next"} ${formatTime(selectedSchedule.nextRunAt)}` : ""
                      } · ${runnerDetail}`
                    : runnerDetail}
                </p>
              </div>
              {selectedSchedule ? (
                <div className="scheduled-detail-actions">
                  <button
                    className={`control-btn compact ${selectedSchedule.enabled ? "is-active" : ""}`}
                    type="button"
                    aria-label={selectedSchedule.enabled ? (zh ? "暂停计划" : "Pause schedule") : (zh ? "启用计划" : "Enable schedule")}
                    onClick={() => void onUpdateSchedule(selectedSchedule, { enabled: !selectedSchedule.enabled })}
                  >
                    <span>{selectedSchedule.enabled ? (zh ? "暂停" : "Pause") : (zh ? "启用" : "Enable")}</span>
                  </button>
                  <button className="control-btn compact" type="button" onClick={() => void onTriggerSchedule(selectedSchedule.scheduleId)}>
                    <Play size={13} />
                    <span>{zh ? "立即执行" : "Run"}</span>
                  </button>
                  <button className="control-btn compact danger" type="button" onClick={() => void onDeleteSchedule(selectedSchedule.scheduleId)}>
                    <Trash2 size={13} />
                    <span>{zh ? "删除" : "Delete"}</span>
                  </button>
                </div>
              ) : null}
            </div>
            {selectedScheduleWorkflow ? (
              <ScheduledWorkflowGraphPreview workflow={selectedScheduleWorkflow} language={language} />
            ) : (
              <div className="empty-state config-empty">{zh ? "左侧选择一个计划，或先创建定时任务。" : "Select a schedule on the left, or create one first."}</div>
            )}
          </section>
        )}

        <aside className="scheduled-side-panel">
          {scheduleEditor}
          <section className="scheduled-panel scheduled-runs-panel">
            <div className="scheduled-panel-head">
              <h3>{zh ? "最近执行" : "Recent runs"}</h3>
              <p>{zh ? "本机执行定时任务后的状态。" : "Execution status reported by this computer."}</p>
            </div>
            <div className="scheduled-run-list">
              {sortedRuns.length === 0 ? <div className="empty-state config-empty">{zh ? "暂无执行记录" : "No run history"}</div> : null}
              {sortedRuns.map((run) => (
                <article key={run.runId} className={`scheduled-run-row is-${run.status}`}>
                  <span>{run.status}</span>
                  <strong>{run.title}</strong>
                  <small>{run.message || (run.finishedAt ? formatTime(run.finishedAt) : formatTime(run.startedAt))}</small>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ScheduledWorkflowGraphPreview({ workflow, language }: { workflow: WorkflowDraftState; language: Language }) {
  const zh = language === "zh";
  const definition = workflow.workflowV2Plan?.definition ?? workflow.definition;
  const renderScheduleNodeCard = (node: WorkflowV2Node): ReactElement => (
    <article className={`scheduled-workflow-node workflow-graph-card workflow-canvas-node-card is-${node.execModel}`}>
      <div className="workflow-graph-card-head">
        <span>{node.execModel}</span>
        <strong>{node.title}</strong>
      </div>
    </article>
  );

  if (!definition) {
    return <div className="empty-state config-empty">{zh ? "?????????? V2 ???" : "This workflow has no executable V2 plan."}</div>;
  }

  return (
    <div className="scheduled-workflow-detail">
      <div aria-label={zh ? "Workflow ???" : "Workflow graph detail"}>
        <WorkflowCanvasBoard definition={definition} className="scheduled-workflow-graph" renderNodeCard={renderScheduleNodeCard} />
      </div>
    </div>
  );
}
