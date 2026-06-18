import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "./Markdown";
import {
  App,
  appShellClass,
  ChatHistoryPanel,
  chatConfigLocked,
  ChatControls,
  ConfigPage,
  RuntimePage,
  SettingsPage,
  SkillsPage,
  applySkillTemplate,
  applyProviderPresetToChannel,
  applyProviderPresetToConfiguredAgent,
  applyProviderModelIdToAgentConfig,
  rememberProviderKeyFromChannel,
  shouldAutoQueryBalance,
  onlineSkillTreeUrl,
  parseSkillMarkdown,
  missingAppCapabilityMessage,
  shouldSendComposerKey,
  SlashCommandSuggestions,
  slashCommandSuggestionsFor,
  resolveConfiguredAgentChannel,
  reorderTeamMembers,
  taskDetailIdFor,
  TaskPage,
  TaskStatusFilter,
  TeamPage,
  WorkflowHistoryPanel,
  WorkflowPage,
  extractWorkflowOutputDocuments,
  extractWorkflowOutputDocumentsForPlan,
  parseWorkflowJudgeResult,
  workflowArtifactSummary,
  workflowAssistantDisplayContent,
  workflowContextDocumentFromArtifacts,
  workflowFinalReviewPrompt,
  workflowDraftShouldPersist,
  workflowJudgePrompt,
  workflowNodeRunPrompt,
  workflowRunProgressSummary,
  workflowStoragePlanDocument,
  workflowTaskLiveDetail,
} from "./App";
import { DEFAULT_MODEL_ID } from "../../shared/models";
import { generatedConfigChannels, normalizeConfigChannelsForStorage, selectConfigChannelsForDisplay } from "../../shared/config-channels";
import { AGENT_PROVIDER_PRESETS } from "../../shared/provider-presets";
import { SKILL_TEMPLATES } from "../../shared/skill-templates";
import { firstWorkflowQuestionForObjective } from "../../shared/workflow-agent";
import type {
  AgentChannel,
  AgentRuntime,
  AgentTeam,
  AppSnapshot,
  ChatSession,
  CodexPluginCatalogItem,
  ConfiguredAgent,
  InstalledSkillResult,
  TaskRun,
  TeamRun,
  WorkflowGraph,
} from "../../shared/types";

const runtimes: AgentRuntime[] = [
  {
    id: "codex",
    label: "Codex",
    command: "codex",
    version: "0.136.0",
    available: true,
  },
  {
    id: "claude",
    label: "Claude Code",
    command: "claude",
    version: null,
    available: false,
    error: "missing",
  },
];

const channels: AgentChannel[] = [
  {
    id: "codex-openai",
    agentId: "codex",
    label: "Codex OpenAI",
    plugins: [
      { id: "documents@openai-primary-runtime", enabled: true },
      { id: "browser-use@openai-bundled", enabled: false },
    ],
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "gpt-5.5", label: "GPT-5.5" },
    ],
  },
  {
    id: "claude-code",
    agentId: "claude",
    label: "Claude Code",
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "sonnet", label: "Sonnet" },
    ],
  },
];

