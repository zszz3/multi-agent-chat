import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "./Markdown";
import { buildPaletteCommands } from "./CommandPalette";
import {
  App,
  appShellClass,
  ChatPage,
  ChatHistoryPanel,
  chatConfigLocked,
  ChatControls,
  AgentPage,
  RuntimePage,
  ScheduledWorkflowPage,
  SkillsPage,
  applySkillTemplate,
  applyProviderPresetToChannel,
  applyCodexDefaultConfigToChannel,
  applyProviderPresetToConfiguredAgent,
  applyProviderModelIdToAgentConfig,
  rememberProviderKeyFromChannel,
  resolveProviderPresetId,
  shouldRefreshBalances,
  fetchOnlineSkills,
  buildFindSkillAgentPrompt,
  findSkillAgentPrompt,
  findSkillFallbackMessage,
  findSkillImportRequest,
  findSkillImportSelection,
  parseFindSkillAgentToolCall,
  resolveFindSkillConfiguredAgentId,
  onlineSkillTreeUrl,
  parseSkillMarkdown,
  skillPopularityLabel,
  skillsShResultFromApiSkill,
  skillsShSearchUrl,
  syncKeepAwakeIfAvailable,
  missingAppCapabilityMessage,
  shouldSendComposerKey,
  SlashCommandSuggestions,
  slashCommandSuggestionsFor,
  scheduledWorkflowEventTarget,
  resolveConfiguredAgentChannel,
  reorderTeamMembers,
  taskDetailIdFor,
  navigateWithRuntimeSave,
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
  workflowCanvasLayout,
  workflowContextDocumentFromArtifacts,
  workflowFinalReviewPrompt,
  workflowDraftShouldPersist,
  workflowJudgePrompt,
  workflowNodeRunPrompt,
  workflowProgressAfterFailure,
  workflowRunProgressSummary,
  workflowStoragePlanDocument,
  workflowTaskLiveDetail,
} from "./App";
import { DEFAULT_MODEL_ID } from "../../shared/models";
import { generatedConfigChannels, normalizeConfigChannelsForStorage, selectConfigChannelsForDisplay } from "../../shared/config-channels";
import { AGENT_PROVIDER_PRESETS, CODEX_DEFAULT_PRESET_ID } from "../../shared/provider-presets";
import { SKILL_TEMPLATES } from "../../shared/skill-templates";
import { firstWorkflowQuestionForObjective } from "../../shared/workflow-agent";
import { formatTime } from "./app/format";
import { loadCodexDefaultConfigFromRuntimeApi } from "./pages/runtime/runtime-utils";
import type {
  AgentId,
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
  WorkflowDraftState,
  ScheduledWorkflowRun,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  ScheduledWorkflowDueEvent,
} from "../../shared/types";

function runtimeConversation(runtimeId: AgentId, payload: Record<string, unknown>) {
  return { runtimeId, codecVersion: "v1", payload };
}

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
    tags: ["review", "docs"],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
  },
  {
    id: "claude-reviewer",
    name: "Claude Reviewer",
    description: "Reviews with Claude.",
    runtimeAgentId: "claude",
    channelId: "claude-code",
    modelId: DEFAULT_MODEL_ID,
    tags: ["review"],
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

test("guards only navigation away from the Runtime page", async () => {
  const navigated: string[] = [];
  let confirmations = 0;
  const confirm = async () => {
    confirmations += 1;
    return false;
  };

  await navigateWithRuntimeSave("chat", "workflow", confirm, (feature) => navigated.push(feature));
  await navigateWithRuntimeSave("runtimes", "skills", confirm, (feature) => navigated.push(feature));

  expect(confirmations).toBe(1);
  expect(navigated).toEqual(["workflow"]);
});

const taskRuns: TaskRun[] = [
  {
    id: "task-1",
    title: "Inspect repo",
    prompt: "Inspect repo",
    configuredAgentId: "repo-reviewer",
    modelId: "gpt-5.5",
    workDir: "/tmp/workspace",
    status: "completed",
    progress: "in_review",
    running: false,
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
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      messages: [],
      running: false,
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
  scheduledWorkflowStore: {
    activeScheduleId: undefined,
    runnerConfig: { baseUrl: "" },
    runnerStatus: { connected: false, connecting: false },
    schedules: [],
    runs: [],
  },
  workflowDraft: undefined,
  artifacts: [],
};

const paletteContext = {
  chats: appSnapshot.chats.map((chat) => ({ id: chat.id, title: chat.title, agentId: "codex" })),
  theme: "light" as const,
  language: "en" as const,
  onNavigate: () => undefined,
  onSelectChat: () => undefined,
  onNewChat: () => undefined,
  onToggleTheme: () => undefined,
  onChooseWorkDir: () => undefined,
  onRefreshAgents: () => undefined,
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
        configuredAgentId: "repo-reviewer",
        canvasPosition: { x: 120, y: 90 },
      },
      {
        id: "member-2",
        roleName: "Checker",
        prompt: "Verify the previous artifact.",
        configuredAgentId: "claude-reviewer",
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
        configuredAgentId: "repo-reviewer",
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
        configuredAgentId: "claude-reviewer",
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

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");

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
    expect(appShellClass("schedules")).toBe("shell schedules-shell");
    expect(appShellClass("skills")).toBe("shell skills-shell");
    expect(appShellClass("agent")).toBe("shell agent-shell");
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

  test("removes the standalone Teams surface from top-level navigation", () => {
    expect(buildPaletteCommands(paletteContext).map((command) => command.id)).not.toContain("nav-teams");
    expect(appShellClass("workflow")).toBe("shell workflow-shell");
    expect(styles).not.toContain(".feature-nav-item[data-feature=\"teams\"]");
  });

  test("uses a React Flow canvas for workflow graphs with pan and fit controls", () => {
    expect(styles).toContain(".workflow-canvas-board.workflow-graph-board {");
    expect(styles).toContain(".workflow-react-flow-board {");
    expect(styles).toContain(".workflow-canvas-controls.react-flow__controls");
    expect(styles).toContain(".workflow-canvas-minimap.react-flow__minimap");
    expect(styles).toContain(".workflow-result-card .workflow-canvas-board.workflow-graph-board:not(.is-expanded)");
    expect(styles).toContain("max-width: 760px;");
    expect(styles).toContain("height: clamp(380px, 54vh, 600px);");
    expect(styles).toContain("width: 192px;");
    expect(styles).toContain("font-size: 13px;");
    expect(styles).toContain("overflow: hidden;\n  padding: 0;");
    expect(styles).not.toContain(".workflow-canvas-preview-trigger .workflow-canvas-board");
    expect(styles).not.toContain(".workflow-result-card .workflow-graph-board:not(.is-expanded) {\n  max-height: min(460px, 56vh);\n  justify-content: center;");
    expect(styles).toMatch(
      /\.workflow-graph-board:not\(\.is-expanded\) \.workflow-graph-card textarea,[\s\S]*?\.workflow-graph-board:not\(\.is-expanded\) \.workflow-node-config-grid,[\s\S]*?\{\n  display: none;\n\}/,
    );
    expect(styles).toContain(".workflow-graph-board.is-expanded .workflow-graph-card textarea");
    expect(styles).toContain(".workflow-node-edit-overlay {");
    expect(styles).toContain(".workflow-node-edit-modal {");
    expect(styles).toContain(".workflow-node-edit-field textarea");
    expect(styles).not.toContain(".workflow-graph-board.is-expanded .workflow-graph-card textarea {\n  display: block;\n}");
    expect(styles).not.toContain(".workflow-graph-board.is-expanded .workflow-node-config-grid {\n  display: grid;\n}");
    expect(styles).not.toContain("linear-gradient(var(--line-faint) 1px, transparent 1px)");
  });

  test("positions workflow output document preview as a right-side reader drawer", () => {
    expect(styles).toContain(".workflow-file-preview-overlay {\n  position: fixed;");
    expect(styles).toContain("justify-content: flex-end;");
    expect(styles).toContain(".workflow-file-preview-modal {\n  display: grid;");
    expect(styles).toContain("width: min(760px, calc(100vw - 92px));");
    expect(styles).toContain("height: 100%;");
    expect(styles).toContain("max-height: none;");
    expect(styles).toContain("border-radius: 0;");
    expect(styles).toContain(".workflow-file-preview-content {\n  grid-row: 3;");
    expect(styles).not.toContain(".workflow-file-preview-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 110;\n  display: grid;\n  place-items: center;");
    expect(styles).not.toContain("width: min(980px, 100%);");
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
        configuredAgentId: "repo-reviewer",
        modelId: "gpt-5.5",
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
        configuredAgentId="repo-reviewer"
        configuredAgents={configuredAgents}
        channels={channels}
        locked={false}
        running={false}
        workDir="/tmp/workspace"
        runtimes={runtimes}
        onSelectConfiguredAgent={async () => undefined}
        onChooseWorkDir={async () => undefined}
      />,
    );

    expect(html).toContain("composer-controls");
    expect(html).toContain("aria-label=\"Configured agent\"");
    expect(html).toContain("Repo Reviewer");
    expect(html).toContain("aria-label=\"Agent model\"");
    expect(html).toContain("value=\"gpt-5.5\" selected=\"\"");
    expect(html).toContain("aria-label=\"Choose work directory\"");
    expect(html).toContain("/tmp/workspace");
    expect(html).not.toContain("composer-refresh-btn");
    expect(html).not.toContain("Refresh agents");
  });

  test("locks agent, model, and workdir after a chat starts", () => {
    const html = renderToStaticMarkup(
      <ChatControls
        configuredAgentId="repo-reviewer"
        configuredAgents={configuredAgents}
        channels={channels}
        locked={true}
        running={false}
        workDir="/tmp/workspace"
        runtimes={runtimes}
        onSelectConfiguredAgent={async () => undefined}
        onChooseWorkDir={async () => undefined}
      />,
    );

    expect(html).toContain("<select class=\"composer-select\" aria-label=\"Configured agent\" disabled=\"\"");
    expect(html).toContain("<select class=\"composer-select\" aria-label=\"Agent model\" disabled=\"\"");
    expect(html).toContain("aria-label=\"Choose work directory\" disabled=\"\"");
  });
});

