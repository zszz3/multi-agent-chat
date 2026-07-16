import type { IpcMain } from "electron";
import path from "node:path";
import type { ConfiguredAgent } from "../../shared/types";
import { AgentRevisionRepository } from "../agent-revisions/repository";
import { AgentRevisionService } from "../agent-revisions/service";
import { registerAgentRevisionIpc } from "../agent-revisions/ipc";
import { EvaluationStore } from "../evaluation-store";
import { registerEvaluationIpc } from "../evaluation/ipc";
import { McpRegistryStore } from "../mcp-registry-store";
import { registerMcpRegistryIpc } from "../mcp/ipc";
import { ConfiguredAgentExecutionService } from "./configured-agent-execution-service";
import type { AgentChannel, WorkflowAgentRequest, WorkflowAgentResponse } from "../../shared/types";
import { McpAgentManagementService } from "../mcp/agent-management-service";

export class PlatformServices {
  private readonly mcpRegistry: McpRegistryStore;
  private readonly evaluations: EvaluationStore;
  private readonly agentRevisions: AgentRevisionRepository;
  private readonly agentRevisionService: AgentRevisionService;
  private readonly mcpAgents: McpAgentManagementService;

  constructor(databasePath: string, mcp: ConstructorParameters<typeof McpAgentManagementService>[0]) {
    this.mcpRegistry = new McpRegistryStore(databasePath);
    this.evaluations = new EvaluationStore(databasePath);
    this.agentRevisions = new AgentRevisionRepository(databasePath);
    this.agentRevisionService = new AgentRevisionService(this.agentRevisions);
    this.mcpAgents = new McpAgentManagementService(mcp);
  }

  registerIpc(input: {
    ipc: Pick<IpcMain, "handle">;
    agents: () => ConfiguredAgent[];
    channels: () => AgentChannel[];
    defaultWorkDir: () => string;
    executeRuntime: (request: WorkflowAgentRequest) => Promise<WorkflowAgentResponse>;
    saveAgent: (agent: ConfiguredAgent) => unknown;
  }): void {
    const executor = new ConfiguredAgentExecutionService({ agents: input.agents, channels: input.channels, defaultWorkDir: input.defaultWorkDir, execute: input.executeRuntime });
    registerMcpRegistryIpc(input.ipc, this.mcpRegistry, this.mcpAgents);
    registerEvaluationIpc({ ipc: input.ipc, store: this.evaluations, agents: input.agents, executeAgent: (agentId, prompt) => executor.runOneShot({ configuredAgentId: agentId, prompt }) });
    registerAgentRevisionIpc({ ipc: input.ipc, service: this.agentRevisionService, saveAgent: input.saveAgent });
  }

  close(): void {
    this.mcpRegistry.close();
    this.evaluations.close();
    this.agentRevisions.close();
  }
}
