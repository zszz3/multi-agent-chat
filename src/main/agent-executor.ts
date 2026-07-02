import { CodexRpcClient } from "./agents/codex-rpc";
import {
  createRuntimeAdapterRegistry,
  type RuntimeAdapterRegistry,
  type RuntimeAdapterRegistryOptions,
  type RuntimeExecutor,
  type RuntimeExecutorContext,
} from "./runtime-adapter";

export type AgentExecutionContext = RuntimeExecutorContext;
export type AgentExecutor = RuntimeExecutor;

export interface AgentExecutorFactory {
  create(context: AgentExecutionContext): AgentExecutor;
}

type RuntimeAgentExecutorFactoryOptions = RuntimeAdapterRegistryOptions;

export class RuntimeAgentExecutorFactory implements AgentExecutorFactory {
  private readonly registry: RuntimeAdapterRegistry;

  constructor(options: RuntimeAgentExecutorFactoryOptions) {
    this.registry = createRuntimeAdapterRegistry(options);
  }

  create(context: AgentExecutionContext): AgentExecutor {
    return this.registry.createExecutor(context);
  }
}
