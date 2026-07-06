import type { RuntimeResumeCapabilities } from "../../shared/types";
import type { ClaudeInteractiveTransport } from "./claude-interactive-transport";
import { ClaudeRunnerInteractiveTransport } from "./claude-runner-interactive-transport";
import { ClaudeStreamJsonInteractiveTransport } from "./claude-stream-json-interactive-transport";

export interface ClaudeTransportSelection {
  createTransport: () => ClaudeInteractiveTransport;
  resume: RuntimeResumeCapabilities;
}

function parseClaudeInteractiveTransportSelector(): "stream-json" | "runner" {
  const parsed = process.env.CLAUDE_INTERACTIVE_TRANSPORT?.trim() ?? "";
  if (!parsed || parsed === "stream-json") {
    return "stream-json";
  }
  if (parsed === "runner") {
    return "runner";
  }
  if (parsed === "sdk") {
    throw new Error("Official Claude programmatic SDK transport is not implemented for the installed package surface.");
  }
  throw new Error(
    `Unsupported CLAUDE_INTERACTIVE_TRANSPORT=${JSON.stringify(parsed)}. Use "runner" instead. Accepted values are unset, empty, "stream-json", or "runner".`,
  );
}

export function selectClaudeInteractiveTransport(input: {
  executable: string;
  cliModelForTurn: (modelId: string | undefined) => string | undefined;
  streamJsonModelForTurn: (modelId: string | undefined) => string | undefined;
  envForTurn: (modelId: string | undefined) => NodeJS.ProcessEnv;
}): ClaudeTransportSelection {
  const transportSelector = parseClaudeInteractiveTransportSelector();

  if (transportSelector === "runner") {
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
