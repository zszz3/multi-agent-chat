import { useState } from "react";
import { CircleStop, Send, X } from "lucide-react";
import type { TaskRun } from "../../../../shared/types";
import type { WorkflowNodeConversation } from "../../../../shared/workflow-v2/conversation";

export interface WorkflowNodeAgentSession {
  nodeId: string;
  nodeTitle: string;
  conversation?: WorkflowNodeConversation;
  task?: TaskRun;
}

function sessionStatus(session: WorkflowNodeAgentSession): { label: string; attention: boolean; group: number } {
  const status = session.conversation?.status ?? session.task?.status;
  if (status === "waiting_for_user") return { label: "Waiting for input", attention: true, group: 0 };
  if (status === "completion_proposed") return { label: "Confirm completion", attention: true, group: 0 };
  if (status === "starting" || status === "active" || status === "running" || status === "queued") return { label: "Running", attention: false, group: 1 };
  if (status === "failed") return { label: "Failed", attention: false, group: 2 };
  return { label: "Completed", attention: false, group: 2 };
}

export function WorkflowNodeAgentWindow({ conversation, task, sessions = [], selectedNodeId, nodeTitle, onClose, onSelectNode, onSend, onConfirm, onReject, onInterrupt }: {
  conversation?: WorkflowNodeConversation;
  task?: TaskRun;
  sessions?: WorkflowNodeAgentSession[];
  selectedNodeId?: string;
  nodeTitle: string;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
  onSend?: (message: string) => void | Promise<void>;
  onConfirm?: () => void | Promise<void>;
  onReject?: (instruction: string) => void | Promise<void>;
  onInterrupt?: () => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const draftKey = selectedNodeId ?? conversation?.nodeId ?? task?.id ?? "current";
  const message = drafts[draftKey] ?? "";
  const setMessage = (value: string) => setDrafts((current) => ({ ...current, [draftKey]: value }));
  const acceptsInput = Boolean(conversation && conversation.status !== "closed" && conversation.status !== "failed" && (conversation.status !== "completion_proposed" || rejecting));
  const submit = async () => {
    const content = message.trim();
    if (!content) return;
    try {
      setActionError(undefined);
      if (rejecting && onReject) await onReject(content);
      else if (onSend) await onSend(content);
      setMessage("");
      setRejecting(false);
    } catch (error) { setActionError(error instanceof Error ? error.message : String(error)); }
  };
  const identity = conversation
    ? `${conversation.status} · ${conversation.modelId} · ${conversation.conversationId}`
    : task
      ? `${task.status} · ${task.modelId} · ${task.runtimeConversation?.runtimeId ?? "one-shot"}`
      : "Node has not started yet.";
  const orderedSessions = [...sessions].sort((left, right) => sessionStatus(left).group - sessionStatus(right).group || left.nodeTitle.localeCompare(right.nodeTitle));
  const attentionCount = sessions.filter((session) => sessionStatus(session).attention).length;

  return <section className="workflow-node-agent-overlay" role="dialog" aria-modal="true" aria-label={`${nodeTitle} agent conversation`}>
    <article className="workflow-node-agent-window">
      {orderedSessions.length ? <aside className="workflow-node-agent-sidebar">
        <div className="workflow-node-agent-queue-summary"><strong>Node conversations</strong><span>{attentionCount} {attentionCount === 1 ? "node needs" : "nodes need"} attention</span></div>
        <div className="workflow-node-agent-session-list">
          {orderedSessions.map((session) => { const state = sessionStatus(session); return <button key={session.nodeId} className={`workflow-node-agent-session${session.nodeId === selectedNodeId ? " is-selected" : ""}${state.attention ? " needs-attention" : ""}`} onClick={() => onSelectNode?.(session.nodeId)}>
            <strong>{session.nodeTitle}</strong><span>{state.label}</span>
          </button>; })}
        </div>
      </aside> : null}
      <div className="workflow-node-agent-main">
        <header>
          <div><strong>{nodeTitle}</strong><span>{identity}</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close node conversation"><X size={16} /></button>
        </header>
        <div className="workflow-node-agent-messages">
          {conversation ? conversation.messages.map((item) => { const kind = item.eventType === "tool_call" ? "tool-call" : item.eventType === "tool_result" ? "tool-result" : item.role; const label = item.role === "system" ? "System instruction" : item.eventType === "tool_call" ? `Tool call${item.name ? ` · ${item.name}` : ""}` : item.eventType === "tool_result" ? `Tool result${item.name ? ` · ${item.name}` : ""}` : item.role === "assistant" ? "Agent" : "You"; return <div key={item.id} className={`workflow-node-agent-message is-${kind}`}>
            <span>{label} · {new Date(item.at).toLocaleTimeString()}</span><p>{item.content}</p>
          </div>; }) : task ? task.messages.map((item) => <div key={item.id} className={`workflow-node-agent-message is-${item.role}`}>
            <span>{item.role} · {new Date(item.timestamp).toLocaleTimeString()}</span><p>{item.content}</p>
          </div>) : <div className="workflow-node-agent-message is-system">
            <span>Node status</span><p>This agent node has not produced runtime activity yet. Its full conversation will appear here after execution starts.</p>
          </div>}
        </div>
        {conversation?.completionProposal ? <div className="workflow-node-completion-proposal">
          <strong>Completion proposal</strong><p>{conversation.completionProposal.output.summary}</p>
          {conversation.completionProposal.unresolvedRisks.length ? <ul>{conversation.completionProposal.unresolvedRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : null}
          <div className="workflow-node-agent-actions">
            <button className="control-btn compact" onClick={() => void Promise.resolve(onConfirm?.()).catch((error) => setActionError(error instanceof Error ? error.message : String(error)))}>Confirm and continue</button>
            <button className="control-btn compact secondary" onClick={() => setRejecting(true)}>Reject / request changes</button>
          </div>
        </div> : null}
        {actionError ? <div className="workflow-node-agent-error" role="alert">{actionError}</div> : null}
        <footer>
          <textarea value={message} disabled={!acceptsInput} onChange={(event) => setMessage(event.currentTarget.value)} placeholder={conversation ? (rejecting ? "Describe required changes..." : "Send information to this node agent...") : task ? "This one-shot node is read-only." : "This node has not started; there is no active conversation yet."} rows={3} />
          <div>
            <button className="icon-btn" disabled={!conversation} onClick={() => void onInterrupt?.()} title="Interrupt agent"><CircleStop size={16} /></button>
            <button className="send-btn" disabled={!acceptsInput || !message.trim()} onClick={() => void submit()}><Send size={14} /><span>Send</span></button>
          </div>
        </footer>
      </div>
    </article>
  </section>;
}
