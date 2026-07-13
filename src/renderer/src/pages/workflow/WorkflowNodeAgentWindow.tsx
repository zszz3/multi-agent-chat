import { useMemo, useState } from "react";
import { CircleStop, Send, X } from "lucide-react";
import type { TaskRun, WorkflowRunProgressItem } from "../../../../shared/types";
import type { WorkflowV2ScriptParameterDef } from "../../../../shared/workflow-v2/definition";
import type { WorkflowNodeConversation } from "../../../../shared/workflow-v2/conversation";
import { WorkflowMessageContent } from "./WorkflowMessageContent";

export interface WorkflowNodeAgentSession { nodeId: string; nodeTitle: string; conversation?: WorkflowNodeConversation; task?: TaskRun; }

function sessionStatus(session: WorkflowNodeAgentSession): { label: string; attention: boolean; group: number } {
  const status = session.conversation?.status ?? session.task?.status;
  if (status === "waiting_for_user") return { label: "Waiting for input", attention: true, group: 0 };
  if (status === "completion_proposed") return { label: "Confirm completion", attention: true, group: 0 };
  if (status === "starting" || status === "active" || status === "running" || status === "queued") return { label: "Running", attention: false, group: 1 };
  if (status === "failed") return { label: "Failed", attention: false, group: 2 };
  return { label: "Completed", attention: false, group: 2 };
}

const locationLabels: Record<WorkflowV2ScriptParameterDef["location"], string> = { header: "Headers", query: "Query", body: "Body", argument: "Arguments", environment: "Environment", stdin: "Standard input" };

