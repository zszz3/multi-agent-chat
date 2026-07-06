import type { RuntimeResumeCapabilities } from "../../shared/types";
import type { ClaudeInteractiveTransport } from "./claude-interactive-transport";
import { ClaudeRunnerInteractiveTransport } from "./claude-runner-interactive-transport";
import { ClaudeStreamJsonInteractiveTransport } from "./claude-stream-json-interactive-transport";

export interface ClaudeTransportSelection {
  createTransport: () => ClaudeInteractiveTransport;
  resume: RuntimeResumeCapabilities;
}

export function selectClaudeInteractiveTransport(input: {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  streamJsonModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}): ClaudeTransportSelection {
  if (process.env.CLAUDE_INTERACTIVE_TRANSPORT === "sdk") {
    throw new Error("Official Claude programmatic SDK transport is not implemented for the installed package surface.");
  }

  if (process.env.CLAUDE_INTERACTIVE_TRANSPORT === "runner" || process.env.CLAUDE_INTERACTIVE_TRANSPORT === "cli") {
    return {
      createTransport: () =>
        new ClaudeRunnerInteractiveTransport({
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
      new ClaudeStreamJsonInteractiveTransport({
        executable: input.executable,
        streamJsonModelForTurn: input.streamJsonModelForTurn,
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
