import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isRuntimeId } from "../../../shared/runtime-catalog";
import type { AgentId } from "../../../shared/types";

export type RuntimeExecutableOverrides = Partial<Record<AgentId, string>>;

function parseOverrides(value: unknown): RuntimeExecutableOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const overrides: RuntimeExecutableOverrides = {};
  for (const [runtimeId, executable] of Object.entries(value)) {
    if (!isRuntimeId(runtimeId) || typeof executable !== "string") continue;
    const normalized = executable.trim();
    if (normalized) overrides[runtimeId] = normalized;
  }
  return overrides;
}

export async function loadRuntimeExecutableOverrides(configPath: string): Promise<RuntimeExecutableOverrides> {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parseOverrides("executables" in parsed ? (parsed as { executables?: unknown }).executables : undefined);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export async function saveRuntimeExecutableOverrides(
  configPath: string,
  overrides: RuntimeExecutableOverrides,
): Promise<void> {
  const directory = path.dirname(configPath);
  const temporaryPath = `${configPath}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ executables: parseOverrides(overrides) }, null, 2)}\n`, "utf8");
    await rename(temporaryPath, configPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
