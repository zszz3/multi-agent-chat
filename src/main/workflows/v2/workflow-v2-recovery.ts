import { createHash } from "node:crypto";
import type { WorkflowV2Node } from "../../../shared/workflow-v2/definition";
import type { WorkflowV2WorkerOutput } from "../../../shared/workflow-v2/packets";
import type { WorkflowV2PlanNode } from "../../../shared/workflow-v2/planning";
import {
  sameWorkflowV2CacheFingerprint,
  type WorkflowV2CacheEntryMetadata,
  type WorkflowV2NodeCacheFingerprint,
  type WorkflowV2NodeRecoveryDecision,
  type WorkflowV2PersistedRunState,
  type WorkflowV2RecoveryPlan,
} from "../../../shared/workflow-v2/storage";

export function createWorkflowV2NodeCacheFingerprint(input: {
  graphVersion: number;
  node: WorkflowV2Node;
  planNode: WorkflowV2PlanNode;
  upstreamOutputs: readonly WorkflowV2WorkerOutput[];
  executionEnvironment: unknown;
  reviewerPolicy?: unknown;
  templateVersion?: string;
}): WorkflowV2NodeCacheFingerprint {
  return {
    graphVersion: input.graphVersion,
    nodeDefinitionHash: hashValue(input.node),
    upstreamOutputHash: hashValue(input.upstreamOutputs),
    modelProfile: input.planNode.modelProfile,
    role: input.planNode.role,
    ...(input.node.execModel === "llm" && input.node.requiredTools
      ? { requiredToolsHash: hashValue([...input.node.requiredTools].sort()) }
      : {}),
    executionEnvHash: hashValue(input.executionEnvironment),
    ...(input.reviewerPolicy !== undefined ? { reviewerPolicyHash: hashValue(input.reviewerPolicy) } : {}),
    ...(input.templateVersion ? { templateVersion: input.templateVersion } : {}),
  };
}

export function buildWorkflowV2RecoveryPlan(input: {
  persisted: WorkflowV2PersistedRunState;
  targetGraphVersion: number;
  targetFingerprints: ReadonlyMap<string, WorkflowV2NodeCacheFingerprint>;
  cacheEntries: ReadonlyMap<string, WorkflowV2CacheEntryMetadata>;
}): WorkflowV2RecoveryPlan {
  const graphChanged = input.persisted.graphVersion !== input.targetGraphVersion;
  const outputByNodeId = new Map(input.persisted.workerOutputs.map((output) => [output.nodeId, output]));
  const decisions = new Map<string, WorkflowV2NodeRecoveryDecision>();

  for (const nodeId of input.persisted.runState.nodeOrder) {
    const nodeState = input.persisted.runState.nodes[nodeId];
    if (!nodeState) {
      decisions.set(nodeId, { nodeId, action: "blocked", reason: "Persisted node state is missing." });
      continue;
    }
    const upstreamNodeIds = nodeState.dependsOn;
    if (upstreamNodeIds.some((upstreamNodeId) => decisions.get(upstreamNodeId)?.action !== "reuse")) {
      decisions.set(nodeId, { nodeId, action: "rerun", reason: "An upstream node is not reusable." });
      continue;
    }

    const targetFingerprint = input.targetFingerprints.get(nodeId);
    const cacheEntry = input.cacheEntries.get(nodeId);
    const cacheReusable = Boolean(
      targetFingerprint
      && cacheEntry
      && cacheEntry.graphVersion === input.targetGraphVersion
      && sameWorkflowV2CacheFingerprint(cacheEntry.fingerprint, targetFingerprint),
    );
    if (cacheReusable && cacheEntry) {
      decisions.set(nodeId, {
        nodeId,
        action: "reuse",
        reason: "Cache fingerprint matches the target execution contract.",
        cachedOutput: structuredClone(cacheEntry.output),
      });
      continue;
    }

    if (nodeState.status === "completed" && !graphChanged) {
      const output = outputByNodeId.get(nodeId);
      if (output) {
        decisions.set(nodeId, {
          nodeId,
          action: "reuse",
          reason: "Completed output belongs to the same frozen graph version.",
          cachedOutput: structuredClone(output),
        });
      } else {
        decisions.set(nodeId, { nodeId, action: "rerun", reason: "Completed node output is missing." });
      }
      continue;
    }

    const control = input.persisted.nodeControl[nodeId];
    if (!graphChanged && nodeState.status === "paused" && control?.checkpoint) {
      decisions.set(nodeId, {
        nodeId,
        action: "resume",
        reason: "Paused node has a checkpoint under the same graph version.",
        checkpoint: control.checkpoint,
      });
      continue;
    }

    decisions.set(nodeId, {
      nodeId,
      action: "rerun",
      reason: graphChanged
        ? "Graph version changed and no matching cache entry is available."
        : `Persisted node state ${nodeState.status} is not reusable.`,
    });
  }

  return {
    workflowId: input.persisted.workflowId,
    runId: input.persisted.runId,
    persistedGraphVersion: input.persisted.graphVersion,
    targetGraphVersion: input.targetGraphVersion,
    decisions: input.persisted.runState.nodeOrder.map((nodeId) => decisions.get(nodeId)!),
  };
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Workflow V2 cache fingerprint input cannot contain non-finite numbers.");
    }
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}
