import type { AgentRuntime } from "../../../../../shared/types";
import type { RuntimeCapabilities } from "../../../../agents/runtime/runtime-capabilities";
import type { RuntimeSurfaceSupport } from "../../../../agents/runtime/runtime-driver";
import { support } from "../agent-executor-capabilities";

export const codexSurfaceSupport: RuntimeSurfaceSupport[] = [
  support("chat", ["interactive"], ["fresh", "resume-preferred"]),
  support("task", ["oneshot"], ["fresh", "resume-preferred"]),
  support("workflow", ["oneshot"], ["fresh", "resume-preferred"]),
  support("channel-test", ["oneshot"], ["fresh"]),
  support("cleanup", ["oneshot"], ["fresh", "resume-preferred"]),
];

export function getCodexCapabilities(runtime: AgentRuntime): RuntimeCapabilities {
  return {
    runtimeId: runtime.id,
    chatStyle: "interactive",
    taskStyle: "oneshot",
    workflowStyle: "oneshot",
    testStyle: "oneshot",
    supportsInterrupt: true,
    supportsContinue: true,
    supportsApprovalRequests: true,
    supportsUserInputRequests: true,
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
  };
}
