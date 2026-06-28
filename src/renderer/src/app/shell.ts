import type { ScheduledWorkflowDueEvent } from "../../../shared/types";

export type ActiveFeature = "chat" | "tasks" | "workflow" | "schedules" | "skills" | "configuration" | "runtimes" | "settings";

export function appShellClass(activeFeature: ActiveFeature): string {
  return activeFeature === "tasks" ||
    activeFeature === "workflow" ||
    activeFeature === "schedules" ||
    activeFeature === "skills" ||
    activeFeature === "configuration" ||
    activeFeature === "runtimes"
    ? `shell ${activeFeature}-shell`
    : "shell";
}

export function appContentClass(activeFeature: ActiveFeature): string {
  if (activeFeature === "chat") return "content chat-content";
  if (activeFeature === "tasks") return "content tasks-content";
  if (activeFeature === "workflow") return "content workflow-content";
  if (activeFeature === "schedules") return "content scheduled-content";
  if (activeFeature === "skills") return "content skills-content";
  if (activeFeature === "configuration") return "content config-content";
  if (activeFeature === "runtimes") return "content runtime-content";
  if (activeFeature === "settings") return "content settings-content";
  return "content chat-content";
}

export function missingAppCapabilityMessage(action: string): string {
  return `${action} needs a full app restart to load the updated Electron API.`;
}

export async function syncKeepAwakeIfAvailable(api: Window["multiAgentChat"], enabled: boolean): Promise<void> {
  const keepAwakeApi = api as Window["multiAgentChat"] & {
    setKeepAwake?: (enabled: boolean) => Promise<boolean>;
  };
  if (typeof keepAwakeApi.setKeepAwake !== "function") return;
  await keepAwakeApi.setKeepAwake(enabled);
}

export function taskDetailIdFor(
  activeFeature: ActiveFeature,
  selectedTaskDetailId: string | undefined,
  persistedActiveTaskId: string | undefined,
): string | undefined {
  void persistedActiveTaskId;
  return activeFeature === "tasks" ? selectedTaskDetailId : undefined;
}

export function scheduledWorkflowEventTarget(event: ScheduledWorkflowDueEvent): { scheduleId: string; workflowId: string } | undefined {
  const scheduleId = typeof event.payload.scheduleId === "string" ? event.payload.scheduleId : undefined;
  const workflowId = typeof event.payload.workflowId === "string" ? event.payload.workflowId : undefined;
  if (!scheduleId || !workflowId) return undefined;
  return { scheduleId, workflowId };
}
