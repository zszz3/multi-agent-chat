import type { AgentId, RuntimeConversation } from "../../../shared/types";

export interface CodexRuntimeConversationPayload {
  native: {
    threadId: string;
    sessionTreeRootId?: string;
  };
  appContext?: {
    cwd?: string;
    modelId?: string;
    approvalPolicy?: string;
    sandboxPolicy?: unknown;
  };
  extensions?: Record<string, unknown>;
}

export interface ClaudeRuntimeConversationPayload {
  native: {
    sessionId: string;
    projectKey?: string;
    subpaths?: string[];
  };
  appContext?: {
    cwd?: string;
    modelId?: string;
    claudeConfigDir?: string;
    sessionStoreRef?: string;
  };
  extensions?: Record<string, unknown>;
}

export interface HermesRuntimeConversationPayload {
  native: {
    sessionId: string;
  };
  appContext?: {
    cwd?: string;
    modelId?: string;
    transport?: "acp";
  };
  extensions?: Record<string, unknown>;
}

export interface RuntimeStateCodec<TState> {
  runtimeId: AgentId;
  restorePersistedConversation(raw: unknown): RuntimeConversation | undefined;
  cloneConversation(conversation: RuntimeConversation): RuntimeConversation | undefined;
  decodeConversation(conversation: RuntimeConversation | undefined): TState | undefined;
  encodeConversation(state: TState): RuntimeConversation;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => asString(item)).filter((item): item is string => item !== undefined);
  return items.length === value.length ? items : undefined;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function asRuntimeConversationEnvelope(raw: unknown, runtimeId: AgentId): RuntimeConversation | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  if (record.runtimeId !== runtimeId) return undefined;
  if (record.codecVersion !== "v1") return undefined;
  if (!Object.prototype.hasOwnProperty.call(record, "payload")) return undefined;
  return {
    runtimeId,
    codecVersion: "v1",
    payload: cloneValue(record.payload),
  };
}

function cloneEnvelope(runtimeId: AgentId, payload: unknown): RuntimeConversation {
  return {
    runtimeId,
    codecVersion: "v1",
    payload: cloneValue(payload),
  };
}

function decodeCodexPayload(raw: unknown): CodexRuntimeConversationPayload | undefined {
  const record = asRecord(raw);
  const native = asRecord(record?.native);
  const threadId = asString(native?.threadId);
  if (!threadId) return undefined;
  if (native && Object.prototype.hasOwnProperty.call(native, "sessionTreeRootId") && typeof native.sessionTreeRootId !== "string") {
    return undefined;
  }
  const sessionTreeRootId = asString(native?.sessionTreeRootId);
  const appContext = asRecord(record?.appContext);
  const extensions = asRecord(record?.extensions);
  if (record?.appContext !== undefined && !appContext) return undefined;
  if (record?.extensions !== undefined && !extensions) return undefined;
  if (
    appContext &&
    ((Object.prototype.hasOwnProperty.call(appContext, "cwd") && typeof appContext.cwd !== "string") ||
      (Object.prototype.hasOwnProperty.call(appContext, "modelId") && typeof appContext.modelId !== "string") ||
      (Object.prototype.hasOwnProperty.call(appContext, "approvalPolicy") && typeof appContext.approvalPolicy !== "string"))
  ) {
    return undefined;
  }
  const cwd = asString(appContext?.cwd);
  const modelId = asString(appContext?.modelId);
  const approvalPolicy = asString(appContext?.approvalPolicy);
  return {
    native: {
      threadId,
      ...(sessionTreeRootId !== undefined ? { sessionTreeRootId } : {}),
    },
    ...(appContext
      ? {
          appContext: {
            ...(cwd !== undefined ? { cwd } : {}),
            ...(modelId !== undefined ? { modelId } : {}),
            ...(approvalPolicy !== undefined ? { approvalPolicy } : {}),
            ...(Object.prototype.hasOwnProperty.call(appContext, "sandboxPolicy") ? { sandboxPolicy: cloneValue(appContext.sandboxPolicy) } : {}),
          },
        }
      : {}),
    ...(extensions ? { extensions: cloneValue(extensions) } : {}),
  };
}

