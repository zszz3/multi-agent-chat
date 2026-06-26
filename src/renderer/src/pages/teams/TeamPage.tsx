import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { CircleStop, FolderOpen, GitBranch, GripVertical, Play, Plus, RefreshCw, Save, Trash2, UserPlus, Users, Wand2, X } from "lucide-react";
import { DEFAULT_MODEL_ID } from "../../../../shared/models";
import type {
  AgentChannel,
  AgentRuntime,
  AgentTeam,
  AgentTeamMember,
  AgentTeamMode,
  AgentWorkflowNodeStatus,
  ConfiguredAgent,
  TeamRun,
} from "../../../../shared/types";
import {
  agentAccent,
  agentLabel,
  configuredAgentById,
  configuredAgentModel,
  configuredAgentRuntimeId,
  defaultConfiguredAgentId,
  fallbackRuntime,
  resolveConfiguredAgentChannel,
  runtimeStatus,
} from "../../app/agents";
import { shouldSendComposerKey } from "../../app/composer";
import { formatTime } from "../../app/format";
import { MarkdownDocument } from "../../ui/MarkdownDocument";
import { TaskMeta, TaskStatusChip } from "../tasks/task-status";
import {
  draftWorkflowMembers,
  reorderTeamMembers,
  teamModeLabel,
  TEAM_MODE_OPTIONS,
  workflowStatusClass,
  workflowStatusForTeamMember,
  workflowTraceNodesForRun,
} from "./team-utils";

type MaybePromise = void | Promise<void>;

