import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AgentId, AgentRuntime } from "../../shared/types";

const execFileAsync = promisify(execFile);

const AGENT_COMMANDS: Record<AgentId, { label: string; env: string; executable: string }> = {
  codex: { label: "Codex", env: "CODEX_PATH", executable: "codex" },
  claude: { label: "Claude Code", env: "CLAUDE_PATH", executable: "claude" },
};

export function parseCliVersion(raw: string): string {
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const match = firstLine.match(/(\d+\.\d+[\w.+-]*)/);
  return match?.[1] ?? firstLine;
}

async function detectOne(id: AgentId): Promise<AgentRuntime> {
  const spec = AGENT_COMMANDS[id];
  const command = process.env[spec.env] ?? spec.executable;

  try {
    const { stdout } = await execFileAsync(command, ["--version"], {
      timeout: 5000,
      windowsHide: true,
      maxBuffer: 1024 * 16,
    });
    return {
      id,
      label: spec.label,
      command,
      version: parseCliVersion(String(stdout).trim()),
      available: true,
    };
  } catch (error) {
    return {
      id,
      label: spec.label,
      command,
      version: null,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function detectAgentRuntimes(): Promise<AgentRuntime[]> {
  return Promise.all([detectOne("codex"), detectOne("claude")]);
}
