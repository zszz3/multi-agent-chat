import type { AgentId } from "../../../shared/types";
import type { RuntimeSurfaceSupport } from "../../agents/runtime/runtime-driver";

function defaultResumeCapabilities() {
  return {
    supportsInProcessConversationResume: true,
    supportsResumeAfterDetach: false,
    supportsResumeAfterAppRestart: false,
    supportsTurnResume: false,
  };
}

export function defaultInteractiveCapabilities(runtimeId: AgentId) {
  return {
    runtimeId,
    chatStyle: "interactive" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: runtimeId !== "api",
    supportsUserInputRequests: runtimeId !== "api",
    resume: defaultResumeCapabilities(),
  };
}

export function defaultOneShotCapabilities(runtimeId: AgentId) {
  return {
    runtimeId,
    chatStyle: "oneshot" as const,
    taskStyle: "oneshot" as const,
    workflowStyle: "oneshot" as const,
    testStyle: "oneshot" as const,
    supportsInterrupt: false,
    supportsContinue: false,
    supportsApprovalRequests: false,
    supportsUserInputRequests: false,
    resume: {
      supportsInProcessConversationResume: false,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    },
  };
}

export function support(
  surface: RuntimeSurfaceSupport["surface"],
  executionModes: RuntimeSurfaceSupport["executionModes"],
  continuationPolicies: RuntimeSurfaceSupport["continuationPolicies"],
): RuntimeSurfaceSupport {
  return { surface, executionModes, continuationPolicies };
}
