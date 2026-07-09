import { randomUUID } from "node:crypto";
import type {
  AgentChannel,
  AgentId,
  AgentTeamMember,
  ChatMessage,
  ChatRuntimeSessionState,
  ConfiguredAgent,
  RuntimeConversation,
  TeamRunStep,
} from "../../../shared/types";
import { defaultChannelForAgent, defaultModelForAgent, isModelForChannel } from "../../../shared/models";
import {
  asArray,
  asBoolean,
  asNumber,
  asOptionalString,
  asRecord,
  cloneRuntimeState,
  defaultRuntimeSessionCapabilities,
  isAgentId,
  isAgentTeamMode,
  isAgentWorkflowTarget,
  isExecutionStyle,
  isRuntimeAttachmentState,
  isTaskProgress,
  isTaskRunStatus,
  isTeamRunStatus,
  isTeamRunStepStatus,
} from "./agent-hub-persistence";
import { normalizeRestoredMessages, restoreMessage } from "../state/agent-hub-restore";
import { titleFromPrompt } from "../chat/agent-hub-ui";
import { ChatState, TaskState, AgentTeamState, TeamRunState } from "../state/agent-hub-state";

type RestorableTeamMemberInput = Partial<Omit<AgentTeamMember, "id">> & { id?: string };

export interface RestoreConfiguredAgentDeps {
  channels: AgentChannel[];
  channelById: (channelId: string) => AgentChannel | undefined;
  defaultAgentId: AgentId;
}

export interface RestoreChatStateDeps {
  configuredAgentOrDefault: (configuredAgentId: string | undefined) => ConfiguredAgent | undefined;
  normalizeModelIdForConfiguredAgent: (
    configuredAgentId: string | undefined,
    modelId: string | undefined,
    channelIdOverride?: string,
  ) => string;
  channelById: (channelId: string) => AgentChannel | undefined;
  restoreRuntimeConversation: (raw: unknown) => RuntimeConversation | undefined;
  cloneRuntimeConversation: (conversation: RuntimeConversation) => RuntimeConversation;
  runtimeSupportsInteractiveChat: (runtimeAgentId: AgentId) => boolean;
  expirePendingInteractionEvents: (messages: ChatMessage[]) => ChatMessage[];
}

export interface RestoreTaskStateDeps {
  workDir: string;
  configuredAgentOrDefault: (configuredAgentId: string | undefined) => ConfiguredAgent | undefined;
  normalizeModelIdForConfiguredAgent: (
    configuredAgentId: string | undefined,
    modelId: string | undefined,
    channelIdOverride?: string,
  ) => string;
  restoreRuntimeConversation: (raw: unknown) => RuntimeConversation | undefined;
  cloneRuntimeConversation: (conversation: RuntimeConversation) => RuntimeConversation;
}

export interface RestoreTeamStateDeps {
  normalizeTeamMembers: (members: RestorableTeamMemberInput[]) => AgentTeamMember[];
}

export interface RestoreTeamRunStepDeps {
  configuredAgentOrDefault: (configuredAgentId: string | undefined) => ConfiguredAgent | undefined;
}

export interface RestoreTeamRunStateDeps {
  workDir: string;
  normalizeTeamMembers: (members: RestorableTeamMemberInput[]) => AgentTeamMember[];
  teamMembersFromRunSteps: (steps: TeamRunStep[]) => AgentTeamMember[];
  restoreTeamRunStep: (raw: unknown) => TeamRunStep | null;
}

export function restoreConfiguredAgentState(
  raw: unknown,
  deps: RestoreConfiguredAgentDeps,
  now = Date.now(),
): ConfiguredAgent | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const id = asOptionalString(record.id)?.trim();
  const name = asOptionalString(record.name)?.trim();
  const runtimeAgentId = isAgentId(record.runtimeAgentId) ? record.runtimeAgentId : deps.defaultAgentId;
  if (!id || !name) return undefined;
  const fallbackChannelId = defaultChannelForAgent(runtimeAgentId, deps.channels);
  const channelId = asOptionalString(record.channelId);
  const normalizedChannelId = channelId && deps.channelById(channelId)?.agentId === runtimeAgentId ? channelId : fallbackChannelId;
  const modelId = asOptionalString(record.modelId);
  return {
    id,
    name,
    description: asOptionalString(record.description) ?? "",
    runtimeAgentId,
    channelId: normalizedChannelId,
    modelId: modelId && isModelForChannel(runtimeAgentId, normalizedChannelId, modelId, deps.channels) ? modelId : defaultModelForAgent(runtimeAgentId),
    tags: asArray(record.tags).map((tag) => asOptionalString(tag)).filter((tag): tag is string => Boolean(tag)),
    createdAt: asNumber(record.createdAt, now),
    updatedAt: asNumber(record.updatedAt, now),
  };
}

