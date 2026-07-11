import { useState } from "react";
import { CircleStop, Send, X } from "lucide-react";
import type { WorkflowNodeConversation } from "../../../../shared/workflow-v2/conversation";

export function WorkflowNodeAgentWindow({ conversation, nodeTitle, onClose, onSend, onConfirm, onReject, onInterrupt }: {
  conversation: WorkflowNodeConversation;
  nodeTitle: string;
  onClose: () => void;
  onSend?: (message: string) => void | Promise<void>;
  onConfirm?: () => void | Promise<void>;
  onReject?: (instruction: string) => void | Promise<void>;
  onInterrupt?: () => void | Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const acceptsInput = conversation.status === "active" || conversation.status === "waiting_for_user" || conversation.status === "completion_proposed";
  const submit = async () => {
    const content = message.trim();
    if (!content) return;
    if (rejecting && onReject) await onReject(content);
    else if (onSend) await onSend(content);
    setMessage("");
    setRejecting(false);
  };
  return <section className="workflow-node-agent-overlay" role="dialog" aria-modal="true" aria-label={`${nodeTitle} agent conversation`}>
    <article className="workflow-node-agent-window">
      <header>
        <div><strong>{nodeTitle}</strong><span>{conversation.status} ? {conversation.modelId} ? {conversation.conversationId}</span></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close node conversation"><X size={16} /></button>
      </header>
      <div className="workflow-node-agent-messages">
        {conversation.messages.map((item) => <div key={item.id} className={`workflow-node-agent-message is-${item.role}`}>
          <span>{item.role} ? {new Date(item.at).toLocaleTimeString()}</span><p>{item.content}</p>
        </div>)}
      </div>
      {conversation.completionProposal ? <div className="workflow-node-completion-proposal">
        <strong>Completion proposal</strong><p>{conversation.completionProposal.output.summary}</p>
        {conversation.completionProposal.unresolvedRisks.length ? <ul>{conversation.completionProposal.unresolvedRisks.map((risk) => <li key={risk}>{risk}</li>)}</ul> : null}
        <div className="workflow-node-agent-actions"><button className="control-btn compact" onClick={() => void onConfirm?.()}>Confirm and continue</button><button className="control-btn compact secondary" onClick={() => setRejecting(true)}>Reject / request changes</button></div>
      </div> : null}
      <footer>
        <textarea value={message} disabled={!acceptsInput} onChange={(event) => setMessage(event.currentTarget.value)} placeholder={rejecting ? "Describe required changes..." : "Send information to this node agent..."} rows={3} />
        <div><button className="icon-btn" onClick={() => void onInterrupt?.()} title="Interrupt agent"><CircleStop size={16} /></button><button className="send-btn" disabled={!acceptsInput || !message.trim()} onClick={() => void submit()}><Send size={14} /><span>Send</span></button></div>
      </footer>
    </article>
  </section>;
}
