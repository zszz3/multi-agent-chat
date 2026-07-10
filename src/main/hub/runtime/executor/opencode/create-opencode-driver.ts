import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { createOneShotRuntimeDriver } from "../agent-executor-driver-factories";
import type { RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { getOpenCodeCapabilities, openCodeSurfaceSupport } from "./opencode-capabilities";
import { OpenCodeAgentExecutor } from "./opencode-executor";
import { runOpenCodeChannelTest, runOpenCodeWorkflow } from "./opencode-workflow";

export function createOpenCodeDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  return createOneShotRuntimeDriver({
    runtimeId: "opencode",
    surfaceSupport: [...openCodeSurfaceSupport],
    getCapabilities: getOpenCodeCapabilities,
    createOneShotExecutor: (context) => new OpenCodeAgentExecutor(context, options),
    askWorkflow: (input) => runOpenCodeWorkflow(input, options),
    testChannel: (input) => runOpenCodeChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
}
