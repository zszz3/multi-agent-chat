import type {
  CreateWorkflowRequest,
  WorkflowArtifactReference,
  WorkflowDraftState,
  WorkflowOperationResult,
} from "../../../shared/types";
import { validateWorkflowV2Definition } from "../../../shared/workflow-v2/validation";
import type { WorkflowV2Definition } from "../../../shared/workflow-v2/definition";
import { asOptionalString, asRecord } from "../persisted/agent-hub-persistence";

type WorkflowToolName = "workflow_create" | "workflow_validate" | "workflow_context_append";

export interface CodexWorkflowToolCallResult {
  handled: boolean;
  success?: boolean;
  payload?: Record<string, unknown>;
  workflowId?: string;
  revision?: number;
}

export interface CodexWorkflowToolDependencies {
  createWorkflow: (request: CreateWorkflowRequest) => WorkflowOperationResult;
  getWorkflow: (workflowId: string) => WorkflowDraftState | undefined;
  appendWorkflowContext: (input: {
    workflowId: string;
    report: string;
    handoff: string;
    artifacts: WorkflowArtifactReference[];
  }) => WorkflowOperationResult;
}

const TOOL_NAMES = new Set<WorkflowToolName>([
  "workflow_create",
  "workflow_validate",
  "workflow_context_append",
]);

function toolName(value: unknown): WorkflowToolName | undefined {
  if (typeof value !== "string") return undefined;
  for (const candidate of [value, ...value.split("__"), ...value.split(/[.:/]/)]) {
    const normalized = candidate.trim().toLowerCase().replace(/-/g, "_") as WorkflowToolName;
    if (TOOL_NAMES.has(normalized)) return normalized;
  }
  return undefined;
}

function findToolName(value: unknown, depth = 0): WorkflowToolName | undefined {
  if (depth > 4) return undefined;
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ["name", "toolName", "tool_name", "serverToolName", "dynamicToolName"]) {
    const found = toolName(record[key]);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findToolName(nested, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function inputRecord(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (record) return record;
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return undefined;
  }
}

function findToolInput(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 4) return undefined;
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ["arguments", "args", "input", "parameters", "params", "json"]) {
    const parsed = inputRecord(record[key]);
    if (parsed) return parsed;
  }
  if ("definition" in record || "graph" in record || "workflowId" in record || "report" in record || "handoff" in record) return record;
  for (const key of ["toolCall", "tool_call", "call", "request", "payload"]) {
    const parsed = findToolInput(record[key], depth + 1);
    if (parsed) return parsed;
  }
  return undefined;
}

export function handleCodexWorkflowToolCall(
  params: Record<string, unknown>,
  deps: CodexWorkflowToolDependencies,
): CodexWorkflowToolCallResult {
  const name = findToolName(params);
  if (!name) return { handled: false };
  const input = findToolInput(params) ?? {};
  if (name === "workflow_create") {
    const definition = asRecord(input.definition) as unknown as WorkflowV2Definition | undefined;
    const validation = definition ? validateWorkflowV2Definition(definition) : undefined;
    if (!definition || !validation?.valid) {
      return { handled: true, success: false, payload: { ok: false, error: validation?.errors[0] ?? "workflow_create requires a valid Workflow V2 definition." } };
    }
    const title = asOptionalString(input.title) ?? definition.objective;
    const request: CreateWorkflowRequest = {
      title,
      objective: asOptionalString(input.objective) ?? definition.objective,
      definition,
    };
    const configuredAgentId = asOptionalString(input.configuredAgentId);
    if (configuredAgentId) request.configuredAgentId = configuredAgentId;
    const modelId = asOptionalString(input.modelId);
    if (modelId) request.modelId = modelId;
    const workDir = asOptionalString(input.workDir);
    if (workDir) request.workDir = workDir;
    const result = deps.createWorkflow(request);
    const workflow = result.workflowId ? deps.getWorkflow(result.workflowId) : undefined;
    return {
      handled: true,
      success: result.ok,
      payload: (workflow ? { ...result, workflow } : result) as Record<string, unknown>,
      ...(result.workflowId ? { workflowId: result.workflowId } : {}),
      ...(result.revision !== undefined ? { revision: result.revision } : {}),
    };
  }
  if (name === "workflow_validate") {
    const workflowId = asOptionalString(input.workflowId) ?? "";
    const definition = (asRecord(input.definition) as unknown as WorkflowV2Definition | undefined) ?? deps.getWorkflow(workflowId)?.definition;
    if (!definition) return { handled: true, success: false, payload: { ok: false, error: "workflow_validate requires definition or workflowId." } };
    const validation = validateWorkflowV2Definition(definition);
    return {
      handled: true,
      success: validation.valid,
      payload: { ok: validation.valid, validation, error: validation.valid ? undefined : validation.errors[0] },
    };
  }
  const result = deps.appendWorkflowContext({
    workflowId: asOptionalString(input.workflowId) ?? "",
    report: asOptionalString(input.report) ?? "",
    handoff: asOptionalString(input.handoff) ?? "",
    artifacts: Array.isArray(input.artifacts) ? input.artifacts as WorkflowArtifactReference[] : [],
  });
  return { handled: true, success: result.ok, payload: result as unknown as Record<string, unknown> };
}
