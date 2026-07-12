export interface WorkflowAgentPromptInput {
  objective: string;
}

export const WORKFLOW_FOLLOW_UP_QUESTIONS = [
  "Which inputs are already available, and which must be requested from the user? Recommended answer: mark every node that may need any user-provided information as interactive.",
  "Which steps can be deterministic scripts instead of agents? Recommended answer: use script nodes for parsing, formatting, validation, file conversion, and other deterministic transformations.",
  "Where must execution pause for approval or confirmation? Recommended answer: add explicit interactive or gate-style nodes before irreversible or user-visible decisions.",
];

export const WORKFLOW_TOTAL_QUESTION_COUNT = WORKFLOW_FOLLOW_UP_QUESTIONS.length + 1;

export const WORKFLOW_V2_DEFINITION_TEMPLATE = `{
  "workflowId": "<temporary-id>",
  "graphVersion": 1,
  "objective": "<original user objective>",
  "nodes": [
    {
      "id": "collect-input",
      "kind": "agent",
      "title": "Collect required user input",
      "execModel": "llm",
      "role": "executor",
      "executionMode": "interactive",
      "executionModeRationale": "This node requires information from the user.",
      "executionModeConfidence": 1,
      "modelProfile": "balanced",
      "prompt": "Collect all required information from the user before completing.",
      "outputFields": [{ "key": "result", "required": true }]
    }
  ],
  "edges": []
}`;

function workflowTaskSnippet(objective: string): string {
  const text = objective.trim().replace(/\s+/g, " ");
  if (!text) return "this task";
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

export function buildWorkflowAgentPrompt({ objective }: WorkflowAgentPromptInput): string {
  const task = objective.trim() || "The user has not provided a task yet.";
  return [
    "You are the Workflow V2 Manager inside Multi Agent Chat.",
    "",
    "Interview the user and create an executable WorkflowV2Definition through the MCP workflow_create tool (it may be displayed by Codex as mcp__multi_agent_chat__workflow_create).",
    "",
    "Conversation protocol:",
    "- Ask exactly one question at a time and include a recommended answer.",
    "- Stop asking when the available information is sufficient to build the workflow.",
    "- Do not send a definition as ordinary prose. Call workflow_create (or mcp__multi_agent_chat__workflow_create when namespaced) with title, objective, and definition.",
    "- If workflow_create is unavailable or fails, explain the failure; do not emit an alternative code payload.",
    "",
    "Workflow V2 rules:",
    "- The definition must be a valid DAG using WorkflowV2Definition nodes and edges.",
    "- Do not create start/end placeholder nodes. Only create executable LLM or script nodes.",
    "- Use executionMode one-shot only when the node needs no user input and all required inputs are already available from workflow context or upstream outputs.",
    "- If a node needs any user input, clarification, choice, confirmation, iteration, or supplemental information, it must use executionMode interactive.",
    "- Never classify an input-dependent node as one-shot because the expected question seems simple.",
    "- Use execModel script for deterministic parsing, formatting, validation, conversion, filtering, merging, or file operations that do not need agent reasoning.",
    "- Each LLM node requires prompt and outputFields; each script node requires script, sandboxMode, and outputFields.",
    "- Edges express all topology dependencies. Downstream nodes must not run before every upstream dependency completes.",
    "- Node prompts must state required inputs, completion criteria, output fields, and downstream handoff expectations.",
    "",
    "workflow_create payload:",
    "- title: concise workflow title",
    "- objective: original user objective",
    "- definition: complete WorkflowV2Definition",
    "",
    "WorkflowV2Definition example:",
    WORKFLOW_V2_DEFINITION_TEMPLATE,
    "",
    "User task:",
    task,
  ].join("\n");
}

export function firstWorkflowQuestionForObjective(objective: string): string {
  return `For ${workflowTaskSnippet(objective)}, which information must be supplied by the user during execution? Recommended answer: list every missing input and make each node that collects it interactive.`;
}

export function nextWorkflowQuestion(answerCount: number): string {
  return WORKFLOW_FOLLOW_UP_QUESTIONS[Math.min(Math.max(0, answerCount - 1), WORKFLOW_FOLLOW_UP_QUESTIONS.length - 1)]!;
}
