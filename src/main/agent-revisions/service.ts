import type { ConfiguredAgent } from "../../shared/types";
import type { AgentRevision } from "../../shared/agent/types";
import { agentBehaviorConfig, createAgentRevision, stableConfigHash } from "../../shared/agent-revisions";
import { AgentRevisionRepository } from "./repository";

export class AgentRevisionService {
  constructor(private readonly repository: AgentRevisionRepository) {}

  list(agentId?: string): Promise<AgentRevision[]> { return this.repository.list(agentId); }

  async saveComposedAgent(agent: ConfiguredAgent): Promise<{ agent: ConfiguredAgent; revision: AgentRevision }> {
    const revisions = await this.repository.list(agent.id);
    const current = revisions[0];
    const hash = stableConfigHash(agentBehaviorConfig(agent));
    const revision = current?.configHash === hash ? current : await this.repository.save(createAgentRevision(agent, (current?.revision ?? 0) + 1));
    return { agent: { ...agent, agentType: "composed", currentRevisionId: revision.id, revision: revision.revision, updatedAt: Date.now() }, revision };
  }
}
