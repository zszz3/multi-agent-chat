import type { IpcMain } from "electron";
import type { ConfiguredAgent } from "../../shared/types";
import type { AgentRevisionService } from "./service";

export function registerAgentRevisionIpc(input: {
  ipc: Pick<IpcMain, "handle">;
  service: AgentRevisionService;
  saveAgent: (agent: ConfiguredAgent) => unknown;
}): void {
  input.ipc.handle("configured-agents:save-composed", async (_event, agent: ConfiguredAgent) => {
    const saved = await input.service.saveComposedAgent(agent);
    return input.saveAgent(saved.agent);
  });
  input.ipc.handle("configured-agents:revisions:list", (_event, agentId?: string) => input.service.list(agentId));
}
