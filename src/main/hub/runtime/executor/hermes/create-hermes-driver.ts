import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { hermesRuntimeStateCodec } from "../../../../agents/runtime/runtime-state-codec";
import { createOneShotRuntimeDriver } from "../agent-executor-driver-factories";
import { HermesAgentExecutor } from "../agent-executor-hermes";
import type { RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { getHermesCapabilities, hermesSurfaceSupport } from "./hermes-capabilities";
import { runHermesChannelTest, runHermesWorkflow } from "./hermes-workflow";

export function createHermesDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  return createOneShotRuntimeDriver({
    runtimeId: "hermes",
    surfaceSupport: [...hermesSurfaceSupport],
    getCapabilities: getHermesCapabilities,
    runtimeStateCodec: hermesRuntimeStateCodec,
    createOneShotExecutor: (context) => new HermesAgentExecutor(context, options),
    askWorkflow: (input) => runHermesWorkflow(input, options),
    testChannel: (input) => runHermesChannelTest(input, options),
    deleteSessionArtifacts: undefined,
  });
}
