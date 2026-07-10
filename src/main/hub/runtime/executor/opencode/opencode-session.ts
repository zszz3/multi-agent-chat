import { AcpInteractiveSession, type AcpInteractiveSessionOptions } from "../../../../agents/acp/acp-interactive-session";
import type { InteractiveSessionContext } from "../../../../agents/runtime/runtime-driver";
import { openCodeRuntimeStateCodec } from "../../../../agents/runtime/runtime-state-codec";

type OpenCodeInteractiveSessionOptions = Omit<AcpInteractiveSessionOptions, "runtimeLabel" | "runtimeStateCodec">;

export class OpenCodeInteractiveSession extends AcpInteractiveSession {
  constructor(context: InteractiveSessionContext, options: OpenCodeInteractiveSessionOptions) {
    super(context, {
      ...options,
      runtimeLabel: "OpenCode",
      runtimeStateCodec: openCodeRuntimeStateCodec,
    });
  }
}
