import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentId, LearnedNativeCommandRecord, RuntimeCommandConfig } from "../shared/types";

const RUNTIME_COMMAND_STATE_VERSION = 1;

export interface RuntimeCommandStateFile {
  version: typeof RUNTIME_COMMAND_STATE_VERSION;
  runtimeCommandConfigs: RuntimeCommandConfig[];
  learnedNativeCommands: LearnedNativeCommandRecord[];
}

export function runtimeCommandStatePathFor(storagePath: string): string {
  return `${storagePath}.runtime-commands.json`;
}

function isAgentId(value: unknown): value is AgentId {
  return value === "codex" || value === "claude" || value === "api";
}

function cloneRuntimeCommandOverride(override: RuntimeCommandConfig["override"]): RuntimeCommandConfig["override"] {
  if (!override || typeof override.executable !== "string") return undefined;
  const fixedArgs = Array.isArray(override.fixedArgs)
    ? override.fixedArgs.filter((item): item is string => typeof item === "string")
    : undefined;
  return {
    executable: override.executable,
    ...(fixedArgs && fixedArgs.length > 0 ? { fixedArgs: [...fixedArgs] } : {}),
  };
}

function cloneRuntimeCommandConfig(config: RuntimeCommandConfig): RuntimeCommandConfig {
  const override = cloneRuntimeCommandOverride(config.override);
  return {
    runtimeId: config.runtimeId,
    ...(override ? { override } : {}),
  };
}

function cloneLearnedNativeCommandRecord(record: LearnedNativeCommandRecord): LearnedNativeCommandRecord {
  return {
    runtimeId: record.runtimeId,
    cliFingerprint: record.cliFingerprint,
    commandStem: record.commandStem,
    example: record.example,
    successCount: record.successCount,
    lastUsedAt: record.lastUsedAt,
  };
}

export function createEmptyRuntimeCommandState(): RuntimeCommandStateFile {
  return {
    version: RUNTIME_COMMAND_STATE_VERSION,
    runtimeCommandConfigs: [],
    learnedNativeCommands: [],
  };
}

export function normalizeRuntimeCommandState(state: RuntimeCommandStateFile): RuntimeCommandStateFile {
  return {
    version: RUNTIME_COMMAND_STATE_VERSION,
    runtimeCommandConfigs: [...state.runtimeCommandConfigs]
      .map((config) => cloneRuntimeCommandConfig(config))
      .sort((left, right) => {
        const runtimeOrder = left.runtimeId.localeCompare(right.runtimeId);
        if (runtimeOrder !== 0) return runtimeOrder;
        const leftExecutable = left.override?.executable ?? "";
        const rightExecutable = right.override?.executable ?? "";
        const executableOrder = leftExecutable.localeCompare(rightExecutable);
        if (executableOrder !== 0) return executableOrder;
        return (left.override?.fixedArgs ?? []).join("\u0000").localeCompare((right.override?.fixedArgs ?? []).join("\u0000"));
      }),
    learnedNativeCommands: [...state.learnedNativeCommands]
      .map((record) => cloneLearnedNativeCommandRecord(record))
      .sort((left, right) => {
        const runtimeOrder = left.runtimeId.localeCompare(right.runtimeId);
        if (runtimeOrder !== 0) return runtimeOrder;
        const fingerprintOrder = left.cliFingerprint.localeCompare(right.cliFingerprint);
        if (fingerprintOrder !== 0) return fingerprintOrder;
        const stemOrder = left.commandStem.localeCompare(right.commandStem);
        if (stemOrder !== 0) return stemOrder;
        const exampleOrder = left.example.localeCompare(right.example);
        if (exampleOrder !== 0) return exampleOrder;
        const successOrder = left.successCount - right.successCount;
        if (successOrder !== 0) return successOrder;
        return left.lastUsedAt - right.lastUsedAt;
      }),
  };
}

function parseRuntimeCommandConfigs(raw: unknown): RuntimeCommandConfig[] {
  if (!Array.isArray(raw)) return [];
  const configs: RuntimeCommandConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as { runtimeId?: unknown; override?: unknown };
    if (!isAgentId(record.runtimeId)) continue;
    const overrideRecord = record.override && typeof record.override === "object"
      ? (record.override as { executable?: unknown; fixedArgs?: unknown })
      : undefined;
    if (!overrideRecord || typeof overrideRecord.executable !== "string") {
      configs.push({ runtimeId: record.runtimeId });
      continue;
    }
    const fixedArgs = Array.isArray(overrideRecord.fixedArgs)
      ? overrideRecord.fixedArgs.filter((value): value is string => typeof value === "string")
      : undefined;
    configs.push({
      runtimeId: record.runtimeId,
      override: {
        executable: overrideRecord.executable,
        ...(fixedArgs && fixedArgs.length > 0 ? { fixedArgs } : {}),
      },
    });
  }
  return configs;
}

function parseLearnedNativeCommands(raw: unknown): LearnedNativeCommandRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: LearnedNativeCommandRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<LearnedNativeCommandRecord>;
    if (
      !isAgentId(record.runtimeId) ||
      typeof record.cliFingerprint !== "string" ||
      typeof record.commandStem !== "string" ||
      typeof record.example !== "string" ||
      typeof record.successCount !== "number" ||
      typeof record.lastUsedAt !== "number"
    ) {
      continue;
    }
    records.push({
      runtimeId: record.runtimeId,
      cliFingerprint: record.cliFingerprint,
      commandStem: record.commandStem,
      example: record.example,
      successCount: record.successCount,
      lastUsedAt: record.lastUsedAt,
    });
  }
  return records;
}

export async function loadRuntimeCommandState(filePath: string): Promise<RuntimeCommandStateFile> {
  const state = await loadOptionalRuntimeCommandState(filePath);
  return state ?? createEmptyRuntimeCommandState();
}

export async function loadOptionalRuntimeCommandState(filePath: string): Promise<RuntimeCommandStateFile | undefined> {
  try {
    const raw = JSON.parse(await readFile(filePath, "utf8")) as {
      version?: number;
      runtimeCommandConfigs?: unknown;
      learnedNativeCommands?: unknown;
    };
    const state: RuntimeCommandStateFile = {
      version: RUNTIME_COMMAND_STATE_VERSION,
      runtimeCommandConfigs: parseRuntimeCommandConfigs(raw.runtimeCommandConfigs),
      learnedNativeCommands: parseLearnedNativeCommands(raw.learnedNativeCommands),
    };
    return normalizeRuntimeCommandState(state);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function saveRuntimeCommandState(filePath: string, state: RuntimeCommandStateFile): Promise<void> {
  const normalized = normalizeRuntimeCommandState(state);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}
