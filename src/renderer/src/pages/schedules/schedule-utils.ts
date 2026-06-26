import {
  DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY,
  DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
} from "../../../../shared/types";
import type { ScheduledWorkflowFrequency, ScheduledWorkflowSchedule, WorkflowDraftState } from "../../../../shared/types";
import type { Language } from "../../app/language";

export const DEFAULT_SCHEDULE_INTERVAL_SECONDS = 86400;

export const WEEKDAY_OPTIONS = [
  { value: 1, zh: "周一", en: "Mon" },
  { value: 2, zh: "周二", en: "Tue" },
  { value: 3, zh: "周三", en: "Wed" },
  { value: 4, zh: "周四", en: "Thu" },
  { value: 5, zh: "周五", en: "Fri" },
  { value: 6, zh: "周六", en: "Sat" },
  { value: 0, zh: "周日", en: "Sun" },
];

export interface ScheduledWorkflowDraft {
  workflowId: string;
  title: string;
  intervalSeconds: number;
  frequency: ScheduledWorkflowFrequency;
  timeOfDay: string;
  timezone: string;
  weekdays: number[];
  dayOfMonth: number;
  enabled: boolean;
}

export function defaultScheduledWorkflowDraft(workflows: WorkflowDraftState[], activeWorkflowId?: string): ScheduledWorkflowDraft {
  const firstWorkflow = workflows.find((workflow) => workflow.workflowId === activeWorkflowId) ?? workflows[0];
  return {
    workflowId: firstWorkflow?.workflowId ?? "",
    title: firstWorkflow ? `${firstWorkflow.title} schedule` : "Scheduled workflow",
    intervalSeconds: DEFAULT_SCHEDULE_INTERVAL_SECONDS,
    frequency: "daily",
    timeOfDay: DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY,
    timezone: DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
    weekdays: [1],
    dayOfMonth: 1,
    enabled: true,
  };
}

function formatScheduleInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function intervalSecondsForFrequency(frequency: ScheduledWorkflowFrequency): number {
  if (frequency === "weekly") return 7 * 86400;
  if (frequency === "monthly") return 30 * 86400;
  return 86400;
}

export function normalizeScheduleTimeOfDay(value: string | undefined): string {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY;
}

export function normalizeScheduleWeekdays(value: number[] | undefined): number[] {
  const days = [...new Set((value ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.length > 0 ? days : [1];
}

export function normalizeScheduleDayOfMonth(value: number | undefined): number {
  return Math.min(31, Math.max(1, Math.floor(value || 1)));
}

export function formatScheduleRecurrence(schedule: Pick<ScheduledWorkflowSchedule, "frequency" | "timeOfDay" | "weekdays" | "dayOfMonth" | "intervalSeconds">, language: Language): string {
  const zh = language === "zh";
  const timeOfDay = normalizeScheduleTimeOfDay(schedule.timeOfDay);
  if (schedule.frequency === "weekly") {
    const days = normalizeScheduleWeekdays(schedule.weekdays)
      .map((day) => WEEKDAY_OPTIONS.find((item) => item.value === day)?.[zh ? "zh" : "en"] ?? String(day))
      .join(zh ? "、" : ", ");
    return zh ? `每周${days} ${timeOfDay}` : `Every ${days} at ${timeOfDay}`;
  }
  if (schedule.frequency === "monthly") {
    const day = normalizeScheduleDayOfMonth(schedule.dayOfMonth);
    return zh ? `每月 ${day} 号 ${timeOfDay}` : `Monthly on day ${day} at ${timeOfDay}`;
  }
  if (schedule.frequency === "daily" || schedule.timeOfDay) {
    return zh ? `每天 ${timeOfDay}` : `Daily at ${timeOfDay}`;
  }
  return formatScheduleInterval(schedule.intervalSeconds);
}
