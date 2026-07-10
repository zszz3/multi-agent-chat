import type { WorkflowV2ExecutionLeasePolicy } from "./supervision";
import type { WorkflowV2HookActionDef, WorkflowV2NodeHooks } from "./hooks";
export type {
  WorkflowV2HookActionDef,
  WorkflowV2HookActionKind,
  WorkflowV2HookFailurePolicy,
  WorkflowV2HookLifecycle,
  WorkflowV2HookSource,
  WorkflowV2NodeHooks,
} from "./hooks";

export type WorkflowV2NodeRole = "orchestrator" | "executor" | "reviewer";
export type WorkflowV2ExecModel = "llm" | "script";
export type WorkflowV2ModelProfile = "fast" | "balanced" | "expert";
export type WorkflowV2ScriptLanguage = "python" | "typescript" | "bash";
export type WorkflowV2ScriptSandboxMode = "sandbox" | "workspace" | "full";
export type WorkflowV2ExhaustedPolicy = "fail" | "skip" | "ask_human";
export type WorkflowV2PassThreshold = "must" | "should" | "nice_to_have";
export type WorkflowV2ValidationOutcome = "pass" | "retry" | "fail" | "ask_human";
export type WorkflowV2TemplateParamValue = string | number | boolean | string[] | number[] | boolean[];

export interface WorkflowV2OutputFieldDef {
  key: string;
  required?: boolean;
  description?: string;
}

export interface WorkflowV2ConstraintDef {
  key: string;
  description: string;
  rule?: string;
}

export interface WorkflowV2JudgeDimensionDef {
  key: string;
  description?: string;
  passThreshold?: WorkflowV2PassThreshold;
}

export interface WorkflowV2ContextBudget {
  maxContextTokens: number;
  maxEvidenceItems?: number;
  maxUpstreamNodes?: number;
  summaryFallbackPolicy?: "truncate" | "summarize" | "ask_human";
}

export interface WorkflowV2Edge {
  fromNodeId: string;
  toNodeId: string;
}

export interface WorkflowV2BaseNode {
  id: string;
  kind: string;
  title: string;
  execModel: WorkflowV2ExecModel;
  role?: WorkflowV2NodeRole;
  outputFields: WorkflowV2OutputFieldDef[];
  hooks?: WorkflowV2NodeHooks;
  resourceLocks?: string[];
  executionLease?: WorkflowV2ExecutionLeasePolicy;
}

export interface WorkflowV2LLMNode extends WorkflowV2BaseNode {
  execModel: "llm";
  modelProfile?: WorkflowV2ModelProfile;
  prompt: string;
  judgeDimensions?: WorkflowV2JudgeDimensionDef[];
  constraints?: WorkflowV2ConstraintDef[];
  maxRetry?: number;
  onExhausted?: WorkflowV2ExhaustedPolicy;
  requiredTools?: string[];
  contextBudget?: WorkflowV2ContextBudget;
}

export interface WorkflowV2ScriptSpec {
  language: WorkflowV2ScriptLanguage;
  code: string;
  input?: string;
  timeoutMs?: number;
}

export interface WorkflowV2ScriptNode extends WorkflowV2BaseNode {
  execModel: "script";
  script: WorkflowV2ScriptSpec;
  sandboxMode: WorkflowV2ScriptSandboxMode;
  expectedExitCode?: number;
  onError?: WorkflowV2ExhaustedPolicy;
}

export type WorkflowV2Node = WorkflowV2LLMNode | WorkflowV2ScriptNode;

export interface WorkflowV2LLMNodeTemplate extends Omit<WorkflowV2LLMNode, "id" | "title"> {
  id: string;
  title?: string;
  category?: string;
  description?: string;
  whenToUse?: string;
}

export interface WorkflowV2ScriptNodeTemplate extends Omit<WorkflowV2ScriptNode, "id" | "title"> {
  id: string;
  title?: string;
  category?: string;
  description?: string;
  whenToUse?: string;
}

export type WorkflowV2NodeTemplate = WorkflowV2LLMNodeTemplate | WorkflowV2ScriptNodeTemplate;

export interface WorkflowV2TemplateNodeOverrides {
  kind?: string;
  title?: string;
  role?: WorkflowV2NodeRole;
  outputFields?: WorkflowV2OutputFieldDef[];
  hooks?: WorkflowV2NodeHooks;
  resourceLocks?: string[];
  executionLease?: WorkflowV2ExecutionLeasePolicy;
  modelProfile?: WorkflowV2ModelProfile;
  prompt?: string;
  judgeDimensions?: WorkflowV2JudgeDimensionDef[];
  constraints?: WorkflowV2ConstraintDef[];
  maxRetry?: number;
  onExhausted?: WorkflowV2ExhaustedPolicy;
  requiredTools?: string[];
  contextBudget?: WorkflowV2ContextBudget;
  script?: WorkflowV2ScriptSpec;
  sandboxMode?: WorkflowV2ScriptSandboxMode;
  expectedExitCode?: number;
  onError?: WorkflowV2ExhaustedPolicy;
}

export interface WorkflowV2TemplateNodeDraft {
  id: string;
  templateId: string;
  params?: Record<string, WorkflowV2TemplateParamValue>;
  overrides?: WorkflowV2TemplateNodeOverrides;
}

export type WorkflowV2AuthoredNode = WorkflowV2Node | WorkflowV2TemplateNodeDraft;

export interface WorkflowV2Definition {
  workflowId: string;
  graphVersion: number;
  objective: string;
  nodes: WorkflowV2Node[];
  edges: WorkflowV2Edge[];
}

export interface WorkflowV2AuthoredDefinition {
  workflowId: string;
  graphVersion: number;
  objective: string;
  nodes: WorkflowV2AuthoredNode[];
  edges: WorkflowV2Edge[];
}

export interface WorkflowV2ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  topologicalNodeIds: string[];
}

export interface WorkflowV2NodeValidationResult {
  outcome: WorkflowV2ValidationOutcome;
  reasons: string[];
  missingOutputFields: string[];
}
