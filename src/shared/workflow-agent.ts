export interface WorkflowAgentPromptInput {
  objective: string;
}

export const WORKFLOW_FOLLOW_UP_QUESTIONS = [
  "这个任务更适合串行、并行，还是先分工再汇总？推荐答案：先分工并行收集信息，再串行汇总成最终产物；如果任务很小，可以直接串行。",
  "执行前必须确认哪些边界？推荐答案：确认目标路径、只读或可改代码、验收标准、禁止改动范围，以及是否允许运行测试/构建/搜索命令。",
  "哪些节点需要人来检查后再继续？推荐答案：先在生成 workflow 图后人工确认一次，执行完成后再人工确认最终文档或改动。",
];

export const WORKFLOW_TOTAL_QUESTION_COUNT = WORKFLOW_FOLLOW_UP_QUESTIONS.length + 1;
export const WORKFLOW_GRAPH_CODE_TEMPLATE = `workflowGraph.upsert({
  title: "<short workflow title>",
  objective: "<original user objective>",
  nodes: [
    {
      id: "start",
      kind: "start",
      title: "Start",
      prompt: ""
    },
    {
      id: "plan",
      kind: "agent",
      title: "<agent role name>",
      prompt: "<specific instructions for this agent node>",
      agentId: "<codex|claude>",
      channelId: "<channel id or empty>",
      modelId: "<model id or default>"
    },
    {
      id: "end",
      kind: "end",
      title: "Done",
      prompt: ""
    }
  ],
  edges: [
    {
      id: "start->plan",
      fromNodeId: "start",
      toNodeId: "plan"
    },
    {
      id: "plan->end",
      fromNodeId: "plan",
      toNodeId: "end"
    }
  ]
});`;

function workflowTaskSnippet(objective: string): string {
  const text = objective.trim().replace(/\s+/g, " ");
  if (!text) return "这个任务";
  return text.length > 72 ? `${text.slice(0, 72)}...` : text;
}

export function buildWorkflowAgentPrompt({ objective }: WorkflowAgentPromptInput): string {
  const task = objective.trim() || "用户还没有提供任务";
  return [
    "You are a Loop Engineering Agent inside Multi Agent Chat.",
    "",
    "Your job is to interview the user and turn their task into an executable multi-agent workflow DAG.",
    "",
    "Conversation protocol:",
    "- Ask exactly one question at a time.",
    "- Every question must include a recommended answer the user can accept or edit.",
    "- Do not use canned generic questions when the task gives useful context.",
    "- Prefer questions that clarify execution scope, boundaries, sequencing, verification, and human approval gates.",
    "- After enough information is collected, produce a workflowGraph.upsert payload instead of prose.",
    "",
    "Workflow graph contract:",
    "- The graph must be a DAG.",
    "- It must have exactly one start node.",
    "- It must contain executable agent nodes with title, prompt, agent/channel/model placeholders, and directed edges.",
    "- It should be easy for the user to edit agent assignments before execution.",
    "- Agent node prompts must explain what each node writes to shared memory and what user-facing output documents, if any, should be saved under the runtime Workflow storage plan output directory.",
    "- Do not hard-code arbitrary output paths in node prompts. Refer to the runtime Workflow storage plan provided during execution.",
    "",
    "Output code template:",
    "```ts",
    WORKFLOW_GRAPH_CODE_TEMPLATE,
    "```",
    "",
    "Output rules:",
    "- Fill the template with concrete node ids, titles, prompts, and edges.",
    "- Use start and end terminal nodes, and at least one executable agent node.",
    "- Include a planning node that decides the shared memory strategy and final output document structure when the task produces documents.",
    "- Do not include prose around the template when producing the final graph.",
    "- Do not include cycles or unreachable nodes.",
    "- Node positions are optional: omit them to use the automatic canvas layout. Only add a per-node position {x,y} (x left-to-right, y top-to-bottom) when the user explicitly asks you to arrange or move nodes on the canvas.",
    "",
    "User task:",
    task,
  ].join("\n");
}

export function firstWorkflowQuestionForObjective(objective: string): string {
  const snippet = workflowTaskSnippet(objective);
  if (/review|代码|code|repo|仓库|PR|diff/i.test(objective)) {
    return `围绕「${snippet}」，这次代码检查最需要先锁定什么范围？推荐答案：先确认 review 范围、学习文档受众和文档结构，再梳理项目结构、入口、关键模块、数据流和测试方式。`;
  }
  if (/实现|开发|新增|改造|修复|bug|feature|页面|UI|交互/i.test(objective)) {
    return `围绕「${snippet}」，你希望 agent 先交付什么结果？推荐答案：先生成可编辑 workflow 图，确认后再执行代码修改和测试。`;
  }
  if (/分析|调研|排查|定位|原因|为什么|方案/i.test(objective)) {
    return `围绕「${snippet}」，这次分析最重要的判断标准是什么？推荐答案：先给根因/结论，再给证据、风险清单、验证步骤和下一步执行计划。`;
  }
  return `围绕「${snippet}」，你希望这个 workflow 先确认哪类目标和边界？推荐答案：先确认输出形态、允许执行的操作、验收标准和需要人工确认的节点。`;
}

export function nextWorkflowQuestion(answerCount: number): string {
  return WORKFLOW_FOLLOW_UP_QUESTIONS[Math.min(Math.max(0, answerCount - 1), WORKFLOW_FOLLOW_UP_QUESTIONS.length - 1)]!;
}
