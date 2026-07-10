import type { AgentId, WorkflowAgentResponse } from "../../../shared/types";
import type {
  RuntimeChannelTestContext,
  RuntimeDriver,
  RuntimeSessionCleanupContext,
  RuntimeWorkflowRequestContext,
} from "../../agents/runtime/runtime-driver";
import { defaultInteractiveCapabilities, defaultOneShotCapabilities, support } from "./agent-executor-capabilities";

type InteractiveResumeCapabilities = ReturnType<typeof defaultInteractiveCapabilities>["resume"];

const INTERACTIVE_SURFACE_SUPPORT = [
  support("chat", ["interactive"], ["fresh", "resume-preferred"]),
  support("task", ["oneshot"], ["fresh", "resume-preferred"]),
  support("workflow", ["oneshot"], ["fresh", "resume-preferred"]),
  support("channel-test", ["oneshot"], ["fresh"]),
  support("cleanup", ["oneshot"], ["fresh", "resume-preferred"]),
] as const;

const ONESHOT_SURFACE_SUPPORT = [
  support("chat", ["oneshot"], ["fresh"]),
  support("task", ["oneshot"], ["fresh"]),
  support("workflow", ["oneshot"], ["fresh"]),
  support("channel-test", ["oneshot"], ["fresh"]),
  support("cleanup", ["oneshot"], ["fresh"]),
] as const;

export function createInteractiveRuntimeDriver(input: {
  runtimeId: AgentId;
  runtimeStateCodec: NonNullable<RuntimeDriver["runtimeStateCodec"]>;
  createOneShotExecutor: NonNullable<RuntimeDriver["createOneShotExecutor"]>;
  createInteractiveSession: NonNullable<RuntimeDriver["createInteractiveSession"]>;
  askWorkflow: ((input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>) | undefined;
  testChannel: ((input: RuntimeChannelTestContext) => Promise<string>) | undefined;
  deleteSessionArtifacts: ((input: RuntimeSessionCleanupContext) => Promise<void>) | undefined;
  resume: InteractiveResumeCapabilities;
}): RuntimeDriver {
  return {
    runtimeId: input.runtimeId,
    surfaceSupport: [...INTERACTIVE_SURFACE_SUPPORT],
    runtimeStateCodec: input.runtimeStateCodec,
    getCapabilities: () => ({
      ...defaultInteractiveCapabilities(input.runtimeId),
      resume: input.resume,
    }),
    createOneShotExecutor: input.createOneShotExecutor,
    createInteractiveSession: input.createInteractiveSession,
    ...(input.askWorkflow ? { askWorkflow: input.askWorkflow } : {}),
    ...(input.testChannel ? { testChannel: input.testChannel } : {}),
    deleteSessionArtifacts: input.deleteSessionArtifacts ?? (async () => undefined),
  };
}

export function createOneShotRuntimeDriver(input: {
  runtimeId: AgentId;
  runtimeStateCodec?: RuntimeDriver["runtimeStateCodec"];
  createOneShotExecutor: NonNullable<RuntimeDriver["createOneShotExecutor"]>;
  askWorkflow: ((input: RuntimeWorkflowRequestContext) => Promise<WorkflowAgentResponse>) | undefined;
  testChannel: ((input: RuntimeChannelTestContext) => Promise<string>) | undefined;
  deleteSessionArtifacts: ((input: RuntimeSessionCleanupContext) => Promise<void>) | undefined;
}): RuntimeDriver {
  return {
    runtimeId: input.runtimeId,
    surfaceSupport: [...ONESHOT_SURFACE_SUPPORT],
    ...(input.runtimeStateCodec ? { runtimeStateCodec: input.runtimeStateCodec } : {}),
    getCapabilities: () => defaultOneShotCapabilities(input.runtimeId),
    createOneShotExecutor: input.createOneShotExecutor,
    ...(input.askWorkflow ? { askWorkflow: input.askWorkflow } : {}),
    ...(input.testChannel ? { testChannel: input.testChannel } : {}),
    deleteSessionArtifacts: input.deleteSessionArtifacts ?? (async () => undefined),
  };
}