export function restoreRuntimeState(raw: unknown): ChatRuntimeSessionState | undefined {
  const record = asRecord(raw);
  if (!record || !isExecutionStyle(record.executionStyle) || !isRuntimeAttachmentState(record.attachmentState)) return undefined;
  const capabilitiesRecord = asRecord(record.capabilities);
  const capabilities = defaultRuntimeSessionCapabilities();
  if (capabilitiesRecord) {
    capabilities.supportsInProcessConversationResume = asBoolean(capabilitiesRecord.supportsInProcessConversationResume);
    capabilities.supportsResumeAfterDetach = asBoolean(capabilitiesRecord.supportsResumeAfterDetach);
    capabilities.supportsResumeAfterAppRestart = asBoolean(capabilitiesRecord.supportsResumeAfterAppRestart);
    capabilities.supportsTurnResume = asBoolean(capabilitiesRecord.supportsTurnResume);
    capabilities.supportsInterrupt = asBoolean(capabilitiesRecord.supportsInterrupt);
    capabilities.supportsContinue = asBoolean(capabilitiesRecord.supportsContinue);
    capabilities.supportsApprovalRequests = asBoolean(capabilitiesRecord.supportsApprovalRequests);
    capabilities.supportsUserInputRequests = asBoolean(capabilitiesRecord.supportsUserInputRequests);
  }
  const restored: ChatRuntimeSessionState = {
    executionStyle: record.executionStyle,
    attachmentState: record.attachmentState,
    attachmentGeneration: Math.max(0, Math.floor(asNumber(record.attachmentGeneration, 0))),
    capabilities,
  };
  const activeTurnId = asOptionalString(record.activeTurnId);
  if (activeTurnId) restored.activeTurnId = activeTurnId;
  if (typeof record.lastMeaningfulActivityAt === "number") {
    restored.lastMeaningfulActivityAt = record.lastMeaningfulActivityAt;
  }
  return restored;
}

export function restoreChatState(raw: unknown, deps: RestoreChatStateDeps): ChatState | null {
  const record = asRecord(raw);
  if (!record || "sessionId" in record || "runtimeSession" in record) return null;

  const now = Date.now();
  const configuredAgent = deps.configuredAgentOrDefault(asOptionalString(record.configuredAgentId));
  if (!configuredAgent) return null;
  const chat = new ChatState(
    configuredAgent.id,
    deps.normalizeModelIdForConfiguredAgent(configuredAgent.id, asOptionalString(record.modelId) ?? configuredAgent.modelId),
    configuredAgent.name || "New Chat",
  );
  const channelId = asOptionalString(record.channelId);
  chat.channelId =
    channelId && deps.channelById(channelId)?.agentId === configuredAgent.runtimeAgentId
      ? channelId
      : undefined;
  chat.modelId = deps.normalizeModelIdForConfiguredAgent(
    configuredAgent.id,
    asOptionalString(record.modelId) ?? configuredAgent.modelId,
    chat.channelId,
  );
  chat.id = asOptionalString(record.id) ?? chat.id;
  chat.title = asOptionalString(record.title) ?? (configuredAgent.name || "New Chat");
  chat.running = false;
  chat.pendingAssistantMessageId = undefined;
  chat.lastError = asOptionalString(record.lastError);
  chat.createdAt = asNumber(record.createdAt, now);
  chat.updatedAt = asNumber(record.updatedAt, chat.createdAt);
  const messages = Array.isArray(record.messages)
    ? record.messages.map((message) => restoreMessage(message)).filter((message): message is ChatMessage => Boolean(message))
    : [];
  chat.messages = deps.expirePendingInteractionEvents(normalizeRestoredMessages(messages));
  const restoredRuntimeState = record.runtimeState === undefined ? undefined : restoreRuntimeState(record.runtimeState);
  if (record.runtimeState !== undefined && !restoredRuntimeState) return null;
  const restoredRuntimeConversation =
    record.runtimeConversation === undefined ? undefined : deps.restoreRuntimeConversation(record.runtimeConversation);
  if (record.runtimeConversation !== undefined && !restoredRuntimeConversation) return null;
  if (restoredRuntimeState && deps.runtimeSupportsInteractiveChat(configuredAgent.runtimeAgentId)) {
    chat.runtimeState = {
      ...cloneRuntimeState(restoredRuntimeState),
      attachmentState: "detached",
      attachmentGeneration: 0,
    };
    delete chat.runtimeState.activeTurnId;
  }
  chat.runtimeConversation = restoredRuntimeConversation ? deps.cloneRuntimeConversation(restoredRuntimeConversation) : undefined;
  return chat;
}

