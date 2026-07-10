import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { createOneShotRuntimeDriver } from "../agent-executor-driver-factories";
import type { RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { getHermesCapabilities, hermesSurfaceSupport } from "./hermes-capabilities";
import { HermesAgentExecutor } from "./hermes-executor";
import { runHermesChannelTest, runHermesWorkflow } from "./hermes-workflow";

export function createHermesDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  return createOneShotRuntimeDriver({
    runtimeId: "hermes",
    surfaceSupport: [...hermesSurfaceSupport],
    getCapabilities: getHermesCapabilities,
    createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
    askWorkflow: (input) => runHermesWorkflow(input, options),
    testChannel: (input) => runHermesChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
}
