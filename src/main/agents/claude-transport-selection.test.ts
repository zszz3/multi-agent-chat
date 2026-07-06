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
  test("defaults to the stream-json transport with detach and restart resume support when the selector is unset", () => {
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

  test("treats an empty selector as the default stream-json transport", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = "   ";

    const selection = selectTransport();

    expect(selection.createTransport().kind).toBe("stream-json");
    expect(selection.resume).toMatchObject({
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: true,
      supportsResumeAfterAppRestart: true,
      supportsTurnResume: false,
    });
  });

  test("accepts an explicit trimmed stream-json selector", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = " stream-json ";

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
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = " runner ";

    const selection = selectTransport();

    expect(selection.createTransport().kind).toBe("runner");
    expect(selection.resume).toMatchObject({
      supportsInProcessConversationResume: true,
      supportsResumeAfterDetach: false,
      supportsResumeAfterAppRestart: false,
      supportsTurnResume: false,
    });
  });

  test("rejects the legacy cli selector and tells the operator to use runner instead", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = "cli";

    expect(() => selectTransport()).toThrow('Use "runner" instead.');
  });

  test("rejects the reserved sdk transport key until an official Claude programmatic API exists", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = " sdk ";

    expect(() => selectTransport()).toThrow(
      "Official Claude programmatic SDK transport is not implemented for the installed package surface.",
    );
  });

  test("rejects unknown selector values with a clear operator-facing error", () => {
    process.env.CLAUDE_INTERACTIVE_TRANSPORT = "bogus";

    expect(() => selectTransport()).toThrow('Use "runner" instead.');
  });
});
