import type { AgentEvent, RuntimeConversation } from "../../../shared/types";
import type {
  WorkflowNodeCompletionProposal,
  WorkflowNodeConversation,
  WorkflowNodeMessage,
} from "../../../shared/workflow-v2/conversation";
import { workflowNodeConversationId } from "../../../shared/workflow-v2/conversation";

export interface WorkflowNodeInteractiveSession {
  sendPrompt(prompt: string): Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  runtimeConversation(): RuntimeConversation | undefined;
}

export interface CreateWorkflowNodeConversationInput {
  workflowId: string;
  runId: string;
  nodeId: string;
  configuredAgentId: string;
  modelId: string;
  workDir: string;
  initialPrompt: string;
  developerInstructions?: string;
  contextDocument?: string;
}

export class WorkflowV2ConversationManager {
  private readonly conversations = new Map<string, WorkflowNodeConversation>();
  private readonly sessions = new Map<string, WorkflowNodeInteractiveSession>();

  constructor(private readonly deps: {
    now: () => number;
    createSession: (input: CreateWorkflowNodeConversationInput & { emit: (event: AgentEvent) => void }) => WorkflowNodeInteractiveSession;
    onChanged?: (conversation: WorkflowNodeConversation) => void;
    onCompleted?: (conversation: WorkflowNodeConversation, content: string) => void;
  }) {}

  async start(input: CreateWorkflowNodeConversationInput): Promise<WorkflowNodeConversation> {
    const conversationId = workflowNodeConversationId(input.workflowId, input.runId, input.nodeId);
    const existing = this.conversations.get(conversationId);
    if (existing) return structuredClone(existing);
    const now = this.deps.now();
    const conversation: WorkflowNodeConversation = {
      conversationId,
      workflowId: input.workflowId,
      runId: input.runId,
      nodeId: input.nodeId,
      configuredAgentId: input.configuredAgentId,
      modelId: input.modelId,
      workDir: input.workDir,
      status: "starting",
      messages: [],
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    };
    const session = this.deps.createSession({ ...input, emit: (event) => this.recordEvent(conversationId, event) });
    this.conversations.set(conversationId, conversation);
    this.sessions.set(conversationId, session);
    this.appendMessage(conversation, "user", input.initialPrompt, now);
    conversation.status = "active";
    this.changed(conversation);
    void session.sendPrompt(input.initialPrompt)
      .then(() => this.syncRuntimeConversation(conversationId))
      .catch((error) => {
        const mutable = this.conversations.get(conversationId);
        if (!mutable || mutable.status === "closed") return;
        const message = error instanceof Error ? error.message : String(error);
        this.appendMessage(mutable, "system", message, this.deps.now(), "error");
        mutable.status = "failed";
        this.changed(mutable);
      });
    return this.getRequired(conversationId);
  }

  async sendUserMessage(conversationId: string, content: string): Promise<WorkflowNodeConversation> {
    const conversation = this.mutableRequired(conversationId);
    const session = this.sessionRequired(conversationId);
    const message = content.trim();
    if (!message) throw new Error("Workflow node conversation message is required.");
    if (conversation.status === "closed" || conversation.status === "failed") throw new Error("Workflow node conversation is not active.");
    const now = this.deps.now();
    this.appendMessage(conversation, "user", message, now);
    delete conversation.completionProposal;
    conversation.status = "active";
    this.changed(conversation);
    await session.sendPrompt(message);
    this.syncRuntimeConversation(conversationId);
    return this.getRequired(conversationId);
  }

  markWaitingForUser(conversationId: string, question: string): WorkflowNodeConversation {
    const conversation = this.mutableRequired(conversationId);
    this.appendMessage(conversation, "assistant", question, this.deps.now());
    conversation.status = "waiting_for_user";
    this.changed(conversation);
    return this.getRequired(conversationId);
  }

  proposeCompletion(conversationId: string, proposal: Omit<WorkflowNodeCompletionProposal, "proposedAt">): WorkflowNodeConversation {
    const conversation = this.mutableRequired(conversationId);
    conversation.completionProposal = { ...structuredClone(proposal), proposedAt: this.deps.now() };
    conversation.status = "completion_proposed";
    this.changed(conversation);
    return this.getRequired(conversationId);
  }

