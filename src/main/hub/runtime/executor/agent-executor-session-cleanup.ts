import type { Dirent } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RuntimeConversation } from "../../../../shared/types";
import { execCli } from "../../../platform/cli-launcher";
import { codexHome } from "../../../channels/model-config";
import { claudeSessionIdFromConversation, codexThreadIdFromConversation } from "./agent-executor-conversation";

function claudeProjectStoragePath(workDir: string, sessionId: string): string {
  const slug = workDir.replace(/[:\\/]/g, "-");
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, ".claude", "projects", slug, `${sessionId}.jsonl`);
}

export async function deleteCodexSessionFiles(home: string, sessionId: string): Promise<number> {
  const root = path.join(home, "sessions");
  let deleted = 0;
  const visit = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await visit(entryPath);
          return;
        }
        if (!entry.isFile() || !entry.name.includes(sessionId)) return;
        await rm(entryPath, { force: true });
        deleted += 1;
      }),
    );
  };
  await visit(root);
  return deleted;
}

export async function deleteCodexSessionArtifacts(executable: string, runtimeConversation?: RuntimeConversation): Promise<void> {
  const sessionId = codexThreadIdFromConversation(runtimeConversation);
  if (!sessionId) return;
  try {
    await execCli({
      executable,
      args: ["archive", sessionId],
      cwd: process.cwd(),
      env: process.env,
      timeout: 10_000,
      windowsHide: true,
      maxBuffer: 1024 * 64,
    });
  } catch (error) {
    console.warn(`Failed to archive Codex session ${sessionId}:`, error);
  }
  try {
    await deleteCodexSessionFiles(codexHome(), sessionId);
  } catch (error) {
    console.warn(`Failed to delete local Codex session ${sessionId}:`, error);
  }
}

export async function deleteClaudeSessionArtifacts(workDir: string, runtimeConversation?: RuntimeConversation): Promise<void> {
  const sessionId = claudeSessionIdFromConversation(runtimeConversation);
  if (!sessionId) return;
  try {
    await rm(claudeProjectStoragePath(workDir, sessionId), { force: true });
  } catch (error) {
    console.warn(`Failed to delete Claude session ${sessionId}:`, error);
  }
}
