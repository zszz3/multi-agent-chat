import type { ExecuteWorkflowV2ScriptRequest } from "../workflow-runtime";
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";
import { spawn } from "node:child_process";

const READ_ONLY_GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "rev-parse", "ls-files"]);

function validateTypedCommand(input: ExecuteWorkflowV2ScriptRequest): { command: string; args: string[] } {
  const { script } = input.node;
  if (!script.command || !script.args || script.cwdPolicy !== "workflow" || !script.access || !script.outputSchema) {
    throw new Error("Workflow V2 legacy/free-form scripts remain disabled; a complete typed command spec is required.");
  }
  if (script.access === "workspace-write" && !input.approved) throw new Error("Workflow V2 workspace-write script requires explicit approval.");
  if (script.command !== "git" || !READ_ONLY_GIT_SUBCOMMANDS.has(script.args[0] ?? "")) {
    throw new Error(`Workflow V2 command ${script.command} is not allowlisted.`);
  }
  if (script.access !== "read-only") throw new Error("No workspace-write command is currently allowlisted.");
  if (script.args.some((argument) => /[;&|><`]/.test(argument))) throw new Error("Workflow V2 command arguments contain forbidden shell syntax.");
  return { command: script.command, args: script.args };
}

async function runTypedCommand(input: ExecuteWorkflowV2ScriptRequest, command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: input.workDir, shell: false, windowsHide: true, signal: input.signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => code === (input.node.expectedExitCode ?? 0) ? resolve(stdout) : reject(new Error(stderr || `Script exited with code ${code}.`)));
  });
}

/**
 * Product policy for script execution until a trusted isolation backend and the
 * Phase 04 human-approval surface exist. Every mode fails closed deliberately.
 */
export async function executeWorkflowV2ScriptWithPolicy(
  input: ExecuteWorkflowV2ScriptRequest,
): Promise<WorkflowV2WorkerOutput> {
  const { command, args } = validateTypedCommand(input);
  const stdout = await runTypedCommand(input, command, args);
  const output = { stdout: stdout.trim() };
  for (const key of input.node.script.outputSchema?.required ?? []) {
    if (!(key in output)) throw new Error(`Workflow V2 script output is missing required field ${key}.`);
  }
  return { nodeId: input.node.id, summary: `${command} ${args.join(" ")} completed.`, outputs: output, evidence: [stdout.trim()].filter(Boolean), proposals: [] };
}
