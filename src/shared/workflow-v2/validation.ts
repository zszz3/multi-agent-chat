import type {
  WorkflowV2AuthoredDefinition,
  WorkflowV2Definition,
  WorkflowV2ModelProfile,
  WorkflowV2Node,
  WorkflowV2NodeRole,
  WorkflowV2ScriptSandboxMode,
  WorkflowV2ValidationResult,
} from "./definition";
import type {
  WorkflowV2AcceptanceCriterion,
  WorkflowV2BudgetEnvelope,
  WorkflowV2CostBudget,
} from "./planning";
import { isWorkflowV2ExecutionLeasePolicy } from "./supervision";
import type { WorkflowV2TemplateRegistry } from "./templates";
import { compileWorkflowV2Definition, WorkflowV2TemplateCompileError } from "./templates";
import { workflowV2NodeHookValidationErrors } from "./hooks";

const VALID_SANDBOX_MODES: ReadonlySet<WorkflowV2ScriptSandboxMode> = new Set(["sandbox", "workspace", "full"]);
const VALID_SCRIPT_LANGUAGES = new Set(["python", "typescript", "bash"]);
const VALID_SUMMARY_FALLBACK_POLICIES = new Set(["truncate", "summarize", "ask_human"]);
const VALID_MODEL_PROFILES = new Set(["fast", "balanced", "expert"]);
const VALID_NODE_ROLES = new Set(["orchestrator", "executor", "reviewer"]);

export function isSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

export function isNonNegativeSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

export function isWorkflowV2ModelProfile(value: unknown): value is WorkflowV2ModelProfile {
  return typeof value === "string" && VALID_MODEL_PROFILES.has(value);
}

export function isWorkflowV2NodeRole(value: unknown): value is WorkflowV2NodeRole {
  return typeof value === "string" && VALID_NODE_ROLES.has(value);
}

export function workflowV2AcceptanceCriteriaValidationErrors(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["Workflow V2 acceptance criteria must be a non-empty array."];
  }

  const errors: string[] = [];
  const keys = new Set<string>();
  value.forEach((criterion, index) => {
    if (!isRecord(criterion)) {
      errors.push(`Workflow V2 acceptance criteria item ${index} must be an object.`);
      return;
    }

    const key = typeof criterion.key === "string" ? criterion.key.trim() : "";
    if (!key) {
      errors.push(`Workflow V2 acceptance criteria item ${index} requires a non-empty key.`);
    } else if (keys.has(key)) {
      errors.push(`Workflow V2 acceptance criteria has duplicate key ${key}.`);
    } else {
      keys.add(key);
    }

    if (typeof criterion.description !== "string" || !criterion.description.trim()) {
      errors.push(`Workflow V2 acceptance criteria item ${index} requires a non-empty description.`);
    }
    if (criterion.required !== undefined && typeof criterion.required !== "boolean") {
      errors.push(`Workflow V2 acceptance criteria item ${index} requires required to be a boolean when provided.`);
    }
  });
  return errors;
}

export function isValidWorkflowV2AcceptanceCriteria(value: unknown): value is WorkflowV2AcceptanceCriterion[] {
  return workflowV2AcceptanceCriteriaValidationErrors(value).length === 0;
}

export function isValidWorkflowV2ContextBudget(value: unknown): value is WorkflowV2BudgetEnvelope["context"] {
  if (!isRecord(value) || !isPositiveSafeInteger(value.maxContextTokens)) return false;
  if (value.maxEvidenceItems !== undefined && !isNonNegativeSafeInteger(value.maxEvidenceItems)) return false;
  if (value.maxUpstreamNodes !== undefined && !isNonNegativeSafeInteger(value.maxUpstreamNodes)) return false;
  return value.summaryFallbackPolicy === undefined
    || (typeof value.summaryFallbackPolicy === "string" && VALID_SUMMARY_FALLBACK_POLICIES.has(value.summaryFallbackPolicy));
}

export function isValidWorkflowV2CostBudget(value: unknown): value is WorkflowV2CostBudget {
  if (!isRecord(value)) return false;
  return (["maxModelCalls", "maxPromptTokens", "maxCompletionTokens", "maxWallClockMs"] as const)
    .every((field) => value[field] === undefined || isNonNegativeSafeInteger(value[field]));
}

