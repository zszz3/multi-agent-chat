import { useState } from "react";
import { CircleStop, Send, X } from "lucide-react";
import type { TaskRun } from "../../../../shared/types";
import type { WorkflowNodeConversation } from "../../../../shared/workflow-v2/conversation";

export function WorkflowNodeAgentWindow({ conversation, task, nodeTitle, onClose, onSend, onConfirm, onReject, onInterrupt }: {
  conversation?: WorkflowNodeConversation;
  task?: TaskRun;
  nodeTitle: string;
  onClose: () => void;
  onSend?: (message: string) => void | Promise<void>;
  onConfirm?: () => void | Promise<void>;
  onReject?: (instruction: string) => void | Promise<void>;
  onInterrupt?: () => void | Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const acceptsInput = conversation?.status === "waiting_for_user" || (conversation?.status === "completion_proposed" && rejecting);
  const submit = async () => {
    const content = message.trim();
    if (!content) return;
    if (rejecting && onReject) await onReject(content);
    else if (onSend) await onSend(content);
    setMessage("");
    setRejecting(false);
  };
  const identity = conversation
    ? `${conversation.status} · ${conversation.modelId} · ${conversation.conversationId}`
    : task
      ? `${task.status} · ${task.modelId} · ${task.runtimeConversation?.runtimeId ?? "one-shot"}`
      : "Connecting to node agent...";

  return <section className="workflow-node-agent-overlay" role="dialog" aria-modal="true" aria-label={`${nodeTitle} agent conversation`}>
    <article className="workflow-node-agent-window">
      <header>
        <div><strong>{nodeTitle}</strong><span>{identity}</span></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close node conversation"><X size={16} /></button>
      </header>
      <div className="workflow-node-agent-messages">
        {conversation ? conversation.messages.map((item) => <div key={item.id} className={`workflow-node-agent-message is-${item.role}`}>
          <span>{item.role} · {new Date(item.at).toLocaleTimeString()}</span><p>{item.content}</p>
        </div>) : task ? task.messages.map((item) => <div key={item.id} className={`workflow-node-agent-message is-${item.role}`}>
          <span>{item.role} · {new Date(item.timestamp).toLocaleTimeString()}</span><p>{item.content}</p>
        </div>) : <div className="workflow-node-agent-message is-system">
          <span>system</span><p>The interactive session is being created. Input will be enabled as soon as it is ready.</p>
        </div>}
      </div>
      {conversation?.completionProposal ? <div className="workflow-node-completion-proposal">
        <strong>Completion proposal</strong><p>{conversation.completionProposal.output.summary}</p>
        {conversation.completionProposal.unresolvedRisks.length ? <ul>{conversation.completionProposal.unresolvedRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : null}
        <div className="workflow-node-agent-actions">
          <button className="control-btn compact" onClick={() => void onConfirm?.()}>Confirm and continue</button>
          <button className="control-btn compact secondary" onClick={() => setRejecting(true)}>Reject / request changes</button>
        </div>
      </div> : null}
      <footer>
        <textarea value={message} disabled={!acceptsInput} onChange={(event) => setMessage(event.currentTarget.value)} placeholder={conversation ? (rejecting ? "Describe required changes..." : "Send information to this node agent...") : task ? "This one-shot node is read-only." : "Connecting; input will be available shortly..."} rows={3} />
        <div>
          <button className="icon-btn" disabled={!conversation} onClick={() => void onInterrupt?.()} title="Interrupt agent"><CircleStop size={16} /></button>
          <button className="send-btn" disabled={!acceptsInput || !message.trim()} onClick={() => void submit()}><Send size={14} /><span>Send</span></button>
        </div>
      </footer>
    </article>
  </section>;
}