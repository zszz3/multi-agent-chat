import type { RuntimeDriver } from "../../../../agents/runtime/runtime-driver";
import { createOneShotRuntimeDriver } from "../agent-executor-driver-factories";
import { ApiAgentExecutor } from "../agent-executor-api";
import type { RuntimeAgentExecutorFactoryOptions } from "../agent-executor-types";
import { apiSurfaceSupport, getApiCapabilities } from "./api-capabilities";

export function createApiDriver(options: RuntimeAgentExecutorFactoryOptions): RuntimeDriver {
  const askWorkflowByRuntime = options.askWorkflowByRuntime ?? {};
  const testChannelByRuntime = options.testChannelByRuntime ?? {};
  const deleteSessionArtifactsByRuntime = options.deleteSessionArtifactsByRuntime ?? {};

  return createOneShotRuntimeDriver({
    runtimeId: "api",
    surfaceSupport: [...apiSurfaceSupport],
    getCapabilities: getApiCapabilities,
    createOneShotExecutor: (context) => new ApiAgentExecutor(context, options),
    askWorkflow: askWorkflowByRuntime.api,
    testChannel: testChannelByRuntime.api,
    deleteSessionArtifacts: deleteSessionArtifactsByRuntime.api,
  });
}
