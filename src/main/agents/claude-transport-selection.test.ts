import { afterEach, describe, expect, test } from "vitest";
import { selectClaudeInteractiveTransport } from "./claude-transport-selection";

const originalTransport = process.env.CLAUDE_INTERACTIVE_TRANSPORT;

afterEach(() => {
  if (originalTransport === undefined) delete process.env.CLAUDE_INTERACTIVE_TRANSPORT;
  else process.env.CLAUDE_INTERACTIVE_TRANSPORT = originalTransport;
});

function selectTransport() {
  return selectClaudeInteractiveTransport({
    executable: "claude",
    cliModelForTurn: (modelId) => modelId,
    streamJsonModelForTurn: (modelId) => modelId,
    envForTurn: () => ({ PATH: process.env.PATH ?? "" }),
  });
}

describe("selectClaudeInteractiveTransport", () => {
  test("defaults to the stream-json transport with detach and restart resume support", () => {
    delete process.env.CLAUDE_INTERACTIVE_TRANSPORT;

    const selection = selectTransport();

    expect(selection.createTransport().kind).toBe("stream-json");
    expect(selection.resume).toMatchObject({
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    });
  });

  test("uses the runner compatibility transport when CLAUDE_INTERACTIVE_TRANSPORT=runner", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = "runner";

    const selection = selectTransport();

    expect(selection.createTransport().kind).toBe("runner");
    expect(selection.resume).toMatchObject({
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    });
  });

  test("does not accept the legacy cli selector for the runner compatibility transport", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = "cli";

    const selection = selectTransport();

    expect(selection.createTransport().kind).toBe("stream-json");
    expect(selection.resume).toMatchObject({
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    });
  });

  test("rejects the reserved sdk transport key until an official Claude programmatic API exists", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = "sdk";

    expect(() => selectTransport()).toThrow(
      "Official Claude programmatic SDK transport is not implemented for the installed package surface.",
    );
  });
});