interface TeamPageProps {
  teams: AgentTeam[];
  teamRuns: TeamRun[];
  activeTeamId: string | undefined;
  activeTeamRunId: string | undefined;
  prompt: string;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents?: ConfiguredAgent[];
  defaultEditingMemberId?: string;
  onPromptChange: (value: string) => void;
  onCreateTeam: () => MaybePromise;
  onUpdateTeam: (teamId: string, update: { name?: string; mode?: AgentTeamMode; sharedContext?: string; members?: AgentTeamMember[] }) => MaybePromise;
  onDeleteTeam: (teamId: string) => MaybePromise;
  onSelectTeam: (teamId: string) => MaybePromise;
  onSelectTeamRun: (teamRunId: string) => MaybePromise;
  onRunTeam: (teamId: string) => MaybePromise;
  onStopTeamRun: (teamRunId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
}

export function TeamPage({
  teams,
  teamRuns,
  activeTeamId,
  activeTeamRunId,
  prompt,
  workDir,
  runtimes,
  channels,
  configuredAgents = [],
  defaultEditingMemberId,
  onPromptChange,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
  onSelectTeam,
  onSelectTeamRun,
  onRunTeam,
  onStopTeamRun,
  onChooseWorkDir,
  onRefresh,
}: TeamPageProps) {
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
  const activeTeamRuns = activeTeam ? teamRuns.filter((run) => run.teamId === activeTeam.id) : [];
  const activeRun = activeTeamRuns.find((run) => run.id === activeTeamRunId) ?? activeTeamRuns[0];
  const canRun = Boolean(activeTeam && activeTeam.members.length > 0 && prompt.trim());
  const [editingMemberId, setEditingMemberId] = useState<string | undefined>(defaultEditingMemberId);
  const [draggingMemberId, setDraggingMemberId] = useState<string | undefined>();
  const [dragOverMemberId, setDragOverMemberId] = useState<string | undefined>();
  const [draftingWorkflow, setDraftingWorkflow] = useState(false);

  useEffect(() => {
    if (!editingMemberId || activeTeam?.members.some((member) => member.id === editingMemberId)) return;
    setEditingMemberId(undefined);
  }, [activeTeam?.id, activeTeam?.members, editingMemberId]);

  function updateMembers(members: AgentTeamMember[]): void {
    if (!activeTeam) return;
    void onUpdateTeam(activeTeam.id, { members });
  }

  function updateMode(mode: AgentTeamMode): void {
    if (!activeTeam || activeTeam.mode === mode) return;
    void onUpdateTeam(activeTeam.id, { mode });
  }

  function updateMember(index: number, update: Partial<AgentTeamMember>): void {
    if (!activeTeam) return;
    const members = activeTeam.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...update } : member));
    updateMembers(members);
  }

  function addMember(): void {
    if (!activeTeam) return;
    updateMembers([
      ...activeTeam.members,
      {
        id: `draft-${Date.now()}`,
        roleName: `Agent ${activeTeam.members.length + 1}`,
        prompt: "",
        configuredAgentId: defaultConfiguredAgentId(configuredAgents),
      },
    ]);
  }

  async function buildDraftWorkflow(): Promise<void> {
    if (!activeTeam || draftingWorkflow) return;
    setDraftingWorkflow(true);
    try {
      await onUpdateTeam(activeTeam.id, { members: draftWorkflowMembers(activeTeam.mode, configuredAgents) });
    } finally {
      setDraftingWorkflow(false);
    }
  }

  function removeMember(index: number): void {
    if (!activeTeam) return;
    updateMembers(activeTeam.members.filter((_member, memberIndex) => memberIndex !== index));
  }

  function startMemberDrag(event: DragEvent<HTMLElement>, memberId: string): void {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multi-agent-team-member", memberId);
    event.dataTransfer.setData("text/plain", memberId);
    setDraggingMemberId(memberId);
    setDragOverMemberId(undefined);
  }

  function endMemberDrag(): void {
    setDraggingMemberId(undefined);
    setDragOverMemberId(undefined);
  }

  function dropMemberBefore(event: DragEvent<HTMLElement>, targetMemberId: string | undefined): void {
    event.preventDefault();
    event.stopPropagation();
    if (!activeTeam) return;
    const draggedMemberId =
      event.dataTransfer.getData("application/x-multi-agent-team-member") || event.dataTransfer.getData("text/plain") || draggingMemberId;
    endMemberDrag();
    if (!draggedMemberId) return;
    const reordered = reorderTeamMembers(activeTeam.members, draggedMemberId, targetMemberId);
    if (reordered === activeTeam.members) return;
    updateMembers(reordered);
  }

  function renderWorkflowModeControls() {
    if (!activeTeam) return null;
    return (
      <div className="workflow-mode-row" role="group" aria-label="Workflow mode">
        {TEAM_MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            className={`workflow-mode-toggle ${activeTeam.mode === option.id ? "is-active" : ""}`}
            onClick={() => updateMode(option.id)}
            title={option.description}
            aria-label={`${option.label}: ${option.description}`}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderWorkflowNode(member: AgentTeamMember, index: number, className = "") {
    const workflowStatus = workflowStatusForTeamMember(activeRun, member.id);
    return (
      <div className={`workflow-node-slot ${className}`} key={member.id}>
        <TeamMemberRow
          member={member}
          index={index}
          runtimes={runtimes}
          channels={channels}
          configuredAgents={configuredAgents}
          editing={editingMemberId === member.id}
          dragging={draggingMemberId === member.id}
          dropTarget={Boolean(draggingMemberId && draggingMemberId !== member.id && dragOverMemberId === member.id)}
          freeNode={false}
          workflowStatus={workflowStatus}
          onEdit={() => setEditingMemberId(member.id)}
          onDone={() => setEditingMemberId(undefined)}
          onDragStart={startMemberDrag}
          onDragEnd={endMemberDrag}
          onDragOverMember={() => setDragOverMemberId(member.id)}
          shouldSuppressClick={() => false}
          onDropBefore={dropMemberBefore}
          onUpdateRole={(roleName) => updateMember(index, { roleName })}
          onUpdatePrompt={(memberPrompt) => updateMember(index, { prompt: memberPrompt })}
          onUpdateConfiguredAgent={(configuredAgentId) => updateMember(index, { configuredAgentId })}
          onRemove={() => removeMember(index)}
        />
      </div>
    );
  }

  function renderWorkflowTopology() {
    if (!activeTeam) return null;
    return (
      <div
        className={`workflow-topology-board workflow-canvas workflow-canvas-${activeTeam.mode} ${draggingMemberId ? "is-dragging" : ""}`}
        aria-label="Workflow topology"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          if (event.target instanceof HTMLElement && !event.target.closest(".workflow-node-card")) {
            setDragOverMemberId(undefined);
          }
        }}
        onDrop={(event) => dropMemberBefore(event, undefined)}
      >
        <div className="workflow-topology-stage">
          {activeTeam.members.length === 0 ? (
            <div className="workflow-empty-canvas">No nodes</div>
          ) : activeTeam.mode === "parallel" ? (
            <div className="workflow-parallel-layout">
              <div className="workflow-terminal workflow-terminal-start">Start</div>
              <span className="workflow-edge" />
              <div className="workflow-parallel-workers">{activeTeam.members.map((member, index) => renderWorkflowNode(member, index))}</div>
              <span className="workflow-edge" />
              <div className="workflow-join-node">Join</div>
            </div>
          ) : activeTeam.mode === "supervisor" ? (
            <div className="workflow-supervisor-layout">
              <div className="workflow-supervisor-region workflow-supervisor-lead">
                <span className="workflow-region-label">Lead</span>
                {activeTeam.members[0] ? renderWorkflowNode(activeTeam.members[0], 0, "is-lead") : null}
              </div>
              <div className="workflow-supervisor-region workflow-supervisor-workers">
                <span className="workflow-region-label">Workers</span>
                <div className="workflow-worker-grid">
                  {activeTeam.members.slice(1).map((member, workerIndex) => renderWorkflowNode(member, workerIndex + 1))}
                </div>
              </div>
              <div className="workflow-supervisor-region workflow-supervisor-synthesis">
                <span className="workflow-region-label">Synthesis</span>
                <div className="workflow-synthesis-card">
                  <GitBranch size={14} />
                  <span>{`${activeTeam.members[0]?.roleName ?? "Lead"} summarizes worker artifacts`}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="workflow-pipeline-row">
              <div className="workflow-terminal workflow-terminal-start">Start</div>
              {activeTeam.members.map((member, index) => (
                <div className="workflow-pipeline-segment" key={member.id}>
                  <span className="workflow-edge" />
                  {renderWorkflowNode(member, index)}
                </div>
              ))}
              <span className="workflow-edge" />
              <div className="workflow-terminal workflow-terminal-end">Done</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderWorkflowBuilder() {
    if (!activeTeam) return null;
    return (
      <section className="team-section workflow-builder-shell">
        <div className="workflow-builder-head">
          <div className="workflow-builder-title">
            <strong>Workflow Builder</strong>
            <span>{`${activeTeam.members.length} nodes · ${teamModeLabel(activeTeam.mode)}`}</span>
          </div>
          <div className="workflow-studio-toolbar">
            {renderWorkflowModeControls()}
            <div className="workflow-builder-toolbar">
              <button
                type="button"
                className="control-btn compact secondary"
                aria-label="Draft workflow"
                onClick={() => void buildDraftWorkflow()}
                disabled={draftingWorkflow}
              >
                <Wand2 size={14} />
                <span>{draftingWorkflow ? "Drafting..." : "Draft workflow"}</span>
              </button>
              <button type="button" className="control-btn compact secondary" aria-label="Add node" onClick={addMember}>
                <UserPlus size={14} />
                <span>Add node</span>
              </button>
            </div>
          </div>
        </div>
        {renderWorkflowTopology()}
      </section>
    );
  }

  return (
    <section className="agent-teams-page">
      <header className="teams-header">
        <div>
          <h2>Agent Workflow</h2>
          <p>Pick an execution mode, wire agent nodes, then run the team.</p>
        </div>
        <button className="control-btn compact" onClick={() => void onCreateTeam()}>
          <Plus size={14} />
          <span>New team</span>
        </button>
      </header>

      {activeTeam ? (
        <div className="teams-workspace is-workflow-ide">
          <aside className="team-list-pane team-resource-pane" aria-label="Agent teams">
            <div className="team-resource-head">
              <span>Teams</span>
              <strong>{teams.length}</strong>
            </div>
            {teams.map((team) => (
              <article
                key={team.id}
                className={`team-list-card ${team.id === activeTeam.id ? "is-active" : ""}`}
                onClick={() => void onSelectTeam(team.id)}
              >
                <div>
                  <input
                    className="team-list-name-input"
                    aria-label="Team name in sidebar"
                    value={team.name}
                    onClick={(event) => event.stopPropagation()}
                    onFocus={() => void onSelectTeam(team.id)}
                    onChange={(event) => void onUpdateTeam(team.id, { name: event.currentTarget.value })}
                  />
                  <span>{`${team.members.length} nodes`}</span>
                </div>
                <div className="team-list-card-actions">
                  <TaskStatusChip label={teamModeLabel(team.mode)} tone="todo" />
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onDeleteTeam(team.id);
                    }}
                    title="Delete team"
                    aria-label={`Delete ${team.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </aside>

          <section className="team-config-pane workflow-studio-pane">
            {renderWorkflowBuilder()}

            <section className="team-section workflow-context-section">
              <div className="task-section-divider">
                <span>Shared Context</span>
                <i />
              </div>
              <textarea
                className="team-shared-context"
                aria-label="Shared Context"
                value={activeTeam.sharedContext}
                onChange={(event) => void onUpdateTeam(activeTeam.id, { sharedContext: event.currentTarget.value })}
                placeholder="Project background, constraints, paths, review standards..."
                rows={5}
              />
            </section>

            <section className="team-run-composer workflow-task-composer">
              <textarea
                aria-label="Team prompt"
                value={prompt}
                onChange={(event) => onPromptChange(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (shouldSendComposerKey({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                    isComposing: event.nativeEvent.isComposing,
                  })) {
                    event.preventDefault();
                    void onRunTeam(activeTeam.id);
                  }
                }}
                placeholder="Describe the workflow task..."
                rows={4}
              />
              <div className="team-run-footer">
                <button
                  className="workdir-picker composer-workdir-picker"
                  onClick={() => void onChooseWorkDir()}
                  title={workDir || "Choose workdir"}
                  aria-label="Choose work directory"
                >
                  <FolderOpen size={14} />
                  <span>{workDir || "Choose workdir"}</span>
                </button>
                <button className="icon-btn flat composer-refresh-btn" onClick={() => void onRefresh()} title="Refresh agents">
                  <RefreshCw size={13} />
                </button>
                <button className="send-btn" onClick={() => void onRunTeam(activeTeam.id)} disabled={!canRun}>
                  <Play size={14} />
                  <span>Run Workflow</span>
                </button>
              </div>
            </section>
          </section>

          <section className="team-run-pane run-inspector-pane">
            <div className="run-inspector-head">
              <div>
                <strong>Run Inspector</strong>
                <span>{activeRun ? `${activeRun.status} · ${activeRun.steps.length} steps` : "No active run"}</span>
              </div>
              {activeRun ? <TaskStatusChip label={activeRun.status} tone={activeRun.status} /> : null}
            </div>
            <div className="team-run-list">
              <div className="task-section-divider">
                <span>Runs</span>
                <i />
              </div>
              {activeTeamRuns.length === 0 ? (
                <div className="empty-state config-empty">No team runs</div>
              ) : (
                activeTeamRuns.map((run) => (
                  <button
                    key={run.id}
                    className={`team-run-card ${run.id === activeRun?.id ? "is-active" : ""}`}
                    onClick={() => void onSelectTeamRun(run.id)}
                  >
                    <strong>{run.title}</strong>
                    <span>{`${run.status} · ${run.steps.length} steps`}</span>
                  </button>
                ))
              )}
            </div>

            {activeRun ? (
              <TeamRunDetail run={activeRun} channels={channels} configuredAgents={configuredAgents} onStopTeamRun={onStopTeamRun} />
            ) : (
              <div className="empty-state page-empty">
                <GitBranch size={18} />
                <span>Run this team to create artifacts.</span>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="teams-empty-state">
          <Users size={22} />
          <strong>No teams yet</strong>
          <button className="control-btn compact" onClick={() => void onCreateTeam()}>
            <Plus size={14} />
            <span>New team</span>
          </button>
        </div>
      )}
    </section>
  );
}

function TeamMemberRow({
  member,
  index,
  runtimes,
  channels,
  configuredAgents,
  editing,
  dragging,
  dropTarget,
  freeNode,
  workflowStatus,
  onEdit,
  onDone,
  onDragStart,
  onDragEnd,
  onDragOverMember,
  shouldSuppressClick,
  onDropBefore,
  onUpdateRole,
  onUpdatePrompt,
  onUpdateConfiguredAgent,
  onRemove,
}: {
  member: AgentTeamMember;
  index: number;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  editing: boolean;
  dragging: boolean;
  dropTarget: boolean;
  freeNode: boolean;
  workflowStatus: AgentWorkflowNodeStatus;
  onEdit: () => void;
  onDone: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, memberId: string) => void;
  onDragEnd: () => void;
  onDragOverMember: () => void;
  shouldSuppressClick: () => boolean;
  onDropBefore: (event: DragEvent<HTMLElement>, targetMemberId: string | undefined) => void;
  onUpdateRole: (roleName: string) => void;
  onUpdatePrompt: (prompt: string) => void;
  onUpdateConfiguredAgent: (configuredAgentId: string) => void;
  onRemove: () => void;
}) {
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const selectedConfiguredAgent = configuredAgentById(member.configuredAgentId, configuredAgents);
  const selectedChannel = resolveConfiguredAgentChannel(selectedConfiguredAgent, channels);
  const runtimeId = configuredAgentRuntimeId(selectedConfiguredAgent, selectedChannel);
  const runtime = runtimeMap.get(runtimeId) ?? fallbackRuntime(runtimeId);
  const selectedModel = configuredAgentModel(selectedConfiguredAgent, selectedChannel);
  const suppressClickRef = useRef(false);
  const nodeStatusClass = workflowStatusClass(workflowStatus);

  function openMemberEditor(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
    if (suppressClickRef.current || shouldSuppressClick()) {
      suppressClickRef.current = false;
      return;
    }
    onEdit();
  }

  return (
    <>
      <article
        className={`team-member-card workflow-node-card ${nodeStatusClass} ${editing ? "is-selected" : ""} ${dragging ? "is-dragging" : ""} ${
          dropTarget ? "is-drop-target" : ""
        }`}
        role="button"
        tabIndex={0}
        draggable={!freeNode}
        data-member-id={member.id}
        data-free-node={freeNode ? "true" : undefined}
        data-workflow-node-status={workflowStatus}
        title="Click to edit member"
        aria-label={`Edit ${member.roleName}`}
        onClick={openMemberEditor}
        onDragStart={(event) => {
          suppressClickRef.current = true;
          onDragStart(event, member.id);
        }}
        onDragEnd={() => {
          onDragEnd();
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }}
        onDragOver={(event) => {
          if (freeNode) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          onDragOverMember();
        }}
        onDrop={freeNode ? undefined : (event) => onDropBefore(event, member.id)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onEdit();
        }}
      >
        <div className="workflow-node-drag" aria-hidden="true">
          <GripVertical size={13} />
        </div>
        <div className="team-member-card-index">{index + 1}</div>
        <div className="team-member-card-main">
          <div className="team-member-card-head">
            <strong>{member.roleName}</strong>
            <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{selectedConfiguredAgent?.name || agentLabel(runtimeId)}</span>
            {workflowStatus !== "idle" ? <span className={`workflow-node-status-pill ${nodeStatusClass}`}>{workflowStatus}</span> : null}
          </div>
          <p>{member.prompt || "No member prompt."}</p>
          <div className="team-member-card-meta">
            <span>{selectedChannel?.label ?? "No config"}</span>
            <span>{selectedModel?.label ?? selectedConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID}</span>
          </div>
        </div>
      </article>

      {editing ? (
        <section className="team-member-edit-overlay" role="dialog" aria-modal="true" aria-label="Edit team member" onClick={onDone}>
          <article className="team-member-edit-modal" onClick={(event) => event.stopPropagation()}>
            <div className="team-member-edit-head">
              <div>
                <h3>Edit member</h3>
                <span>{`Node ${index + 1} in this workflow`}</span>
              </div>
              <button className="icon-btn flat" onClick={onDone} title="Close member editor" aria-label="Close member editor">
                <X size={14} />
              </button>
            </div>

            <section className="team-member-editor-identity">
              <div className="team-member-card-index">{index + 1}</div>
              <label className="team-member-edit-field">
                <span>Role</span>
                <input aria-label={`Member ${index + 1} role`} value={member.roleName} onChange={(event) => onUpdateRole(event.currentTarget.value)} />
              </label>
              <div className="team-member-editor-summary">
                <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{selectedConfiguredAgent?.name || agentLabel(runtimeId)}</span>
                <strong>{selectedModel?.label ?? selectedConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID}</strong>
                <small>{selectedChannel?.label ?? runtimeStatus(runtime)}</small>
              </div>
            </section>

            <section className="team-member-editor-prompt-panel">
              <div className="task-section-divider">
                <span>Instructions</span>
                <i />
              </div>
              <label className="team-member-edit-field">
                <textarea
                  className="team-member-prompt"
                  aria-label={`Member ${index + 1} prompt`}
                  value={member.prompt}
                  onChange={(event) => onUpdatePrompt(event.currentTarget.value)}
                  placeholder="Member-specific instructions..."
                  rows={5}
                />
              </label>
            </section>

            <section className="team-member-editor-routing">
              <div className="task-section-divider">
                <span>Routing</span>
                <i />
              </div>
              <div className="team-member-edit-grid">
                <label className="team-member-edit-field">
                  <span>Agent</span>
                  <select
                    className="composer-select"
                    aria-label={`Member ${index + 1} configured agent`}
                    value={selectedConfiguredAgent?.id ?? ""}
                    onChange={(event) => onUpdateConfiguredAgent(event.currentTarget.value)}
                  >
                    {configuredAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.id}
                      </option>
                    ))}
                  </select>
                </label>
                <TaskMeta label="Config" value={selectedChannel?.label ?? "No config"} />
                <TaskMeta label="Model" value={selectedModel?.label ?? selectedConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID} />
              </div>
            </section>

            <div className="team-member-edit-actions">
              <button
                className="control-btn compact secondary danger"
                onClick={() => {
                  onRemove();
                  onDone();
                }}
              >
                <Trash2 size={14} />
                <span>Remove</span>
              </button>
              <button className="control-btn compact" onClick={onDone}>
                <Save size={14} />
                <span>Done</span>
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </>
  );
}

function TeamRunDetail({
  run,
  channels,
  configuredAgents,
  onStopTeamRun,
}: {
  run: TeamRun;
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  onStopTeamRun: (teamRunId: string) => MaybePromise;
}) {
  return (
    <article className="team-run-detail">
      <div className="team-run-detail-head">
        <div>
          <h3>{run.title}</h3>
          <span>{run.teamName}</span>
        </div>
        <div className="team-config-actions">
          <TaskStatusChip label={run.status} tone={run.status} />
          {run.status === "running" ? (
            <button className="control-btn compact secondary" onClick={() => void onStopTeamRun(run.id)}>
              <CircleStop size={14} />
              <span>Stop</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="task-section-divider">
        <span>Prompt</span>
        <i />
      </div>
      <MarkdownDocument className="team-run-prompt" text={run.prompt} />

      <div className="task-section-divider">
        <span>Target</span>
        <i />
      </div>
      <pre className="team-run-context">{run.target ? `${run.target.label}: ${run.target.value}` : run.workDir}</pre>

      <div className="task-section-divider">
        <span>Shared Context Snapshot</span>
        <i />
      </div>
      <MarkdownDocument className="team-run-shared-context" text={run.sharedContextSnapshot || "No shared context snapshot."} />

      <div className="task-section-divider">
        <span>Workflow Trace</span>
        <i />
      </div>
      <div className="workflow-trace-list">
        {workflowTraceNodesForRun(run).map((node) => {
          const step = run.steps.find((item) => item.id === node.stepId || item.teamMemberId === node.teamMemberId);
          const time = step?.completedAt ?? step?.startedAt;
          const glyph = node.status === "completed" ? "✓" : node.status === "running" ? "●" : node.status === "failed" ? "✕" : "○";
          const detail =
            node.status === "running"
              ? "正在执行…"
              : node.status === "completed"
                ? (step?.artifact?.split("\n")[0]?.slice(0, 96) ?? node.description)
                : node.status === "failed"
                  ? step?.lastError ?? "执行失败"
                  : "等待上游产物";
          return (
            <article key={node.id} className={`workflow-trace-item ${workflowStatusClass(node.status)}`}>
              <span className="trace-time">{time ? formatTime(time) : "—"}</span>
              <span className="trace-glyph">{glyph}</span>
              <strong>{`${node.label} ${node.status}`}</strong>
              {detail ? <p>{detail}</p> : null}
            </article>
          );
        })}
      </div>

      <div className="task-section-divider">
        <span>Steps</span>
        <i />
      </div>
      <div className="team-run-steps">
        {run.steps.map((step, index) => {
          const agent = configuredAgentById(step.configuredAgentId, configuredAgents);
          const channel = resolveConfiguredAgentChannel(agent, channels);
          const runtimeId = configuredAgentRuntimeId(agent, channel);
          const model = configuredAgentModel(agent, channel);
          return (
            <article key={step.id} className="team-run-step">
              <div className="team-run-step-head">
                <div>
                  <span>{`Step ${index + 1}`}</span>
                  <strong>{step.roleName}</strong>
                </div>
                <TaskStatusChip label={step.status} tone={step.status} />
              </div>
              <div className="team-run-step-meta">
                <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{agent?.name || agentLabel(runtimeId)}</span>
                <span>{channel?.label ?? "No config"}</span>
                <span>{model?.label ?? agent?.modelId ?? DEFAULT_MODEL_ID}</span>
              </div>
              {step.artifact ? <MarkdownDocument className="team-run-step-artifact" text={step.artifact} /> : <p>{step.lastError ?? "Waiting for artifact."}</p>}
            </article>
          );
        })}
      </div>
    </article>
  );
}