const configuredAgents: ConfiguredAgent[] = [
  {
    id: "repo-reviewer",
    name: "Repo Reviewer",
    description: "Reviews repositories and writes learning docs.",
    runtimeAgentId: "codex",
    channelId: "codex-openai",
    modelId: "gpt-5.5",
    prompt: "Review the repo and produce a concise report.",
    tags: ["review", "docs"],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
];

const codexPluginCatalog: CodexPluginCatalogItem[] = [
  {
    id: "documents@openai-primary-runtime",
    name: "documents",
    marketplace: "openai-primary-runtime",
    installed: true,
    enabled: true,
    version: "1.0.0",
  },
  {
    id: "github@openai-curated",
    name: "github",
    marketplace: "openai-curated",
    installed: false,
    enabled: false,
  },
];

const taskRuns: TaskRun[] = [
  {
    id: "task-1",
    title: "Inspect repo",
    prompt: "Inspect repo",
    agentId: "codex",
    channelId: "codex-openai",
    modelId: "gpt-5.5",
    workDir: "/tmp/workspace",
    status: "completed",
    progress: "in_review",
    running: false,
    sessionId: undefined,
    messages: [],
    pendingAssistantMessageId: undefined,
    lastError: undefined,
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
];

const appSnapshot: AppSnapshot = {
  detectedAt: 1710000000000,
  activeChatId: "chat-1",
  activeTaskId: undefined,
  activeTeamId: undefined,
  activeTeamRunId: undefined,
  workDir: "/tmp/workspace",
  runtimes,
  channels,
  configuredAgents,
  chats: [
    {
      id: "chat-1",
      title: "Repo chat",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: "gpt-5.5",
      messages: [],
      running: false,
      sessionId: undefined,
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    },
  ],
  tasks: [],
  teams: [],
  teamRuns: [],
  workflowStore: {
    activeWorkflowId: undefined,
    workflows: [],
    runs: [],
  },
  workflowDraft: undefined,
};

const teams: AgentTeam[] = [
  {
    id: "team-1",
    name: "Review Team",
    mode: "pipeline",
    sharedContext: "Focus on repo risks and public dependencies.",
    members: [
      {
        id: "member-1",
        roleName: "Planner",
        prompt: "Create a review plan first.",
        agentId: "codex",
        channelId: "codex-openai",
        modelId: "gpt-5.5",
        canvasPosition: { x: 120, y: 90 },
      },
      {
        id: "member-2",
        roleName: "Checker",
        prompt: "Verify the previous artifact.",
        agentId: "claude",
        channelId: "claude-code",
        modelId: DEFAULT_MODEL_ID,
      },
    ],
    workflow: {
      mode: "pipeline",
      phases: [
        { id: "phase:start", title: "Start", nodeIds: ["start"] },
        { id: "phase:member-1", title: "Planner", nodeIds: ["member:member-1"] },
        { id: "phase:member-2", title: "Checker", nodeIds: ["member:member-2"] },
        { id: "phase:done", title: "Done", nodeIds: ["done"] },
      ],
      nodes: [
        { id: "start", kind: "start", label: "Start", status: "idle" },
        {
          id: "member:member-1",
          kind: "agent",
          label: "Planner",
          status: "idle",
          teamMemberId: "member-1",
          description: "Create a review plan first.",
          canvasPosition: { x: 120, y: 90 },
        },
        {
          id: "member:member-2",
          kind: "agent",
          label: "Checker",
          status: "idle",
          teamMemberId: "member-2",
          description: "Verify the previous artifact.",
        },
        { id: "done", kind: "done", label: "Done", status: "idle" },
      ],
      edges: [
        { id: "start->member:member-1", fromNodeId: "start", toNodeId: "member:member-1" },
        { id: "member:member-1->member:member-2", fromNodeId: "member:member-1", toNodeId: "member:member-2" },
        { id: "member:member-2->done", fromNodeId: "member:member-2", toNodeId: "done" },
      ],
    },
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
];

const teamRuns: TeamRun[] = [
  {
    id: "team-run-1",
    teamId: "team-1",
    teamName: "Review Team",
    title: "Review example-service",
    prompt: "Review cd ../example-service",
    target: { kind: "workspace", label: "Workspace", value: "/tmp/workspace" },
    mode: "pipeline",
    status: "running",
    currentStepIndex: 1,
    workDir: "/tmp/workspace",
    sharedContextSnapshot: "Focus on repo risks and public dependencies.",
    workflow: {
      mode: "pipeline",
      phases: [
        { id: "phase:start", title: "Start", nodeIds: ["start"] },
        { id: "phase:member-1", title: "Planner", nodeIds: ["member:member-1"] },
        { id: "phase:member-2", title: "Checker", nodeIds: ["member:member-2"] },
        { id: "phase:done", title: "Done", nodeIds: ["done"] },
      ],
      nodes: [
        { id: "start", kind: "start", label: "Start", status: "completed" },
        {
          id: "member:member-1",
          kind: "agent",
          label: "Planner",
          status: "completed",
          teamMemberId: "member-1",
          stepId: "step-1",
          description: "Create a review plan first.",
          canvasPosition: { x: 120, y: 90 },
        },
        {
          id: "member:member-2",
          kind: "agent",
          label: "Checker",
          status: "running",
          teamMemberId: "member-2",
          stepId: "step-2",
          description: "Verify the previous artifact.",
        },
        { id: "done", kind: "done", label: "Done", status: "queued" },
      ],
      edges: [
        { id: "start->member:member-1", fromNodeId: "start", toNodeId: "member:member-1" },
        { id: "member:member-1->member:member-2", fromNodeId: "member:member-1", toNodeId: "member:member-2" },
        { id: "member:member-2->done", fromNodeId: "member:member-2", toNodeId: "done" },
      ],
    },
    steps: [
      {
        id: "step-1",
        teamMemberId: "member-1",
        roleName: "Planner",
        prompt: "Create a review plan first.",
        agentId: "codex",
        channelId: "codex-openai",
        modelId: "gpt-5.5",
        status: "completed",
        taskId: "task-1",
        artifact: "artifact-1",
        lastError: undefined,
        startedAt: 1710000000000,
        completedAt: 1710000001000,
      },
      {
        id: "step-2",
        teamMemberId: "member-2",
        roleName: "Checker",
        prompt: "Verify the previous artifact.",
        agentId: "claude",
        channelId: "claude-code",
        modelId: DEFAULT_MODEL_ID,
        status: "running",
        taskId: "task-2",
        artifact: undefined,
        lastError: undefined,
        startedAt: 1710000002000,
        completedAt: undefined,
      },
    ],
    lastError: undefined,
    createdAt: 1710000000000,
    updatedAt: 1710000002000,
  },
];

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function cssSelectorsForDeclaration(declaration: RegExp): string[] {
  return Array.from(styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)).flatMap((match) => {
    const selector = match[1] ?? "";
    const body = match[2] ?? "";
    if (!declaration.test(body)) return [];
    return selector
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  });
}

describe("ChatControls", () => {
  test("uses a full-width shell when tasks are shown", () => {
    expect(appShellClass("tasks")).toBe("shell tasks-shell");
    expect(appShellClass("skills")).toBe("shell skills-shell");
    expect(appShellClass("runtimes")).toBe("shell runtimes-shell");
    expect(appShellClass("chat")).toBe("shell");
  });

  test("does not use persisted task selection to open the detail panel", () => {
    expect(taskDetailIdFor("tasks", undefined, "task-1")).toBeUndefined();
    expect(taskDetailIdFor("tasks", "task-1", "task-2")).toBe("task-1");
    expect(taskDetailIdFor("chat", "task-1", "task-1")).toBeUndefined();
  });

  test("uses fixed workflow topology layouts instead of a pannable canvas", () => {
    expect(styles).toContain("grid-template-columns: minmax(172px, 214px) minmax(640px, 1fr) minmax(300px, 360px)");
    expect(styles).toContain(".team-resource-pane {");
    expect(styles).toContain(".workflow-studio-pane {");
    expect(styles).toContain(".run-inspector-pane {");
    expect(styles).toContain("@media (max-width: 1320px)");
    expect(styles).toContain(".workflow-topology-board {\n  min-height: 340px");
    expect(styles).toContain(".workflow-topology-stage {\n  min-width: 0");
    expect(styles).toContain(".workflow-pipeline-row {\n  width: max-content");
    expect(styles).toContain(".workflow-studio-toolbar {");
    expect(styles).toContain(".workflow-task-composer {\n  position: sticky");
    expect(styles).toContain(".workflow-builder-toolbar {\n  position: relative;\n  z-index: 2;\n  pointer-events: auto");
    expect(styles).toContain(".workflow-node-card {\n  width: 176px;\n  min-height: 82px");
    expect(styles).toContain(".workflow-node-card.is-drop-target");
    expect(styles).toContain("grid-template-columns: repeat(auto-fit, minmax(176px, 1fr))");
    expect(styles).toContain(".workflow-edge {\n  display: block;\n  width: 36px");
    expect(styles).not.toContain(".workflow-builder-board.is-panning");
    expect(styles).not.toContain(".workflow-free-canvas-stage");
  });

  test("keeps the workflow history sidebar visible", () => {
    expect(appShellClass("workflow")).toBe("shell workflow-shell");
    expect(cssSelectorsForDeclaration(/display:\s*none\s*;?/)).not.toContain(".shell.workflow-shell .resource-sidebar");
    expect(cssSelectorsForDeclaration(/grid-template-columns:\s*(?:62|74|76)px\s+minmax\(0,\s*1fr\)\s*;?/)).not.toContain(".shell.workflow-shell");
  });

  test("keeps sidebar history actions outside Electron drag regions", () => {
    expect(styles).toContain(".resource-sidebar button {\n  -webkit-app-region: no-drag");
    expect(styles).toContain(".agent-context-menu {\n  -webkit-app-region: no-drag");
  });

  test("explains when a newly added Electron API requires app restart", () => {
    expect(missingAppCapabilityMessage("Delete chat")).toContain("Delete chat");
    expect(missingAppCapabilityMessage("Delete chat")).toContain("restart");
  });

  test("uses compact segmented controls for workflow mode", () => {
    expect(styles).toContain(".workflow-mode-row {\n  display: inline-flex");
    expect(styles).toContain(".workflow-mode-toggle {\n  display: inline-flex");
    expect(styles).toContain("min-height: 28px");
    expect(styles).toContain(".workflow-mode-toggle span {\n  display: none");
  });

  test("lets workflow run activity wrap inside progress cards", () => {
    expect(styles).toContain(".workflow-run-progress-item > small {\n  display: -webkit-box");
    expect(styles).toContain("-webkit-line-clamp: 3");
    expect(styles).toContain("white-space: normal");
  });

  test("sends composer text with Enter and keeps Shift Enter for new lines", () => {
    expect(shouldSendComposerKey({ key: "Enter", shiftKey: false, metaKey: false, ctrlKey: false })).toBe(true);
    expect(shouldSendComposerKey({ key: "Enter", shiftKey: true, metaKey: false, ctrlKey: false })).toBe(false);
    expect(shouldSendComposerKey({ key: "Enter", shiftKey: false, metaKey: true, ctrlKey: false })).toBe(true);
    expect(shouldSendComposerKey({ key: "Enter", shiftKey: false, metaKey: false, ctrlKey: true })).toBe(true);
    expect(shouldSendComposerKey({ key: "a", shiftKey: false, metaKey: false, ctrlKey: false })).toBe(false);
  });

  test("filters slash command suggestions like the CLI prompt", () => {
    expect(slashCommandSuggestionsFor("/", "codex").map((item) => item.command)).toEqual(["/status", "/models", "/plugins", "/help"]);
    expect(slashCommandSuggestionsFor("/", "claude").map((item) => item.command)).toEqual(["/help"]);
    expect(slashCommandSuggestionsFor("/pl", "codex").map((item) => item.command)).toEqual(["/plugins"]);
    expect(slashCommandSuggestionsFor("/pl", "claude")).toEqual([]);
    expect(slashCommandSuggestionsFor("/status ", "codex")).toEqual([]);
    expect(slashCommandSuggestionsFor("hello", "codex")).toEqual([]);
  });

  test("renders slash command suggestions", () => {
    const html = renderToStaticMarkup(
      <SlashCommandSuggestions
        suggestions={slashCommandSuggestionsFor("/", "codex")}
        activeIndex={0}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("slash-command-menu");
    expect(html).toContain("/status");
    expect(html).toContain("/plugins");
    expect(html).toContain("Read Codex app-server config");
  });

  test("does not lock chat config for local slash command history", () => {
    expect(
      chatConfigLocked({
        id: "chat-1",
        title: "New Codex chat",
        agentId: "codex",
        channelId: "codex-openai",
        modelId: DEFAULT_MODEL_ID,
        sessionId: undefined,
        running: false,
        messages: [
          { id: "message-1", role: "user", content: "/status", timestamp: 1710000000000, local: true } as any,
          { id: "message-2", role: "assistant", content: "Status", timestamp: 1710000000001, local: true } as any,
        ],
        pendingAssistantMessageId: undefined,
        lastError: undefined,
        createdAt: 1710000000000,
        updatedAt: 1710000000001,
      }),
    ).toBe(false);
  });

  test("renders agent and workdir as compact composer controls", () => {
    const html = renderToStaticMarkup(
      <ChatControls
        agentId="codex"
        channelId="codex-openai"
        modelId={DEFAULT_MODEL_ID}
        channels={channels}
        locked={false}
        running={false}
        workDir="/tmp/workspace"
        runtimes={runtimes}
        onSelectAgent={async () => undefined}
        onSelectChannel={async () => undefined}
        onSelectModel={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("composer-controls");
    expect(html).toContain("aria-label=\"Agent\"");
    expect(html).toContain("aria-label=\"Channel\"");
    expect(html).toContain("aria-label=\"Model\"");
    expect(html).toContain("Codex");
    expect(html).toContain("Claude Code");
    expect(html).toContain("Codex OpenAI");
    expect(html).toContain("GPT-5.5");
    expect(html).toContain("aria-label=\"Choose work directory\"");
    expect(html).toContain("/tmp/workspace");
  });

  test("locks agent and model selects after a chat starts", () => {
    const html = renderToStaticMarkup(
      <ChatControls
        agentId="codex"
        channelId="codex-openai"
        modelId={DEFAULT_MODEL_ID}
        channels={channels}
        locked={true}
        running={false}
        workDir="/tmp/workspace"
        runtimes={runtimes}
        onSelectAgent={async () => undefined}
        onSelectChannel={async () => undefined}
        onSelectModel={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("<select class=\"composer-select\" aria-label=\"Agent\" disabled=\"\"");
    expect(html).toContain("<select class=\"composer-select\" aria-label=\"Channel\" disabled=\"\"");
    expect(html).toContain("<select class=\"composer-select\" aria-label=\"Model\" disabled=\"\"");
  });
});

describe("Markdown", () => {
  test("renders headings and GitHub links as markdown instead of plain text", () => {
    const html = renderToStaticMarkup(<Markdown text={"# Source\n\nSee [TradingAgents](https://github.com/TauricResearch/TradingAgents)."} />);

    expect(html).toContain("<h1>Source</h1>");
    expect(html).toContain('href="https://github.com/TauricResearch/TradingAgents"');
    expect(html).toContain(">TradingAgents</a>");
    expect(html).not.toContain("[TradingAgents]");
  });
});

describe("Sidebar history panels", () => {
  const workflowPanelGraph: WorkflowGraph = {
    title: "Review payment release",
    objective: "Review payment release",
    nodes: [
      { id: "start", kind: "start", title: "Start", prompt: "" },
      { id: "plan", kind: "agent", title: "Plan", prompt: "Plan release.", agentId: "codex", channelId: "codex-openai", modelId: DEFAULT_MODEL_ID },
      { id: "review", kind: "agent", title: "Review", prompt: "Review release.", agentId: "claude", channelId: "claude-code", modelId: DEFAULT_MODEL_ID },
      { id: "end", kind: "end", title: "Done", prompt: "" },
    ],
    edges: [
      { id: "start->plan", fromNodeId: "start", toNodeId: "plan" },
      { id: "plan->review", fromNodeId: "plan", toNodeId: "review" },
      { id: "review->end", fromNodeId: "review", toNodeId: "end" },
    ],
  };

  test("renders a chat context menu for deleting the selected session", () => {
    const chat: ChatSession = {
      id: "chat-1",
      title: "Payment review",
      agentId: "codex",
      channelId: "codex-openai",
      modelId: DEFAULT_MODEL_ID,
      sessionId: "019e9143-2451-7612-a62d-e65389574d7d",
      running: false,
      messages: [],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };

    const html = renderToStaticMarkup(
      <ChatHistoryPanel
        chats={[chat]}
        activeChatId="chat-1"
        contextMenu={{ chatId: "chat-1", x: 24, y: 32 }}
        onCreateChat={() => undefined}
        onSelectChat={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteChat={() => undefined}
      />,
    );

    expect(html).toContain("Chats");
    expect(html).toContain("Payment review");
    expect(html).toContain("chat-context-menu");
    expect(html).toContain("Delete chat");
    expect(html).toContain("Delete session and data");
  });

  test("renders workflow context menu actions and rename dialog", () => {
    const html = renderToStaticMarkup(
      <WorkflowHistoryPanel
        workflows={[
          {
            workflowId: "wf_review",
            title: "Review payment release",
            objective: "Review payment release",
            status: "draft",
            revision: 2,
            graph: workflowPanelGraph,
            graphReady: true,
            messages: [],
            reply: "",
            error: undefined,
            runProgress: [],
            runContextDocument: "",
            contextDocument: "",
            runIds: [],
            agentId: "codex",
            channelId: "codex-openai",
            modelId: "gpt-5.5",
            agentSessionId: undefined,
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
        ]}
        activeWorkflowId="wf_review"
        contextMenu={{ workflowId: "wf_review", x: 18, y: 42 }}
        renameDraft={{ workflowId: "wf_review", title: "Review payment release" }}
        onSelectWorkflow={() => undefined}
        onNewWorkflow={() => undefined}
        onOpenContextMenu={() => undefined}
        onStartRename={() => undefined}
        onRenameDraftChange={() => undefined}
        onConfirmRename={() => undefined}
        onCancelRename={() => undefined}
        onDeleteWorkflow={() => undefined}
      />,
    );

    expect(html).toContain("workflow-context-menu");
    expect(html).toContain("Rename workflow");
    expect(html).toContain("Delete workflow");
    expect(html).toContain("workflow-rename-overlay");
    expect(html).toContain("aria-label=\"Rename workflow\"");
    expect(html).toContain("value=\"Review payment release\"");
  });
});

describe("ConfigPage", () => {
  test("renders agent profile controls without runtime provider settings", () => {
    const html = renderToStaticMarkup(
      <ConfigPage
        channels={channels}
        configuredAgents={configuredAgents}
        selectedConfiguredAgentId="repo-reviewer"
        status=""
        onSave={async () => undefined}
        onAddConfiguredAgent={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onUpdateConfiguredAgent={() => undefined}
      />,
    );

    expect(html).toContain("config-form");
    expect(html).not.toContain("aria-label=\"Import Codex profiles\"");
    expect(html).not.toContain(">Import Codex<");
    expect(html).not.toContain(">Generate<");
    expect(html).not.toContain("Imported profiles");
    expect(html).not.toContain("Generated Profiles");
    expect(html).not.toContain("aria-label=\"Agent model id\"");
    expect(html).not.toContain("Plugins");
    expect(html).not.toContain("documents@openai-primary-runtime");
    expect(html).not.toContain("browser-use@openai-bundled");
    expect(html).not.toContain("aria-label=\"Codex plugin catalog\"");
    expect(html).not.toContain("github@openai-curated");
    expect(html).not.toContain("Loaded 2 plugins");
    expect(html).not.toContain("CLI");
    expect(html).not.toContain("Provider");
    expect(html).not.toContain("aria-label=\"Provider API key\"");
    expect(html).not.toContain("Advanced JSON");
    expect(html).not.toContain("config-editor-panel");
    expect(html).toContain("Agent Assembly");
    expect(html).not.toContain("aria-label=\"Language\"");
    expect(html).not.toContain("统一中文");
    expect(html).not.toContain("Agent templates");
    expect(html).not.toContain("<h3>Channels</h3>");
    expect(html).not.toContain("代码审查 Agent");
    expect(html).not.toContain(">Import template<");
    expect(html).not.toContain(">导入模板<");
    expect(html).toContain("Repo Reviewer");
    expect(html).toContain("aria-label=\"Agent execution config\"");
    expect(html).toContain("Codex OpenAI · Codex");
    expect(html).toContain("aria-label=\"Agent prompt\"");
    expect(html).not.toContain(">Test<");
    expect(html).toContain("configured-agent-editor-actions");
    expect(html).toContain(">Save<");
  });

  test("renders runtime provider settings separately from agent profile settings", () => {
    const savedKeyChannels: AgentChannel[] = [
      {
        ...channels[0]!,
        providerName: "DeepSeek",
        modelProvider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        httpHeaders: { Authorization: "Bearer saved-key" },
      },
      channels[1]!,
    ];

    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={savedKeyChannels}
        selectedChannelId="codex-openai"
        providerKeys={{}}
        codexPluginCatalog={codexPluginCatalog}
        pluginCatalogStatus="Loaded 2 plugins"
        agentTestResults={{}}
        testingAgentId={undefined}
        agentTestTick={0}
        onUpdateChannel={() => undefined}
        onAddModel={() => undefined}
        onUpdateModel={() => undefined}
        onRemoveModel={() => undefined}
        onSave={async () => undefined}
        onLoadCodexPluginCatalog={async () => undefined}
        onSelectChannel={() => undefined}
        onAddConfig={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteConfig={() => undefined}
        onTestChannel={async () => undefined}
        onUpdateProviderKey={() => undefined}
      />,
    );

    expect(html).toContain("runtime-page");
    expect(html).toContain("Config");
    expect(html).toContain("CLI");
    expect(html).toContain("Provider");
    expect(html).toContain("aria-label=\"Provider API key\"");
    expect(html).toContain("value=\"saved-key\"");
    expect(html).toContain("aria-label=\"Agent model id\"");
    expect(html).toContain("Plugins");
    expect(html).toContain("documents@openai-primary-runtime");
    expect(html).toContain("browser-use@openai-bundled");
    expect(html).toContain("aria-label=\"Codex plugin catalog\"");
    expect(html).toContain("github@openai-curated");
    expect(html).toContain("Loaded 2 plugins");
    expect(html).not.toContain("aria-label=\"Agent prompt\"");
  });

  test("shows the stored channel key ahead of stale provider key cache", () => {
    const savedKeyChannels: AgentChannel[] = [
      {
        ...channels[0]!,
        providerName: "DeepSeek",
        modelProvider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        httpHeaders: { Authorization: "Bearer saved-key" },
      },
    ];

    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={savedKeyChannels}
        selectedChannelId="codex-openai"
        providerKeys={{ deepseek: "stale-key" }}
        codexPluginCatalog={codexPluginCatalog}
        pluginCatalogStatus=""
        agentTestResults={{}}
        testingAgentId={undefined}
        agentTestTick={0}
        onUpdateChannel={() => undefined}
        onAddModel={() => undefined}
        onUpdateModel={() => undefined}
        onRemoveModel={() => undefined}
        onSave={async () => undefined}
        onLoadCodexPluginCatalog={async () => undefined}
        onSelectChannel={() => undefined}
        onAddConfig={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteConfig={() => undefined}
        onTestChannel={async () => undefined}
        onUpdateProviderKey={() => undefined}
      />,
    );

    expect(html).toContain("value=\"saved-key\"");
    expect(html).not.toContain("value=\"stale-key\"");
  });

  test("renders all stored execution configs without legacy cleanup controls", () => {
    const noisyChannels: AgentChannel[] = [
      channels[0]!,
      {
        ...channels[0]!,
        id: "codex-deepseek",
        label: "Codex DeepSeek",
        providerName: "DeepSeek",
        modelProvider: "deepseek",
        baseUrl: "https://api.deepseek.com",
      },
      {
        ...channels[0]!,
        id: "repo-reviewer-channel",
        label: "Repo Reviewer Runtime",
      },
      {
        ...channels[0]!,
        id: "payment-writer-channel",
        label: "Payment Writer Runtime",
      },
      channels[1]!,
      {
        ...channels[0]!,
        id: "codex-multi-agent-repo-reviewer-default",
        label: "Codex multi-agent-repo-reviewer-default",
      },
      {
        id: "api-openai",
        agentId: "api",
        label: "OpenAI API",
        providerName: "OpenAI",
        modelProvider: "openai-api",
        models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
      },
    ];

    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={noisyChannels}
        selectedChannelId="repo-reviewer-channel"
        providerKeys={{}}
        codexPluginCatalog={[]}
        pluginCatalogStatus=""
        agentTestResults={{}}
        testingAgentId={undefined}
        agentTestTick={0}
        contextMenu={{ channelId: "codex-deepseek", x: 16, y: 24 }}
        onUpdateChannel={() => undefined}
        onAddModel={() => undefined}
        onUpdateModel={() => undefined}
        onRemoveModel={() => undefined}
        onSave={async () => undefined}
        onLoadCodexPluginCatalog={async () => undefined}
        onSelectChannel={() => undefined}
        onAddConfig={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteConfig={() => undefined}
        onTestChannel={async () => undefined}
        onUpdateProviderKey={() => undefined}
      />,
    );

    expect(html.match(/runtime-channel-row/g)).toHaveLength(7);
    expect(html).toContain("Configs");
    expect(html).toContain("OpenAI API");
    expect(html).toContain("Codex DeepSeek");
    expect(html).toContain("DeepSeek");
    expect(html).toContain("Repo Reviewer Runtime");
    expect(html).toContain("Payment Writer Runtime");
    expect(html).toContain("Codex multi-agent-repo-reviewer-default");
    expect(html).toContain("Add config");
    expect(html).toContain("runtime-config-context-menu");
    expect(html).toContain("Delete config");
    expect(html).not.toContain("Add Codex");
    expect(html).not.toContain("Add Claude");
    expect(html).not.toContain("Add API");
    expect(html).not.toContain("runtime-channel-actions");
    expect(html).not.toContain("legacy");
    expect(html).not.toContain("automatic internal channels");
    expect(html).not.toContain("not additional runtimes");
    expect(html).not.toContain("Organize history");
    expect(html).not.toContain("generated");
    expect(html).not.toContain("aria-label=\"Delete runtime channel\"");
    expect(html).not.toContain("aria-label=\"Agent prompt\"");
  });

  test("keeps config cleanup focused on generated channel records", () => {
    const noisyChannels: AgentChannel[] = [
      channels[0]!,
      {
        ...channels[0]!,
        id: "repo-reviewer-channel",
        label: "Repo Reviewer Runtime",
      },
      {
        ...channels[0]!,
        id: "codex-multi-agent-repo-reviewer-default",
        label: "Codex multi-agent-repo-reviewer-default",
      },
      channels[1]!,
      {
        id: "deepseek-api-agent-channel",
        agentId: "api",
        label: "DeepSeek API Agent",
        providerName: "DeepSeek",
        modelProvider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        httpHeaders: { Authorization: "Bearer test-token" },
        models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
      },
      {
        id: "api-openai",
        agentId: "api",
        label: "OpenAI API",
        providerName: "OpenAI",
        modelProvider: "openai-api",
        models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
      },
    ];

    expect(selectConfigChannelsForDisplay(noisyChannels).map((channel) => channel.id)).toEqual([
      "codex-openai",
      "repo-reviewer-channel",
      "codex-multi-agent-repo-reviewer-default",
      "claude-code",
      "deepseek-api-agent-channel",
      "api-openai",
    ]);
    expect(generatedConfigChannels(noisyChannels).map((channel) => channel.id)).toEqual(["repo-reviewer-channel", "codex-multi-agent-repo-reviewer-default"]);
    expect(normalizeConfigChannelsForStorage(noisyChannels).map((channel) => channel.id)).toEqual([
      "codex-openai",
      "claude-code",
      "deepseek-api-agent-channel",
      "api-openai",
    ]);
  });

  test("offers ccswitch-style Claude Code provider presets", () => {
    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={channels}
        selectedChannelId="claude-code"
        providerKeys={{}}
        codexPluginCatalog={[]}
        pluginCatalogStatus=""
        agentTestResults={{}}
        testingAgentId={undefined}
        agentTestTick={0}
        onUpdateChannel={() => undefined}
        onAddModel={() => undefined}
        onUpdateModel={() => undefined}
        onRemoveModel={() => undefined}
        onSave={async () => undefined}
        onLoadCodexPluginCatalog={async () => undefined}
        onSelectChannel={() => undefined}
        onAddConfig={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteConfig={() => undefined}
        onTestChannel={async () => undefined}
        onUpdateProviderKey={() => undefined}
      />,
    );

    expect(html).toContain("Claude Code");
    expect(html).toContain(">DeepSeek<");
    expect(html).toContain(">GLM<");
    expect(html).toContain(">Kimi<");
    expect(html).toContain(">SiliconFlow<");
    expect(html).toContain(">Bailian<");
    expect(html).toContain(">Volcengine<");
    expect(html).toContain(">Custom<");
  });

  test("collapses successful execution config tests into a green deployment summary", () => {
    const html = renderToStaticMarkup(
      <RuntimePage
        language="zh"
        channels={channels}
        selectedChannelId="codex-openai"
        providerKeys={{}}
        codexPluginCatalog={codexPluginCatalog}
        pluginCatalogStatus=""
        agentTestResults={{
          "codex-openai": {
            agentId: "codex-openai",
            state: "passed",
            phase: "Completed",
            message: "OK",
            startedAt: 1710000000000,
            testedAt: 1710000001000,
            elapsedMs: 1000,
            runtimeAgentId: "codex",
            channelId: "codex-openai",
            modelId: "gpt-5.5",
            providerLabel: "OpenAI",
            output: "verbose passing output should stay collapsed",
            transcript: [
              {
                id: "event-1",
                type: "assistant",
                content: "verbose transcript should stay collapsed",
                timestamp: 1710000000500,
              },
            ],
          },
        }}
        testingAgentId={undefined}
        agentTestTick={0}
        onUpdateChannel={() => undefined}
        onAddModel={() => undefined}
        onUpdateModel={() => undefined}
        onRemoveModel={() => undefined}
        onSave={async () => undefined}
        onLoadCodexPluginCatalog={async () => undefined}
        onSelectChannel={() => undefined}
        onAddConfig={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteConfig={() => undefined}
        onTestChannel={async () => undefined}
        onUpdateProviderKey={() => undefined}
      />,
    );

    expect(html).toContain("agent-test-result passed collapsed");
    expect(html).toContain("配置可用");
    expect(html).toContain("OpenAI · GPT-5.5");
    expect(html).not.toContain("verbose passing output should stay collapsed");
    expect(html).not.toContain("verbose transcript should stay collapsed");
    expect(html).not.toContain("agent-test-transcript");
  });

  test("renders provider balance status on the execution config page", () => {
    const html = renderToStaticMarkup(
      <RuntimePage
        language="zh"
        channels={channels}
        selectedChannelId="codex-openai"
        providerKeys={{}}
        codexPluginCatalog={[]}
        pluginCatalogStatus=""
        agentTestResults={{}}
        testingAgentId={undefined}
        agentTestTick={0}
        balanceResults={{
          "codex-openai": {
            channelId: "codex-openai",
            providerName: "DeepSeek",
            supported: true,
            status: "success",
            message: "Balance query succeeded.",
            queriedAt: 1710000000000,
            items: [{ label: "CNY", remaining: 12.34, unit: "CNY", isValid: true }],
          },
        }}
        balanceLoadingChannelId={undefined}
        onUpdateChannel={() => undefined}
        onAddModel={() => undefined}
        onUpdateModel={() => undefined}
        onRemoveModel={() => undefined}
        onSave={async () => undefined}
        onLoadCodexPluginCatalog={async () => undefined}
        onSelectChannel={() => undefined}
        onAddConfig={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteConfig={() => undefined}
        onTestChannel={async () => undefined}
        onQueryBalance={async () => undefined}
        onUpdateProviderKey={() => undefined}
      />,
    );

    expect(html).toContain("余额");
    expect(html).toContain("DeepSeek");
    expect(html).toContain("12.34 CNY");
    expect(html).toContain("刷新余额");
  });

  test("auto-queries balance when opening a saved execution config without cached balance", () => {
    expect(
      shouldAutoQueryBalance({
        activeFeature: "runtimes",
        selectedChannelId: "deepseek-api",
        configDirty: false,
        balanceLoadingChannelId: undefined,
        balanceResults: {},
        alreadyRequested: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoQueryBalance({
        activeFeature: "runtimes",
        selectedChannelId: "deepseek-api",
        configDirty: true,
        balanceLoadingChannelId: undefined,
        balanceResults: {},
        alreadyRequested: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoQueryBalance({
        activeFeature: "chat",
        selectedChannelId: "deepseek-api",
        configDirty: false,
        balanceLoadingChannelId: undefined,
        balanceResults: {},
        alreadyRequested: false,
      }),
    ).toBe(false);
  });

  test("keeps skill templates named from SKILL.md frontmatter without separate localized fields", () => {
    const codeReviewer = SKILL_TEMPLATES.find((template) => template.id === "refactor-review-knowledge");

    expect(codeReviewer).toMatchObject({
      name: "refactor-review-knowledge",
      description: expect.stringContaining("conducting thorough code reviews"),
      prompt: expect.stringContaining("name: refactor-review-knowledge"),
    });
    expect(SKILL_TEMPLATES.some((template) => "nameZh" in template || "descriptionZh" in template || "promptZh" in template)).toBe(false);
  });

  test("includes the requested built-in skill templates first", () => {
    expect(SKILL_TEMPLATES.map((template) => template.id)).toEqual([
      "brainstorming",
      "systematic-debugging",
      "personal-finance-planning",
      "resume-optimization",
      "paper-writing",
      "refactor-review-knowledge",
      "code-review-and-quality",
    ]);
    expect(SKILL_TEMPLATES.map((template) => template.name)).toEqual(
      expect.arrayContaining([
        "brainstorming",
        "systematic-debugging",
        "personal-finance-planning",
        "resume-optimization",
        "paper-writing",
        "refactor-review-knowledge",
        "code-review-and-quality",
      ]),
    );
  });

  test("stores the requested built-in skill templates as raw SKILL.md content", () => {
    const expectedSkillContent = [
      ["brainstorming", ["---", "name: brainstorming", "# Brainstorming Ideas Into Designs", "<HARD-GATE>", "Offer the visual companion just-in-time"]],
      ["systematic-debugging", ["---", "name: systematic-debugging", "# Systematic Debugging", "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST"]],
      ["personal-finance-planning", ["---", "name: personal-finance-planning", "# 理财规划", "## 边界"]],
      ["resume-optimization", ["---", "name: resume-optimization", "argument-hint:", "allowed-tools:", "## ATS Optimization"]],
      ["paper-writing", ["---", "name: paper-writing", "# 论文写作", "## 学术诚信"]],
      ["refactor-review-knowledge", ["---", "name: refactor-review-knowledge", "required_tools:", "user-invocable: false", "DO NOT fix issues"]],
      ["code-review-and-quality", ["---", "name: code-review-and-quality", "# Code Review and Quality", "## The Five-Axis Review", "## Change Sizing"]],
    ] as const;

    for (const [templateId, expectedSections] of expectedSkillContent) {
      const template = SKILL_TEMPLATES.find((item) => item.id === templateId);

      expect(template?.prompt.length).toBeGreaterThan(500);
      expect(template?.prompt.startsWith("---\n")).toBe(true);
      for (const section of expectedSections) {
        expect(template?.prompt).toContain(section);
      }
    }
    expect(SKILL_TEMPLATES.every((template) => template.sourceLabel && template.sourcePath)).toBe(true);
    expect(SKILL_TEMPLATES.every((template) => template.sourceUrl?.startsWith("https://github.com/"))).toBe(true);
    expect(SKILL_TEMPLATES.every((template) => template.sourcePath?.startsWith("src/shared/bundled-skills/"))).toBe(true);
    expect(SKILL_TEMPLATES.every((template) => template.sourcePath?.endsWith("/SKILL.md"))).toBe(true);
    expect(SKILL_TEMPLATES.find((template) => template.id === "brainstorming")?.prompt).not.toContain("## 工作方式");
    expect(SKILL_TEMPLATES.find((template) => template.id === "personal-finance-planning")?.sourceUrl).toBe(
      "https://github.com/TauricResearch/TradingAgents",
    );
  });

  test("ships bundled Chinese reading views without replacing original skill prompts", () => {
    for (const template of SKILL_TEMPLATES) {
      expect(template.translationZh?.startsWith("---\n")).toBe(true);
      expect(template.translationZh?.length).toBeGreaterThan(300);
    }

    const brainstorming = SKILL_TEMPLATES.find((template) => template.id === "brainstorming");
    const resume = SKILL_TEMPLATES.find((template) => template.id === "resume-optimization");

    expect(brainstorming?.prompt).toContain("# Brainstorming Ideas Into Designs");
    expect(brainstorming?.translationZh).toContain("# 将头脑风暴转化为设计");
    expect(resume?.prompt).toContain("# Resume Optimization");
    expect(resume?.translationZh).toContain("# 简历优化");
    expect(SKILL_TEMPLATES.find((template) => template.id === "systematic-debugging")?.translationZh).toContain("# 系统化调试");
    expect(SKILL_TEMPLATES.find((template) => template.id === "code-review-and-quality")?.translationZh).toContain("# 代码评审与质量");
  });

  test("renders language controls without a duplicate settings sidebar", () => {
    const html = renderToStaticMarkup(<SettingsPage language="zh" onLanguageChange={() => undefined} />);

    expect(html).toContain("settings-page");
    expect(html).not.toContain("settings-sidebar");
    expect(html).toContain("语言");
    expect(html).toContain("aria-label=\"Language\"");
    expect(html).toContain("统一中文");
    expect(html).toContain("English");
  });

  test("applies skill templates without changing runtime or provider selection", () => {
    const template = SKILL_TEMPLATES.find((item) => item.id === "personal-finance-planning")!;
    const agent = configuredAgents[0]!;

    const nextAgent = applySkillTemplate(agent, template);

    expect(nextAgent.name).toBe("personal-finance-planning");
    expect(nextAgent.description).toBe("整理财务目标、预算、风险偏好和长期规划。");
    expect(nextAgent.prompt).toContain("name: personal-finance-planning");
    expect(nextAgent.tags).toEqual(template.tags);
    expect(nextAgent.runtimeAgentId).toBe(agent.runtimeAgentId);
    expect(nextAgent.channelId).toBe(agent.channelId);
    expect(nextAgent.modelId).toBe(agent.modelId);
  });

  test("applies API provider presets to both the channel and configured agent", () => {
    const apiPreset = {
      id: "api-deepseek",
      label: "DeepSeek API",
      runtimeAgentId: "api" as const,
      providerName: "DeepSeek",
      modelProvider: "deepseek-api",
      baseUrl: "https://api.deepseek.com",
      usesApiKey: true,
      models: [
        { id: DEFAULT_MODEL_ID, label: "Default" },
        { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      ],
    };
    const staleAgent: ConfiguredAgent = {
      ...configuredAgents[0]!,
      channelId: "missing-channel",
      runtimeAgentId: "api",
      modelId: "old-model",
    };
    const fallbackChannel = resolveConfiguredAgentChannel(staleAgent, channels);

    expect(fallbackChannel?.id).toBe("codex-openai");
    expect(fallbackChannel).toBeDefined();

    const nextChannel = applyProviderPresetToChannel(fallbackChannel!, apiPreset, "test-token");
    const nextAgent = applyProviderPresetToConfiguredAgent(staleAgent, nextChannel, apiPreset);

    expect(nextChannel.agentId).toBe("api");
    expect(nextChannel.providerName).toBe("DeepSeek");
    expect(nextChannel.modelProvider).toBe("deepseek-api");
    expect(nextChannel.baseUrl).toBe("https://api.deepseek.com");
    expect(nextChannel.httpHeaders?.Authorization).toBe("Bearer test-token");
    expect(nextAgent.channelId).toBe("codex-openai");
    expect(nextAgent.runtimeAgentId).toBe("api");
    expect(nextAgent.modelId).toBe(DEFAULT_MODEL_ID);
  });

  test("offers Doubao Seed Lite in the Volcengine API and Codex presets", () => {
    const apiPreset = AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "api-volcengine");
    const codexPreset = AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "codex-volcengine");
    const volcengineModels = [...(apiPreset?.models ?? []), ...(codexPreset?.models ?? [])];

    expect(apiPreset?.baseUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(codexPreset?.baseUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(apiPreset?.models).toContainEqual({ id: "doubao-seed-1-6-lite-251015", label: "Doubao Seed 1.6 Lite" });
    expect(apiPreset?.models).toContainEqual({ id: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" });
    expect(codexPreset?.models).toContainEqual({ id: "doubao-seed-1-6-lite-251015", label: "Doubao Seed 1.6 Lite" });
    expect(codexPreset?.models).toContainEqual({ id: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" });
    expect(volcengineModels.every((model) => !model.id.startsWith("ep-m-"))).toBe(true);
  });

  test("lets Volcengine agents use a user-configured endpoint model id", () => {
    const preset = AGENT_PROVIDER_PRESETS.find((item) => item.id === "api-volcengine")!;
    const channel = applyProviderPresetToChannel(channels[0]!, preset, "test-token");
    const agent = applyProviderPresetToConfiguredAgent(configuredAgents[0]!, channel, preset);

    const result = applyProviderModelIdToAgentConfig(agent, channel, "ep-m-user-owned-endpoint");

    expect(result.agent.modelId).toBe("ep-m-user-owned-endpoint");
    expect(result.channel.models).toContainEqual({
      id: "ep-m-user-owned-endpoint",
      label: "ep-m-user-owned-endpoint",
    });
  });

  test("keeps a user-configured Volcengine endpoint when credentials are updated", () => {
    const preset = AGENT_PROVIDER_PRESETS.find((item) => item.id === "api-volcengine")!;
    const initialChannel = applyProviderPresetToChannel(channels[0]!, preset, "first-token");
    const { channel } = applyProviderModelIdToAgentConfig(configuredAgents[0]!, initialChannel, "ep-m-user-owned-endpoint");

    const updatedChannel = applyProviderPresetToChannel(channel, preset, "second-token");

    expect(updatedChannel.httpHeaders?.Authorization).toBe("Bearer second-token");
    expect(updatedChannel.models).toContainEqual({
      id: "ep-m-user-owned-endpoint",
      label: "ep-m-user-owned-endpoint",
    });
  });

  test("remembers the current provider key before switching presets", () => {
    const deepseekPreset = AGENT_PROVIDER_PRESETS.find((item) => item.id === "deepseek")!;
    const glmPreset = AGENT_PROVIDER_PRESETS.find((item) => item.id === "glm")!;
    const deepseekChannel = applyProviderPresetToChannel(channels[0]!, deepseekPreset, "dpsk-key");

    const cachedKeys = rememberProviderKeyFromChannel({}, deepseekPreset, deepseekChannel);
    const glmChannel = applyProviderPresetToChannel(deepseekChannel, glmPreset, cachedKeys[glmPreset.id] ?? "");
    const restoredDeepseekChannel = applyProviderPresetToChannel(glmChannel, deepseekPreset, cachedKeys[deepseekPreset.id] ?? "");

    expect(cachedKeys.deepseek).toBe("dpsk-key");
    expect(glmChannel.httpHeaders?.Authorization).toBeUndefined();
    expect(restoredDeepseekChannel.httpHeaders?.Authorization).toBe("Bearer dpsk-key");
  });
});

describe("SkillsPage", () => {
  test("renders the built-in skill library as a sourced reader", () => {
    const installResult: InstalledSkillResult = {
      templateId: "brainstorming",
      target: "codex",
      path: "/Users/example/.codex/skills/brainstorming/SKILL.md",
      sourcePath: "/Users/example/Library/Application Support/Multi Agent Chat/bundled-skills/brainstorming/SKILL.md",
      existed: false,
    };
    const html = renderToStaticMarkup(<SkillsPage language="zh" templates={SKILL_TEMPLATES} onInstallSkill={async () => installResult} />);

    expect(html).toContain("skills-page");
    expect(html).toContain("skills-browser");
    expect(html).toContain("skill-list-panel");
    expect(html).toContain("skill-detail-panel");
    expect(html).toContain("技能库");
    expect(html).toContain("内置技能");
    expect(html).toContain("搜索网上 Skills");
    expect(html).toContain("OpenAI Skills");
    expect(html).toContain("Anthropic Skills");
    expect(html).toContain("brainstorming");
    expect(html).toContain("personal-finance-planning");
    expect(html).toContain("resume-optimization");
    expect(html).toContain("paper-writing");
    expect(html).toContain("refactor-review-knowledge");
    expect(html).toContain("conducting thorough code reviews");
    expect(html).toContain("review");
    expect(html).toContain("出处");
    expect(html).toContain("skill-source-pills");
    expect(html).toContain("GitHub");
    expect(html).toContain("bundled original skill");
    expect(html).toContain("src/shared/bundled-skills/brainstorming/SKILL.md");
    expect(html).not.toContain("src/shared/bundled-skill-prompts.ts");
    expect(html).toContain("https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md");
    expect(html).toContain("SKILL.md");
    expect(html).toContain("本地安装");
    expect(html).toContain("查看中文");
    expect(html).not.toContain("翻译成中文");
    expect(html).not.toContain("安装到 Codex");
    expect(html).not.toContain("安装到 Claude");
    expect(html).toContain("md-body");
    expect(html).toContain("<h1>Brainstorming Ideas Into Designs</h1>");
    expect(html).toContain("name: brainstorming");
    expect(html).not.toContain("<pre class=\"skill-detail-body\"");
    expect(html).not.toContain("用此技能创建 Agent");
    expect(html).not.toContain("skills-grid");
    expect(html).not.toContain("头脑风暴 Agent");
    expect(html).not.toContain("代码审查 Agent");
  });

  test("builds online skill source URLs and parses SKILL.md frontmatter", () => {
    expect(onlineSkillTreeUrl({ id: "openai", label: "OpenAI Skills", owner: "openai", repo: "skills", branch: "main" })).toBe(
      "https://api.github.com/repos/openai/skills/git/trees/main?recursive=1",
    );

    expect(
      parseSkillMarkdown(
        [
          "---",
          "name: code-review",
          "description: Review code changes and identify defects.",
          "metadata:",
          "  short-description: Code review",
          "---",
          "",
          "# Code Review",
          "Use this workflow when reviewing a pull request.",
        ].join("\n"),
        "skills/code-review/SKILL.md",
      ),
    ).toMatchObject({
      name: "code-review",
      description: "Review code changes and identify defects.",
      prompt: expect.stringContaining("name: code-review"),
      tags: ["code-review"],
      path: "skills/code-review/SKILL.md",
    });
  });
});

describe("TaskPage", () => {
  test("keeps the task board full-width and opens detail as an overlay page", () => {
    expect(styles).toContain("grid-template-columns: repeat(5, minmax(min(100%, 220px), 1fr))");
    expect(styles).toContain(".task-detail-overlay");
    expect(styles).toContain(".task-detail-page");
    expect(styles).not.toContain(".task-board-shell.has-detail");
    expect(styles).not.toContain("grid-template-columns: minmax(0, 1fr) minmax(28%, 38%)");
    expect(styles).not.toContain("grid-template-columns: minmax(0, 1fr) minmax(320px, 360px)");
    expect(styles).not.toContain("grid-template-columns: repeat(5, minmax(180px, 1fr))");
  });

  test("renders task status progress filter with counts", () => {
    const baseTask = taskRuns[0]!;
    const html = renderToStaticMarkup(
      <TaskStatusFilter
        tasks={[
          baseTask,
          { ...baseTask, id: "task-2", status: "running", progress: "in_review" },
          { ...baseTask, id: "task-3", status: "completed", progress: "done" },
        ]}
        value="all"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("aria-label=\"Task progress\"");
    expect(html).toContain("All");
    expect(html).toContain("Review");
    expect(html).toContain("Done");
    expect(html).toContain(">2<");
  });

  test("renders a draggable kanban task board with an inline creation card", () => {
    const html = renderToStaticMarkup(
      <TaskPage
        prompt="Review this project"
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        tasks={taskRuns}
        activeTaskId="task-1"
        onPromptChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
        onRunTask={async () => undefined}
        onRerunTask={async () => undefined}
        onSelectTask={async () => undefined}
        onCloseTaskDetail={() => undefined}
        onStopTask={async () => undefined}
        onDeleteTask={async () => undefined}
        onUpdateTaskProgress={() => undefined}
      />,
    );

    expect(html).toContain("tasks-page");
    expect(html).toContain("task-surface-card");
    expect(html).toContain("New task");
    expect(html).toContain("task-inline-create-card");
    expect(html).toContain("task-create-chipbar");
    expect(html).toContain("task-board-shell");
    expect(html).toContain("task-kanban-board");
    expect(html).toContain("aria-label=\"Task board\"");
    expect(html).toContain("task-kanban-column");
    expect(html).toContain("data-progress=\"in_review\"");
    expect(html).toContain("task-kanban-card");
    expect(html).toContain("draggable=\"true\"");
    expect(html).toContain("data-task-id=\"task-1\"");
    expect(html).toContain("task-detail-overlay");
    expect(html).toContain("task-detail-page");
    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("title=\"Close task detail\"");
    expect(html).toContain("Task detail");
    expect(html).toContain("task-status-chip");
    expect(html).toContain("task-detail-status-row");
    expect(html).toContain("Execution timeline");
    expect(html).toContain("task-log-stream");
    expect(html).toContain("aria-label=\"Task progress\"");
    expect(html).toContain("Review");
    expect(html).toContain("aria-label=\"Task prompt\"");
    expect(html).toContain("aria-label=\"Agent\"");
    expect(html).toContain("aria-label=\"Channel\"");
    expect(html).toContain("aria-label=\"Model\"");
    expect(html).toContain("Run Agent");
    expect(html).toContain("Inspect repo");
    expect(html).toContain("/tmp/workspace");
    expect(html).toContain("title=\"Delete task\"");
    expect(html).toContain("task-run-timeline");
    expect(html).not.toContain("task-detail-workspace");
    expect(html).not.toContain("task-side-detail");
    expect(html).not.toContain("has-detail");
    expect(html).not.toContain("task-create-strip");
  });

  test("does not show task detail until a task card is selected", () => {
    const html = renderToStaticMarkup(
      <TaskPage
        prompt="Review this project"
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        tasks={taskRuns}
        activeTaskId={undefined}
        onPromptChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
        onRunTask={async () => undefined}
        onRerunTask={async () => undefined}
        onSelectTask={async () => undefined}
        onCloseTaskDetail={() => undefined}
        onStopTask={async () => undefined}
        onDeleteTask={async () => undefined}
        onUpdateTaskProgress={() => undefined}
      />,
    );

    expect(html).toContain("task-kanban-card");
    expect(html).toContain("Inspect repo");
    expect(html).not.toContain("task-detail-overlay");
    expect(html).not.toContain("task-side-detail");
    expect(html).not.toContain("Task detail");
    expect(html).not.toContain("Full prompt");
    expect(html).not.toContain("Execution timeline");
  });
});

describe("App chrome", () => {
  test("uses the rail footer for settings instead of clearing all history", () => {
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
        multiAgentChat: {
          getSnapshot: async () => appSnapshot,
          onSnapshot: () => () => undefined,
        },
      },
    });

    try {
      const html = renderToStaticMarkup(<App />);

      expect(html).toContain("aria-label=\"打开设置\"");
      expect(html).toContain("data-tip=\"设置\"");
      expect(html).toContain("<span>配置</span>");
      expect(html).not.toContain("清除全部历史");
      expect(html).not.toContain("danger");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});

describe("TeamPage", () => {
  test("swaps team members by dragging one member onto another", () => {
    expect(reorderTeamMembers(teams[0]!.members, "member-1", "member-2").map((member) => member.id)).toEqual(["member-2", "member-1"]);
    expect(reorderTeamMembers(teams[0]!.members, "member-2", "member-1").map((member) => member.id)).toEqual(["member-2", "member-1"]);
    expect(reorderTeamMembers(teams[0]!.members, "member-1", undefined).map((member) => member.id)).toEqual(["member-2", "member-1"]);
    expect(reorderTeamMembers(teams[0]!.members, "missing", "member-1")).toBe(teams[0]!.members);
    expect(reorderTeamMembers(teams[0]!.members, "member-1", "member-1")).toBe(teams[0]!.members);
  });

  test("renders teams, shared context, ordered members, and run artifacts", () => {
    const html = renderToStaticMarkup(
      <TeamPage
        teams={teams}
        teamRuns={teamRuns}
        activeTeamId="team-1"
        activeTeamRunId="team-run-1"
        prompt="Review another repo"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("agent-teams-page");
    expect(html).toContain("teams-workspace is-workflow-ide");
    expect(html).toContain("team-resource-pane");
    expect(html).toContain("workflow-studio-pane");
    expect(html).toContain("run-inspector-pane");
    expect(html).toContain("Run Inspector");
    expect(html).toContain("Agent Workflow");
    expect(html).toContain("Review Team");
    expect(html).toContain("aria-label=\"Team name in sidebar\"");
    expect(html).not.toContain("aria-label=\"Team name\"");
    expect(html).not.toContain("workflow-target-section");
    expect(html).not.toContain("Target type");
    expect(html).not.toContain("aria-label=\"Workflow target kind\"");
    expect(html).not.toContain("aria-label=\"Workflow target value\"");
    expect(html).toContain("Pipeline");
    expect(html).toContain("Parallel");
    expect(html).toContain("Supervisor");
    expect(html).toContain("workflow-builder-title");
    expect(html).toContain("workflow-studio-toolbar");
    expect(html).toContain("workflow-topology-board");
    expect(html).toContain("aria-label=\"Workflow topology\"");
    expect(html).toContain("workflow-topology-stage");
    expect(html).not.toContain("data-pan-canvas=\"true\"");
    expect(html).not.toContain("aria-label=\"Open workflow editor\"");
    expect(html).not.toContain("workflow-editor-overlay");
    expect(html).not.toContain("workflow-free-node");
    expect(html).toContain("workflow-builder-toolbar");
    expect(html).toContain("workflow-canvas-pipeline");
    expect(html).toContain("workflow-terminal");
    expect(html).toContain("Start");
    expect(html).toContain("Done");
    expect(html).toContain("workflow-edge");
    expect(html).toContain("workflow-node-card");
    expect(html).toContain("data-workflow-node-status=\"completed\"");
    expect(html).toContain("data-workflow-node-status=\"running\"");
    expect(html).toContain("workflow-node-card is-completed");
    expect(html).toContain("workflow-node-card is-running");
    expect(html).toContain("Draft workflow");
    expect(html).toContain("aria-label=\"Draft workflow\"");
    expect(html).toContain("type=\"button\"");
    expect(html).toContain("Shared Context");
    expect(html).toContain("Focus on repo risks and public dependencies.");
    expect(html).toContain("Planner");
    expect(html).toContain("Checker");
    expect(html).toContain("Create a review plan first.");
    expect(html).toContain("Verify the previous artifact.");
    expect(html).toContain("title=\"Click to edit member\"");
    expect(html).not.toContain("Double-click to edit member");
    expect(html).toContain("draggable=\"true\"");
    expect(html).toContain("data-member-id=\"member-1\"");
    expect(html).toContain("data-member-id=\"member-2\"");
    expect(html).not.toContain("aria-label=\"Member 1 prompt\"");
    expect(html).not.toContain("aria-label=\"Member 1 reusable agent\"");
    expect(html).not.toContain("Recent Codex chat");
    expect(html).not.toContain("Recent Claude task");
    expect(html).toContain("Run Workflow");
    expect(html).toContain("Review cd ../example-service");
    expect(html).toContain("Shared Context Snapshot");
    expect(html).toContain("Workflow Trace");
    expect(html).toContain("workflow-trace-list");
    expect(html).toContain("Planner completed");
    expect(html).toContain("Checker running");
    expect(html).toContain("artifact-1");
    expect(html).toContain("team-run-step");
    expect(html).toContain("aria-label=\"Team prompt\"");
    expect(html).toContain("aria-label=\"Choose work directory\"");
    expect(html.indexOf("workflow-builder-shell")).toBeLessThan(html.indexOf("Shared Context"));
    expect(html.indexOf("Shared Context")).toBeLessThan(html.indexOf("workflow-task-composer"));
  });

  test("does not render a separate free-canvas workflow editor", () => {
    const html = renderToStaticMarkup(
      <TeamPage
        teams={teams}
        teamRuns={teamRuns}
        activeTeamId="team-1"
        activeTeamRunId="team-run-1"
        prompt="Review another repo"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("workflow-topology-board");
    expect(html).not.toContain("workflow-editor-overlay");
    expect(html).not.toContain("aria-label=\"Workflow editor\"");
    expect(html).not.toContain("workflow-builder-board-expanded");
    expect(html).not.toContain("workflow-free-canvas-stage");
    expect(html).not.toContain("workflow-free-node");
  });

  test("renders a parallel workflow canvas with worker lanes and a join node", () => {
    const parallelTeams: AgentTeam[] = [{ ...teams[0]!, mode: "parallel" }];
    const html = renderToStaticMarkup(
      <TeamPage
        teams={parallelTeams}
        teamRuns={[]}
        activeTeamId="team-1"
        activeTeamRunId={undefined}
        prompt="Review another repo"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("workflow-canvas-parallel");
    expect(html).toContain("workflow-parallel-workers");
    expect(html).toContain("workflow-join-node");
    expect(html).toContain("Join");
    expect(html).toContain("Planner");
    expect(html).toContain("Checker");
  });

  test("renders a supervisor workflow canvas with lead, worker, and synthesis regions", () => {
    const supervisorTeams: AgentTeam[] = [{ ...teams[0]!, mode: "supervisor" }];
    const html = renderToStaticMarkup(
      <TeamPage
        teams={supervisorTeams}
        teamRuns={[]}
        activeTeamId="team-1"
        activeTeamRunId={undefined}
        prompt="Review another repo"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("workflow-canvas-supervisor");
    expect(html).toContain("workflow-supervisor-lead");
    expect(html).toContain("workflow-supervisor-workers");
    expect(html).toContain("workflow-supervisor-synthesis");
    expect(html).toContain("Lead");
    expect(html).toContain("Workers");
    expect(html).toContain("Synthesis");
  });

  test("renders member edit controls only for the member being edited", () => {
    const html = renderToStaticMarkup(
      <TeamPage
        teams={teams}
        teamRuns={teamRuns}
        activeTeamId="team-1"
        activeTeamRunId="team-run-1"
        defaultEditingMemberId="member-1"
        prompt="Review another repo"
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("team-member-edit-overlay");
    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("aria-label=\"Edit team member\"");
    expect(html).toContain("Edit member");
    expect(html).toContain("team-member-editor-identity");
    expect(html).toContain("team-member-editor-prompt-panel");
    expect(html).toContain("team-member-editor-routing");
    expect(html).toContain("aria-label=\"Member 1 prompt\"");
    expect(html).not.toContain("Reuse agent");
    expect(html).not.toContain("aria-label=\"Member 1 reusable agent\"");
    expect(html).not.toContain("aria-label=\"Member 2 prompt\"");
    expect(html).not.toContain("team-member-card is-editing");
    expect(html).toContain("Done");
  });

  test("renders an empty teams state with a create action", () => {
    const html = renderToStaticMarkup(
      <TeamPage
        teams={[]}
        teamRuns={[]}
        activeTeamId={undefined}
        activeTeamRunId={undefined}
        prompt=""
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
        onRefresh={async () => undefined}
      />,
    );

    expect(html).toContain("No teams yet");
    expect(html).toContain("New team");
  });
});

describe("WorkflowPage", () => {
  const graph: WorkflowGraph = {
    title: "Review payment release",
    objective: "Review payment release",
    nodes: [
      { id: "start", kind: "start", title: "Start", prompt: "" },
      {
        id: "plan",
        kind: "agent",
        title: "Clarify & Plan",
        prompt: "Interrogate the task and produce a plan.",
        agentId: "codex",
        channelId: "codex-openai",
        modelId: "gpt-5.5",
      },
      {
        id: "review",
        kind: "agent",
        title: "Review",
        prompt: "Review the output.",
        agentId: "claude",
        channelId: "claude-code",
        modelId: DEFAULT_MODEL_ID,
      },
      { id: "end", kind: "end", title: "Done", prompt: "" },
    ],
    edges: [
      { id: "start->plan", fromNodeId: "start", toNodeId: "plan" },
      { id: "plan->review", fromNodeId: "plan", toNodeId: "review" },
      { id: "review->end", fromNodeId: "review", toNodeId: "end" },
    ],
  };

  test("builds the first grill question from the submitted workflow task", () => {
    const question = firstWorkflowQuestionForObjective("帮我 review cd../example-service 的代码");

    expect(question).toContain("cd../example-service");
    expect(question).toContain("代码");
    expect(question).not.toContain("最终交付物是什么");
  });

  test("renders only a chat-style task composer before the workflow chat starts", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady={false}
        objective="Review payment release"
        messages={[]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("New workflow");
    expect(html).toContain("Describe a task to start generating a workflow.");
    expect(html).toContain("aria-label=\"Agent\"");
    expect(html).toContain("aria-label=\"Channel\"");
    expect(html).toContain("aria-label=\"Model\"");
    expect(html).toContain("aria-label=\"Workflow task\"");
    expect(html).toContain("Start");
    expect(html).not.toContain("第一个问题：最终交付物是什么？");
    expect(html).not.toContain("Send Answer");
    expect(html).not.toContain("Generate Graph");
    expect(html).not.toContain("workflowGraph.upsert");
    expect(html).not.toContain("aria-label=\"Workflow graph JSON\"");
    expect(html).not.toContain("DAG valid");
    expect(html).not.toContain("Workflow graph board");
    expect(html).not.toContain("Node plan agent");
    expect(html).not.toContain("Run Graph");
    expect(html).not.toContain("Grill first");
    expect(html).not.toContain("Answer one question at a time");
  });

  test("shows the selected saved workflow title before a graph exists", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        title="qjagents Agent 功能速览"
        status="failed"
        graph={graph}
        graphReady={false}
        objective=""
        messages={[]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("qjagents Agent 功能速览");
    expect(html).toContain("failed");
    expect(html).toContain("Describe a task to start generating a workflow.");
    expect(html).not.toContain("<h2>New workflow</h2>");
  });

  test("shows saved final output even when the graph was not restored", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        title="qjagents Agent 功能速览"
        status="failed"
        graph={graph}
        graphReady={false}
        objective=""
        messages={[]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        finalReport="## Final User Report\nqjagents workflow finished."
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("DAG valid");
    expect(html).toContain("Review payment release");
    expect(html).toContain("Main agent summary");
    expect(html).toContain("qjagents workflow finished.");
    expect(html).toContain("Run Graph");
  });

  test("renders workflow output documents from final report paths", () => {
    expect(extractWorkflowOutputDocuments("产物见 docs/learning-highlights.md 和 [summary](reports/summary.md).")).toEqual([
      { path: "docs/learning-highlights.md", title: "learning-highlights.md" },
      { path: "reports/summary.md", title: "summary.md" },
    ]);
    expect(
      extractWorkflowOutputDocumentsForPlan(
        {
          memoryPath: ".multi-agent-chat/workflows/wf_review/memory.md",
          outputDir: ".multi-agent-chat/workflows/wf_review/outputs",
        },
        "证据包含 README.md；最终产物见 .multi-agent-chat/workflows/wf_review/outputs/learning-highlights.md。",
      ),
    ).toEqual([{ path: ".multi-agent-chat/workflows/wf_review/outputs/learning-highlights.md", title: "learning-highlights.md" }]);

    const html = renderToStaticMarkup(
      <WorkflowPage
        workflowId="wf_review"
        title="qjagents Agent 功能速览"
        status="completed"
        graph={graph}
        graphReady
        objective="Review qjagents"
        messages={[]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        finalReport="## Final User Report\n证据包含 README.md；最终产物见 .multi-agent-chat/workflows/wf_review/outputs/learning-highlights.md。"
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("Output documents");
    expect(html).toContain("learning-highlights.md");
    expect(html).toContain(".multi-agent-chat/workflows/wf_review/outputs/learning-highlights.md");
    expect(html).not.toContain("README.md</span>");
  });

  test("renders workflow history beside the workflow workspace", () => {
    const html = renderToStaticMarkup(
      <WorkflowHistoryPanel
        workflows={[
          {
            workflowId: "wf_review",
            title: "Review payment release",
            objective: "Review payment release",
            status: "draft",
            revision: 2,
            graph,
            graphReady: true,
            messages: [],
            reply: "",
            error: undefined,
            runProgress: [],
            runContextDocument: "",
            contextDocument: "",
            runIds: [],
            agentId: "codex",
            channelId: "codex-openai",
            modelId: "gpt-5.5",
            agentSessionId: undefined,
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
          },
          {
            workflowId: "wf_release",
            title: "Release workflow",
            objective: "Prepare release",
            status: "completed",
            revision: 1,
            graph: { ...graph, title: "Release workflow", objective: "Prepare release" },
            graphReady: true,
            messages: [],
            reply: "",
            error: undefined,
            runProgress: [],
            runContextDocument: "",
            contextDocument: "",
            runIds: [],
            agentId: "codex",
            channelId: "codex-openai",
            modelId: "gpt-5.5",
            agentSessionId: undefined,
            createdAt: 1710001000000,
            updatedAt: 1710001000000,
          },
        ]}
        activeWorkflowId="wf_review"
        onSelectWorkflow={() => undefined}
        onNewWorkflow={() => undefined}
      />,
    );

    expect(html).toContain("Workflows");
    expect(html).toContain("New workflow");
    expect(html).toContain("Review payment release");
    expect(html).toContain("Release workflow");
    expect(html).toContain("draft · 4 nodes · rev 2");
    expect(html).toContain("completed · 4 nodes · rev 1");
    expect(html).toContain("workflow-history-card is-active");
  });

  test("keeps the new workflow action visible without workflow history", () => {
    const html = renderToStaticMarkup(
      <WorkflowHistoryPanel workflows={[]} activeWorkflowId={undefined} onSelectWorkflow={() => undefined} onNewWorkflow={() => undefined} />,
    );

    expect(html).toContain("Workflows");
    expect(html).toContain("New workflow");
    expect(html).toContain("No workflows yet");
  });

  test("summarizes generated workflow graph code in the grill transcript", () => {
    const content = workflowAssistantDisplayContent(`Agent is thinking...\`\`\`ts
workflowGraph.upsert({
  title: "Review DAG",
  objective: "Review the repo",
  nodes: [
    { id: "start", kind: "start", title: "Start", prompt: "" },
    { id: "review", kind: "agent", title: "Review Agent", prompt: "Review.", agentId: "codex", channelId: "", modelId: "default" },
    { id: "end", kind: "end", title: "Done", prompt: "" }
  ],
  edges: [
    { id: "start->review", fromNodeId: "start", toNodeId: "review" },
    { id: "review->end", fromNodeId: "review", toNodeId: "end" }
  ]
});
\`\`\``);

    expect(content).toBe("Workflow graph ready: Review DAG");
    expect(content).not.toContain("Agent is thinking");
    expect(content).not.toContain("workflowGraph.upsert");
  });

  test("builds workflow node prompts with upstream artifacts", () => {
    const graph: WorkflowGraph = {
      title: "Review DAG",
      objective: "Review the repo",
      nodes: [
        { id: "start", kind: "start", title: "Start", prompt: "" },
        { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map the repo." },
        { id: "writer", kind: "agent", title: "Writer", prompt: "Write the doc." },
        { id: "end", kind: "end", title: "Done", prompt: "" },
      ],
      edges: [
        { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
        { id: "inventory->writer", fromNodeId: "inventory", toNodeId: "writer" },
        { id: "writer->end", fromNodeId: "writer", toNodeId: "end" },
      ],
    };

    const storagePlan = {
      memoryPath: ".multi-agent-chat/workflows/wf_review/memory.md",
      outputDir: ".multi-agent-chat/workflows/wf_review/outputs",
    };
    const prompt = workflowNodeRunPrompt(
      graph,
      graph.nodes[2]!,
      [{ node: graph.nodes[1]!, artifact: "Inventory artifact" }],
      "## Inventory\nKey context.",
      storagePlan,
    );

    expect(prompt).toContain("Workflow: Review DAG");
    expect(prompt).toContain("Node: Writer (writer)");
    expect(prompt).toContain("Write the doc.");
    expect(prompt).toContain("Use this workflow context document first:");
    expect(prompt).toContain("## Inventory");
    expect(prompt).toContain("Key context.");
    expect(prompt).toContain("## Upstream: Inventory (inventory)");
    expect(prompt).toContain("Inventory artifact");
    expect(prompt).toContain("Work Completion Report");
    expect(prompt).toContain("This report will be appended to the shared Workflow Context document");
    expect(prompt).toContain("Workflow storage plan");
    expect(prompt).toContain(storagePlan.outputDir);
    expect(prompt).toContain("When you finish, include a concise Handoff section.");
  });

  test("builds workflow storage plan instructions for shared memory and outputs", () => {
    const storagePlan = {
      memoryPath: ".multi-agent-chat/workflows/wf_review/memory.md",
      outputDir: ".multi-agent-chat/workflows/wf_review/outputs",
    };

    expect(workflowStoragePlanDocument(storagePlan)).toContain("Shared memory file: .multi-agent-chat/workflows/wf_review/memory.md");
    expect(workflowStoragePlanDocument(storagePlan)).toContain("Output document directory: .multi-agent-chat/workflows/wf_review/outputs");

    const prompt = workflowFinalReviewPrompt(
      graph,
      [{ node: graph.nodes[1]!, artifact: "Wrote .multi-agent-chat/workflows/wf_review/outputs/summary.md" }],
      workflowStoragePlanDocument(storagePlan),
      [],
      storagePlan,
    );

    expect(prompt).toContain("Workflow storage plan");
    expect(prompt).toContain(storagePlan.memoryPath);
    expect(prompt).toContain(storagePlan.outputDir);
    expect(prompt).toContain("Only list output documents that are under the output document directory.");
  });

  test("builds and parses workflow judge prompts for node completion decisions", () => {
    const judgePrompt = workflowJudgePrompt(
      graph,
      graph.nodes.find((node) => node.id === "review")!,
      "## Work Completion Report\nImplemented the requested page.\n\n## Handoff\nNeeds tests.",
      "# Workflow Context\n\n## Clarify & Plan\nBuild the page.",
      1,
      2,
    );

    expect(judgePrompt).toContain("You are the workflow judge");
    expect(judgePrompt).toContain("attempt 1 of 2");
    expect(judgePrompt).toContain("workflowEvaluation.submit");
    expect(judgePrompt).toContain("## Work Completion Report");
    expect(judgePrompt).toContain("# Workflow Context");

    expect(
      parseWorkflowJudgeResult(`
        workflowEvaluation.submit({
          complete: false,
          reason: "The report does not mention verification.",
          retryPrompt: "Run or explain the relevant tests, then update the handoff."
        });
      `),
    ).toEqual({
      complete: false,
      reason: "The report does not mention verification.",
      retryPrompt: "Run or explain the relevant tests, then update the handoff.",
    });
  });

  test("builds a final main agent review prompt from all workflow node outputs", () => {
    const prompt = workflowFinalReviewPrompt(
      graph,
      [
        { node: graph.nodes[1]!, artifact: "## Work Completion Report\nPlanned the review.\n\n## Handoff\nCheck auth." },
        { node: graph.nodes[2]!, artifact: "## Work Completion Report\nReviewed auth.\n\n## Handoff\nNo blocker." },
      ],
      "# Workflow Context\n\n## Clarify & Plan\nCheck auth first.",
      [
        { nodeId: "plan", title: "Clarify & Plan", status: "completed", detail: "Approved" },
        { nodeId: "review", title: "Review", status: "completed", detail: "Approved" },
      ],
    );

    expect(prompt).toContain("You are the main workflow agent");
    expect(prompt).toContain("Continue the same workflow chat with the user");
    expect(prompt).toContain("Objective: Review payment release");
    expect(prompt).toContain("Shared Workflow Context document:");
    expect(prompt).toContain("## Node: Clarify & Plan (plan)");
    expect(prompt).toContain("Planned the review.");
    expect(prompt).toContain("## Node: Review (review)");
    expect(prompt).toContain("Reviewed auth.");
    expect(prompt).toContain("Final User Report");
    expect(prompt).toContain("Do not rerun the workflow nodes");
  });

  test("builds a workflow context document from node handoffs", () => {
    const artifact = [
      "Detailed analysis that can be long.",
      "",
      "## Handoff",
      "- Key finding: service uses active turn guards.",
      "- Next input: inspect persistence.",
      "",
      "## Extra Detail",
      "This should not be part of the handoff summary.",
    ].join("\n");

    expect(workflowArtifactSummary(artifact)).toBe("- Key finding: service uses active turn guards.\n- Next input: inspect persistence.");
    expect(
      workflowContextDocumentFromArtifacts([
        { nodeId: "inventory", title: "Inventory", summary: workflowArtifactSummary(artifact) },
      ]),
    ).toContain("## Inventory (inventory)\n- Key finding: service uses active turn guards.");
  });

  test("keeps workflow work completion reports in the shared context summary", () => {
    const artifact = [
      "Verbose logs.",
      "",
      "## Work Completion Report",
      "- Did: mapped the repository.",
      "- Evidence: src/main.ts.",
      "",
      "## Handoff",
      "- Next: inspect renderer state.",
    ].join("\n");

    expect(workflowArtifactSummary(artifact)).toContain("### Work Completion Report\n- Did: mapped the repository.");
    expect(workflowArtifactSummary(artifact)).toContain("### Handoff\n- Next: inspect renderer state.");
  });

  test("summarizes workflow run progress while the graph is executing", () => {
    expect(
      workflowRunProgressSummary([
        { nodeId: "inventory", title: "Inventory", status: "completed" },
        { nodeId: "analysis", title: "Analysis", status: "running", detail: "Task running" },
        { nodeId: "writer", title: "Writer", status: "queued" },
      ]),
    ).toBe("Running 2/3 · 1 done · 1 queued");
  });

  test("keeps an empty active workflow draft persistable", () => {
    const emptyDraftInput = {
      workflowId: "wf_new",
      activeWorkflowId: "wf_new",
      workflowIds: ["wf_existing", "wf_new"],
      objective: "",
      messages: [],
      graphReady: false,
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      finalReport: "",
      agentSessionId: undefined,
    };

    expect(workflowDraftShouldPersist(emptyDraftInput)).toBe(true);
    expect(workflowDraftShouldPersist({ ...emptyDraftInput, activeWorkflowId: undefined, workflowIds: [] })).toBe(false);
  });

  test("summarizes live workflow task activity from the latest agent event", () => {
    const task: TaskRun = {
      ...taskRuns[0]!,
      status: "running",
      running: true,
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "Inspecting files",
          timestamp: 1710000000001,
          events: [
            {
              id: "event-1",
              type: "tool_call",
              name: "shell_command",
              content: "rg -n \"auth\" src",
              timestamp: 1710000000002,
            },
          ],
        },
      ],
    };

    expect(workflowTaskLiveDetail(task)).toBe('Tool shell_command: rg -n "auth" src');
  });

  test("renders the first grill question only after the user starts the workflow chat", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady={false}
        objective="Review payment release"
        messages={[
          { id: "m-1", role: "user", content: "Review payment release" },
          { id: "m-2", role: "assistant", content: "第一个问题：最终交付物是什么？推荐答案：风险清单和验证步骤。" },
        ]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("Review payment release");
    expect(html).toContain("第一个问题：最终交付物是什么？");
    expect(html).toContain("aria-label=\"Reply to grill question\"");
    expect(html).toContain("Send");
    expect(html).not.toContain("DAG valid");
  });

  test("renders the editable DAG only after the grill session is complete", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady
        objective="Review payment release"
        messages={[
          { id: "m-1", role: "assistant", content: "第一个问题：最终交付物是什么？推荐答案：风险清单和验证步骤。" },
          { id: "m-2", role: "user", content: "我要风险清单。" },
          { id: "m-3", role: "assistant", content: "信息足够了，已经生成 DAG。" },
        ]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("DAG valid");
    expect(html).toContain("Start");
    expect(html).toContain("Clarify &amp; Plan");
    expect(html).toContain("Review");
    expect(html).toContain("Done");
    expect(html).toContain("aria-label=\"Node plan runtime\"");
    expect(html).toContain("aria-label=\"Node plan provider\"");
    expect(html).toContain("aria-label=\"Node plan model\"");
    expect(html).toContain("aria-label=\"Expand workflow graph board\"");
    expect(html).toContain("Run Graph");
    expect(html).toContain("aria-label=\"Reply to workflow agent\"");
    expect(html).toContain("Ask the workflow agent to modify the graph");
    expect(html).toContain("Send");
    expect(html).not.toContain("Generate Graph");
  });

  test("renders configured agents instead of raw channels in workflow node cards", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady
        objective="Review payment release"
        messages={[{ id: "m-1", role: "assistant", content: "信息足够了，已经生成 DAG。" }]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        configuredAgents={configuredAgents}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("aria-label=\"Node plan configured agent\"");
    expect(html).toContain("Repo Reviewer");
    expect(html).not.toContain("aria-label=\"Node plan channel\"");
    expect(html).not.toContain(">Channel</span>");
  });

  test("renders workflow run feedback while execution is in progress", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady
        objective="Review payment release"
        messages={[{ id: "m-1", role: "assistant", content: "信息足够了，已经生成 DAG。" }]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running
        contextDocument={"# Workflow Context\n\n## Clarify & Plan\nUse active turn guards."}
        runProgress={[
          { nodeId: "plan", title: "Clarify & Plan", status: "completed", detail: "Output captured" },
          { nodeId: "work", title: "Execute", status: "running", detail: "Task running" },
          { nodeId: "review", title: "Review", status: "queued" },
        ]}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("Run progress");
    expect(html).toContain("Running 2/3 · 1 done · 1 queued");
    expect(html).toContain("Task running");
    expect(html).toContain("Output captured");
    expect(html).not.toContain("Workflow context");
    expect(html).not.toContain("Use active turn guards.");
    expect(html).toContain("Running...");
  });

  test("renders the main agent final report after workflow execution", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady
        objective="Review payment release"
        messages={[
          { id: "m-1", role: "assistant", content: "信息足够了，已经生成 DAG。" },
          { id: "m-2", role: "assistant", content: "## Final User Report\nPayment release is ready with one follow-up risk." },
        ]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        finalReport={"## Final User Report\nPayment release is ready with one follow-up risk."}
        runProgress={[
          { nodeId: "plan", title: "Clarify & Plan", status: "completed", detail: "Approved" },
          { nodeId: "review", title: "Review", status: "completed", detail: "Approved" },
          { nodeId: "__final_review__", title: "Main agent review", status: "completed", detail: "Main agent report ready" },
        ]}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("Main agent summary");
    expect(html).toContain("Main agent review");
    expect(html).toContain("<h2>Final User Report</h2>");
    expect(html).not.toContain("<pre>## Final User Report");
    expect(html).toContain("Payment release is ready with one follow-up risk.");
    expect(html).toContain("Workflow transcript");
    expect(html).toContain("Main agent report ready");
    expect(styles.indexOf(".workflow-result-card .workflow-final-report")).toBeLessThan(styles.indexOf(".workflow-result-card .workflow-graph-board"));
    expect(styles).toContain(".workflow-result-card .workflow-final-report {\n  order: 1;");
  });

  test("shows validation errors and disables execution for cyclic graphs", () => {
    const cyclicGraph: WorkflowGraph = {
      ...graph,
      edges: [
        ...graph.edges,
        { id: "review->plan", fromNodeId: "review", toNodeId: "plan" },
      ],
    };
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={cyclicGraph}
        graphReady
        objective="Review payment release"
        messages={[{ id: "m-1", role: "assistant", content: "第一个问题：最终交付物是什么？推荐答案：风险清单。" }]}
        reply=""
        error={undefined}
        agentId="codex"
        channelId="codex-openai"
        modelId="gpt-5.5"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectAgent={() => undefined}
        onSelectChannel={() => undefined}
        onSelectModel={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("DAG invalid");
    expect(html).toContain("Workflow graph must be acyclic.");
    expect(html).toContain("disabled=\"\"");
  });
});
