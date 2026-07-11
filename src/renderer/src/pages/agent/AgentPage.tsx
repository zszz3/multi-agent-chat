import { useEffect, useState } from "react";
import { LockKeyhole, Plus, Save, Server } from "lucide-react";
import { configuredAgentType } from "../../../../shared/agent-revisions";
import type { AgentChannel, AgentRevision, ConfiguredAgent, McpServerDefinition } from "../../../../shared/types";
import { agentAccent, agentLabel, resolveConfiguredAgentChannel } from "../../app/agents";
import type { Language } from "../../app/language";

type MaybePromise = void | Promise<void>;

interface AgentPageProps {
  language?: Language;
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  agentRevisions: AgentRevision[];
  selectedConfiguredAgentId: string;
  status: string;
  onSave: () => Promise<void>;
  onAddConfiguredAgent: () => MaybePromise;
  onSelectConfiguredAgent: (agentId: string) => void;
  onUpdateConfiguredAgent: (agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent) => void;
}

function textFor(language: Language) {
  return language === "zh"
    ? {
        title: "Agent 组装",
        description: "执行型 Agent 与 Runtime 一对一同步；复杂型 Agent 在此组装指令和能力。",
        composed: "复杂型",
        execution: "执行型 · 只读",
        newAgent: "新建复杂 Agent",
        save: "保存新版本",
        name: "名称",
        descriptionField: "描述",
        instructions: "Instructions",
        base: "基础执行 Agent",
        runtime: "Runtime",
        config: "配置",
        model: "模型",
        reasoning: "推理强度",
        tags: "标签",
        revisions: "版本历史",
        capabilities: "MCP 能力",
        noMcp: "请先在 MCP 页面添加 Server。",
        runtimeHint: "该 Agent 由 Runtime 配置自动生成。请在 Runtime 页面修改执行配置。",
        empty: "新建复杂 Agent 后，可以组装 Instructions、Skills 和 MCP。",
      }
    : {
        title: "Agent Assembly",
        description: "Execution agents mirror Runtime configs; composed agents assemble instructions and capabilities here.",
        composed: "Composed",
        execution: "Execution · Read only",
        newAgent: "New composed agent",
        save: "Save new version",
        name: "Name",
        descriptionField: "Description",
        instructions: "Instructions",
        base: "Base execution agent",
        runtime: "Runtime",
        config: "Config",
        model: "Model",
        reasoning: "Reasoning",
        tags: "Tags",
        revisions: "Revision history",
        capabilities: "MCP capabilities",
        noMcp: "Add a server on the MCP page first.",
        runtimeHint: "This agent is generated from a Runtime config. Edit execution settings on the Runtime page.",
        empty: "Create a composed agent to assemble Instructions, Skills, and MCP.",
      };
}

