import type { RuntimeSessionCleanupContext } from "../../../../agents/runtime/runtime-driver";
import { deleteCodexSessionArtifacts as deleteSharedCodexSessionArtifacts } from "../agent-executor-session-cleanup";

export function deleteCodexSessionArtifacts(
  executable: string,
  input: RuntimeSessionCleanupContext,
) {
  return deleteSharedCodexSessionArtifacts(executable, input.runtimeConversation);
}