function decodeClaudePayload(raw: unknown): ClaudeRuntimeConversationPayload | undefined {
  const record = asRecord(raw);
  const native = asRecord(record?.native);
  const sessionId = asString(native?.sessionId);
  if (!sessionId) return undefined;
  if (native && Object.prototype.hasOwnProperty.call(native, "projectKey") && typeof native.projectKey !== "string") {
    return undefined;
  }
  if (native && Object.prototype.hasOwnProperty.call(native, "subpaths") && asOptionalStringArray(native.subpaths) === undefined) {
    return undefined;
  }
  const projectKey = asString(native?.projectKey);
  const subpaths = asOptionalStringArray(native?.subpaths);
  const appContext = asRecord(record?.appContext);
  const extensions = asRecord(record?.extensions);
  if (record?.appContext !== undefined && !appContext) return undefined;
  if (record?.extensions !== undefined && !extensions) return undefined;
  if (
    appContext &&
    ((Object.prototype.hasOwnProperty.call(appContext, "cwd") && typeof appContext.cwd !== "string") ||
      (Object.prototype.hasOwnProperty.call(appContext, "modelId") && typeof appContext.modelId !== "string") ||
      (Object.prototype.hasOwnProperty.call(appContext, "claudeConfigDir") && typeof appContext.claudeConfigDir !== "string") ||
      (Object.prototype.hasOwnProperty.call(appContext, "sessionStoreRef") && typeof appContext.sessionStoreRef !== "string"))
  ) {
    return undefined;
  }
  const cwd = asString(appContext?.cwd);
  const modelId = asString(appContext?.modelId);
  const claudeConfigDir = asString(appContext?.claudeConfigDir);
  const sessionStoreRef = asString(appContext?.sessionStoreRef);
  return {
    native: {
      sessionId,
      ...(projectKey !== undefined ? { projectKey } : {}),
      ...(subpaths !== undefined ? { subpaths } : {}),
    },
    ...(appContext
      ? {
          appContext: {
            ...(cwd !== undefined ? { cwd } : {}),
            ...(modelId !== undefined ? { modelId } : {}),
            ...(claudeConfigDir !== undefined ? { claudeConfigDir } : {}),
            ...(sessionStoreRef !== undefined ? { sessionStoreRef } : {}),
          },
        }
      : {}),
    ...(extensions ? { extensions: cloneValue(extensions) } : {}),
  };
}

function decodeHermesPayload(raw: unknown): HermesRuntimeConversationPayload | undefined {
  const record = asRecord(raw);
  const native = asRecord(record?.native);
  const sessionId = asString(native?.sessionId);
  if (!sessionId) return undefined;
  const appContext = asRecord(record?.appContext);
  const extensions = asRecord(record?.extensions);
  if (record?.appContext !== undefined && !appContext) return undefined;
  if (record?.extensions !== undefined && !extensions) return undefined;
  if (
    appContext
    && ((Object.prototype.hasOwnProperty.call(appContext, "cwd") && typeof appContext.cwd !== "string")
      || (Object.prototype.hasOwnProperty.call(appContext, "modelId") && typeof appContext.modelId !== "string")
      || (Object.prototype.hasOwnProperty.call(appContext, "transport") && appContext.transport !== "acp"))
  ) {
    return undefined;
  }
  const cwd = asString(appContext?.cwd);
  const modelId = asString(appContext?.modelId);
  const transport = appContext?.transport === "acp" ? "acp" as const : undefined;
  return {
    native: { sessionId },
    ...(appContext
      ? {
          appContext: {
            ...(cwd !== undefined ? { cwd } : {}),
            ...(modelId !== undefined ? { modelId } : {}),
            ...(transport !== undefined ? { transport } : {}),
          },
        }
      : {}),
    ...(extensions ? { extensions: cloneValue(extensions) } : {}),
  };
}

function createRuntimeStateCodec<TState>(input: {
  runtimeId: AgentId;
  decodePayload: (raw: unknown) => TState | undefined;
}): RuntimeStateCodec<TState> {
  return {
    runtimeId: input.runtimeId,
    restorePersistedConversation(raw: unknown): RuntimeConversation | undefined {
      const envelope = asRuntimeConversationEnvelope(raw, input.runtimeId);
      if (!envelope) return undefined;
      const decoded = input.decodePayload(envelope.payload);
      return decoded ? cloneEnvelope(input.runtimeId, decoded) : undefined;
    },
    cloneConversation(conversation: RuntimeConversation): RuntimeConversation | undefined {
      const decoded = this.decodeConversation(conversation);
      return decoded ? this.encodeConversation(decoded) : undefined;
    },
    decodeConversation(conversation: RuntimeConversation | undefined): TState | undefined {
      if (!conversation || conversation.runtimeId !== input.runtimeId || conversation.codecVersion !== "v1") return undefined;
      return input.decodePayload(conversation.payload);
    },
    encodeConversation(state: TState): RuntimeConversation {
      return cloneEnvelope(input.runtimeId, state);
    },
  };
}

export const codexRuntimeStateCodec = createRuntimeStateCodec<CodexRuntimeConversationPayload>({
  runtimeId: "codex",
  decodePayload: decodeCodexPayload,
});

export const claudeRuntimeStateCodec = createRuntimeStateCodec<ClaudeRuntimeConversationPayload>({
  runtimeId: "claude",
  decodePayload: decodeClaudePayload,
});

export const hermesRuntimeStateCodec = createRuntimeStateCodec<HermesRuntimeConversationPayload>({
  runtimeId: "hermes",
  decodePayload: decodeHermesPayload,
});