describe("ChatPage", () => {
  test("renders full date and time for chat messages", () => {
    const chat: ChatSession = {
      id: "chat-1",
      title: "Repo chat",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      runtimeConversation: runtimeConversation("codex", { native: { threadId: "session-1" } }),
      running: false,
      messages: [
        { id: "message-1", role: "user", content: "Review this", timestamp: 1710000000000 },
        { id: "message-2", role: "assistant", content: "Done", timestamp: 1710000060000 },
      ],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000060000,
    };

    const html = renderToStaticMarkup(
      <ChatPage
        activeChat={chat}
        activeChatRuntimeId="codex"
        activeChatConfiguredAgent={configuredAgents[0]}
        activeChatConfigTitle="Codex OpenAI"
        prompt=""
        slashCommandSuggestions={[]}
        slashCommandIndex={0}
        canSend={false}
        activeChatLocked={false}
        transcriptRef={{ current: null }}
        configuredAgents={configuredAgents}
        channels={channels}
        runtimes={runtimes}
        workDir="/tmp/workspace"
        onTranscriptScroll={() => undefined}
        onPromptChange={() => undefined}
        onSlashCommandIndexChange={() => undefined}
        onCompleteSlashCommand={() => undefined}
        onSend={async () => undefined}
        onStopActiveChat={async () => undefined}
        onSelectConfiguredAgent={() => undefined}
        onSelectModel={() => undefined}
        onChooseWorkDir={() => undefined}
      />,
    );

    expect(html).toContain("You · 2024.03.10 00:00");
    expect(html).toContain("Codex · 2024.03.10 00:01");
  });

  test("renders the runtime conversation state in the chat header", () => {
    const chat: ChatSession = {
      id: "chat-1",
      title: "Repo chat",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      runtimeConversation: runtimeConversation("codex", { native: { threadId: "session-1" } }),
      running: false,
      messages: [],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };

    const html = renderToStaticMarkup(
      <ChatPage
        activeChat={chat}
        activeChatRuntimeId="codex"
        activeChatConfiguredAgent={configuredAgents[0]}
        activeChatConfigTitle="Codex OpenAI"
        prompt=""
        slashCommandSuggestions={[]}
        slashCommandIndex={0}
        canSend={false}
        activeChatLocked={false}
        transcriptRef={{ current: null }}
        configuredAgents={configuredAgents}
        channels={channels}
        runtimes={runtimes}
        workDir="/tmp/workspace"
        onTranscriptScroll={() => undefined}
        onPromptChange={() => undefined}
        onSlashCommandIndexChange={() => undefined}
        onCompleteSlashCommand={() => undefined}
        onSend={async () => undefined}
        onStopActiveChat={async () => undefined}
        onSelectConfiguredAgent={() => undefined}
        onSelectModel={() => undefined}
        onChooseWorkDir={() => undefined}
      />,
    );

    expect(html).toContain("chat-session-id");
    expect(html).toContain("title=\"Runtime conversation linked\"");
    expect(html).toContain("Conversation linked");
  });

  test("shows compact running controls in the transcript instead of the header", () => {
    const chat: ChatSession = {
      id: "chat-1",
      title: "Repo chat",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      runtimeConversation: runtimeConversation("codex", { native: { threadId: "session-1" } }),
      running: true,
      messages: [{ id: "message-1", role: "user", content: "Review this", timestamp: 1710000000000 }],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };

    const html = renderToStaticMarkup(
      <ChatPage
        activeChat={chat}
        activeChatRuntimeId="codex"
        activeChatConfiguredAgent={configuredAgents[0]}
        activeChatConfigTitle="Codex OpenAI"
        prompt=""
        slashCommandSuggestions={[]}
        slashCommandIndex={0}
        canSend={false}
        activeChatLocked={false}
        transcriptRef={{ current: null }}
        configuredAgents={configuredAgents}
        channels={channels}
        runtimes={runtimes}
        workDir="/tmp/workspace"
        onTranscriptScroll={() => undefined}
        onPromptChange={() => undefined}
        onSlashCommandIndexChange={() => undefined}
        onCompleteSlashCommand={() => undefined}
        onSend={async () => undefined}
        onStopActiveChat={async () => undefined}
        onSelectConfiguredAgent={() => undefined}
        onSelectModel={() => undefined}
        onChooseWorkDir={() => undefined}
      />,
    );

    expect(html).toContain("cli-status-stop");
    expect(html).not.toContain("Codex is working");
    expect(html).not.toContain("<div class=\"chat-header-actions\"><button");
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
      { id: "plan", kind: "agent", title: "Plan", prompt: "Plan release."},
      { id: "review", kind: "agent", title: "Review", prompt: "Review release."},
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
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      runtimeConversation: runtimeConversation("codex", { native: { threadId: "019e9143-2451-7612-a62d-e65389574d7d" } }),
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
        configuredAgents={configuredAgents}
        channels={channels}
        activeChatId="chat-1"
        contextMenu={{ chatId: "chat-1", x: 24, y: 32 }}
        onSelectChat={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteChat={() => undefined}
      />,
    );

    expect(html).toContain("Chats");
    expect(html).toContain("Payment review");
    expect(html).not.toContain("new-chat-compact-btn");
    expect(html).toContain("chat-context-menu");
    expect(html).toContain("Delete chat");
    expect(html).toContain("Delete session and data");
  });

  test("renders running and idle state inside each chat tab", () => {
    const runningChat: ChatSession = {
      id: "chat-running",
      title: "Running review",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      runtimeConversation: runtimeConversation("codex", { native: { threadId: "session-1" } }),
      running: true,
      messages: [
        { id: "message-1", role: "user", content: "Review this", timestamp: 1710000000000 },
        { id: "message-2", role: "assistant", content: "", timestamp: 1710000000001 },
      ],
      pendingAssistantMessageId: "message-2",
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000001,
    };
    const idleChat: ChatSession = {
      id: "chat-idle",
      title: "Idle review",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      runtimeConversation: runtimeConversation("codex", { native: { threadId: "session-2" } }),
      running: false,
      messages: [
        { id: "message-3", role: "user", content: "Review this too", timestamp: 1710000000002 },
        { id: "message-4", role: "assistant", content: "Done", timestamp: 1710000000003 },
      ],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000002,
      updatedAt: 1710000000003,
    };

    const html = renderToStaticMarkup(
      <ChatHistoryPanel
        chats={[runningChat, idleChat]}
        configuredAgents={configuredAgents}
        channels={channels}
        activeChatId="chat-running"
        onSelectChat={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteChat={() => undefined}
      />,
    );

    expect(html).toContain("chat-row-status is-running");
    expect(html).toContain(`Running | ${formatTime(runningChat.updatedAt)}`);
    expect(html).toContain("chat-row-status is-idle");
    expect(html).toContain(`Idle | ${formatTime(idleChat.updatedAt)}`);
    expect(html).not.toContain("Replied");
    expect(html).not.toContain("Stopped");
  });

  test("orders chat tabs by updated time", () => {
    const olderChat: ChatSession = {
      id: "chat-older",
      title: "Older chat",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      running: false,
      messages: [],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };
    const newerChat: ChatSession = {
      id: "chat-newer",
      title: "Newer chat",
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      running: false,
      messages: [],
      pendingAssistantMessageId: undefined,
      lastError: undefined,
      createdAt: 1710000000001,
      updatedAt: 1710000005000,
    };

    const html = renderToStaticMarkup(
      <ChatHistoryPanel
        chats={[olderChat, newerChat]}
        configuredAgents={configuredAgents}
        channels={channels}
        activeChatId="chat-newer"
        onSelectChat={() => undefined}
        onOpenContextMenu={() => undefined}
        onDeleteChat={() => undefined}
      />,
    );

    expect(html.indexOf("Newer chat")).toBeLessThan(html.indexOf("Older chat"));
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
            configuredAgentId: "repo-reviewer",
            modelId: "gpt-5.5",
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

  test("separates official and user workflow history", () => {
    const base = {
      objective: "Run",
      status: "draft" as const,
      revision: 1,
      graph: workflowPanelGraph,
      graphReady: true,
      messages: [],
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      createdAt: 1,
      updatedAt: 1,
    };
    const html = renderToStaticMarkup(
      <WorkflowHistoryPanel
        workflows={[
          { ...base, workflowId: "official", title: "Official release", sourceType: "official", topologyLocked: true },
          { ...base, workflowId: "user", title: "My release", sourceType: "user", topologyLocked: false },
        ]}
        activeWorkflowId="official"
        onSelectWorkflow={() => undefined}
        onNewWorkflow={() => undefined}
      />,
    );

    expect(html).toContain("Official workflows");
    expect(html).toContain("My workflows");
    expect(html.indexOf("Official release")).toBeLessThan(html.indexOf("My release"));
  });
});

describe("AgentPage", () => {
  test("scopes the two-column agent editor without changing runtime forms", () => {
    expect(styles).toContain(".config-form {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);");
    expect(styles).toContain(".agent-page .config-form {\n  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);");
  });

  test("renders agent profile controls without runtime provider settings", () => {
    const html = renderToStaticMarkup(
      <AgentPage
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
    expect(html).toContain("configured-agent-browser");
    expect(html).toContain("aria-label=\"Agent runtime\"");
    expect(html).toContain("aria-label=\"Agent execution config\"");
    expect(html).toContain("Codex OpenAI · Codex");
    expect(html).toContain("aria-label=\"Agent model\"");
    expect(html).toContain("GPT-5.5");
    expect(html).not.toContain("aria-label=\"Agent prompt\"");
    expect(html).not.toContain(">Test<");
    expect(html).toContain("configured-agent-editor-actions");
    expect(html).toContain(">Save<");
  });

  test("renders model-specific Codex reasoning efforts", () => {
    const modelChannel: AgentChannel = {
      ...channels[0]!,
      models: [{
        id: "gpt-5.6-sol",
        label: "GPT-5.6-Sol",
        reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
        defaultReasoningEffort: "low",
      }],
    };
    const agent: ConfiguredAgent = {
      ...configuredAgents[0]!,
      modelId: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    };

    const html = renderToStaticMarkup(
      <AgentPage
        channels={[modelChannel]}
        configuredAgents={[agent]}
        selectedConfiguredAgentId={agent.id}
        status=""
        onSave={async () => undefined}
        onAddConfiguredAgent={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onUpdateConfiguredAgent={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Agent reasoning effort"');
    expect(html).toContain('<option value="xhigh" selected="">XHigh</option>');
    expect(html).toContain('<option value="ultra">Ultra</option>');
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
    expect(html).toContain('class="runtime-choice-dot agent-hermes"');
    expect(html).toContain('class="runtime-choice-dot agent-opencode"');
    expect(html).toContain('class="runtime-choice-dot agent-openclaw"');
    expect(styles).toContain(".agent-provider-preset-list {\n  display: grid;\n  grid-template-columns: repeat(6, minmax(0, 1fr));");
    expect(styles).toContain("@media (max-width: 820px) {\n  .runtime-layout {\n    grid-template-columns: 1fr;");
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

  test("renders the Codex Default preset button", () => {
    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={channels}
        selectedChannelId="codex-openai"
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

    expect(html).toContain(">Default<");
    expect(html).toContain('aria-label="Refresh model catalog"');
    expect(html).toContain('aria-label="Provider presets"');
    expect(html).toContain('class="agent-provider-catalog"');
    expect(html).toContain('<details class="agent-provider-presets agent-provider-disclosure" open="">');
    expect(html).not.toContain('class="agent-provider-select"');
  });

  test("renders runtime config status messages", () => {
    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={channels}
        selectedChannelId="codex-openai"
        providerKeys={{}}
        codexPluginCatalog={[]}
        pluginCatalogStatus=""
        agentTestResults={{}}
        testingAgentId={undefined}
        agentTestTick={0}
        status="Codex Default import needs a full app restart to load the updated Electron API."
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

    expect(html).toContain("Codex Default import needs a full app restart to load the updated Electron API.");
    expect(html).toContain("runtime-config-status");
  });

  test("reports a restart-needed error when the Codex Default preload API is unavailable", async () => {
    await expect(loadCodexDefaultConfigFromRuntimeApi({})).rejects.toThrow(
      "Codex Default import needs a full app restart to load the updated Electron API.",
    );
  });

  test("prefers persisted preset id when resolving the active runtime preset", () => {
    const runtimeProviderPresets = AGENT_PROVIDER_PRESETS.filter((preset) => preset.runtimeAgentId === "codex");
    const channel: AgentChannel = {
      ...channels[0]!,
      presetId: CODEX_DEFAULT_PRESET_ID,
      modelProvider: "bridge",
      providerName: "Bridge",
      baseUrl: "https://bridge.example/v1",
    };

    expect(resolveProviderPresetId(channel, runtimeProviderPresets)).toBe(CODEX_DEFAULT_PRESET_ID);
  });

  test("shows Codex Default loaded values and blank fallbacks in runtime inputs", () => {
    const defaultChannel: AgentChannel = {
      ...channels[0]!,
      presetId: CODEX_DEFAULT_PRESET_ID,
      label: "Codex Default",
      modelProvider: "bridge",
      providerName: "Bridge",
      baseUrl: "https://bridge.example/v1",
      wireApi: "responses",
      httpHeaders: { Authorization: "Bearer sk-default" },
      models: [
        { id: DEFAULT_MODEL_ID, label: "Default" },
        { id: "gpt-5.5", label: "gpt-5.5" },
      ],
    };

    const html = renderToStaticMarkup(
      <RuntimePage
        language="en"
        channels={[defaultChannel]}
        selectedChannelId="codex-openai"
        providerKeys={{ [CODEX_DEFAULT_PRESET_ID]: "stale-key" }}
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

    expect(html).not.toContain('aria-label="Provider API key"');
    expect(html).not.toContain("value=\"stale-key\"");
    expect(html).toContain("value=\"Bridge\"");
    expect(html).toContain("value=\"bridge\"");
    expect(html).toContain("value=\"https://bridge.example/v1\"");
    expect(html).toContain("value=\"responses\"");
    expect(html).toContain("value=\"\"");
  });

  test("maps Codex Default loader output onto a channel and clears stale fields", () => {
    const mapped = applyCodexDefaultConfigToChannel(
      {
        ...channels[0]!,
        presetId: "deepseek",
        modelProvider: "deepseek",
        providerName: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        wireApi: "responses",
        modelCatalogJson: '{"models":[1]}',
        modelReasoningEffort: "high",
        httpHeaders: { Authorization: "Bearer stale" },
        plugins: [{ id: "stale-plugin", enabled: true }],
        models: [
          { id: DEFAULT_MODEL_ID, label: "Default" },
          { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
        ],
      },
      {
        modelProvider: null,
        providerName: null,
        baseUrl: null,
        wireApi: null,
        httpHeaders: null,
        apiKey: null,
        modelId: null,
        modelCatalogJson: null,
        modelReasoningEffort: null,
        plugins: null,
      },
    );

    expect(mapped).toMatchObject({
      presetId: CODEX_DEFAULT_PRESET_ID,
      models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
    });
    expect(mapped.modelProvider).toBeUndefined();
    expect(mapped.providerName).toBeUndefined();
    expect(mapped.baseUrl).toBeUndefined();
    expect(mapped.wireApi).toBeUndefined();
    expect(mapped.httpHeaders).toBeUndefined();
    expect(mapped.modelCatalogJson).toBeUndefined();
    expect(mapped.modelReasoningEffort).toBeUndefined();
    expect(mapped.plugins).toBeUndefined();
  });

  test("writes Codex Default api key into Authorization while preserving loaded headers", () => {
    const mapped = applyCodexDefaultConfigToChannel(channels[0]!, {
      modelProvider: "bridge",
      providerName: "Bridge",
      baseUrl: "https://bridge.example/v1",
      wireApi: "responses",
      httpHeaders: { "X-Test": "1" },
      apiKey: "sk-default",
      modelId: "gpt-5.5",
      modelCatalogJson: null,
      modelReasoningEffort: null,
      plugins: null,
    });

    expect(mapped.httpHeaders).toEqual({
      "X-Test": "1",
      Authorization: "Bearer sk-default",
    });
    expect(mapped.models).toEqual([
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "gpt-5.5", label: "gpt-5.5" },
    ]);
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
    expect(html).toContain('class="agent-provider-option is-active" aria-pressed="true" title="Claude Official">Claude Official</button>');
    expect(html).toContain(">DeepSeek<");
    expect(html).toContain(">Zhipu GLM<");
    expect(html).toContain(">Kimi<");
    expect(html).toContain(">SiliconFlow<");
    expect(html).toContain(">Bailian<");
    expect(html).toContain(">DouBaoSeed<");
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

  test("refreshes balances on app start and interval without depending on selected config", () => {
    expect(
      shouldRefreshBalances({
        channels,
        configDirty: false,
        refreshInFlight: false,
        lastRefreshAt: undefined,
        now: 1710000000000,
        intervalMs: 300000,
      }),
    ).toBe(true);
    expect(
      shouldRefreshBalances({
        channels,
        configDirty: true,
        refreshInFlight: false,
        lastRefreshAt: undefined,
        now: 1710000000000,
        intervalMs: 300000,
      }),
    ).toBe(false);
    expect(
      shouldRefreshBalances({
        channels,
        configDirty: false,
        refreshInFlight: true,
        lastRefreshAt: undefined,
        now: 1710000000000,
        intervalMs: 300000,
      }),
    ).toBe(false);
    expect(
      shouldRefreshBalances({
        channels: [],
        configDirty: false,
        refreshInFlight: false,
        lastRefreshAt: undefined,
        now: 1710000000000,
        intervalMs: 300000,
      }),
    ).toBe(false);
    expect(
      shouldRefreshBalances({
        channels,
        configDirty: false,
        refreshInFlight: false,
        lastRefreshAt: 1710000000000,
        now: 1710000060000,
        intervalMs: 300000,
      }),
    ).toBe(false);
    expect(
      shouldRefreshBalances({
        channels,
        configDirty: false,
        refreshInFlight: false,
        lastRefreshAt: 1710000000000,
        now: 1710000300000,
        intervalMs: 300000,
      }),
    ).toBe(true);
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
      "frontend-design",
      "handoff",
      "skill-creator",
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

  test("renders scheduled workflow runner status, schedules, and run history", () => {
    const workflow: WorkflowDraftState = {
      workflowId: "wf_daily_review",
      title: "每日代码复盘",
      status: "completed",
      revision: 1,
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      objective: "每天总结代码变化",
      graph: {
        title: "每日代码复盘",
        objective: "每天总结代码变化",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "review", kind: "agent", title: "Review", prompt: "Review changes."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start->review", fromNodeId: "start", toNodeId: "review" },
          { id: "review->end", fromNodeId: "review", toNodeId: "end" },
        ],
      },
      graphReady: true,
      messages: [],
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };
    const schedule: ScheduledWorkflowSchedule = {
      scheduleId: "sched_daily_review",
      workflowId: workflow.workflowId,
      title: "每天 9 点复盘",
      enabled: true,
      intervalSeconds: 86400,
      frequency: "daily",
      timeOfDay: "09:00",
      timezone: "Asia/Shanghai",
      nextRunAt: 1710003600000,
      source: "cloud",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };
    const run: ScheduledWorkflowRun = {
      runId: "scheduled_run_1",
      scheduleId: schedule.scheduleId,
      workflowId: workflow.workflowId,
      eventId: "event_1",
      workflowRunId: "run_1",
      title: schedule.title,
      status: "completed",
      startedAt: 1710003600000,
      finishedAt: 1710003900000,
      message: "Workflow completed.",
    };
    const store: ScheduledWorkflowStoreState = {
      activeScheduleId: schedule.scheduleId,
      runnerConfig: { baseUrl: "https://scheduler.example.com", deviceId: "device-local", runnerToken: "token" },
      runnerStatus: { connected: true, connecting: false, lastConnectedAt: 1710000000000 },
      schedules: [schedule],
      runs: [run],
    };

    const html = renderToStaticMarkup(
      <ScheduledWorkflowPage
        language="zh"
        workflows={[workflow]}
        store={store}
        draft={{
          workflowId: workflow.workflowId,
          title: "新的定时任务",
          intervalSeconds: 86400,
          frequency: "daily",
          timeOfDay: "09:00",
          timezone: "Asia/Shanghai",
          weekdays: [1],
          dayOfMonth: 1,
          enabled: true,
        }}
        onDraftChange={() => undefined}
        onConnectRunner={() => undefined}
        onDisconnectRunner={() => undefined}
        onRefreshSchedules={() => undefined}
        onCreateSchedule={() => undefined}
        onUpdateSchedule={() => undefined}
        onDeleteSchedule={() => undefined}
        onTriggerSchedule={() => undefined}
      />,
    );

    expect(html).toContain("定时任务");
    expect(html).toContain("本机已连接");
    expect(html).toContain("云端调度服务");
    expect(html).toContain("scheduled-toolbar");
    expect(html).toContain("scheduled-side-panel");
    expect(html).toContain("aria-label=\"定时任务 Workflow 详情\"");
    expect(html).toContain("aria-label=\"Workflow 图详情\"");
    expect(html).toContain("workflow-graph-board");
    expect(html).toContain("workflow-react-flow-board");
    expect(html).toContain("react-flow__edges");
    expect(html).toContain("scheduled-workflow-node");
    expect(html).not.toContain("scheduled-workflow-list");
    expect(html).not.toContain("scheduled-workflow-row");
    expect(html).not.toContain("scheduled-workflow-down-arrow");
    expect(html).not.toContain("scheduled-runner-panel");
    expect(html).not.toContain("<h3>计划列表</h3>");
    expect(html).not.toContain("<h3>给 Workflow 加计划</h3>");
    expect(html).not.toContain("Runner Token");
    expect(html).not.toContain("远端地址");
    expect(html).not.toContain("运行 Workflow");
    expect(html).not.toContain("间隔秒数");
    expect(html).toContain("每日代码复盘");
    expect(html).toContain("每天 9 点复盘");
    expect(html).toContain("每天 09:00");
    expect(html).toContain("aria-label=\"编辑定时任务时间\"");
    expect(html).toContain("scheduled-time-panel");
    expect(html).toContain("type=\"time\"");
    expect(html).toContain("value=\"09:00\"");
    expect(html).not.toContain("scheduled-inline-control");
    expect(html).toContain("应用");
    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Start");
    expect(html).toContain("Review");
    expect(html).toContain("Done");
    expect(html).not.toContain("Review changes.");
    expect(html).not.toContain(DEFAULT_MODEL_ID);
    expect(html).not.toContain("每天总结代码变化");
    expect(html).not.toContain("可运行");
    expect(html).not.toContain("个执行节点");
    expect(html).toContain("aria-label=\"暂停计划\"");
    expect(styles).not.toContain(".scheduled-edit-strip");
    expect(styles).not.toContain(".scheduled-inline-control");
    expect(styles).toContain(".scheduled-time-panel {");
    expect(styles).toContain(".scheduled-weekday-checks {");
    expect(styles).toContain(".scheduled-apply-btn {");
    expect(styles).toContain(".scheduled-workflow-graph {\n  min-height: 260px;");
    expect(styles).toContain(".scheduled-workflow-node {");
    expect(html).toContain("删除");
    expect(html).toContain("Workflow completed.");
  });

  test("renders the scheduled workflow creation form only in create mode", () => {
    const workflow: WorkflowDraftState = {
      workflowId: "wf_daily_review",
      title: "每日代码复盘",
      objective: "每天总结代码变化",
      status: "draft",
      revision: 1,
      graph: {
        title: "每日代码复盘",
        objective: "每天总结代码变化",
        nodes: [
          { id: "start", kind: "start", title: "Start", prompt: "" },
          { id: "review", kind: "agent", title: "Review", prompt: "Review changes."},
          { id: "end", kind: "end", title: "Done", prompt: "" },
        ],
        edges: [
          { id: "start-review", fromNodeId: "start", toNodeId: "review" },
          { id: "review-end", fromNodeId: "review", toNodeId: "end" },
        ],
      },
      graphReady: true,
      messages: [],
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      finalReport: "",
      runIds: [],
      configuredAgentId: "repo-reviewer",
      modelId: "gpt-5.5",
      createdAt: 1710000000000,
      updatedAt: 1710000000000,
    };
    const store: ScheduledWorkflowStoreState = {
      activeScheduleId: undefined,
      runnerConfig: { baseUrl: "https://scheduler.example.com", deviceId: "device-local", runnerToken: "token" },
      runnerStatus: { connected: true, connecting: false, lastConnectedAt: 1710000000000 },
      schedules: [],
      runs: [],
    };
    const html = renderToStaticMarkup(
      <ScheduledWorkflowPage
        language="zh"
        mode="create"
        workflows={[workflow]}
        store={store}
        draft={{
          workflowId: workflow.workflowId,
          title: "新的定时任务",
          intervalSeconds: 86400,
          frequency: "daily",
          timeOfDay: "09:00",
          timezone: "Asia/Shanghai",
          weekdays: [1],
          dayOfMonth: 1,
          enabled: true,
        }}
        onDraftChange={() => undefined}
        onConnectRunner={() => undefined}
        onDisconnectRunner={() => undefined}
        onRefreshSchedules={() => undefined}
        onCreateSchedule={() => undefined}
        onUpdateSchedule={() => undefined}
        onDeleteSchedule={() => undefined}
        onTriggerSchedule={() => undefined}
      />,
    );

    expect(html).toContain("<h3>新增定时任务</h3>");
    expect(html).toContain("运行 Workflow");
    expect(html).toContain("周期");
    expect(html).toContain("执行时间");
    expect(html).toContain("云端到点触发");
    expect(html).toContain("创建定时任务");
    expect(html).not.toContain("aria-label=\"定时任务 Workflow 详情\"");
  });

  test("extracts workflow and schedule ids from cloud due events", () => {
    const event: ScheduledWorkflowDueEvent = {
      eventId: "event_1",
      type: "workflow_due",
      title: "Due",
      message: "Run now",
      payload: { scheduleId: "sched_1", workflowId: "wf_1" },
    };

    expect(scheduledWorkflowEventTarget(event)).toEqual({ scheduleId: "sched_1", workflowId: "wf_1" });
    expect(scheduledWorkflowEventTarget({ ...event, payload: { workflowId: "wf_1" } })).toBeUndefined();
  });

  test("applies skill templates without storing template prompts in agent config", () => {
    const template = SKILL_TEMPLATES.find((item) => item.id === "personal-finance-planning")!;
    const agent = configuredAgents[0]!;

    const nextAgent = applySkillTemplate(agent, template);

    expect(nextAgent.name).toBe("personal-finance-planning");
    expect(nextAgent.description).toBe("整理财务目标、预算、风险偏好和长期规划。");
    expect(nextAgent).not.toHaveProperty("prompt");
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

  test("keeps the API catalog and follows CC Switch for the latest Codex Doubao model", () => {
    const apiPreset = AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "api-volcengine");
    const codexPreset = AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "codex-volcengine");
    const volcengineModels = [...(apiPreset?.models ?? []), ...(codexPreset?.models ?? [])];

    expect(apiPreset?.baseUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(codexPreset?.baseUrl).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(apiPreset?.models).toContainEqual({ id: "doubao-seed-1-6-lite-251015", label: "Doubao Seed 1.6 Lite" });
    expect(apiPreset?.models).toContainEqual({ id: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" });
    expect(codexPreset?.models).toContainEqual({ id: "doubao-seed-2-1-pro-260628", label: "doubao-seed-2-1-pro-260628" });
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

  test("drops models from the previous provider when switching to Claude Official", () => {
    const claudeOfficial = AGENT_PROVIDER_PRESETS.find((preset) => preset.id === "claude-code")!;
    const qwenChannel: AgentChannel = {
      id: "claude-code",
      agentId: "claude",
      label: "Claude Qwen",
      presetId: "claude-code-bailian",
      models: [
        { id: DEFAULT_MODEL_ID, label: "Default" },
        { id: "qwen3-coder-plus", label: "Qwen3 Coder Plus" },
      ],
    };

    const officialChannel = applyProviderPresetToChannel(qwenChannel, claudeOfficial);

    expect(officialChannel.models).toEqual(claudeOfficial.models);
    expect(officialChannel.models.some((model) => model.id.includes("qwen"))).toBe(false);
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
  test("renders official and user skills as separate collections", () => {
    const html = renderToStaticMarkup(
      <SkillsPage
        language="zh"
        officialSkills={[{ id: "official", sourceType: "official", name: "Official", description: "Official", prompt: "official", tags: [] }]}
        userSkills={[{ id: "user", sourceType: "user", name: "User", description: "User", prompt: "user", tags: [] }]}
      />,
    );
    expect(html).toContain("官方技能");
    expect(html).toContain("我的技能");
    expect(html).toContain("Official");
    expect(html).toContain("User");
  });

  test("renders shared search, category filtering, and category assignment controls", () => {
    const html = renderToStaticMarkup(
      <SkillsPage
        language="zh"
        categories={[
          { id: "explore", name: "Explore", system: true, sequence: 0 },
          { id: "coding", name: "Coding", system: true, sequence: 1 },
          { id: "category-research", name: "研究", system: false, sequence: 5 },
        ]}
        officialSkills={[{ id: "official", sourceType: "official", name: "Official", description: "Official", prompt: "official", tags: [], categoryId: "coding" }]}
        userSkills={[{ id: "user", sourceType: "user", name: "User", description: "User", prompt: "user", tags: [], categoryId: "category-research" }]}
        onAssignCategory={async () => undefined}
        onCreateCategory={async (name) => ({ id: "new", name, system: false, sequence: 6 })}
      />,
    );

    expect(html).toContain("aria-label=\"搜索名称、描述或标签\"");
    expect(html).toContain("aria-label=\"按分类筛选\"");
    expect(html).toContain(">探索<");
    expect(html).toContain(">编程<");
    expect(html).toContain(">研究<");
    expect(html).toContain("aria-label=\"技能分类\"");
    expect(html).toContain("aria-label=\"新建分类\"");
  });

  test("renders the built-in skill library as a sourced reader", () => {
    const installResult: InstalledSkillResult = {
      templateId: "brainstorming",
      target: "codex",
      path: "/Users/example/.codex/skills/brainstorming/SKILL.md",
      sourcePath: "/Users/example/Library/Application Support/Multi Agent Chat/bundled-skills/brainstorming/SKILL.md",
      existed: false,
    };
    const html = renderToStaticMarkup(
      <SkillsPage
        language="zh"
        templates={SKILL_TEMPLATES}
        onInstallSkill={async () => installResult}
        onRevealSkillInFinder={async () => undefined}
      />,
    );

    expect(html).toContain("skills-page");
    expect(html).toContain("skills-browser");
    expect(html).toContain("skill-list-panel");
    expect(html).toContain("skill-detail-panel");
    expect(html).toContain("技能库");
    expect(html).toContain("内置技能");
    expect(html).not.toContain("搜索网上 Skills");
    expect(html).not.toContain("skills.sh 上的公开 Skills");
    expect(html).not.toContain("OpenAgentSkill");
    expect(html).not.toContain("OpenAI Skills");
    expect(html).not.toContain("Anthropic Skills");
    expect(html).toContain("brainstorming");
    expect(html).toContain("personal-finance-planning");
    expect(html).toContain("resume-optimization");
    expect(html).toContain("paper-writing");
    expect(html).toContain("refactor-review-knowledge");
    expect(html).toContain("conducting thorough code reviews");
    expect(html).toContain("review");
    expect(html).not.toContain("出处");
    expect(html).not.toContain("skill-source-pills");
    expect(html).toContain("GitHub");
    expect(html).toContain("bundled original skill");
    expect(html).not.toContain("src/shared/bundled-skills/brainstorming/SKILL.md");
    expect(html).not.toContain("src/shared/bundled-skill-prompts.ts");
    expect(html).toContain("https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md");
    expect(html).toContain("class=\"control-btn compact secondary skill-source-link\"");
    expect(html).toContain("class=\"control-btn compact skill-install-trigger\"");
    expect(html).not.toContain("skill-install-actions");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("aria-live=\"polite\"");
    expect(html).not.toContain("SKILL.md</span>");
    expect(html).toContain("本地安装");
    expect(html).toContain("Finder");
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
    expect(html).not.toContain("online-skill-sources");
    expect(html).not.toContain("Online skill search results");
  });

  test("renders an online assistant for finding skills", () => {
    const html = renderToStaticMarkup(
      <SkillsPage
        language="zh"
        templates={SKILL_TEMPLATES}
        configuredAgents={configuredAgents}
        defaultFindSkillChatOpen
      />,
    );

    expect(html).toContain("skills-browser");
    expect(html).toContain("skill-find-chat-panel");
    expect(html).toContain("Find skill");
    expect(html).toContain("Online search");
    expect(html).toContain("aria-label=\"Find skill agent\"");
    expect(html).toContain("Repo Reviewer");
    expect(html).toContain("Claude Reviewer");
    expect(html).toContain("aria-label=\"Find skill message\"");
    expect(html).toContain("跟 AI 说你想找什么 skill");
    expect(html).toContain("本软件技能库");
    expect(html).not.toContain("优先从当前页面里的技能里找");
  });

  test("uses a conversational find-skill agent prompt with the managed install destination", () => {
    const prompt = findSkillAgentPrompt("zh");

    expect(prompt).toContain("自然对话");
    expect(prompt).toContain("找合适的 skill");
    expect(prompt).toContain("中文回复时必须用中文解释候选");
    expect(prompt).toContain("用户想安装");
    expect(prompt).toContain("本软件技能库");
    expect(prompt).toContain("app userData/bundled-skills");
    expect(prompt).toContain("实际导入由应用完成");
    expect(prompt).toContain("skills.search_online");
    expect(prompt).toContain("skills.import_online");
  });

  test("parses find-skill agent tool calls", () => {
    expect(
      parseFindSkillAgentToolCall('```json\n{"tool":"skills.search_online","query":"backend engineer resume optimization skill"}\n```'),
    ).toEqual({
      tool: "skills.search_online",
      query: "backend engineer resume optimization skill",
    });
    expect(parseFindSkillAgentToolCall('{"tool":"skills.import_online","candidateIndex":1}')).toEqual({
      tool: "skills.import_online",
      candidateIndex: 1,
    });
    expect(parseFindSkillAgentToolCall("可以，我再看看。")).toBeUndefined();
  });

  test("resolves the selected find-skill agent config", () => {
    expect(resolveFindSkillConfiguredAgentId("claude-reviewer", configuredAgents)).toBe("claude-reviewer");
    expect(resolveFindSkillConfiguredAgentId("missing-agent", configuredAgents)).toBe("repo-reviewer");
    expect(resolveFindSkillConfiguredAgentId(undefined, [])).toBe("");
  });

  test("keeps find-skill useful without leaking Codex errors when summarization fails", () => {
    const message = findSkillFallbackMessage(
      [
        {
          id: "skills-sh:anthropics/skills/front-end-design",
          name: "front-end-design",
          description: "Anthropic frontend design skill",
          prompt: "# front-end-design",
          tags: ["skills.sh", "anthropics/skills"],
          sourceId: "skills-sh",
          sourceLabel: "skills.sh Find",
          sourcePath: "anthropics/skills/front-end-design",
          sourceUrl: "https://www.skills.sh/anthropics/skills/front-end-design",
          path: "anthropics/skills/front-end-design",
          url: "https://www.skills.sh/anthropics/skills/front-end-design",
          rawUrl: "https://www.skills.sh/anthropics/skills/front-end-design",
          repositoryUrl: "https://github.com/anthropics/skills",
          installCommand: "npx skills add anthropics/skills@front-end-design",
          installs: 22,
          contentLabel: "skills.sh result",
        },
      ],
      "zh",
      "Codex error",
    );

    expect(message).toContain("我找到了 1 个候选，先没动本地文件");
    expect(message).toContain("front-end-design");
    expect(message).toContain("来源和热度：skills.sh Find · 22 installs");
    expect(message).toContain("确认后会导入到本软件技能库");
    expect(message).not.toContain("install_cmd");
    expect(message).not.toContain("Codex");
    expect(message).not.toContain("Error invoking remote method");
  });

  test("renders readable online skill candidates without raw command fields", () => {
    const message = findSkillFallbackMessage(
      [
        {
          id: "anthropic-skills:skills/frontend-design/SKILL.md",
          name: "frontend-design",
          description: "Guidance for distinctive, intentional visual design.",
          prompt: "# Frontend Design",
          tags: ["frontend-design"],
          sourceId: "anthropic-skills",
          sourceLabel: "Anthropic Skills",
          sourcePath: "skills/frontend-design/SKILL.md",
          sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
          path: "skills/frontend-design/SKILL.md",
          url: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
          rawUrl: "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md",
          repositoryUrl: "https://github.com/anthropics/skills",
          repositoryStars: 13200,
          contentLabel: "SKILL.md",
        },
      ],
      "zh",
      "Codex error",
    );

    expect(message).toContain("我找到了 1 个候选，先没动本地文件");
    expect(message).toContain("第 1 个最像");
    expect(message).toContain("frontend-design");
    expect(message).toContain("做什么：用于前端和界面设计指导");
    expect(message).toContain("来源和热度：Anthropic Skills · 13.2K GitHub stars");
    expect(message).toContain("可以继续问我区别");
    expect(message).toContain("就第一个");
    expect(message).toContain("导入官方那个");
    expect(message).not.toContain("回复 1 或 导入 1");
    expect(message).not.toContain("download_url");
    expect(message).not.toContain("install_cmd");
    expect(message).not.toContain("Guidance for distinctive");
    expect(message).not.toContain("Codex");
  });

  test("passes Chinese candidate summaries to the find-skill agent", () => {
    const prompt = buildFindSkillAgentPrompt(
      "下载一个前端设计skill，A那家公司的",
      [
        {
          id: "anthropic-skills:skills/frontend-design/SKILL.md",
          name: "frontend-design",
          description: "Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one.",
          prompt: "# Frontend Design",
          tags: ["frontend-design"],
          sourceId: "anthropic-skills",
          sourceLabel: "Anthropic Skills",
          sourcePath: "skills/frontend-design/SKILL.md",
          sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
          path: "skills/frontend-design/SKILL.md",
          url: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
          rawUrl: "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md",
          repositoryUrl: "https://github.com/anthropics/skills",
          repositoryStars: 13200,
          contentLabel: "SKILL.md",
        },
      ],
      "zh",
    );

    expect(prompt).toContain("中文回复时必须用中文解释候选");
    expect(prompt).toContain("做什么：用于前端和界面设计指导");
    expect(prompt).not.toContain("Guidance for distinctive");
  });

  test("asks the agent to choose online search terms when no candidates exist", () => {
    const prompt = buildFindSkillAgentPrompt("后端简历优化的skill", [], "zh");

    expect(prompt).toContain("当前还没有候选");
    expect(prompt).toContain("调用 skills.search_online 搜索");
    expect(prompt).toContain('"query":"你自己判断出的搜索关键词"');
  });

  test("requires explicit candidate confirmation before importing online skills", () => {
    const candidate = {
      id: "anthropic-skills:skills/frontend-design/SKILL.md",
      name: "frontend-design",
      description: "Guidance for distinctive, intentional visual design.",
      prompt: "# Frontend Design",
      tags: ["frontend-design"],
      sourceId: "anthropic-skills",
      sourceLabel: "Anthropic Skills",
      sourcePath: "skills/frontend-design/SKILL.md",
      sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
      path: "skills/frontend-design/SKILL.md",
      url: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
      rawUrl: "https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md",
      repositoryUrl: "https://github.com/anthropics/skills",
      repositoryStars: 13200,
      contentLabel: "SKILL.md",
    };

    expect(findSkillImportSelection("下载一个前端设计skill，A那家公司的", [candidate])).toBeUndefined();
    expect(findSkillImportSelection("1", [candidate])).toBe(candidate);
    expect(findSkillImportSelection("导入 1", [candidate])).toBe(candidate);
    expect(findSkillImportSelection("就第一个吧", [candidate])).toBeUndefined();
    expect(findSkillImportSelection("可以，就它", [candidate])).toBeUndefined();
    expect(findSkillImportSelection("可以的", [candidate])).toBeUndefined();
    expect(findSkillImportSelection("好的", [candidate])).toBeUndefined();
    expect(findSkillImportSelection("下载 frontend-design", [candidate])).toBe(candidate);
    expect(
      findSkillImportSelection("导入官方那个", [
        { ...candidate, id: "skills-sh:someone/frontend-design", sourceId: "skills-sh", sourceLabel: "skills.sh Find", repositoryUrl: "https://github.com/someone/frontend-design" },
        candidate,
      ]),
    ).toBeUndefined();
    expect(skillPopularityLabel(candidate)).toBe("13.2K GitHub stars");

    expect(
      findSkillImportRequest(candidate),
    ).toMatchObject({
      id: "anthropic-skills:skills/frontend-design/SKILL.md",
      name: "frontend-design",
      sourceLabel: "Anthropic Skills",
      sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
    });
  });

  test("builds online skill source URLs and parses SKILL.md frontmatter", () => {
    expect(onlineSkillTreeUrl({ id: "openai", label: "OpenAI Skills", owner: "openai", repo: "skills", branch: "main" })).toBe(
      "https://api.github.com/repos/openai/skills/git/trees/main?recursive=1",
    );
    expect(skillsShSearchUrl("flaky tests")).toBe("https://skills.sh/api/search?q=flaky%20tests&limit=10");

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

    expect(
      skillsShResultFromApiSkill({
        id: "composiohq/awesome-claude-skills/tailored-resume-generator",
        skillId: "tailored-resume-generator",
        name: "tailored-resume-generator",
        installs: 6359,
        source: "composiohq/awesome-claude-skills",
      }),
    ).toMatchObject({
      id: "skills-sh:composiohq/awesome-claude-skills/tailored-resume-generator",
      sourceLabel: "skills.sh Find",
      contentLabel: "skills.sh result",
      repositoryUrl: "https://github.com/composiohq/awesome-claude-skills",
      installCommand: "npx skills add composiohq/awesome-claude-skills@tailored-resume-generator",
      prompt: expect.stringContaining("skills.sh search returns registry metadata"),
    });
  });

  test("searches skills.sh and GitHub repository results", async () => {
    const calls: string[] = [];
    const fakeFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/api/search?")) {
        return new Response(
          JSON.stringify({
            query: "resume",
            searchType: "fuzzy",
            skills: [
              {
                id: "composiohq/awesome-claude-skills/tailored-resume-generator",
                skillId: "tailored-resume-generator",
                name: "tailored-resume-generator",
                installs: 6359,
                source: "composiohq/awesome-claude-skills",
              },
              {
                id: "claude-office-skills/skills/resume-tailor",
                skillId: "resume-tailor",
                name: "resume-tailor",
                installs: 2957,
                source: "claude-office-skills/skills",
              },
            ],
            count: 2,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://api.github.com/search/repositories")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const results = await fetchOnlineSkills("resume", undefined, fakeFetch as typeof fetch);

    expect(calls).toEqual([
      "https://skills.sh/api/search?q=resume&limit=10",
      "https://api.github.com/search/repositories?q=resume%20skill&sort=stars&order=desc&per_page=10",
    ]);
    expect(results.map((skill) => skill.name)).toEqual(["tailored-resume-generator", "resume-tailor"]);
    expect(results[0]).toMatchObject({
      sourceLabel: "skills.sh Find",
      contentLabel: "skills.sh result",
      repositoryUrl: "https://github.com/composiohq/awesome-claude-skills",
      installCommand: "npx skills add composiohq/awesome-claude-skills@tailored-resume-generator",
      prompt: expect.stringContaining("skills.sh search returns registry metadata"),
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
        configuredAgentId="repo-reviewer"
        configuredAgents={configuredAgents}
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        tasks={taskRuns}
        activeTaskId="task-1"
        onPromptChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onChooseWorkDir={async () => undefined}
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
    expect(html).toContain("aria-label=\"Configured agent\"");
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
        configuredAgentId="repo-reviewer"
        configuredAgents={configuredAgents}
        workDir="/tmp/workspace"
        runtimes={runtimes}
        channels={channels}
        tasks={taskRuns}
        activeTaskId={undefined}
        onPromptChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onChooseWorkDir={async () => undefined}
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
  test("skips keep-awake sync when an older preload has not exposed the API", async () => {
    await expect(syncKeepAwakeIfAvailable({} as Window["multiAgentChat"], true)).resolves.toBeUndefined();
  });

  test("keeps Runtime and Agent navigation without a general settings page", () => {
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

      expect(html).not.toContain("aria-label=\"打开设置\"");
      expect(html).not.toContain("data-tip=\"设置\"");
      expect(html).toContain("<span>Agent</span>");
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
        configuredAgents={configuredAgents}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
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
        configuredAgents={configuredAgents}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
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
        configuredAgents={configuredAgents}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
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
        configuredAgents={configuredAgents}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
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
        configuredAgents={configuredAgents}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
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
        configuredAgents={configuredAgents}
        onPromptChange={() => undefined}
        onCreateTeam={async () => undefined}
        onUpdateTeam={async () => undefined}
        onDeleteTeam={async () => undefined}
        onSelectTeam={async () => undefined}
        onSelectTeamRun={async () => undefined}
        onRunTeam={async () => undefined}
        onStopTeamRun={async () => undefined}
        onChooseWorkDir={async () => undefined}
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
      },
      {
        id: "review",
        kind: "agent",
        title: "Review",
        prompt: "Review the output.",
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
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        configuredAgents={configuredAgents}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
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
    expect(html).toContain("aria-label=\"Configured agent\"");
    expect(html).toContain("Repo Reviewer");
    expect(html).toContain("Codex OpenAI");
    expect(html).toContain("GPT-5.5");
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
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
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
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        finalReport="## Final User Report\nqjagents workflow finished."
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
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

  test("lays out workflow graphs on a two-dimensional canvas with parallel node groups", () => {
    const parallelGraph: WorkflowGraph = {
      title: "Parallel review",
      objective: "Review release in parallel",
      nodes: [
        { id: "start", kind: "start", title: "Start", prompt: "" },
        { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo."},
        { id: "security", kind: "agent", title: "Security", prompt: "Review security."},
        { id: "testing", kind: "agent", title: "Testing", prompt: "Review tests."},
        { id: "writer", kind: "agent", title: "Writer", prompt: "Synthesize results."},
        { id: "end", kind: "end", title: "Done", prompt: "" },
      ],
      edges: [
        { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
        { id: "inventory->security", fromNodeId: "inventory", toNodeId: "security" },
        { id: "inventory->testing", fromNodeId: "inventory", toNodeId: "testing" },
        { id: "security->writer", fromNodeId: "security", toNodeId: "writer" },
        { id: "testing->writer", fromNodeId: "testing", toNodeId: "writer" },
        { id: "writer->end", fromNodeId: "writer", toNodeId: "end" },
      ],
    };
    const layout = workflowCanvasLayout(parallelGraph);
    const byId = new Map(layout.nodes.map((node) => [node.node.id, node]));

    expect(byId.get("start")!.x).toBeLessThan(byId.get("inventory")!.x);
    expect(byId.get("inventory")!.x).toBeLessThan(byId.get("security")!.x);
    expect(byId.get("testing")!.x).toBe(byId.get("security")!.x);
    expect(byId.get("testing")!.y).toBeGreaterThan(byId.get("security")!.y);
    // long flows wrap onto additional rows instead of one wide line
    expect(byId.get("writer")!.y).toBeGreaterThan(byId.get("security")!.y);
    expect(byId.get("writer")!.x).toBeLessThan(byId.get("security")!.x);
    expect(byId.get("end")!.y).toBeGreaterThan(byId.get("start")!.y);
    expect(layout.edges).toHaveLength(6);
    expect(layout.width).toBeLessThan(900);
  });

  test("pins workflow nodes to their explicit position when set", () => {
    const graph: WorkflowGraph = {
      title: "Pinned",
      objective: "Pin one node",
      nodes: [
        { id: "start", kind: "start", title: "Start", prompt: "" },
        { id: "plan", kind: "agent", title: "Plan", prompt: "Plan.", position: { x: 999, y: 777 } },
        { id: "end", kind: "end", title: "Done", prompt: "" },
      ],
      edges: [
        { id: "start->plan", fromNodeId: "start", toNodeId: "plan" },
        { id: "plan->end", fromNodeId: "plan", toNodeId: "end" },
      ],
    };
    const byId = new Map(workflowCanvasLayout(graph).nodes.map((node) => [node.node.id, node]));
    expect(byId.get("plan")!.x).toBe(999);
    expect(byId.get("plan")!.y).toBe(777);
    // nodes without an explicit position still auto-layout
    expect(byId.get("start")!.x).not.toBe(999);
  });

  test("renders workflow graphs as a pannable canvas with parallel node groups", () => {
    const parallelGraph: WorkflowGraph = {
      title: "Parallel review",
      objective: "Review release in parallel",
      nodes: [
        { id: "start", kind: "start", title: "Start", prompt: "" },
        { id: "inventory", kind: "agent", title: "Inventory", prompt: "Map repo."},
        { id: "security", kind: "agent", title: "Security", prompt: "Review security."},
        { id: "testing", kind: "agent", title: "Testing", prompt: "Review tests."},
        { id: "writer", kind: "agent", title: "Writer", prompt: "Synthesize results."},
        { id: "end", kind: "end", title: "Done", prompt: "" },
      ],
      edges: [
        { id: "start->inventory", fromNodeId: "start", toNodeId: "inventory" },
        { id: "inventory->security", fromNodeId: "inventory", toNodeId: "security" },
        { id: "inventory->testing", fromNodeId: "inventory", toNodeId: "testing" },
        { id: "security->writer", fromNodeId: "security", toNodeId: "writer" },
        { id: "testing->writer", fromNodeId: "testing", toNodeId: "writer" },
        { id: "writer->end", fromNodeId: "writer", toNodeId: "end" },
      ],
    };

    const html = renderToStaticMarkup(
      <WorkflowPage
        title="Parallel review"
        status="draft"
        graph={parallelGraph}
        graphReady
        objective="Review release in parallel"
        messages={[]}
        reply=""
        error={undefined}
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        runProgress={[
          { nodeId: "inventory", title: "Inventory", status: "completed" },
          { nodeId: "security", title: "Security", status: "running", detail: "Checking auth paths" },
          { nodeId: "testing", title: "Testing", status: "running", detail: "Inspecting coverage" },
          { nodeId: "writer", title: "Writer", status: "queued" },
        ]}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("workflow-canvas-board");
    expect(html).toContain("workflow-canvas-viewport");
    expect(html).toContain("workflow-react-flow-board");
    expect(html).toContain("workflow-canvas-node");
    expect(html).toContain("react-flow__edges");
    expect(html).toContain("workflow-canvas-controls");
    expect(html).toContain("Fit View");
    expect(html).not.toContain("workflow-preview-list");
    expect(html).not.toContain("workflow-preview-row");
    expect(html).toContain("data-layer-size=\"2\"");
    expect(html.indexOf("Security")).toBeLessThan(html.indexOf("Writer"));
    expect(html.indexOf("Testing")).toBeLessThan(html.indexOf("Writer"));
    expect(html).toContain("Checking auth paths");
    expect(html).toContain("Inspecting coverage");
  });

  test("renders long workflow previews without folding nodes", () => {
    const nodes: WorkflowGraph["nodes"] = [
      { id: "start", kind: "start", title: "Start", prompt: "" },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `agent-${index + 1}`,
        kind: "agent" as const,
        title: `Agent ${index + 1}`,
        prompt: `Run step ${index + 1}.`,
        agentId: "codex" as const,
        channelId: "codex-openai",
        modelId: DEFAULT_MODEL_ID,
      })),
      { id: "end", kind: "end", title: "Done", prompt: "" },
    ];
    const edges: WorkflowGraph["edges"] = nodes.slice(0, -1).map((node, index) => ({
      id: `${node.id}->${nodes[index + 1]!.id}`,
      fromNodeId: node.id,
      toNodeId: nodes[index + 1]!.id,
    }));
    const graph: WorkflowGraph = {
      title: "Long workflow",
      objective: "Run many steps",
      nodes,
      edges,
    };

    const html = renderToStaticMarkup(
      <WorkflowPage
        title="Long workflow"
        status="draft"
        graph={graph}
        graphReady
        objective="Run many steps"
        messages={[]}
        reply=""
        error={undefined}
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).not.toContain("workflow-preview-gap");
    expect(html).not.toContain("workflow-preview-more");
    expect(html).not.toContain("+ 6 nodes");
    expect(html).toContain("Agent 1");
    expect(html).toContain("Agent 4");
    expect(html).toContain("Agent 8");
  });

  test("extracts workflow output document paths from text", () => {
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
            configuredAgentId: "repo-reviewer",
            modelId: "gpt-5.5",
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
            configuredAgentId: "repo-reviewer",
            modelId: "gpt-5.5",
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
    { id: "review", kind: "agent", title: "Review Agent", prompt: "Review."},
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

  test("marks unfinished workflow progress as failed when a run fails", () => {
    expect(
      workflowProgressAfterFailure(
        [
          { nodeId: "plan", title: "Plan", status: "completed", taskId: "task-done" },
          { nodeId: "review", title: "Review", status: "running", taskId: "task-running", detail: "Judge running" },
          { nodeId: "ship", title: "Ship", status: "queued" },
          { nodeId: "doc", title: "Doc", status: "failed", detail: "Already failed" },
        ],
        "Workflow task timed out.",
      ),
    ).toEqual([
      { nodeId: "plan", title: "Plan", status: "completed", taskId: "task-done" },
      { nodeId: "review", title: "Review", status: "failed", detail: "Workflow task timed out." },
      { nodeId: "ship", title: "Ship", status: "failed", detail: "Workflow task timed out." },
      { nodeId: "doc", title: "Doc", status: "failed", detail: "Already failed" },
    ]);
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

  test("hides shell tool transport metadata from live workflow task activity", () => {
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
              type: "tool_result",
              name: "exec_command",
              content: [
                "Chunk ID: e28e4a",
                "Wall time: 0.0000 seconds",
                "Process exited with code 0",
                "Original token count: 1816",
                "Output:",
                "What I did:",
                "- Interpreted workflow results.",
              ].join("\n"),
              timestamp: 1710000000002,
            },
          ],
        },
      ],
    };

    expect(workflowTaskLiveDetail(task)).toBe("Tool exec_command done: What I did: - Interpreted workflow results.");
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
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
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

  test("renders a compact graph preview after the grill session is complete", () => {
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
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
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
    expect(html).toContain("workflow-canvas-board");
    expect(html).toContain("workflow-react-flow-board");
    expect(html).toContain("react-flow__edges");
    expect(html).not.toContain("workflow-canvas-preview-trigger");
    expect(html).not.toContain("workflow-preview-list");
    expect(html).not.toContain("aria-label=\"Node plan runtime\"");
    expect(html).not.toContain("aria-label=\"Node plan provider\"");
    expect(html).not.toContain("aria-label=\"Node plan model\"");
    expect(html).toContain("aria-label=\"Expand workflow graph board\"");
    expect(html).toContain("Run Graph");
    expect(html).not.toContain("aria-label=\"New workflow\"");
    expect(html).not.toContain("<span>New workflow</span>");
    expect(html).toContain("aria-label=\"Reply to workflow agent\"");
    expect(html).toContain("Ask the workflow agent to modify the graph");
    expect(html).toContain("Send");
    expect(html).not.toContain("Generate Graph");
  });

  test("keeps workflow provider controls out of the collapsed graph preview", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady
        objective="Review payment release"
        messages={[{ id: "m-1", role: "assistant", content: "信息足够了，已经生成 DAG。" }]}
        reply=""
        error={undefined}
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        configuredAgents={configuredAgents}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("workflow-canvas-board");
    expect(html).toContain("workflow-react-flow-board");
    expect(html).not.toContain("workflow-preview-list");
    expect(html).not.toContain("aria-label=\"Node plan configured agent\"");
    expect(html).not.toContain("aria-label=\"Node plan channel\"");
    expect(html).not.toContain(">Channel</span>");
  });

  test("keeps expanded workflow nodes readable and moves editing into a right-click modal", () => {
    const html = renderToStaticMarkup(
      <WorkflowPage
        graph={graph}
        graphReady
        objective="Review payment release"
        messages={[{ id: "m-1", role: "assistant", content: "信息足够了，已经生成 DAG。" }]}
        reply=""
        error={undefined}
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        configuredAgents={configuredAgents}
        workDir="/tmp/workspace"
        running={false}
        defaultGraphExpanded
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
        onDraftGraph={() => undefined}
        onReplyChange={() => undefined}
        onSendReply={() => undefined}
        onUpdateNode={() => undefined}
        onRunGraph={async () => undefined}
        onResetSession={() => undefined}
      />,
    );

    expect(html).toContain("workflow-expanded-node-card");
    expect(html).not.toContain("右键编辑");
    expect(html).not.toContain("Right-click to edit");
    expect(html).not.toContain("aria-label=\"Node plan prompt\"");
    expect(html).not.toContain("aria-label=\"Node plan model\"");
    expect(styles).toContain(".workflow-expanded-node-card {");
    expect(styles).toContain(".workflow-node-edit-overlay {");
    expect(styles).not.toContain(".workflow-node-edit-trigger");
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
        configuredAgentId="repo-reviewer"
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
        onSelectConfiguredAgent={() => undefined}
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
        configuredAgentId="repo-reviewer"
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
        onSelectConfiguredAgent={() => undefined}
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
    // Graph is shown first, then run outputs flow below it.
    expect(styles).toContain(".workflow-result-card .workflow-graph-board {\n  order: 1;");
    expect(styles).toContain(".workflow-result-card .workflow-run-progress {\n  order: 2;");
    expect(styles).toContain(".workflow-result-card .workflow-final-report {\n  order: 3;");
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
        configuredAgentId="repo-reviewer"
        runtimes={runtimes}
        channels={channels}
        workDir="/tmp/workspace"
        running={false}
        onObjectiveChange={() => undefined}
        onSelectConfiguredAgent={() => undefined}
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
