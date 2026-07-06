import type { RuntimeResumeCapabilities } from "../../shared/types";
import type { ClaudeInteractiveTransport } from "./claude-interactive-transport";
import { ClaudeCliInteractiveTransport } from "./claude-cli-interactive-transport";
import { ClaudeSdkInteractiveTransport } from "./claude-sdk-interactive-transport";

export interface ClaudeTransportSelection {
  createTransport: () => ClaudeInteractiveTransport;
  resume: RuntimeResumeCapabilities;
}

export function selectClaudeInteractiveTransport(input: {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  sdkModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}): ClaudeTransportSelection {
  if (process.env.CLAUDE_INTERACTIVE_TRANSPORT === "cli") {
    return {
      createTransport: () =>
        new ClaudeCliInteractiveTransport({
          executable: input.executable,
          cliModelForTurn: input.cliModelForTurn,
          envForTurn: input.envForTurn,
        }),
      resume: {
        supportsInProcessConversationResume: true,
        supportsResumeAfterDetach: false,
        supportsResumeAfterAppRestart: false,
        supportsTurnResume: false,
      },
    };
  }

  return {
    createTransport: () =>
      new ClaudeSdkInteractiveTransport({
        executable: input.executable,
        sdkModelForTurn: input.sdkModelForTurn,
        envForTurn: input.envForTurn,
      }),
    resume: {
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    },
  };
}