  confirmCompletion(conversationId: string): WorkflowNodeCompletionProposal {
    const conversation = this.mutableRequired(conversationId);
    if (conversation.status !== "completion_proposed" || !conversation.completionProposal) {
      throw new Error("Workflow node conversation has no completion proposal to confirm.");
    }
    conversation.status = "closed";
    this.changed(conversation);
    return structuredClone(conversation.completionProposal);
  }

  async rejectCompletion(conversationId: string, instruction: string): Promise<WorkflowNodeConversation> {
    return this.sendUserMessage(conversationId, instruction);
  }

  async interrupt(conversationId: string): Promise<void> {
    await this.sessionRequired(conversationId).interrupt();
  }

  async stopRun(workflowId: string, runId: string): Promise<void> {
    const conversations = this.listForRun(workflowId, runId).filter((conversation) => conversation.status !== "closed" && conversation.status !== "failed");
    await Promise.allSettled(conversations.map(async (conversation) => {
      const session = this.sessions.get(conversation.conversationId);
      if (session) {
        await Promise.allSettled([session.interrupt(), session.close()]);
        this.sessions.delete(conversation.conversationId);
      }
      const mutable = this.mutableRequired(conversation.conversationId);
      mutable.status = "closed";
      this.appendMessage(mutable, "system", "Workflow run stopped by user.", this.deps.now());
      this.changed(mutable);
    }));
  }

  get(conversationId: string): WorkflowNodeConversation | undefined {
    const conversation = this.conversations.get(conversationId);
    return conversation ? structuredClone(conversation) : undefined;
  }

  listForRun(workflowId: string, runId: string): WorkflowNodeConversation[] {
    return [...this.conversations.values()]
      .filter((conversation) => conversation.workflowId === workflowId && conversation.runId === runId)
      .map((conversation) => structuredClone(conversation));
  }

  list(): WorkflowNodeConversation[] {
    return [...this.conversations.values()].map((conversation) => structuredClone(conversation));
  }

  private recordEvent(conversationId: string, event: AgentEvent): void {
    const conversation = this.mutableRequired(conversationId);
    const content = "content" in event && typeof event.content === "string" ? event.content : "";
    if (content && event.type !== "delta" && event.type !== "completed") {
      this.appendMessage(conversation, event.type === "tool_call" || event.type === "tool_result" ? "tool" : "assistant", content, this.deps.now(), event.type);
    }
    if (event.type === "delta") {
      const last = conversation.messages.at(-1);
      if (last?.role === "assistant" && last.eventType === "delta") {
        last.content += event.content;
        last.at = this.deps.now();
        conversation.lastActivityAt = last.at;
      } else {
        this.appendMessage(conversation, "assistant", event.content, this.deps.now(), event.type);
      }
    }
    if (event.type === "completed") {
      const finalContent = (event.content || (conversation.messages.at(-1)?.eventType === "delta" ? conversation.messages.at(-1)?.content : "") || "").trim();
      this.deps.onCompleted?.(structuredClone(conversation), finalContent);
    }
    if (event.type === "error") conversation.status = "failed";
    this.syncRuntimeConversation(conversationId);
    this.changed(conversation);
  }

  private syncRuntimeConversation(conversationId: string): void {
    const conversation = this.mutableRequired(conversationId);
    const runtimeConversation = this.sessionRequired(conversationId).runtimeConversation();
    if (runtimeConversation) conversation.runtimeConversation = structuredClone(runtimeConversation);
  }

  private appendMessage(conversation: WorkflowNodeConversation, role: WorkflowNodeMessage["role"], content: string, at: number, eventType?: AgentEvent["type"]): void {
    conversation.messages.push({ id: `${conversation.conversationId}:${conversation.messages.length + 1}`, role, content, at, ...(eventType ? { eventType } : {}) });
    conversation.updatedAt = at;
    conversation.lastActivityAt = at;
  }

  private changed(conversation: WorkflowNodeConversation): void {
    conversation.updatedAt = this.deps.now();
    this.deps.onChanged?.(structuredClone(conversation));
  }

  private mutableRequired(conversationId: string): WorkflowNodeConversation {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error(`Workflow node conversation ${conversationId} was not found.`);
    return conversation;
  }

  private getRequired(conversationId: string): WorkflowNodeConversation {
    return structuredClone(this.mutableRequired(conversationId));
  }

  private sessionRequired(conversationId: string): WorkflowNodeInteractiveSession {
    const session = this.sessions.get(conversationId);
    if (!session) throw new Error(`Workflow node conversation session ${conversationId} was not found.`);
    return session;
  }
}