export function restoreTaskState(raw: unknown, deps: RestoreTaskStateDeps): TaskState | null {
  const record = asRecord(raw);
  if (!record || "sessionId" in record || typeof record.prompt !== "string") return null;

  const configuredAgent = deps.configuredAgentOrDefault(asOptionalString(record.configuredAgentId));
  if (!configuredAgent) return null;
  const now = Date.now();
  const task = new TaskState(
    record.prompt,
    configuredAgent.id,
    deps.normalizeModelIdForConfiguredAgent(configuredAgent.id, asOptionalString(record.modelId) ?? configuredAgent.modelId),
    asOptionalString(record.workDir) ?? deps.workDir,
  );
  task.id = asOptionalString(record.id) ?? task.id;
  task.title = asOptionalString(record.title) ?? titleFromPrompt(record.prompt);
  task.progress = isTaskProgress(record.progress) ? record.progress : "todo";
  const status = isTaskRunStatus(record.status) ? record.status : "completed";
  task.status = status === "running" ? "failed" : status;
  task.running = false;
  task.pendingAssistantMessageId = undefined;
  task.lastError = asOptionalString(record.lastError);
  task.createdAt = asNumber(record.createdAt, now);
  task.updatedAt = asNumber(record.updatedAt, task.createdAt);
  const messages = Array.isArray(record.messages)
    ? record.messages.map((message) => restoreMessage(message)).filter((message): message is ChatMessage => Boolean(message))
    : [];
  task.messages = normalizeRestoredMessages(messages);
  const restoredRuntimeConversation =
    record.runtimeConversation === undefined ? undefined : deps.restoreRuntimeConversation(record.runtimeConversation);
  if (record.runtimeConversation !== undefined && !restoredRuntimeConversation) return null;
  task.runtimeConversation = restoredRuntimeConversation ? deps.cloneRuntimeConversation(restoredRuntimeConversation) : undefined;
  return task;
}

export function restoreTeamState(raw: unknown, deps: RestoreTeamStateDeps): AgentTeamState | null {
  const record = asRecord(raw);
  const name = asOptionalString(record?.name);
  if (!record || !name) return null;
  const now = Date.now();
  const team = new AgentTeamState(
    name,
    isAgentTeamMode(record.mode) ? record.mode : "pipeline",
    asOptionalString(record.sharedContext) ?? "",
    deps.normalizeTeamMembers(asArray(record.members) as RestorableTeamMemberInput[]),
  );
  team.id = asOptionalString(record.id) ?? team.id;
  team.createdAt = asNumber(record.createdAt, now);
  team.updatedAt = asNumber(record.updatedAt, team.createdAt);
  return team;
}

export function restoreTeamRunState(raw: unknown, deps: RestoreTeamRunStateDeps): TeamRunState | null {
  const record = asRecord(raw);
  const teamId = asOptionalString(record?.teamId);
  const prompt = asOptionalString(record?.prompt);
  if (!record || !teamId || !prompt) return null;

  const placeholderTeam = new AgentTeamState(
    asOptionalString(record.teamName) ?? "Agent Team",
    isAgentTeamMode(record.mode) ? record.mode : "pipeline",
    "",
    [],
  );
  placeholderTeam.id = teamId;

  const now = Date.now();
  const run = new TeamRunState(
    placeholderTeam,
    prompt,
    isAgentWorkflowTarget(record.target) ? record.target : undefined,
    asOptionalString(record.workDir) ?? deps.workDir,
  );
  run.id = asOptionalString(record.id) ?? run.id;
  run.teamName = asOptionalString(record.teamName) ?? placeholderTeam.name;
  run.title = asOptionalString(record.title) ?? titleFromPrompt(prompt);
  run.status = isTeamRunStatus(record.status) ? record.status : "failed";
  if (run.status === "running" || run.status === "queued") run.status = "failed";
  run.currentStepIndex = Math.max(0, Math.floor(asNumber(record.currentStepIndex, 0)));
  run.sharedContextSnapshot = asOptionalString(record.sharedContextSnapshot) ?? "";
  run.lastError = asOptionalString(record.lastError);
  run.createdAt = asNumber(record.createdAt, now);
  run.updatedAt = asNumber(record.updatedAt, run.createdAt);
  run.steps = asArray(record.steps).map((step) => deps.restoreTeamRunStep(step)).filter((step): step is TeamRunStep => Boolean(step));
  const restoredMembers = deps.normalizeTeamMembers(asArray(record.membersSnapshot) as RestorableTeamMemberInput[]);
  run.membersSnapshot = restoredMembers.length > 0 ? restoredMembers : deps.teamMembersFromRunSteps(run.steps);
  return run;
}

export function restoreTeamRunStep(raw: unknown, deps: RestoreTeamRunStepDeps): TeamRunStep | null {
  const record = asRecord(raw);
  if (!record) return null;
  const configuredAgent = deps.configuredAgentOrDefault(asOptionalString(record.configuredAgentId));
  if (!configuredAgent) return null;
  return {
    id: asOptionalString(record.id) ?? randomUUID(),
    teamMemberId: asOptionalString(record.teamMemberId) ?? randomUUID(),
    roleName: asOptionalString(record.roleName) ?? "Agent",
    prompt: asOptionalString(record.prompt) ?? "",
    configuredAgentId: configuredAgent.id,
    status:
      isTeamRunStepStatus(record.status) && record.status !== "running" && record.status !== "queued"
        ? record.status
        : "failed",
    taskId: asOptionalString(record.taskId),
    artifact: asOptionalString(record.artifact),
    lastError: asOptionalString(record.lastError),
    startedAt: typeof record.startedAt === "number" ? record.startedAt : undefined,
    completedAt: typeof record.completedAt === "number" ? record.completedAt : undefined,
  };
}