export function WorkflowNodeAgentWindow(props: {
  conversation?: WorkflowNodeConversation; task?: TaskRun; sessions?: WorkflowNodeAgentSession[]; selectedNodeId?: string; nodeTitle: string;
  onClose: () => void; onSelectNode?: (nodeId: string) => void; onSend?: (message: string) => void | Promise<void>;
  onConfirm?: () => void | Promise<void>; onReject?: (instruction: string) => void | Promise<void>; onInterrupt?: () => void | Promise<void>;
  scriptInputRequest?: WorkflowRunProgressItem["scriptInputRequest"]; onSubmitScriptInput?: (values: Record<string, unknown>) => void | Promise<void>;
}) {
  const { conversation, task, sessions = [], selectedNodeId, nodeTitle, scriptInputRequest } = props;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [scriptValues, setScriptValues] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const draftKey = selectedNodeId ?? conversation?.nodeId ?? task?.id ?? "current";
  const message = drafts[draftKey] ?? "";
  const acceptsInput = Boolean(conversation && conversation.status !== "closed" && conversation.status !== "failed" && (conversation.status !== "completion_proposed" || rejecting));
  const orderedSessions = useMemo(() => [...sessions].sort((a, b) => sessionStatus(a).group - sessionStatus(b).group || a.nodeTitle.localeCompare(b.nodeTitle)), [sessions]);
  const attentionCount = sessions.filter((session) => sessionStatus(session).attention).length;
  const scriptGroups = useMemo(() => {
    const groups = new Map<WorkflowV2ScriptParameterDef["location"], WorkflowV2ScriptParameterDef[]>();
    for (const parameter of scriptInputRequest?.parameters ?? []) groups.set(parameter.location, [...(groups.get(parameter.location) ?? []), parameter]);
    return [...groups].map(([location, parameters]) => ({ location, parameters }));
  }, [scriptInputRequest]);
  const identity = scriptInputRequest ? "Waiting for typed script input" : conversation ? `${conversation.status} ? ${conversation.modelId} ? ${conversation.conversationId}` : task ? `${task.status} ? ${task.modelId} ? ${task.runtimeConversation?.runtimeId ?? "one-shot"}` : "Node has not started yet.";

  const submitMessage = async () => {
    const content = message.trim(); if (!content) return;
    try { setActionError(undefined); if (rejecting && props.onReject) await props.onReject(content); else await props.onSend?.(content); setDrafts((current) => ({ ...current, [draftKey]: "" })); setRejecting(false); }
    catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
  };
  const submitScriptInputs = async () => {
    if (!scriptInputRequest || !props.onSubmitScriptInput) return;
    try {
      const values: Record<string, unknown> = {};
      for (const parameter of scriptInputRequest.parameters) {
        const raw = scriptValues[parameter.key] ?? "";
        if (!raw.trim() && parameter.required) throw new Error(`${parameter.label} is required.`);
        if (!raw.trim()) continue;
        values[parameter.key] = parameter.valueType === "number" ? Number(raw) : parameter.valueType === "boolean" ? raw === "true" : parameter.valueType === "json" ? JSON.parse(raw) : raw;
      }
      setActionError(undefined); await props.onSubmitScriptInput(values);
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
  };

  const conversationMessages = conversation?.messages ?? [];
  const dialogueMessages = conversationMessages.filter((item) => item.role === "user" || item.role === "assistant");
  const runtimeMessages = conversationMessages.filter((item) => item.role === "system" || item.role === "tool");

  return <section className="workflow-node-agent-overlay" role="dialog" aria-modal="true" aria-label={`${nodeTitle} agent conversation`}>
    <article className="workflow-node-agent-window">
      {orderedSessions.length ? <aside className="workflow-node-agent-sidebar"><div className="workflow-node-agent-queue-summary"><strong>Node conversations</strong><span>{attentionCount} {attentionCount === 1 ? "node needs" : "nodes need"} attention</span></div><div className="workflow-node-agent-session-list">{orderedSessions.map((session) => { const state = sessionStatus(session); return <button key={session.nodeId} className={`workflow-node-agent-session${session.nodeId === selectedNodeId ? " is-selected" : ""}${state.attention ? " needs-attention" : ""}`} onClick={() => props.onSelectNode?.(session.nodeId)}><strong>{session.nodeTitle}</strong><span>{state.label}</span></button>; })}</div></aside> : null}
      <div className="workflow-node-agent-main">
        <header><div><strong>{nodeTitle}</strong><span>{identity}</span></div><button className="icon-btn" onClick={props.onClose} aria-label="Close node conversation"><X size={16} /></button></header>
        <div className="workflow-node-agent-messages">
          {scriptInputRequest ? <div className="workflow-script-input-editor"><div className="workflow-script-input-intro"><strong>Script input required</strong><p>Complete the declared request fields to continue this node.</p></div>{scriptGroups.map(({ location, parameters }) => <section key={location} className="workflow-script-input-group"><h4>{locationLabels[location]}</h4>{parameters.map((parameter) => <label key={parameter.key} className="workflow-script-input-field"><span>{parameter.label}{parameter.required ? " *" : ""}<small>{parameter.key}</small></span>{parameter.valueType === "json" ? <textarea rows={5} value={scriptValues[parameter.key] ?? ""} onChange={(event) => setScriptValues((current) => ({ ...current, [parameter.key]: event.currentTarget.value }))} placeholder={parameter.description ?? "JSON value"} /> : parameter.valueType === "boolean" ? <select value={scriptValues[parameter.key] ?? ""} onChange={(event) => setScriptValues((current) => ({ ...current, [parameter.key]: event.currentTarget.value }))}><option value="">Select...</option><option value="true">true</option><option value="false">false</option></select> : <input type={parameter.valueType === "secret" ? "password" : "text"} inputMode={parameter.valueType === "number" ? "numeric" : undefined} value={scriptValues[parameter.key] ?? ""} onChange={(event) => setScriptValues((current) => ({ ...current, [parameter.key]: event.currentTarget.value }))} placeholder={parameter.description ?? parameter.valueType} />}</label>)}</section>)}<button className="control-btn workflow-script-input-submit" onClick={() => void submitScriptInputs()}>Submit inputs and continue</button></div>
          : conversation ? dialogueMessages.map((item) => { const kind = item.eventType === "tool_call" ? "tool-call" : item.eventType === "tool_result" ? "tool-result" : item.role; const label = item.eventType === "tool_call" ? `Tool call${item.name ? ` ? ${item.name}` : ""}` : item.eventType === "tool_result" ? `Tool result${item.name ? ` ? ${item.name}` : ""}` : item.role === "assistant" ? "Agent" : "You"; return <div key={item.id} className={`workflow-node-agent-message is-${kind}`}><span>{label} ? {new Date(item.at).toLocaleTimeString()}</span><WorkflowMessageContent content={item.content} /></div>; })
          : task ? task.messages.map((item) => <div key={item.id} className={`workflow-node-agent-message is-${item.role}`}><span>{item.role} ? {new Date(item.timestamp).toLocaleTimeString()}</span><WorkflowMessageContent content={item.content} /></div>)
          : <div className="workflow-node-agent-message is-system"><span>Node status</span><p>This agent node has not produced runtime activity yet. Its full conversation will appear here after execution starts.</p></div>}
          {conversation && runtimeMessages.length ? <details className="workflow-node-agent-runtime-details"><summary>Runtime details <span>{runtimeMessages.length} events</span></summary><div>{runtimeMessages.map((item) => { const kind = item.eventType === "tool_call" ? "tool-call" : item.eventType === "tool_result" ? "tool-result" : "system"; const label = item.role === "system" ? "System instruction" : item.eventType === "tool_call" ? `Tool call${item.name ? ` ? ${item.name}` : ""}` : `Tool result${item.name ? ` ? ${item.name}` : ""}`; return <div key={item.id} className={`workflow-node-agent-message is-${kind}`}><span>{label} ? {new Date(item.at).toLocaleTimeString()}</span><WorkflowMessageContent content={item.content} /></div>; })}</div></details> : null}
        </div>
        {conversation?.completionProposal ? <div className="workflow-node-completion-proposal"><strong>Completion proposal</strong><p>{conversation.completionProposal.output.summary}</p>{conversation.completionProposal.unresolvedRisks.length ? <ul>{conversation.completionProposal.unresolvedRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : null}<div className="workflow-node-agent-actions"><button className="control-btn compact" onClick={() => void Promise.resolve(props.onConfirm?.()).catch((error) => setActionError(error instanceof Error ? error.message : String(error)))}>Confirm and continue</button><button className="control-btn compact secondary" onClick={() => setRejecting(true)}>Reject / request changes</button></div></div> : null}
        {actionError ? <div className="workflow-node-agent-error" role="alert">{actionError}</div> : null}
        {!scriptInputRequest ? <footer><textarea value={message} disabled={!acceptsInput} onChange={(event) => setDrafts((current) => ({ ...current, [draftKey]: event.currentTarget.value }))} placeholder={conversation ? rejecting ? "Describe required changes..." : "Send information to this node agent..." : task ? "This one-shot node is read-only." : "This node has not started; there is no active conversation yet."} rows={3} /><div><button className="icon-btn" disabled={!conversation} onClick={() => void props.onInterrupt?.()} title="Interrupt agent"><CircleStop size={16} /></button><button className="send-btn" disabled={!acceptsInput || !message.trim()} onClick={() => void submitMessage()}><Send size={14} /><span>Send</span></button></div></footer> : null}
      </div>
    </article>
  </section>;
}
