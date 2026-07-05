import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DarwinShellPathLookupOptions {
  env?: NodeJS.ProcessEnv;
  shell?: string;
  timeoutMs?: number;
}

export async function lookupDarwinLoginShellPath(options: DarwinShellPathLookupOptions = {}): Promise<string[] | null> {
  const shell = options.shell?.trim() || options.env?.SHELL?.trim() || "/bin/zsh";
  try {
    const { stdout } = await execFileAsync(shell, ["-l", "-c", 'printf %s "$PATH"'], {
      env: options.env,
      timeout: options.timeoutMs ?? 3_000,
      windowsHide: true,
      maxBuffer: 1024 * 64,
      encoding: "utf8",
    });
    const entries = stdout
      .split(":")
      .map((item) => item.trim())
      .filter(Boolean);
    if (entries.length === 0) return null;
    return [...new Set(entries)];
  } catch {
    return null;
  }
}