export function AgentPage({
  language = "en",
  channels,
  configuredAgents,
  agentRevisions,
  selectedConfiguredAgentId,
  status,
  onSave,
  onAddConfiguredAgent,
  onSelectConfiguredAgent,
  onUpdateConfiguredAgent,
}: AgentPageProps) {
  const copy = textFor(language);
  const [mcpServers, setMcpServers] = useState<McpServerDefinition[]>([]);
  useEffect(() => { void window.multiAgentChat.listMcpServers().then(setMcpServers); }, []);
  const selected = configuredAgents.find((agent) => agent.id === selectedConfiguredAgentId) ?? configuredAgents[0];
  const executionAgents = configuredAgents.filter((agent) => configuredAgentType(agent) === "execution");
  const composedAgents = configuredAgents.filter((agent) => configuredAgentType(agent) === "composed");
  const selectedType = selected ? configuredAgentType(selected) : undefined;
  const selectedChannel = selected ? resolveConfiguredAgentChannel(selected, channels) : undefined;
  const selectedModelLabel = selectedChannel?.models.find((model) => model.id === selected?.modelId)?.label ?? selected?.modelId ?? "";
  const selectedRevisions = selected
    ? agentRevisions.filter((revision) => revision.agentId === selected.id).sort((left, right) => right.revision - left.revision)
    : [];

  const renderAgent = (agent: ConfiguredAgent) => {
    const channel = resolveConfiguredAgentChannel(agent, channels);
    return (
      <button
        key={agent.id}
        type="button"
        className={`configured-agent-pick ${agent.id === selected?.id ? "is-active" : ""}`}
        onClick={() => onSelectConfiguredAgent(agent.id)}
      >
        <span className={`agent-badge mini ${agentAccent(agent.runtimeAgentId)}`}>{agentLabel(agent.runtimeAgentId)}</span>
        <strong>{agent.name || agent.id}</strong>
        <span>{channel?.label ?? agent.channelId}{agent.revision ? ` · v${agent.revision}` : ""}</span>
      </button>
    );
  };

  return (
    <section className="agent-page">
      <header className="config-header">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
      </header>

      <div className="config-grid">
        <section className="config-form">
          <section className="configured-agent-panel">
            <section className="configured-agent-browser">
              <div className="configured-agent-toolbar">
                <h3>Agents</h3>
                <button className="icon-btn" type="button" onClick={() => void onAddConfiguredAgent()} aria-label={copy.newAgent} title={copy.newAgent}>
                  <Plus size={14} />
                </button>
              </div>
              <div className="configured-agent-list">
                {composedAgents.length > 0 ? <div className="configured-agent-group-label">{copy.composed}</div> : null}
                {composedAgents.map(renderAgent)}
                <div className="configured-agent-group-label">{copy.execution}</div>
                {executionAgents.map(renderAgent)}
              </div>
            </section>

            <section className="configured-agent-editor">
              {selected ? (
                <>
                  <div className="configured-agent-editor-head">
                    <div>
                      <h3>{selected.name || "Untitled Agent"}</h3>
                      <span>{selected.id}{selected.revision ? ` · v${selected.revision}` : ""}</span>
                    </div>
                    {selectedType === "composed" ? (
                      <button className="control-btn compact" type="button" onClick={() => void onSave()}>
                        <Save size={13} />
                        <span>{copy.save}</span>
                      </button>
                    ) : (
                      <span className="configured-agent-readonly-badge"><LockKeyhole size={12} />{copy.execution}</span>
                    )}
                  </div>
                  {status ? <div className="config-status">{status}</div> : null}

                  {selectedType === "execution" ? (
                    <>
                      <div className="configured-agent-runtime-notice"><LockKeyhole size={14} /><span>{copy.runtimeHint}</span></div>
                      <div className="config-field-grid">
                        <ReadOnlyField label={copy.name} value={selected.name} />
                        <ReadOnlyField label="ID" value={selected.id} />
                        <ReadOnlyField label={copy.runtime} value={agentLabel(selected.runtimeAgentId)} />
                        <ReadOnlyField label={copy.config} value={selectedChannel?.label ?? selected.channelId} />
                        <ReadOnlyField label={copy.model} value={selectedModelLabel} />
                        <ReadOnlyField label={copy.reasoning} value={selected.reasoningEffort ?? "Default"} />
                      </div>
                    </>
                  ) : (
                    <div className="config-field-grid">
                      <label className="config-field">
                        <span>{copy.name}</span>
                        <input aria-label="Agent name" value={selected.name} onChange={(event) => onUpdateConfiguredAgent(selected.id, (agent) => ({ ...agent, name: event.currentTarget.value }))} />
                      </label>
                      <label className="config-field">
                        <span>{copy.base}</span>
                        <select
                          aria-label="Base execution agent"
                          value={selected.baseAgentId ?? executionAgents[0]?.id ?? ""}
                          onChange={(event) => {
                            const base = executionAgents.find((agent) => agent.id === event.currentTarget.value);
                            if (!base) return;
                            onUpdateConfiguredAgent(selected.id, (agent) => ({
                              ...agent,
                              baseAgentId: base.id,
                              runtimeAgentId: base.runtimeAgentId,
                              channelId: base.channelId,
                              modelId: base.modelId,
                              ...(base.reasoningEffort ? { reasoningEffort: base.reasoningEffort } : {}),
                            }));
                          }}
                        >
                          {executionAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                        </select>
                      </label>
                      <label className="config-field config-field-wide">
                        <span>{copy.descriptionField}</span>
                        <input aria-label="Agent description" value={selected.description} onChange={(event) => onUpdateConfiguredAgent(selected.id, (agent) => ({ ...agent, description: event.currentTarget.value }))} />
                      </label>
                      <label className="config-field config-field-wide">
                        <span>{copy.instructions}</span>
                        <textarea aria-label="Agent instructions" rows={8} value={selected.instructions ?? ""} onChange={(event) => onUpdateConfiguredAgent(selected.id, (agent) => ({ ...agent, instructions: event.currentTarget.value }))} />
                      </label>
                      <label className="config-field config-field-wide">
                        <span>{copy.tags}</span>
                        <input
                          aria-label="Agent tags"
                          value={selected.tags.join(", ")}
                          onChange={(event) => onUpdateConfiguredAgent(selected.id, (agent) => ({
                            ...agent,
                            tags: event.currentTarget.value.split(",").map((tag) => tag.trim()).filter(Boolean),
                          }))}
                        />
                      </label>
                      <section className="config-field config-field-wide agent-mcp-bindings">
                        <span>{copy.capabilities}</span>
                        {mcpServers.length ? mcpServers.map((server) => {
                          const binding = selected.mcpBindings?.find((item) => item.serverId === server.id);
                          return <div key={server.id} className="agent-mcp-server">
                            <label><input type="checkbox" checked={Boolean(binding)} onChange={(event) => onUpdateConfiguredAgent(selected.id, (agent) => ({
                              ...agent,
                              mcpBindings: event.currentTarget.checked
                                ? [...(agent.mcpBindings ?? []), { serverId: server.id, toolAllowlist: [] }]
                                : (agent.mcpBindings ?? []).filter((item) => item.serverId !== server.id),
                            }))} /><Server size={13} /><strong>{server.name}</strong></label>
                            {binding ? <div className="agent-mcp-tools">{server.tools.map((tool) => <label key={tool.name}><input type="checkbox" checked={binding.toolAllowlist.includes(tool.name)} onChange={(event) => onUpdateConfiguredAgent(selected.id, (agent) => ({
                              ...agent,
                              mcpBindings: (agent.mcpBindings ?? []).map((item) => item.serverId !== server.id ? item : {
                                ...item,
                                toolAllowlist: event.currentTarget.checked ? [...item.toolAllowlist, tool.name] : item.toolAllowlist.filter((name) => name !== tool.name),
                              }),
                            }))} />{tool.name}</label>)}</div> : null}
                          </div>;
                        }) : <p>{copy.noMcp}</p>}
                      </section>
                    </div>
                  )}

                  <section className="configured-agent-revisions">
                    <h4>{copy.revisions}</h4>
                    {selectedRevisions.length > 0 ? selectedRevisions.slice(0, 5).map((revision) => (
                      <div key={revision.id}><strong>v{revision.revision}</strong><span>{revision.modelId}</span><time>{new Date(revision.createdAt).toLocaleString()}</time></div>
                    )) : <p>No revisions yet.</p>}
                  </section>
                </>
              ) : <div className="empty-state configured-agent-empty">{copy.empty}</div>}
            </section>
          </section>
        </section>
      </div>
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="config-field">
      <span>{label}</span>
      <div className="configured-agent-runtime-readonly"><strong>{value}</strong></div>
    </div>
  );
}