export function isValidWorkflowV2BudgetEnvelope(value: unknown): value is WorkflowV2BudgetEnvelope {
  return isRecord(value)
    && isValidWorkflowV2ContextBudget(value.context)
    && (value.cost === undefined || isValidWorkflowV2CostBudget(value.cost));
}

function appendNodeValidationErrors(node: WorkflowV2Node, errors: string[]): void {
  const untrustedNode = node as unknown as { id?: unknown; execModel?: unknown };
  if (untrustedNode.execModel !== "llm" && untrustedNode.execModel !== "script") {
    errors.push(`Workflow V2 node ${String(untrustedNode.id)} has unsupported execution model ${String(untrustedNode.execModel)}.`);
    return;
  }

  if (!node.id.trim()) errors.push("Workflow V2 node id must not be empty.");
  if (!node.title.trim()) errors.push(`Workflow V2 node ${node.id} must have a title.`);
  if (!node.kind.trim()) errors.push(`Workflow V2 node ${node.id} must have a kind.`);
  if (node.executionModeConfidence !== undefined && (
    typeof node.executionModeConfidence !== "number"
    || !Number.isFinite(node.executionModeConfidence)
    || node.executionModeConfidence < 0
    || node.executionModeConfidence > 1
  )) {
    errors.push(`Workflow V2 node ${node.id} execution mode confidence must be between 0 and 1.`);
  }
  if (node.execModel === "llm" && node.executionMode === "script") {
    errors.push(`Workflow V2 llm node ${node.id} cannot use script execution mode.`);
  }
  if (node.execModel === "script" && node.executionMode !== undefined && node.executionMode !== "script") {
    errors.push(`Workflow V2 script node ${node.id} must use script execution mode.`);
  }
  if (node.role !== undefined && !isWorkflowV2NodeRole(node.role)) {
    errors.push(`Workflow V2 node ${node.id} has unsupported role ${String(node.role)}.`);
  }
  if (node.executionLease !== undefined && !isWorkflowV2ExecutionLeasePolicy(node.executionLease)) {
    errors.push(`Workflow V2 node ${node.id} has an invalid execution lease policy.`);
  }
  errors.push(...workflowV2NodeHookValidationErrors(node.hooks).map(
    (error) => `Workflow V2 node ${node.id} ${error}`,
  ));

  if (!Array.isArray(node.outputFields) || node.outputFields.length === 0) {
    errors.push(`Workflow V2 node ${node.id} must declare at least one output field.`);
  } else {
    const outputFieldKeys = new Set<string>();
    for (const outputField of node.outputFields) {
      if (!outputField.key.trim()) {
        errors.push(`Workflow V2 node ${node.id} has an output field with an empty key.`);
        continue;
      }
      if (outputFieldKeys.has(outputField.key)) errors.push(`Workflow V2 node ${node.id} has duplicate output field key ${outputField.key}.`);
      outputFieldKeys.add(outputField.key);
    }
  }

  if (node.execModel === "llm") {
    if (!node.prompt.trim()) errors.push(`Workflow V2 llm node ${node.id} must have a prompt.`);
    if (node.modelProfile !== undefined && !isWorkflowV2ModelProfile(node.modelProfile)) {
      errors.push(`Workflow V2 llm node ${node.id} has unsupported model profile ${String(node.modelProfile)}.`);
    }
    if (node.maxRetry !== undefined && !isNonNegativeSafeInteger(node.maxRetry)) {
      errors.push(`Workflow V2 llm node ${node.id} must have a non-negative safe-integer maxRetry.`);
    }
    if (node.contextBudget && !isValidWorkflowV2ContextBudget(node.contextBudget)) {
      errors.push(`Workflow V2 llm node ${node.id} has an invalid context budget.`);
    }
    return;
  }

  if (node.execModel === "script") {
    const typedCommand = typeof node.script.command === "string" && Array.isArray(node.script.args);
    if (!typedCommand && node.script.language !== undefined && !VALID_SCRIPT_LANGUAGES.has(node.script.language)) {
      errors.push(`Workflow V2 script node ${node.id} has unsupported language ${String(node.script.language)}.`);
    }
    if (!typedCommand && !node.script.code?.trim()) errors.push(`Workflow V2 script node ${node.id} must have script code or a typed command spec.`);
    if (typedCommand) {
      if (!node.script.command?.trim()) errors.push(`Workflow V2 script node ${node.id} must have a command.`);
      if (node.script.cwdPolicy !== "workflow") errors.push(`Workflow V2 script node ${node.id} must use workflow cwdPolicy.`);
      if (node.script.access !== "read-only" && node.script.access !== "workspace-write") errors.push(`Workflow V2 script node ${node.id} has invalid access policy.`);
      if (node.script.args?.some((argument) => typeof argument !== "string" || argument.length > 2_000)) errors.push(`Workflow V2 script node ${node.id} has invalid command arguments.`);
    }
    if (node.script.timeoutMs !== undefined && !isPositiveSafeInteger(node.script.timeoutMs)) {
      errors.push(`Workflow V2 script node ${node.id} must have a positive safe-integer timeoutMs.`);
    }
    if (!VALID_SANDBOX_MODES.has(node.sandboxMode)) {
      errors.push(`Workflow V2 script node ${node.id} has unsupported sandbox mode ${node.sandboxMode}.`);
    }
    if (node.expectedExitCode !== undefined && !isSafeInteger(node.expectedExitCode)) {
      errors.push(`Workflow V2 script node ${node.id} must have a safe-integer expectedExitCode.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function topologicalOrder(definition: WorkflowV2Definition, errors: string[]): string[] {
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const edgeKeys = new Set<string>();

  for (const node of definition.nodes) {
    adjacency.set(node.id, []);
    indegree.set(node.id, 0);
  }

  for (const edge of definition.edges) {
    const edgeKey = JSON.stringify([edge.fromNodeId, edge.toNodeId]);
    if (edgeKeys.has(edgeKey)) {
      errors.push(`Workflow V2 definition has duplicate edge ${edge.fromNodeId} -> ${edge.toNodeId}.`);
      continue;
    }
    edgeKeys.add(edgeKey);
    if (!adjacency.has(edge.fromNodeId) || !adjacency.has(edge.toNodeId)) {
      errors.push(`Workflow V2 edge ${edge.fromNodeId} -> ${edge.toNodeId} references a missing node.`);
      continue;
    }
    adjacency.get(edge.fromNodeId)!.push(edge.toNodeId);
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const queue = definition.nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
  const orderedNodeIds: string[] = [];
  for (let index = 0; index < queue.length; index += 1) {
    const nodeId = queue[index]!;
    orderedNodeIds.push(nodeId);
    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      const nextIndegree = (indegree.get(nextNodeId) ?? 0) - 1;
      indegree.set(nextNodeId, nextIndegree);
      if (nextIndegree === 0) queue.push(nextNodeId);
    }
  }

  if (orderedNodeIds.length !== definition.nodes.length) errors.push("Workflow V2 definition must be acyclic.");
  return orderedNodeIds;
}

export function validateWorkflowV2Definition(definition: WorkflowV2Definition): WorkflowV2ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!definition.workflowId.trim()) errors.push("Workflow V2 definition must have a workflowId.");
  if (!isPositiveSafeInteger(definition.graphVersion)) {
    errors.push("Workflow V2 definition must have a positive safe-integer graphVersion.");
  }
  if (!definition.objective.trim()) errors.push("Workflow V2 definition must have an objective.");
  if (definition.nodes.length === 0) errors.push("Workflow V2 definition must have at least one node.");

  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (nodeIds.has(node.id)) errors.push(`Workflow V2 definition has duplicate node id ${node.id}.`);
    nodeIds.add(node.id);
    appendNodeValidationErrors(node, errors);
    if (node.role === undefined) warnings.push(`Workflow V2 node ${node.id} does not declare a role.`);
  }

  const topologicalNodeIds = topologicalOrder(definition, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    topologicalNodeIds,
  };
}

export function compileAndValidateWorkflowV2Definition(
  definition: WorkflowV2AuthoredDefinition,
  registry: WorkflowV2TemplateRegistry,
): WorkflowV2ValidationResult & { definition?: WorkflowV2Definition } {
  try {
    const compiledDefinition = compileWorkflowV2Definition(definition, registry);
    const validation = validateWorkflowV2Definition(compiledDefinition);
    return {
      ...validation,
      ...(validation.valid ? { definition: compiledDefinition } : {}),
    };
  } catch (error) {
    if (error instanceof WorkflowV2TemplateCompileError) {
      return {
        valid: false,
        errors: [error.message],
        warnings: [],
        topologicalNodeIds: [],
      };
    }
    throw error;
  }
}
