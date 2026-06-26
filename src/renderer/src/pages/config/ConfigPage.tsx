import { Plus, Save } from "lucide-react";
import { agentLabel, resolveConfiguredAgentChannel } from "../../app/agents";
import type { Language } from "../../app/language";
import { DEFAULT_MODEL_ID } from "../../../../shared/models";
import type { AgentChannel, ConfiguredAgent } from "../../../../shared/types";

type MaybePromise = void | Promise<void>;

interface ConfigPageProps {
  language?: Language;
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  selectedConfiguredAgentId: string;
  status: string;
  onSave: () => Promise<void>;
  onAddConfiguredAgent: () => MaybePromise;
  onSelectConfiguredAgent: (agentId: string) => void;
  onUpdateConfiguredAgent: (agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent) => void;
}

function configTextFor(language: Language) {
  return language === "zh"
    ? {
        title: "Agent 组装",
        description: "组装 Agent 的名称、描述、执行配置和标签。",
        save: "保存",
        name: "名称",
        config: "配置",
        model: "模型",
        tags: "标签",
        descriptionField: "描述",
        emptyAgent: "新建 Agent 后可编辑名称、描述、执行配置和标签。",
        newAgent: "新建 Agent",
      }
    : {
        title: "Agent Assembly",
        description: "Assemble agent profiles, execution config, and tags.",
        save: "Save",
        name: "Name",
        config: "Config",
        model: "Model",
        tags: "Tags",
        descriptionField: "Description",
        emptyAgent: "Create an agent to edit its profile, execution config, and tags.",
        newAgent: "New agent",
      };
}

export function ConfigPage({
  language = "en",
  channels,
  configuredAgents,
  selectedConfiguredAgentId,
  status,
  onSave,
  onAddConfiguredAgent,
  onSelectConfiguredAgent,
  onUpdateConfiguredAgent,
}: ConfigPageProps) {
  const configText = configTextFor(language);
  const selectedConfiguredAgent =
    configuredAgents.find((agent) => agent.id === selectedConfiguredAgentId) ?? configuredAgents[0];
  const selectedAgentChannel = selectedConfiguredAgent ? resolveConfiguredAgentChannel(selectedConfiguredAgent, channels) : undefined;
  const selectedAgentModels =
    selectedAgentChannel && selectedAgentChannel.models.length > 0 ? selectedAgentChannel.models : [{ id: DEFAULT_MODEL_ID, label: "Default" }];
  const selectedAgentModelId = selectedConfiguredAgent && selectedAgentModels.some((model) => model.id === selectedConfiguredAgent.modelId)
    ? selectedConfiguredAgent.modelId
    : DEFAULT_MODEL_ID;

  return (
    <section className="config-page">
      <header className="config-header">
        <div>
          <h2>{configText.title}</h2>
          <p>{configText.description}</p>
        </div>
      </header>

      <div className="config-grid">
        <section className="config-form">
          <section className="configured-agent-panel">
            <section className="configured-agent-editor">
              {selectedConfiguredAgent ? (
                <>
                  <div className="configured-agent-editor-head">
                    <div>
                      <h3>{selectedConfiguredAgent.name || "Untitled Agent"}</h3>
                      <span>{selectedConfiguredAgent.id}</span>
                    </div>
                    <div className="configured-agent-editor-actions">
                      <button className="control-btn compact" onClick={() => void onSave()}>
                        <Save size={13} />
                        <span>{configText.save}</span>
                      </button>
                    </div>
                  </div>
                  {status ? <div className="config-status">{status}</div> : null}

                  <div className="config-field-grid">
                    <label className="config-field">
                      <span>{configText.name}</span>
                      <input
                        aria-label="Agent name"
                        value={selectedConfiguredAgent.name}
                        onChange={(event) => {
                          const nextName = event.currentTarget.value;
                          onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, name: nextName }));
                        }}
                      />
                    </label>
                    <label className="config-field">
                      <span>ID</span>
                      <input
                        aria-label="Agent config id"
                        value={selectedConfiguredAgent.id}
                        onChange={(event) => {
                          const nextId = event.currentTarget.value;
                          onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, id: nextId }));
                          onSelectConfiguredAgent(nextId);
                        }}
                      />
                    </label>
                    <label className="config-field">
                      <span>{configText.config}</span>
                      <select
                        aria-label="Agent execution config"
                        value={selectedAgentChannel?.id ?? ""}
                        onChange={(event) => {
                          const channel = channels.find((item) => item.id === event.currentTarget.value);
                          if (!channel) return;
                          onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({
                            ...item,
                            runtimeAgentId: channel.agentId,
                            channelId: channel.id,
                            modelId: DEFAULT_MODEL_ID,
                          }));
                        }}
                      >
                        {channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {`${channel.label || channel.id} · ${agentLabel(channel.agentId)}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="config-field">
                      <span>{configText.model}</span>
                      <select
                        aria-label="Agent model"
                        value={selectedAgentModelId}
                        disabled={!selectedConfiguredAgent || !selectedAgentChannel}
                        onChange={(event) => {
                          const modelId = event.currentTarget.value;
                          onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, modelId }));
                        }}
                      >
                        {selectedAgentModels.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.label || model.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="config-field">
                      <span>{configText.tags}</span>
                      <input
                        aria-label="Agent tags"
                        value={selectedConfiguredAgent.tags.join(", ")}
                        onChange={(event) =>
                          onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({
                            ...item,
                            tags: event.currentTarget.value
                              .split(",")
                              .map((tag) => tag.trim())
                              .filter(Boolean),
                          }))
                        }
                      />
                    </label>
                    <label className="config-field config-field-wide">
                      <span>{configText.descriptionField}</span>
                      <input
                        aria-label="Agent description"
                        value={selectedConfiguredAgent.description}
                        onChange={(event) =>
                          onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, description: event.currentTarget.value }))
                        }
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="empty-state config-empty configured-agent-empty">
                  <span>{configText.emptyAgent}</span>
                  <button className="control-btn compact" onClick={() => void onAddConfiguredAgent()}>
                    <Plus size={13} />
                    <span>{configText.newAgent}</span>
                  </button>
                </div>
              )}
            </section>
          </section>
        </section>
      </div>
    </section>
  );
}
