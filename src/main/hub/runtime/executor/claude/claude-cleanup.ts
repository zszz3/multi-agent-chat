import type { RuntimeSessionCleanupContext } from "../../../../agents/runtime/runtime-driver";
import { deleteClaudeSessionArtifacts as deleteSharedClaudeSessionArtifacts } from "../agent-executor-session-cleanup";

export function deleteClaudeSessionArtifacts(input: RuntimeSessionCleanupContext) {
  return deleteSharedClaudeSessionArtifacts(input.workDir, input.runtimeConversation);
}
