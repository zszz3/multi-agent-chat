import { normalizeConfigChannelsForStorage } from "../../../shared/config-channels";
import {
  appendMissingRuntimeDefaultChannels,
  normalizeChannels,
} from "../../channels/model-config";
import type {
  PersistedAppStateV4,
  PersistedAppStateV5,
} from "./agent-hub-persistence";
import { asRecord } from "./agent-hub-persistence";

function isPersistedAppStateBase(raw: unknown): raw is PersistedAppStateV4 | PersistedAppStateV5 {
  const record = asRecord(raw);
  return Boolean(
    record
      && typeof record.workDir === "string"
      && Array.isArray(record.sessions)
      && Array.isArray(record.messages)
      && Array.isArray(record.events)
      && Array.isArray(record.tasks)
      && Array.isArray(record.taskMessages)
      && Array.isArray(record.taskEvents)
      && Array.isArray(record.teams)
      && Array.isArray(record.teamRuns),
  );
}

export function isPersistedAppStateV4(raw: unknown): raw is PersistedAppStateV4 {
  return isPersistedAppStateBase(raw) && raw.version === 4;
}

export function isPersistedAppStateV5(raw: unknown): raw is PersistedAppStateV5 {
  return isPersistedAppStateBase(raw) && raw.version === 5;
}

export interface PersistedAppStateMigrationResult {
  payload: PersistedAppStateV5;
  migrated: boolean;
}

export function migratePersistedAppState(raw: unknown): PersistedAppStateMigrationResult | undefined {
  if (isPersistedAppStateV5(raw)) return { payload: raw, migrated: false };
  if (!isPersistedAppStateV4(raw)) return undefined;

  const restoredChannels = normalizeConfigChannelsForStorage(normalizeChannels(raw.channels));
  return {
    payload: {
      ...raw,
      version: 5,
      channels: appendMissingRuntimeDefaultChannels(restoredChannels),
    },
    migrated: true,
  };
}
