import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { createOneShotRuntimeDriver } from "../agent-executor-driver-factories";
import type { RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { getOpenClawCapabilities, openClawSurfaceSupport } from "./openclaw-capabilities";
import { OpenClawAgentExecutor } from "./openclaw-executor";
import { runOpenClawChannelTest, runOpenClawWorkflow } from "./openclaw-workflow";

export function createOpenClawDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  return createOneShotRuntimeDriver({
    runtimeId: "openclaw",
    surfaceSupport: [...openClawSurfaceSupport],
    getCapabilities: getOpenClawCapabilities,
    createOneShotExecutor: (context) => new OpenClawAgentExecutor(context, options),
    askWorkflow: (input) => runOpenClawWorkflow(input, options),
    testChannel: (input) => runOpenClawChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
}
