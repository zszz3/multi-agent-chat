import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  type NodeProps as ReactFlowNodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  CheckCircle2,
  CalendarClock,
  CircleStop,
  ClipboardList,
  Cpu,
  FileInput,
  FolderOpen,
  GitBranch,
  GripVertical,
  Maximize2,
  MessageSquareText,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings,
  SquarePen,
  Sun,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { CommandPalette, buildPaletteCommands, type Theme } from "./CommandPalette";
import { Markdown } from "./Markdown";
import { configChannelForSelection, selectConfigChannelsForDisplay } from "../../shared/config-channels";
import { DEFAULT_MODEL_ID, defaultChannelForAgent, modelsForChannel } from "../../shared/models";
import { AGENT_PROVIDER_PRESETS, type AgentProviderPreset } from "../../shared/provider-presets";
import { SKILL_TEMPLATES } from "../../shared/skill-templates";
import {
  fetchOnlineSkills,
  ONLINE_SKILL_SOURCES,
  SKILLS_SH_SOURCE,
  onlineSkillTreeUrl,
  skillsShResultFromApiSkill,
  skillsShSearchUrl,
  parseSkillMarkdown,
  skillFrontmatterValue,
  type OnlineSkillResult,
} from "../../shared/online-skills";
import {
  DEFAULT_SCHEDULED_WORKFLOW_CLOUD_BASE_URL,
  DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY,
  DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
} from "../../shared/types";
import { buildWorkflowAgentPrompt, WORKFLOW_TOTAL_QUESTION_COUNT } from "../../shared/workflow-agent";
import {
  createWorkflowGraphFromObjective,
  parseWorkflowGraphUpsert,
  validateWorkflowGraph,
  workflowGraphDisplayLayers,
  workflowGraphExecutionLevels,
} from "../../shared/workflow-graph";
import type {
  AgentChannel,
  AgentId,
  AgentModelOption,
  AgentPluginConfig,
  AgentRuntime,
  AgentTestEvent,
  SkillTemplate,
  AgentTeam,
  AgentTeamMember,
  AgentTeamMode,
  AgentWorkflowNode,
  AgentWorkflowNodeStatus,
  AppSnapshot,
  ChatEvent,
  ChatMessage,
  ChatSession,
  CodexPluginCatalogItem,
  ConfiguredAgent,
  ImportedSkillResult,
  ImportOnlineSkillRequest,
  InstalledSkillResult,
  LocalFilePreview,
  ProviderBalanceResult,
  ScheduledWorkflowDueEvent,
  ScheduledWorkflowFrequency,
  ScheduledWorkflowRun,
  ScheduledWorkflowSchedule,
  ScheduledWorkflowStoreState,
  SkillInstallTarget,
  TeamRun,
  TaskProgress,
  TaskRun,
  WorkflowGraph,
  WorkflowGraphNode,
  WorkflowDraftState,
  WorkflowGrillMessage,
  WorkflowRunNodeStatus,
  WorkflowRunProgressItem,
  WorkflowStatus,
  UninstalledSkillResult,
} from "../../shared/types";

export {
  fetchOnlineSkills,
  onlineSkillTreeUrl,
  skillsShResultFromApiSkill,
  skillsShSearchUrl,
  parseSkillMarkdown,
};

const AGENTS: AgentId[] = ["codex", "claude", "api"];
const THEME_STORAGE_KEY = "multi-agent-chat-theme";
const PROVIDER_KEYS_STORAGE_KEY = "multi-agent-chat-provider-keys";
const LANGUAGE_STORAGE_KEY = "multi-agent-chat-language";
const KEEP_AWAKE_STORAGE_KEY = "multi-agent-chat-keep-awake";
const BALANCE_REFRESH_INTERVAL_MS = 5 * 60_000;

export type Language = "zh" | "en";

const UI_TEXT = {
  zh: {
    nav: {
      chat: "对话",
      tasks: "任务",
      teams: "团队",
      workflow: "工作流",
      schedules: "定时任务",
      skills: "技能",
      runtimes: "配置",
      configs: "Agent 组装",
      settings: "设置",
      configuration: "设置",
    },
    chrome: {
      featureNav: "功能导航",
      search: "搜索或执行命令...",
      newChat: "新建对话",
      newAgent: "新建 Agent",
      configuredAgents: "Agent 组装",
      noConfiguredAgents: "暂无配置的 Agent",
      noChats: "新建对话后开始。",
      skillLibrary: "技能库",
      noSkills: "暂无技能",
      darkTheme: "深色主题",
      lightTheme: "浅色主题",
      toggleTheme: "切换主题",
      settings: "设置",
      openSettings: "打开设置",
    },
    config: {
      title: "Agent 组装",
      description: "组装 Agent 的名称、描述、执行配置和标签。",
      save: "保存",
      language: "界面语言",
      zh: "统一中文",
      en: "English",
      cliHelp: "选择这个 Agent 使用的命令。",
      providerHelp: "选择 Provider 预设。",
      apiKey: "API Key / Token",
      usedByAll: "同一 Provider 的 Agent 共用",
      name: "名称",
      config: "配置",
      model: "模型",
      tags: "标签",
      descriptionField: "描述",
      advancedProvider: "高级 Provider 设置",
      plugins: "Codex 插件",
      loadCatalog: "加载目录",
      manual: "手动添加",
      catalog: "目录",
      selectPlugin: "选择插件...",
      noPluginsAvailable: "暂无可用插件",
      noPluginsConfigured: "暂无插件配置",
      enabled: "启用",
      models: "模型",
      addModel: "添加模型",
      emptyAgent: "新建 Agent 后可编辑名称、描述、执行配置和标签。",
      agentDeployed: "Agent 部署成功",
    },
    workflow: {
      newWorkflow: "新建 Workflow",
      runGraph: "运行图",
      running: "运行中...",
      executableNodes: "可执行节点",
      noWorkDir: "未选择工作目录",
      empty: "输入任务描述开始生成工作流。",
      agentWorking: "工作流 Agent 正在处理...",
      result: "工作流图结果",
      ready: "就绪",
      invalid: "无效",
      dagValid: "DAG 有效",
      dagInvalid: "DAG 无效",
      runProgress: "运行进度",
      finalReport: "主 Agent 总结",
      completed: "工作流已完成",
      outputDocuments: "产出文档",
      files: "个文件",
      loading: "读取中",
      closePreview: "关闭文档预览",
      largeFile: "文件较大，仅显示前 512KB。",
      entryNode: "入口节点",
      terminalNode: "终止节点",
      replyToAgent: "回复工作流 Agent",
      replyToQuestion: "回复追问",
      task: "工作流任务",
      modifyPlaceholder: "让工作流 Agent 修改图或解释运行结果...",
      answerPlaceholder: "回答当前问题...",
      taskPlaceholder: "描述工作流任务...",
      send: "发送",
    },
  },
  en: {
    nav: {
      chat: "Chat",
      tasks: "Tasks",
      teams: "Teams",
      workflow: "Workflow",
      schedules: "Schedules",
      skills: "Skills",
      runtimes: "Config",
      configs: "Agent Assembly",
      settings: "Settings",
      configuration: "Configuration",
    },
    chrome: {
      featureNav: "Feature navigation",
      search: "Search or run command...",
      newChat: "New chat",
      newAgent: "New agent",
      configuredAgents: "Agent Assembly",
      noConfiguredAgents: "No configured agents",
      noChats: "Create a chat to start.",
      skillLibrary: "Skill library",
      noSkills: "No skills",
      darkTheme: "Dark theme",
      lightTheme: "Light theme",
      toggleTheme: "Toggle theme",
      settings: "Settings",
      openSettings: "Open settings",
    },
    config: {
      title: "Agent Assembly",
      description: "Assemble agent profiles, execution config, and tags.",
      save: "Save",
      language: "Language",
      zh: "统一中文",
      en: "English",
      cliHelp: "Choose the command this agent runs.",
      providerHelp: "Choose a provider preset.",
      apiKey: "API Key / Token",
      usedByAll: "Used by all",
      name: "Name",
      config: "Config",
      model: "Model",
      tags: "Tags",
      descriptionField: "Description",
      advancedProvider: "Advanced provider settings",
      plugins: "Codex Plugins",
      loadCatalog: "Load catalog",
      manual: "Manual",
      catalog: "Catalog",
      selectPlugin: "Select plugin...",
      noPluginsAvailable: "No plugins available",
      noPluginsConfigured: "No plugins configured",
      enabled: "Enabled",
      models: "Models",
      addModel: "Add model",
      emptyAgent: "Create an agent to edit its profile, execution config, and tags.",
      agentDeployed: "Agent deployed",
    },
    workflow: {
      newWorkflow: "New workflow",
      runGraph: "Run Graph",
      running: "Running...",
      executableNodes: "executable nodes",
      noWorkDir: "No work directory selected",
      empty: "Describe a task to start generating a workflow.",
      agentWorking: "workflow agent is working...",
      result: "Workflow graph result",
      ready: "Ready",
      invalid: "Invalid",
      dagValid: "DAG valid",
      dagInvalid: "DAG invalid",
      runProgress: "Run progress",
      finalReport: "Main agent summary",
      completed: "Workflow completed",
      outputDocuments: "Output documents",
      files: "files",
      loading: "Loading",
      closePreview: "Close document preview",
      largeFile: "File is large; showing the first 512KB.",
      entryNode: "Entry node",
      terminalNode: "Terminal node",
      replyToAgent: "Reply to workflow agent",
      replyToQuestion: "Reply to grill question",
      task: "Workflow task",
      modifyPlaceholder: "Ask the workflow agent to modify the graph or explain the run...",
      answerPlaceholder: "Answer the current question...",
      taskPlaceholder: "Describe the workflow task...",
      send: "Send",
    },
  },
} as const;

interface AgentTestUiState {
  agentId: string;
  state: "running" | "passed" | "failed";
  phase: string;
  message: string;
  startedAt: number;
  testedAt?: number;
  elapsedMs?: number;
  runtimeAgentId: AgentId;
  channelId: string;
  modelId: string;
  providerLabel: string;
  output?: string;
  transcript: AgentTestTranscriptItem[];
}

interface AgentTestTranscriptItem {
  id: string;
  type: AgentTestEvent["type"];
  content: string;
  timestamp: number;
}

const SKILL_INSTALL_TARGETS: Array<{ id: SkillInstallTarget; label: string; path: string }> = [
  { id: "codex", label: "Codex", path: "~/.codex/skills" },
  { id: "claude", label: "Claude", path: "~/.claude/skills" },
  { id: "trae", label: "Trae", path: "~/.trae/skills" },
];

function skillDisplayName(skill: Pick<SkillTemplate, "name" | "prompt">): string {
  return skillFrontmatterValue(skill.prompt, "name") || skill.name;
}

function skillDisplayDescription(skill: Pick<SkillTemplate, "description" | "prompt">): string {
  return skillFrontmatterValue(skill.prompt, "description") || skill.description;
}

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(value);
}

export function skillPopularityLabel(skill: Pick<OnlineSkillResult, "repositoryStars" | "installs">): string | undefined {
  if (skill.repositoryStars !== undefined) return `${compactCount(skill.repositoryStars)} GitHub stars`;
  if (skill.installs !== undefined) return `${compactCount(skill.installs)} installs`;
  return undefined;
}

export type FindSkillAgentToolCall =
  | { tool: "skills.search_online"; query: string }
  | { tool: "skills.import_online"; candidateIndex: number };

export function findSkillAgentPrompt(language: Language): string {
  return language === "zh"
    ? [
        "你是 Multi Agent Chat 里的 find-skill 助手。",
        "用自然对话帮用户找合适的 skill；可以追问需求、解释候选差异，也可以调用工具搜索和导入。",
        "中文回复时必须用中文解释候选；候选描述如果是英文，不要照抄英文 description。",
        "可用工具（以 MCP 工具的方式思考，但在这个 UI 里必须返回 JSON 让应用执行）：",
        "- skills.search_online: 搜索线上 skill。参数：{\"tool\":\"skills.search_online\",\"query\":\"你自己判断出的搜索关键词\"}。query 可以是英文、多关键词，不要要求用户自己翻译。",
        "- skills.import_online: 导入当前候选。参数：{\"tool\":\"skills.import_online\",\"candidateIndex\":1}。candidateIndex 是当前候选序号，从 1 开始。",
        "如果需要调用工具，你的整条回复只能是一个 JSON 对象，不要加解释文字，不要放 markdown 以外的内容。",
        "如果用户想安装某个候选，调用 skills.import_online；实际导入由应用完成，会导入到本软件技能库：app userData/bundled-skills（macOS 通常是 ~/Library/Application Support/Multi Agent Chat/bundled-skills）。",
        "回复尽量简洁，优先让用户能判断下一步。",
      ].join("\n")
    : [
        "You are the find-skill assistant inside Multi Agent Chat.",
        "Help the user find suitable skills in a natural conversation. You may ask follow-up questions, compare candidates, and call tools to search or import.",
        "Available tools. Think of them as MCP tools, but in this UI you must return JSON for the app to execute:",
        '- skills.search_online: search online skills. Args: {"tool":"skills.search_online","query":"your best search query"}. Choose the query yourself; do not ask the user to translate.',
        '- skills.import_online: import a current candidate. Args: {"tool":"skills.import_online","candidateIndex":1}. candidateIndex is 1-based.',
        "If you need a tool, your entire reply must be one JSON object and no prose.",
        "If the user wants to install a candidate, call skills.import_online. The app imports it into this app's skill library: app userData/bundled-skills.",
        "Keep replies concise and useful for the user's next decision.",
      ].join("\n");
}

function readableSkillDescription(skill: Pick<OnlineSkillResult, "name" | "description" | "prompt" | "tags">, language: Language): string {
  const description = skillDisplayDescription(skill).trim();
  if (language !== "zh") return description || "No description";
  const name = skillDisplayName(skill).toLowerCase();
  const text = [name, description, ...skill.tags].join("\n").toLowerCase();
  if (/front[- ]?end|frontend|ui|visual|typography|界面/.test(text) && /design|设计/.test(text)) {
    return "用于前端和界面设计指导，帮你判断视觉方向、排版和审美选择，避免做成模板感很强的默认 UI。";
  }
  if (/web[- ]?artifacts|html artifacts|react|tailwind|shadcn/.test(text)) {
    return "用于构建复杂 Web 或 HTML artifacts，适合需要 React、Tailwind 或 shadcn/ui 的交互页面。";
  }
  if (/webapp[- ]?testing|playwright|browser logs|screenshots/.test(text)) {
    return "用于测试本地 Web 应用，支持 Playwright 交互验证、截图、调试和查看浏览器日志。";
  }
  if (/software[- ]?design|architecture|架构|方案/.test(text)) {
    return "用于软件设计和方案梳理，帮助拆分模块、接口、数据流和实现取舍。";
  }
  if (/[\u4e00-\u9fff]/.test(description)) return description || "暂无描述";
  return "线上元数据没有中文说明；建议根据名称、来源和仓库热度先判断，再打开来源确认具体内容。";
}

function findSkillCandidateSummary(skill: OnlineSkillResult, index: number, language: Language): string {
  const popularity = skillPopularityLabel(skill);
  const source = skill.repositoryUrl ?? skill.url;
  const pieces =
    language === "zh"
      ? [
          `${index + 1}. ${skillDisplayName(skill)}`,
          `做什么：${readableSkillDescription(skill, language)}`,
          `来源：${skill.sourceLabel}`,
          popularity ? `热度：${popularity}` : undefined,
          source ? `链接：${source}` : undefined,
        ]
      : [
          `${index + 1}. ${skillDisplayName(skill)}`,
          `Summary: ${skillDisplayDescription(skill) || "No description"}`,
          `Source: ${skill.sourceLabel}`,
          popularity ? `Popularity: ${popularity}` : undefined,
          source ? `Link: ${source}` : undefined,
        ];
  return pieces.filter((line): line is string => Boolean(line)).join("\n");
}

export function buildFindSkillAgentPrompt(input: string, candidates: OnlineSkillResult[], language: Language, toolResult?: string): string {
  const topCandidates = candidates.slice(0, 5);
  const candidateBlock =
    topCandidates.length > 0
      ? topCandidates.map((skill, index) => findSkillCandidateSummary(skill, index, language)).join("\n\n")
      : language === "zh"
        ? "当前还没有候选。你可以调用 skills.search_online 搜索。"
        : "There are no candidates yet. You can call skills.search_online.";
  return [
    findSkillAgentPrompt(language),
    "",
    language === "zh" ? "用户消息：" : "User message:",
    input,
    ...(toolResult ? ["", language === "zh" ? "工具结果：" : "Tool result:", toolResult] : []),
    "",
    language === "zh" ? "当前搜索候选：" : "Current search candidates:",
    candidateBlock,
  ].join("\n");
}

function findSkillAgentJsonPayload(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced || trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return undefined;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return undefined;
  }
}

export function parseFindSkillAgentToolCall(content: string): FindSkillAgentToolCall | undefined {
  const payload = findSkillAgentJsonPayload(content);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const record = payload as Record<string, unknown>;
  if (record.tool === "skills.search_online" && typeof record.query === "string" && record.query.trim()) {
    return { tool: "skills.search_online", query: record.query.trim() };
  }
  if (record.tool === "skills.import_online" && typeof record.candidateIndex === "number" && Number.isInteger(record.candidateIndex) && record.candidateIndex > 0) {
    return { tool: "skills.import_online", candidateIndex: record.candidateIndex };
  }
  return undefined;
}

function chineseOrdinalIndex(value: string): number | undefined {
  const normalized = value.trim();
  const map: Record<string, number> = { 一: 0, 二: 1, 两: 1, 三: 2, 四: 3, 五: 4, 六: 5, 七: 6, 八: 7, 九: 8, 十: 9 };
  return map[normalized];
}

export function findSkillImportSelection(input: string, candidates: OnlineSkillResult[]): OnlineSkillResult | undefined {
  if (candidates.length === 0) return undefined;
  const trimmed = input.trim();
  const numeric = trimmed.match(/^(?:#\s*)?([1-9]\d*)$/);
  const actionNumeric = trimmed.match(/^(?:导入|下载|安装|install|download|import)\s*(?:第\s*)?([1-9]\d*)\s*(?:个)?$/i);
  const actionChinese = trimmed.match(/^(?:导入|下载|安装)\s*第\s*([一二两三四五六七八九十])\s*个?$/);
  const index =
    numeric?.[1] !== undefined
      ? Number(numeric[1]) - 1
      : actionNumeric?.[1] !== undefined
        ? Number(actionNumeric[1]) - 1
        : actionChinese?.[1] !== undefined
          ? chineseOrdinalIndex(actionChinese[1])
          : undefined;
  if (index !== undefined) return candidates[index];

  const named = trimmed.match(/^(?:导入|下载|安装|install|download|import)\s+(.+)$/i)?.[1]?.trim().toLowerCase();
  if (!named) return undefined;
  const normalized = named.replace(/\s+/g, "-");
  return candidates.find((skill) => {
    const name = skillDisplayName(skill).toLowerCase();
    return normalized === name || normalized.includes(name);
  });
}

export function findSkillImportRequest(skill: OnlineSkillResult): ImportOnlineSkillRequest {
  return {
    id: skill.id,
    name: skillDisplayName(skill),
    description: skillDisplayDescription(skill),
    prompt: skill.prompt,
    tags: skill.tags,
    sourceLabel: skill.sourceLabel,
    sourcePath: skill.path,
    sourceUrl: skill.url,
  };
}

export function findSkillImportSuccessMessage(result: ImportedSkillResult, language: Language): string {
  return language === "zh"
    ? `已导入到软件技能库：${result.template.name}\npath: ${result.path}`
    : `Imported into this app's skill library: ${result.template.name}\npath: ${result.path}`;
}

export function findSkillFallbackMessage(candidates: OnlineSkillResult[], language: Language, _codexError?: string): string {
  const topCandidates = candidates.slice(0, 3);
  if (topCandidates.length === 0) {
    return language === "zh"
      ? "没有找到匹配的在线 skill。可以换一个更具体的能力描述再搜，例如平台名、工具名或任务类型。"
      : "No matching online skill was found. Try a more specific capability, platform, tool, or task type.";
  }
  const intro =
    language === "zh"
      ? `我找到了 ${topCandidates.length} 个候选，先没动本地文件。第 1 个最像。`
      : `I found ${topCandidates.length} candidate${topCandidates.length === 1 ? "" : "s"} and have not changed local files. The first one looks closest.`;
  const lines = topCandidates.map((skill, index) => {
    const popularity = skillPopularityLabel(skill);
    const source = skill.repositoryUrl ?? skill.url;
    if (language === "zh") {
      const lines = [
        `${index + 1}. ${skillDisplayName(skill)}${index === 0 ? "（推荐）" : ""}`,
        `   做什么：${readableSkillDescription(skill, language)}`,
        `   来源和热度：${skill.sourceLabel}${popularity ? ` · ${popularity}` : ""}`,
        source ? `   链接：${source}` : undefined,
        "   确认后会导入到本软件技能库。",
      ];
      return lines.filter((line): line is string => Boolean(line)).join("\n");
    }
    const lines = [
      `${index + 1}. ${skillDisplayName(skill)}${index === 0 ? " (recommended)" : ""}`,
      `   Summary: ${skillDisplayDescription(skill) || "No description"}`,
      `   Source and popularity: ${skill.sourceLabel}${popularity ? ` · ${popularity}` : ""}`,
      source ? `   Link: ${source}` : undefined,
      "   If confirmed, it will be imported into this app's skill library.",
    ];
    return lines.filter((line): line is string => Boolean(line)).join("\n");
  });
  const confirm =
    language === "zh"
      ? "你可以继续问我区别、让我换关键词，或者直接说“就第一个”“导入官方那个”。"
      : "You can ask me to compare them, search with different wording, or say something like \"use the first one\".";
  return [intro, "", ...lines, "", confirm].join("\n");
}

function sourceUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
      const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
      if (owner && repo) return `GitHub: ${owner}/${repo}`;
    }
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function targetLabel(target: SkillInstallTarget): string {
  return SKILL_INSTALL_TARGETS.find((item) => item.id === target)?.label ?? target;
}

function MarkdownDocument({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`markdown-document ${className}`.trim()}>
      <Markdown text={text} />
    </div>
  );
}

function isMarkdownFilePath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path.split(/[?#]/)[0] ?? "");
}

export function loadStoredTheme(storage: Pick<Storage, "getItem">): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function loadStoredProviderKeys(storage: Pick<Storage, "getItem">): Record<string, string> {
  try {
    const raw = storage.getItem(PROVIDER_KEYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key, value]),
    );
  } catch {
    return {};
  }
}

function loadStoredLanguage(storage: Pick<Storage, "getItem">): Language {
  return storage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
}

function loadStoredKeepAwake(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(KEEP_AWAKE_STORAGE_KEY) === "true";
}

export type ActiveFeature = "chat" | "tasks" | "workflow" | "schedules" | "skills" | "runtimes" | "settings";
type MaybePromise = void | Promise<void>;
export type TaskStatusFilterValue = "all" | TaskProgress;
const WORKFLOW_THINKING_MESSAGE = "Agent is thinking...";
const WORKFLOW_TASK_POLL_MS = 1000;
const WORKFLOW_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const WORKFLOW_NODE_MAX_ATTEMPTS = 2;
const WORKFLOW_FINAL_REVIEW_NODE_ID = "__final_review__";
const WORKFLOW_OUTPUT_DOCUMENT_EXTENSIONS = "md|markdown|txt|json|yaml|yml|html|htm";
const WORKFLOW_STORAGE_ROOT = ".multi-agent-chat/workflows";
const DEFAULT_SCHEDULE_INTERVAL_SECONDS = 86400;
const WEEKDAY_OPTIONS = [
  { value: 1, zh: "周一", en: "Mon" },
  { value: 2, zh: "周二", en: "Tue" },
  { value: 3, zh: "周三", en: "Wed" },
  { value: 4, zh: "周四", en: "Thu" },
  { value: 5, zh: "周五", en: "Fri" },
  { value: 6, zh: "周六", en: "Sat" },
  { value: 0, zh: "周日", en: "Sun" },
];

const TASK_STATUS_FILTERS: Array<{ id: TaskStatusFilterValue; label: string }> = [
  { id: "all", label: "All" },
  { id: "backlog", label: "Backlog" },
  { id: "todo", label: "Todo" },
  { id: "in_progress", label: "Working" },
  { id: "in_review", label: "Review" },
  { id: "done", label: "Done" },
];

const TEAM_MODE_OPTIONS: Array<{ id: AgentTeamMode; label: string; description: string }> = [
  { id: "pipeline", label: "Pipeline", description: "Run nodes one after another." },
  { id: "parallel", label: "Parallel", description: "Run all worker nodes at once." },
  { id: "supervisor", label: "Supervisor", description: "Lead plans, workers execute, lead synthesizes." },
];

function teamModeLabel(mode: AgentTeamMode): string {
  return TEAM_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? "Pipeline";
}

interface SlashCommandSuggestion {
  command: string;
  description: string;
  agentIds?: AgentId[];
}

interface ComposerKeyState {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
}

const SLASH_COMMANDS: SlashCommandSuggestion[] = [
  { command: "/status", description: "Read Codex app-server config, models, plugins, and MCP status.", agentIds: ["codex"] },
  { command: "/models", description: "List models from Codex app-server.", agentIds: ["codex"] },
  { command: "/plugins", description: "List Codex plugins from all app-server marketplaces.", agentIds: ["codex"] },
  { command: "/help", description: "Show available slash commands." },
];

export function appShellClass(activeFeature: ActiveFeature): string {
  return activeFeature === "tasks" || activeFeature === "workflow" || activeFeature === "schedules" || activeFeature === "skills" || activeFeature === "runtimes"
    ? `shell ${activeFeature}-shell`
    : "shell";
}

export function missingAppCapabilityMessage(action: string): string {
  return `${action} needs a full app restart to load the updated Electron API.`;
}

export function taskDetailIdFor(
  activeFeature: ActiveFeature,
  selectedTaskDetailId: string | undefined,
  persistedActiveTaskId: string | undefined,
): string | undefined {
  void persistedActiveTaskId;
  return activeFeature === "tasks" ? selectedTaskDetailId : undefined;
}

export function scheduledWorkflowEventTarget(event: ScheduledWorkflowDueEvent): { scheduleId: string; workflowId: string } | undefined {
  const scheduleId = typeof event.payload.scheduleId === "string" ? event.payload.scheduleId : undefined;
  const workflowId = typeof event.payload.workflowId === "string" ? event.payload.workflowId : undefined;
  if (!scheduleId || !workflowId) return undefined;
  return { scheduleId, workflowId };
}

const DEFAULT_SNAPSHOT: AppSnapshot = {
  detectedAt: 0,
  activeChatId: undefined,
  activeTaskId: undefined,
  activeTeamId: undefined,
  activeTeamRunId: undefined,
  workDir: "",
  runtimes: [],
  channels: [],
  configuredAgents: [],
  chats: [],
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
    runnerConfig: { baseUrl: DEFAULT_SCHEDULED_WORKFLOW_CLOUD_BASE_URL },
    runnerStatus: { connected: false, connecting: false },
    schedules: [],
    runs: [],
  },
  workflowDraft: undefined,
};

function defaultScheduledWorkflowDraft(workflows: WorkflowDraftState[], activeWorkflowId?: string): ScheduledWorkflowDraft {
  const firstWorkflow = workflows.find((workflow) => workflow.workflowId === activeWorkflowId) ?? workflows[0];
  return {
    workflowId: firstWorkflow?.workflowId ?? "",
    title: firstWorkflow ? `${firstWorkflow.title} schedule` : "Scheduled workflow",
    intervalSeconds: DEFAULT_SCHEDULE_INTERVAL_SECONDS,
    frequency: "daily",
    timeOfDay: DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY,
    timezone: DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
    weekdays: [1],
    dayOfMonth: 1,
    enabled: true,
  };
}

function agentLabel(agentId: AgentId): string {
  if (agentId === "codex") return "Codex";
  if (agentId === "claude") return "Claude Code";
  return "API";
}

function agentAccent(agentId: AgentId): string {
  if (agentId === "codex") return "agent-codex";
  if (agentId === "claude") return "agent-claude";
  return "agent-api";
}

function fallbackRuntime(agentId: AgentId): AgentRuntime {
  return {
    id: agentId,
    label: agentLabel(agentId),
    command: agentId,
    version: null,
    available: false,
    error: "Detecting",
  };
}

function runtimeStatus(runtime: AgentRuntime): string {
  if (runtime.available) return runtime.version ?? "available";
  return runtime.error ?? "missing";
}

function formatTime(value: number): string {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(value: number): string {
  if (value < 1000) return `${Math.max(0, Math.round(value))}ms`;
  return `${Math.max(0, value / 1000).toFixed(1)}s`;
}

function formatScheduleInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function intervalSecondsForFrequency(frequency: ScheduledWorkflowFrequency): number {
  if (frequency === "weekly") return 7 * 86400;
  if (frequency === "monthly") return 30 * 86400;
  return 86400;
}

function normalizeScheduleTimeOfDay(value: string | undefined): string {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : DEFAULT_SCHEDULED_WORKFLOW_TIME_OF_DAY;
}

function normalizeScheduleWeekdays(value: number[] | undefined): number[] {
  const days = [...new Set((value ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return days.length > 0 ? days : [1];
}

function normalizeScheduleDayOfMonth(value: number | undefined): number {
  return Math.min(31, Math.max(1, Math.floor(value || 1)));
}

function formatScheduleRecurrence(schedule: Pick<ScheduledWorkflowSchedule, "frequency" | "timeOfDay" | "weekdays" | "dayOfMonth" | "intervalSeconds">, language: Language): string {
  const zh = language === "zh";
  const timeOfDay = normalizeScheduleTimeOfDay(schedule.timeOfDay);
  if (schedule.frequency === "weekly") {
    const days = normalizeScheduleWeekdays(schedule.weekdays)
      .map((day) => WEEKDAY_OPTIONS.find((item) => item.value === day)?.[zh ? "zh" : "en"] ?? String(day))
      .join(zh ? "、" : ", ");
    return zh ? `每周${days} ${timeOfDay}` : `Every ${days} at ${timeOfDay}`;
  }
  if (schedule.frequency === "monthly") {
    const day = normalizeScheduleDayOfMonth(schedule.dayOfMonth);
    return zh ? `每月 ${day} 号 ${timeOfDay}` : `Monthly on day ${day} at ${timeOfDay}`;
  }
  if (schedule.frequency === "daily" || schedule.timeOfDay) {
    return zh ? `每天 ${timeOfDay}` : `Daily at ${timeOfDay}`;
  }
  return formatScheduleInterval(schedule.intervalSeconds);
}

function formatBalanceNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatBalanceValue(item: ProviderBalanceResult["items"][number]): string {
  if (typeof item.remaining !== "number") return item.invalidMessage ?? "Unavailable";
  return `${formatBalanceNumber(item.remaining)}${item.unit ? ` ${item.unit}` : ""}`;
}

function formatBalanceDetail(item: ProviderBalanceResult["items"][number], language: Language): string {
  const detailParts: string[] = [];
  if (typeof item.total === "number") detailParts.push(`${language === "zh" ? "总额" : "Total"} ${formatBalanceNumber(item.total)}`);
  if (typeof item.used === "number") detailParts.push(`${language === "zh" ? "已用" : "Used"} ${formatBalanceNumber(item.used)}`);
  if (item.invalidMessage) detailParts.push(item.invalidMessage);
  return detailParts.join(" · ");
}

function agentTestEventLabel(type: AgentTestTranscriptItem["type"]): string {
  if (type === "user") return "You";
  if (type === "assistant" || type === "assistant_delta") return "Agent";
  if (type === "tool") return "Tool";
  if (type === "warning") return "warning";
  if (type === "stderr") return "stderr";
  if (type === "error") return "error";
  return "system";
}

function activeChatFrom(snapshot: AppSnapshot): ChatSession | undefined {
  return snapshot.chats.find((chat) => chat.id === snapshot.activeChatId) ?? snapshot.chats[0];
}

function activeTaskFrom(snapshot: AppSnapshot): TaskRun | undefined {
  return snapshot.tasks.find((task) => task.id === snapshot.activeTaskId) ?? snapshot.tasks[0];
}

function activeTeamFrom(snapshot: AppSnapshot): AgentTeam | undefined {
  return snapshot.teams.find((team) => team.id === snapshot.activeTeamId) ?? snapshot.teams[0];
}

function activeTeamRunFrom(snapshot: AppSnapshot, teamId: string | undefined): TeamRun | undefined {
  const run = snapshot.teamRuns.find((item) => item.id === snapshot.activeTeamRunId);
  if (run && (!teamId || run.teamId === teamId)) return run;
  return snapshot.teamRuns.find((item) => !teamId || item.teamId === teamId);
}

export function workflowStatusForTeamMember(run: TeamRun | undefined, teamMemberId: string): AgentWorkflowNodeStatus {
  const workflowNode = run?.workflow?.nodes.find((node) => node.teamMemberId === teamMemberId);
  if (workflowNode) return workflowNode.status;
  const step = run?.steps.find((item) => item.teamMemberId === teamMemberId);
  return step?.status ?? "idle";
}

function workflowStatusClass(status: AgentWorkflowNodeStatus): string {
  return status === "idle" ? "" : `is-${status}`;
}

function workflowTraceNodesForRun(run: TeamRun): AgentWorkflowNode[] {
  const workflowNodes = run.workflow?.nodes.filter((node) => node.kind === "agent" || node.kind === "synthesis") ?? [];
  if (workflowNodes.length > 0) return workflowNodes;
  return run.steps.map((step): AgentWorkflowNode => ({
    id: step.id,
    kind: "agent",
    label: step.roleName,
    status: step.status,
    teamMemberId: step.teamMemberId,
    stepId: step.id,
  }));
}

export function reorderTeamMembers(
  members: AgentTeamMember[],
  draggedMemberId: string,
  targetMemberId: string | undefined,
): AgentTeamMember[] {
  if (draggedMemberId === targetMemberId) return members;
  const draggedIndex = members.findIndex((member) => member.id === draggedMemberId);
  if (draggedIndex < 0) return members;

  const draggedMember = members[draggedIndex];
  if (!draggedMember) return members;
  if (!targetMemberId) {
    const withoutDragged = members.filter((member) => member.id !== draggedMemberId);
    return [...withoutDragged, draggedMember];
  }

  const targetIndex = members.findIndex((member) => member.id === targetMemberId);
  if (targetIndex < 0) return members;
  const next = [...members];
  next[draggedIndex] = members[targetIndex]!;
  next[targetIndex] = draggedMember;
  return next;
}

function draftWorkflowMembers(mode: AgentTeamMode, configuredAgents: ConfiguredAgent[]): AgentTeamMember[] {
  const configuredAgentId = defaultConfiguredAgentId(configuredAgents);
  const templates: Array<[string, string]> =
    mode === "parallel"
      ? [
          ["Research", "Inspect the target and collect relevant facts, files, and constraints."],
          ["Risk Review", "Review correctness, security, edge cases, and operational risks."],
          ["Verification", "Design or run verification steps and call out missing coverage."],
        ]
      : mode === "supervisor"
        ? [
            ["Lead", "Plan the work, assign focus areas, and reconcile the final answer."],
            ["Implementation Review", "Work from the lead plan and inspect implementation details."],
            ["Test Review", "Work from the lead plan and inspect verification gaps."],
          ]
        : [
            ["Planner", "Break down the target and produce a concise execution plan."],
            ["Worker", "Execute the plan and produce concrete findings or changes."],
            ["Reviewer", "Review the previous artifact and identify risks, gaps, and next steps."],
          ];

  return templates.map(([roleName, prompt], index) => ({
    id: `draft-${Date.now()}-${index}`,
    roleName,
    prompt,
    configuredAgentId,
  }));
}

function taskStatusCount(tasks: TaskRun[], status: TaskStatusFilterValue): number {
  if (status === "all") return tasks.length;
  return tasks.filter((task) => task.progress === status).length;
}

function taskProgressLabel(progress: TaskProgress): string {
  return TASK_STATUS_FILTERS.find((item) => item.id === progress)?.label ?? progress;
}

export function slashCommandSuggestionsFor(value: string, agentId: AgentId): SlashCommandSuggestion[] {
  const input = value.trimStart();
  if (!input.startsWith("/") || input.includes("\n")) return [];
  if (/\s/.test(input)) return [];
  const query = input.toLowerCase();
  return SLASH_COMMANDS.filter((item) => {
    if (item.agentIds && !item.agentIds.includes(agentId)) return false;
    return item.command.toLowerCase().startsWith(query);
  });
}

export function shouldSendComposerKey(event: ComposerKeyState): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}

export function SlashCommandSuggestions({
  suggestions,
  activeIndex,
  onSelect,
}: {
  suggestions: SlashCommandSuggestion[];
  activeIndex: number;
  onSelect: (suggestion: SlashCommandSuggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="slash-command-menu" role="listbox" aria-label="Slash commands">
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.command}
          type="button"
          className={`slash-command-option ${index === activeIndex ? "is-active" : ""}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
          role="option"
          aria-selected={index === activeIndex}
        >
          <span>{suggestion.command}</span>
          <small>{suggestion.description}</small>
        </button>
      ))}
    </div>
  );
}

export function TaskStatusFilter({
  tasks,
  value,
  onChange,
}: {
  tasks: TaskRun[];
  value: TaskStatusFilterValue;
  onChange: (value: TaskStatusFilterValue) => void;
}) {
  return (
    <div className="task-progress-filter" aria-label="Task progress">
      {TASK_STATUS_FILTERS.map((filter) => {
        const count = taskStatusCount(tasks, filter.id);
        return (
          <button
            key={filter.id}
            className={`task-progress-option ${value === filter.id ? "is-active" : ""}`}
            onClick={() => onChange(filter.id)}
          >
            <span>{filter.label}</span>
            <strong>{count}</strong>
          </button>
        );
      })}
    </div>
  );
}

function hasAgentConversationMessages(messages: ChatSession["messages"]): boolean {
  return messages.some((message) => !message.local);
}

export function chatConfigLocked(chat: ChatSession): boolean {
  return chat.running || Boolean(chat.sessionId) || hasAgentConversationMessages(chat.messages);
}

function uniqueId(base: string, existingIds: string[]): string {
  const normalized = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "channel";
  if (!existingIds.includes(normalized)) return normalized;
  let suffix = 2;
  while (existingIds.includes(`${normalized}-${suffix}`)) suffix += 1;
  return `${normalized}-${suffix}`;
}

function createChannel(agentId: AgentId, existingIds: string[]): AgentChannel {
  const id = uniqueId(`${agentId}-config`, existingIds);
  return {
    id,
    agentId,
    label: agentId === "codex" ? "New Codex Config" : agentId === "claude" ? "New Claude Config" : "New API Config",
    models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
  };
}

export function resolveConfiguredAgentChannel(agent: ConfiguredAgent | undefined, channels: AgentChannel[]): AgentChannel | undefined {
  if (!agent) return undefined;
  return channels.find((channel) => channel.id === agent.channelId) ?? channels.find((channel) => channel.agentId === agent.runtimeAgentId) ?? channels[0];
}

function configuredAgentById(configuredAgentId: string | undefined, configuredAgents: ConfiguredAgent[]): ConfiguredAgent | undefined {
  return configuredAgents.find((agent) => agent.id === configuredAgentId) ?? configuredAgents[0];
}

function defaultConfiguredAgentId(configuredAgents: ConfiguredAgent[]): string {
  return configuredAgents[0]?.id ?? "";
}

export function resolveFindSkillConfiguredAgentId(configuredAgentId: string | undefined, configuredAgents: ConfiguredAgent[]): string {
  if (configuredAgentId && configuredAgents.some((agent) => agent.id === configuredAgentId)) return configuredAgentId;
  return defaultConfiguredAgentId(configuredAgents);
}

function configuredAgentModel(
  agent: ConfiguredAgent | undefined,
  channel: AgentChannel | undefined,
  modelId?: string,
): AgentModelOption | undefined {
  if (!agent || !channel) return undefined;
  const selectedModelId = modelId || agent.modelId;
  return channel.models.find((model) => model.id === selectedModelId) ?? channel.models.find((model) => model.id === DEFAULT_MODEL_ID) ?? channel.models[0];
}

function configuredAgentRuntimeId(agent: ConfiguredAgent | undefined, channel: AgentChannel | undefined): AgentId {
  return channel?.agentId ?? agent?.runtimeAgentId ?? "codex";
}

function configuredAgentModelId(configuredAgentId: string | undefined, modelId: string | undefined, configuredAgents: ConfiguredAgent[], channels: AgentChannel[]): string {
  const agent = configuredAgentById(configuredAgentId, configuredAgents);
  const channel = resolveConfiguredAgentChannel(agent, channels);
  return configuredAgentModel(agent, channel, modelId)?.id ?? DEFAULT_MODEL_ID;
}

export function applyProviderPresetToConfiguredAgent(agent: ConfiguredAgent, channel: AgentChannel, preset: AgentProviderPreset): ConfiguredAgent {
  return {
    ...agent,
    channelId: channel.id,
    runtimeAgentId: preset.runtimeAgentId,
    modelId: DEFAULT_MODEL_ID,
  };
}

export function applyProviderPresetToChannel(channel: AgentChannel, preset: AgentProviderPreset, apiKey = ""): AgentChannel {
  const presetModelIds = new Set(preset.models.map((model) => model.id));
  const customModels = channel.models.filter((model) => model.id !== DEFAULT_MODEL_ID && !presetModelIds.has(model.id));
  const next: AgentChannel = {
    ...channel,
    agentId: preset.runtimeAgentId,
    models: [...preset.models.map((model) => ({ ...model })), ...customModels.map((model) => ({ ...model }))],
  };
  delete next.providerName;
  delete next.modelProvider;
  delete next.baseUrl;
  delete next.wireApi;
  delete next.modelReasoningEffort;
  delete next.modelCatalogJson;
  delete next.httpHeaders;
  if (preset.providerName) next.providerName = preset.providerName;
  if (preset.modelProvider) next.modelProvider = preset.modelProvider;
  if (preset.baseUrl) next.baseUrl = preset.baseUrl;
  if (preset.wireApi) next.wireApi = preset.wireApi;
  if (preset.modelReasoningEffort) next.modelReasoningEffort = preset.modelReasoningEffort;
  if (preset.extraHeaders) next.httpHeaders = { ...preset.extraHeaders };
  const normalizedApiKey = apiKey.trim();
  if (preset.usesApiKey && normalizedApiKey) {
    const headerName = preset.apiKeyHeaderName ?? "Authorization";
    const prefix = preset.apiKeyPrefix ?? "Bearer ";
    next.httpHeaders = {
      ...(next.httpHeaders ?? {}),
      [headerName]: `${prefix}${normalizedApiKey}`,
    };
  }
  return next;
}

function headerValue(headers: Record<string, string> | undefined, headerName: string): string {
  if (!headers) return "";
  const target = headerName.toLowerCase();
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === target);
  return match?.[1] ?? "";
}

function apiKeyFromChannelHeaders(channel: AgentChannel | undefined, preset: AgentProviderPreset | undefined): string {
  if (!channel || !preset?.usesApiKey) return "";
  const rawValue = headerValue(channel.httpHeaders, preset.apiKeyHeaderName ?? "Authorization").trim();
  const prefix = preset.apiKeyPrefix ?? "Bearer ";
  if (!rawValue || !prefix) return rawValue;
  return rawValue.toLowerCase().startsWith(prefix.toLowerCase()) ? rawValue.slice(prefix.length).trim() : rawValue;
}

function providerKeyValue(providerKeys: Record<string, string>, preset: AgentProviderPreset | undefined, channel: AgentChannel | undefined): string {
  if (!preset) return "";
  return apiKeyFromChannelHeaders(channel, preset) || providerKeys[preset.id] || "";
}

export function rememberProviderKeyFromChannel(
  providerKeys: Record<string, string>,
  preset: AgentProviderPreset | undefined,
  channel: AgentChannel | undefined,
): Record<string, string> {
  if (!preset?.usesApiKey) return providerKeys;
  const apiKey = apiKeyFromChannelHeaders(channel, preset);
  if (!apiKey || providerKeys[preset.id] === apiKey) return providerKeys;
  return { ...providerKeys, [preset.id]: apiKey };
}

export function applyProviderModelIdToAgentConfig(
  agent: ConfiguredAgent,
  channel: AgentChannel,
  rawModelId: string,
): { agent: ConfiguredAgent; channel: AgentChannel } {
  const modelId = rawModelId.trim();
  if (!modelId) {
    return {
      agent: { ...agent, modelId: DEFAULT_MODEL_ID },
      channel,
    };
  }

  const models = channel.models.some((model) => model.id === modelId)
    ? channel.models.map((model) => (model.id === modelId ? { ...model, label: model.label || modelId } : model))
    : [...channel.models, { id: modelId, label: modelId }];

  return {
    agent: { ...agent, modelId },
    channel: { ...channel, models },
  };
}

function createConfiguredAgent(channels: AgentChannel[], existingIds: string[]): ConfiguredAgent {
  const runtimeAgentId: AgentId = "codex";
  const id = uniqueId("agent", existingIds);
  const channelId = defaultChannelForAgent(runtimeAgentId, channels);
  return {
    id,
    name: "New Agent",
    description: "",
    runtimeAgentId,
    channelId,
    modelId: DEFAULT_MODEL_ID,
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function applySkillTemplate(agent: ConfiguredAgent, template: SkillTemplate): ConfiguredAgent {
  return {
    ...agent,
    name: skillDisplayName(template),
    description: skillDisplayDescription(template),
    tags: [...template.tags],
  };
}

function createModel(existingModels: AgentModelOption[]): AgentModelOption {
  const id = uniqueId("model", existingModels.map((model) => model.id));
  return { id, label: id };
}

function headersToText(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function headersFromText(value: string): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const headerValue = trimmed.slice(separator + 1).trim();
    if (key) headers[key] = headerValue;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function withOptionalString(channel: AgentChannel, key: keyof AgentChannel, value: string): AgentChannel {
  const next: AgentChannel = { ...channel, models: channel.models.map((model) => ({ ...model })) };
  const trimmed = value.trim();
  if (trimmed) {
    (next as unknown as Record<string, unknown>)[key] = trimmed;
  } else {
    delete (next as unknown as Record<string, unknown>)[key];
  }
  return next;
}

function withOptionalHeaders(channel: AgentChannel, value: string): AgentChannel {
  const next: AgentChannel = { ...channel, models: channel.models.map((model) => ({ ...model })) };
  const headers = headersFromText(value);
  if (headers) next.httpHeaders = headers;
  else delete (next as unknown as Record<string, unknown>).httpHeaders;
  return next;
}

function updatePluginAt(channel: AgentChannel, index: number, updater: (plugin: AgentPluginConfig) => AgentPluginConfig): AgentChannel {
  const plugins = [...(channel.plugins ?? [])];
  const current = plugins[index];
  if (!current) return channel;
  plugins[index] = updater(current);
  return { ...channel, plugins };
}

function removePluginAt(channel: AgentChannel, index: number): AgentChannel {
  const plugins = (channel.plugins ?? []).filter((_, itemIndex) => itemIndex !== index);
  const next = { ...channel };
  if (plugins.length > 0) next.plugins = plugins;
  else delete next.plugins;
  return next;
}

function addPluginToChannel(channel: AgentChannel, pluginId: string): AgentChannel {
  const id = pluginId.trim();
  if (!id) return channel;
  const plugins = [...(channel.plugins ?? [])];
  const existingIndex = plugins.findIndex((plugin) => plugin.id === id);
  if (existingIndex >= 0) {
    const existingPlugin = plugins[existingIndex];
    if (!existingPlugin) return channel;
    plugins[existingIndex] = { ...existingPlugin, enabled: true };
    return { ...channel, plugins };
  }
  return { ...channel, plugins: [...plugins, { id, enabled: true }] };
}

function initialWorkflowMessages(): WorkflowGrillMessage[] {
  return [];
}

function createWorkflowId(): string {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `wf_${randomPart}`;
}

export function workflowAssistantDisplayContent(content: string): string {
  const graph = parseWorkflowGraphUpsert(content);
  return graph ? `Workflow graph ready: ${graph.title}` : content;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function taskArtifact(task: TaskRun): string {
  const assistantMessage = [...task.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
  if (assistantMessage) return assistantMessage.content.trim();
  const errorMessage = [...task.messages].reverse().find((message) => message.role === "error" && message.content.trim());
  if (errorMessage) return errorMessage.content.trim();
  return `${task.title} completed without assistant output.`;
}

function chatEventDisplayContent(event: ChatEvent): string {
  if (event.type === "tool_call") {
    const name = event.name ?? "tool";
    return event.content ? `→ ${name}\n${event.content}` : `→ ${name}`;
  }
  if (event.type === "tool_result") {
    const name = event.name ?? "tool";
    return event.content ? `✓ ${name}\n${event.content}` : `✓ ${name}`;
  }
  if (event.type === "system") {
    return event.content ? `system\n${event.content}` : "system";
  }
  if (event.type === "handoff") {
    const from = event.fromAgentId ? agentLabel(event.fromAgentId) : "Agent";
    const to = event.toAgentId ? agentLabel(event.toAgentId) : "Agent";
    return event.content ? `${from} → ${to}\n${event.content}` : `${from} → ${to}`;
  }
  if (event.type === "error") {
    return event.content ? `error\n${event.content}` : "error";
  }
  return event.content;
}

function compactWorkflowActivity(content: string, limit = 140): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function workflowToolResultDisplayContent(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^Chunk ID:/i.test(trimmed)) return false;
    if (/^Wall time:/i.test(trimmed)) return false;
    if (/^Process exited with code\b/i.test(trimmed)) return false;
    if (/^Original token count:/i.test(trimmed)) return false;
    if (/^Output:$/i.test(trimmed)) return false;
    return true;
  });
  return filtered.join("\n").trim() || content;
}

export function workflowTaskLiveDetail(task: TaskRun): string {
  const latestEvent = task.messages
    .flatMap((message) => message.events ?? [])
    .sort((left, right) => left.timestamp - right.timestamp)
    .at(-1);

  if (latestEvent) {
    const name = latestEvent.name ?? "tool";
    const eventContent = latestEvent.type === "tool_result" ? workflowToolResultDisplayContent(latestEvent.content) : latestEvent.content;
    const content = compactWorkflowActivity(eventContent);
    if (latestEvent.type === "tool_call") return content ? `Tool ${name}: ${content}` : `Tool ${name} started`;
    if (latestEvent.type === "tool_result") return content ? `Tool ${name} done: ${content}` : `Tool ${name} done`;
    if (latestEvent.type === "system") return content ? `System: ${content}` : "System event";
    if (latestEvent.type === "handoff") return content ? `Handoff: ${content}` : "Handoff received";
    if (latestEvent.type === "error") return content ? `Error: ${content}` : "Agent error";
    return content || "Agent event";
  }

  const latestAssistant = [...task.messages].reverse().find((message) => message.role === "assistant" && message.content.trim());
  if (latestAssistant) return `Output: ${compactWorkflowActivity(latestAssistant.content)}`;
  if (task.sessionId) return `Session ${task.sessionId}`;
  return "Starting agent...";
}

interface WorkflowDraftPersistInput {
  workflowId: string;
  activeWorkflowId?: string | undefined;
  workflowIds: string[];
  objective: string;
  messages: WorkflowGrillMessage[];
  graphReady: boolean;
  reply: string;
  error: string | undefined;
  runProgress: WorkflowRunProgressItem[];
  runContextDocument: string;
  contextDocument: string;
  finalReport: string;
  agentSessionId: string | undefined;
}

export function workflowDraftShouldPersist(input: WorkflowDraftPersistInput): boolean {
  const hasContent = Boolean(
    input.objective.trim() ||
      input.messages.length > 0 ||
      input.graphReady ||
      input.reply.trim() ||
      input.error ||
      input.runProgress.length > 0 ||
      input.runContextDocument.trim() ||
      input.contextDocument.trim() ||
      input.finalReport.trim() ||
      input.agentSessionId,
  );
  return hasContent || input.activeWorkflowId === input.workflowId || input.workflowIds.includes(input.workflowId);
}

interface BalanceRefreshInput {
  channels: AgentChannel[];
  configDirty: boolean;
  refreshInFlight: boolean;
  lastRefreshAt: number | undefined;
  now: number;
  intervalMs: number;
}

export function shouldRefreshBalances(input: BalanceRefreshInput): boolean {
  if (input.channels.length === 0) return false;
  if (input.configDirty) return false;
  if (input.refreshInFlight) return false;
  return input.lastRefreshAt === undefined || input.now - input.lastRefreshAt >= input.intervalMs;
}

function extractWorkflowSection(content: string, headings: string[]): string | undefined {
  const headingSet = new Set(headings.map((heading) => heading.toLowerCase()));
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let startIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^#{1,6}\s+(.+?)\s*$/);
    if (!match) continue;
    const heading = match[1]!.trim().toLowerCase();
    if (headingSet.has(heading)) {
      startIndex = index + 1;
      break;
    }
  }
  if (startIndex < 0) return undefined;
  const sectionLines: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^#{1,6}\s+/.test(line)) break;
    sectionLines.push(line);
  }
  const section = sectionLines.join("\n").trim();
  return section || undefined;
}

function extractWorkflowHandoffSection(content: string): string | undefined {
  return extractWorkflowSection(content, ["handoff", "summary", "key context", "context"]);
}

function truncateWorkflowContext(content: string, limit = 2400): string {
  const normalized = content.replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}\n\n[truncated]`;
}

function workflowStringField(content: string, field: string): string | undefined {
  const match = new RegExp(`["']?${field}["']?\\s*:\\s*("([^"\\\\]|\\\\.)*"|'([^'\\\\]|\\\\.)*'|\`([^\`\\\\]|\\\\.)*\`)`, "s").exec(content);
  if (!match) return undefined;
  const raw = match[1]!;
  const body = raw.slice(1, -1);
  return body
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, `"`)
    .replace(/\\'/g, `'`)
    .replace(/\\`/g, "`")
    .replace(/\\\\/g, "\\")
    .trim();
}

export interface WorkflowJudgeResult {
  complete: boolean;
  reason: string;
  retryPrompt: string;
}

export function workflowArtifactSummary(artifact: string): string {
  const report = extractWorkflowSection(artifact, ["work completion report", "completion report"]);
  const handoff = extractWorkflowSection(artifact, ["handoff"]);
  if (report && handoff) {
    return truncateWorkflowContext(["### Work Completion Report", report, "", "### Handoff", handoff].join("\n"));
  }
  return truncateWorkflowContext(report ?? extractWorkflowHandoffSection(artifact) ?? artifact);
}

export function workflowContextDocumentFromArtifacts(artifacts: Array<{ nodeId: string; title: string; summary: string }>): string {
  if (artifacts.length === 0) return "";
  return [
    "# Workflow Context",
    "",
    ...artifacts.flatMap((artifact) => [`## ${artifact.title} (${artifact.nodeId})`, artifact.summary.trim() || "No handoff summary produced.", ""]),
  ]
    .join("\n")
    .trim();
}

export interface WorkflowOutputDocument {
  path: string;
  title: string;
}

export interface WorkflowStoragePlan {
  memoryPath: string;
  outputDir: string;
}

function workflowStoragePlanFor(workflowId: string): WorkflowStoragePlan {
  const safeWorkflowId = workflowId.replace(/[^a-zA-Z0-9_-]/g, "_") || "workflow";
  const baseDir = `${WORKFLOW_STORAGE_ROOT}/${safeWorkflowId}`;
  return {
    memoryPath: `${baseDir}/memory.md`,
    outputDir: `${baseDir}/outputs`,
  };
}

export function workflowStoragePlanDocument(plan: WorkflowStoragePlan): string {
  return [
    "# Workflow Storage Plan",
    "",
    `- Shared memory file: ${plan.memoryPath}`,
    `- Output document directory: ${plan.outputDir}`,
    "",
    "All agent nodes should treat the Workflow Context in the app as the source of shared memory.",
    "If an agent creates user-facing documents, write them under the output document directory and report the exact relative file path.",
  ].join("\n");
}

function cleanWorkflowOutputPath(value: string): string {
  return value.replace(/[),.;:!?]+$/g, "").replace(/^["'`(]+|["'`]+$/g, "");
}

function isWorkflowOutputDocumentMention(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 80), index).toLowerCase();
  return /产物|产出|输出|生成|创建|写入|更新|保存|文档|报告|deliverable|output|artifact|created|generated|wrote|written|saved|document|report/.test(prefix);
}

export function extractWorkflowOutputDocuments(...sources: string[]): WorkflowOutputDocument[] {
  const docs = new Map<string, WorkflowOutputDocument>();
  const extensionPattern = WORKFLOW_OUTPUT_DOCUMENT_EXTENSIONS;
  const markdownLinkPattern = new RegExp(String.raw`\[[^\]]+\]\(([^)]+\.(?:${extensionPattern})(?:#[^)]+)?)\)`, "gi");
  const pathPattern = new RegExp(String.raw`(?:^|[\s"'` + "`" + String.raw`(])((?:~\/|\/|\.{1,2}\/|[\w.-]+\/)[^\s"'` + "`" + String.raw`()<>]*\.(?:${extensionPattern})(?:#[^\s"'` + "`" + String.raw`()<>]*)?)`, "gi");

  for (const source of sources) {
    const text = source || "";
    const matches: Array<{ index: number; path: string }> = [];
    for (const pattern of [markdownLinkPattern, pathPattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        const rawPath = cleanWorkflowOutputPath(match[1] ?? "");
        if (!rawPath || rawPath.startsWith("http://") || rawPath.startsWith("https://")) continue;
        const index = match.index + match[0].indexOf(match[1] ?? "");
        if (!isWorkflowOutputDocumentMention(text, index)) continue;
        matches.push({ index, path: rawPath.split("#")[0] ?? rawPath });
      }
    }
    for (const item of matches.sort((left, right) => left.index - right.index)) {
      if (docs.has(item.path)) continue;
      docs.set(item.path, {
        path: item.path,
        title: item.path.split(/[\\/]/).filter(Boolean).at(-1) ?? item.path,
      });
    }
  }
  return [...docs.values()];
}

export function extractWorkflowOutputDocumentsForPlan(plan: WorkflowStoragePlan, ...sources: string[]): WorkflowOutputDocument[] {
  const outputPrefix = `${plan.outputDir.replace(/\/+$/g, "")}/`;
  return extractWorkflowOutputDocuments(...sources).filter((document) => document.path.startsWith(outputPrefix));
}

export function workflowNodeRunPrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  upstreamArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument = "",
  storagePlan?: WorkflowStoragePlan,
): string {
  const upstreamSection =
    upstreamArtifacts.length > 0
      ? upstreamArtifacts
          .map((item) => [`## Upstream: ${item.node.title} (${item.node.id})`, item.artifact].join("\n"))
          .join("\n\n")
      : "No upstream agent artifacts.";
  const contextSection = contextDocument.trim() || "No workflow context document yet.";

  return [
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    `Node: ${node.title} (${node.id})`,
    "",
    "Follow this node instruction:",
    node.prompt || "Execute this workflow node.",
    "",
    "Use this workflow context document first:",
    contextSection,
    "",
    ...(storagePlan
      ? [
          "Workflow storage plan:",
          `- Shared memory file: ${storagePlan.memoryPath}`,
          `- Output document directory: ${storagePlan.outputDir}`,
          "If you create a user-facing document, write it under the output document directory and include the exact relative path in your Work Completion Report.",
          "",
        ]
      : []),
    "Use these upstream artifacts as context:",
    upstreamSection,
    "",
    "Before you finish, write a Work Completion Report.",
    "The report must include what you did, concrete evidence or produced artifacts, remaining gaps or risks, and what downstream nodes need next.",
    "This report will be appended to the shared Workflow Context document, so make it useful as one-way handoff context.",
    "",
    "When you finish, include a concise Handoff section.",
    "The Handoff section should capture key findings, decisions, produced artifacts, risks, and what downstream nodes need next.",
  ].join("\n");
}

export function workflowJudgePrompt(
  graph: WorkflowGraph,
  node: WorkflowGraphNode,
  artifact: string,
  contextDocument: string,
  attempt: number,
  maxAttempts: number,
): string {
  return [
    "You are the workflow judge for one completed agent node.",
    `Evaluate attempt ${attempt} of ${maxAttempts}.`,
    "",
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    `Node: ${node.title} (${node.id})`,
    "",
    "Original node instruction:",
    node.prompt || "Execute this workflow node.",
    "",
    "Shared Workflow Context document:",
    contextDocument.trim() || "No workflow context document yet.",
    "",
    "Node output to judge:",
    artifact,
    "",
    "Decide whether this node is complete enough for downstream workflow execution.",
    "Do not perform the work yourself. Judge only the output against the objective, node instruction, evidence, and handoff quality.",
    "",
    "Return only this TypeScript-style call:",
    "workflowEvaluation.submit({",
    "  complete: true,",
    '  reason: "short reason",',
    '  retryPrompt: ""',
    "});",
    "",
    "If complete is false, retryPrompt must be a concrete instruction for rerunning this same node.",
  ].join("\n");
}

export function workflowFinalReviewPrompt(
  graph: WorkflowGraph,
  nodeArtifacts: Array<{ node: WorkflowGraphNode; artifact: string }>,
  contextDocument: string,
  progress: WorkflowRunProgressItem[],
  storagePlan?: WorkflowStoragePlan,
): string {
  const artifactSection =
    nodeArtifacts.length > 0
      ? nodeArtifacts
          .map((item) => [`## Node: ${item.node.title} (${item.node.id})`, item.artifact.trim() || "No output captured."].join("\n"))
          .join("\n\n")
      : "No node outputs captured.";
  const progressSection =
    progress.length > 0
      ? progress.map((item) => `- ${item.title} (${item.nodeId}): ${item.status}${item.detail ? ` - ${item.detail}` : ""}`).join("\n")
      : "No run progress captured.";

  return [
    "You are the main workflow agent. All workflow nodes have finished and passed evaluation.",
    "Continue the same workflow chat with the user: summarize the run result, explain what the worker agents produced, and stay ready for follow-up questions.",
    "",
    `Workflow: ${graph.title}`,
    `Objective: ${graph.objective}`,
    "",
    "Shared Workflow Context document:",
    contextDocument.trim() || "No workflow context document yet.",
    "",
    ...(storagePlan
      ? [
          "Workflow storage plan:",
          `- Shared memory file: ${storagePlan.memoryPath}`,
          `- Output document directory: ${storagePlan.outputDir}`,
          "Only list output documents that are under the output document directory.",
          "",
        ]
      : []),
    "Run progress:",
    progressSection,
    "",
    "Node outputs:",
    artifactSection,
    "",
    "Review the full workflow once for the user. Check whether the node outputs collectively satisfy the objective, whether evidence is concrete, and what risks or gaps remain.",
    "Do not rerun the workflow nodes. Do not invent work that is not supported by the node outputs or context.",
    "",
    "Write a concise Markdown report for the user. It must start with:",
    "## Final User Report",
    "",
    "Include: outcome, important evidence or artifacts, output document paths under the planned output directory, remaining risks/gaps, and concrete next steps.",
  ].join("\n");
}

export function parseWorkflowJudgeResult(content: string): WorkflowJudgeResult | undefined {
  const completeMatch = /["']?complete["']?\s*:\s*(true|false)/i.exec(content);
  if (!completeMatch) return undefined;
  const complete = completeMatch[1]!.toLowerCase() === "true";
  return {
    complete,
    reason: workflowStringField(content, "reason") || (complete ? "Judge approved the node output." : "Judge requested a retry."),
    retryPrompt: workflowStringField(content, "retryPrompt") || "",
  };
}

export function workflowRunProgressSummary(progress: WorkflowRunProgressItem[]): string {
  if (progress.length === 0) return "Not started";
  const completed = progress.filter((item) => item.status === "completed").length;
  const running = progress.filter((item) => item.status === "running").length;
  const failed = progress.filter((item) => item.status === "failed").length;
  const queued = progress.filter((item) => item.status === "queued").length;
  const started = Math.min(progress.length, completed + running + failed);
  const headline = failed > 0 ? `Failed ${started}/${progress.length}` : completed === progress.length ? `Completed ${progress.length}/${progress.length}` : `Running ${started}/${progress.length}`;
  const details = [
    completed > 0 ? `${completed} done` : "",
    failed > 0 ? `${failed} failed` : "",
    queued > 0 ? `${queued} queued` : "",
  ].filter(Boolean);
  return details.length > 0 ? `${headline} · ${details.join(" · ")}` : headline;
}

export function workflowProgressAfterFailure(progress: WorkflowRunProgressItem[], errorMessage: string): WorkflowRunProgressItem[] {
  return progress.map((item) => {
    if (item.status !== "running" && item.status !== "queued") return item;
    const next: WorkflowRunProgressItem = {
      ...item,
      status: "failed",
      detail: errorMessage,
    };
    delete next.taskId;
    return next;
  });
}

function workflowRunStatusLabel(status: WorkflowRunNodeStatus): string {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "queued";
}

interface WorkflowCanvasNodeLayout {
  node: WorkflowGraphNode;
  x: number;
  y: number;
  width: number;
  height: number;
  layerIndex: number;
  layerSize: number;
}

interface WorkflowCanvasEdgeLayout {
  edge: WorkflowGraph["edges"][number];
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface WorkflowCanvasLayout {
  nodes: WorkflowCanvasNodeLayout[];
  edges: WorkflowCanvasEdgeLayout[];
  width: number;
  height: number;
}

type WorkflowCanvasLayoutVariant = "preview" | "expanded";

const WORKFLOW_CANVAS_DIMENSIONS: Record<
  WorkflowCanvasLayoutVariant,
  {
    nodeWidth: number;
    nodeHeight: number;
    terminalWidth: number;
    terminalHeight: number;
    layerGap: number;
    nodeGap: number;
    rowGap: number;
    padding: number;
    maxColumns: number;
  }
> = {
  preview: {
    nodeWidth: 192,
    nodeHeight: 72,
    terminalWidth: 112,
    terminalHeight: 48,
    layerGap: 46,
    nodeGap: 16,
    rowGap: 78,
    padding: 28,
    maxColumns: 4,
  },
  expanded: {
    nodeWidth: 188,
    nodeHeight: 112,
    terminalWidth: 112,
    terminalHeight: 64,
    layerGap: 120,
    nodeGap: 30,
    rowGap: 128,
    padding: 88,
    maxColumns: 5,
  },
};

export function workflowCanvasLayout(graph: WorkflowGraph, variant: WorkflowCanvasLayoutVariant = "preview"): WorkflowCanvasLayout {
  const dimensions = WORKFLOW_CANVAS_DIMENSIONS[variant];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const layers = workflowGraphDisplayLayers(graph)
    .map((layer) => layer.map((nodeId) => nodeById.get(nodeId)).filter((node): node is WorkflowGraphNode => Boolean(node)))
    .filter((layer) => layer.length > 0);
  // Wrap the layer sequence into rows so long flows stay close to the visible
  // area instead of stretching into one very wide line. Each DAG layer keeps its
  // own column; rows fill left-to-right and the count is balanced so the board
  // ends up roughly square.
  const layerCount = layers.length;
  const rowCount = Math.max(1, Math.ceil(layerCount / dimensions.maxColumns));
  const columnsPerRow = Math.max(1, Math.ceil(layerCount / rowCount));
  const layerHeight = (layer: WorkflowGraphNode[]): number => {
    const heights = layer.map((node) => (node.kind === "agent" ? dimensions.nodeHeight : dimensions.terminalHeight));
    return heights.reduce((sum, height) => sum + height, 0) + Math.max(0, layer.length - 1) * dimensions.nodeGap;
  };

  const rows: WorkflowGraphNode[][][] = [];
  for (let index = 0; index < layerCount; index += columnsPerRow) {
    rows.push(layers.slice(index, index + columnsPerRow));
  }

  const positionedNodes = new Map<string, WorkflowCanvasNodeLayout>();
  let maxX = dimensions.padding;
  let maxY = dimensions.padding;
  let rowTop = dimensions.padding;

  rows.forEach((row, rowIndex) => {
    const rowHeight = Math.max(dimensions.nodeHeight, ...row.map(layerHeight));
    row.forEach((layer, columnIndex) => {
      const x = dimensions.padding + columnIndex * (dimensions.nodeWidth + dimensions.layerGap);
      let y = rowTop + Math.max(0, (rowHeight - layerHeight(layer)) / 2);
      layer.forEach((node) => {
        const width = node.kind === "agent" ? dimensions.nodeWidth : dimensions.terminalWidth;
        const height = node.kind === "agent" ? dimensions.nodeHeight : dimensions.terminalHeight;
        // Honor an explicit position (set by agents via MCP or by user drags);
        // fall back to the auto wrapping slot.
        const nodeX = node.position?.x ?? x;
        const nodeY = node.position?.y ?? y;
        positionedNodes.set(node.id, { node, x: nodeX, y: nodeY, width, height, layerIndex: rowIndex * columnsPerRow + columnIndex, layerSize: layer.length });
        maxX = Math.max(maxX, nodeX + width + dimensions.padding);
        maxY = Math.max(maxY, nodeY + height + dimensions.padding);
        y += height + dimensions.nodeGap;
      });
    });
    rowTop += rowHeight + dimensions.rowGap;
  });

  const edges = graph.edges
    .map((edge) => {
      const fromNode = positionedNodes.get(edge.fromNodeId);
      const toNode = positionedNodes.get(edge.toNodeId);
      if (!fromNode || !toNode) return undefined;
      return {
        edge,
        from: { x: fromNode.x + fromNode.width, y: fromNode.y + fromNode.height / 2 },
        to: { x: toNode.x, y: toNode.y + toNode.height / 2 },
      };
    })
    .filter((item): item is WorkflowCanvasEdgeLayout => Boolean(item));

  return {
    nodes: [...positionedNodes.values()],
    edges,
    width: Math.max(maxX, dimensions.padding * 2 + dimensions.nodeWidth),
    height: Math.max(maxY, dimensions.padding * 2 + dimensions.nodeHeight),
  };
}

export function App() {
  const initialWorkflowGraph = useMemo(() => createWorkflowGraphFromObjective(""), []);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(DEFAULT_SNAPSHOT);
  const [importedSkillTemplates, setImportedSkillTemplates] = useState<SkillTemplate[]>([]);
  const [prompt, setPrompt] = useState("");
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [teamPrompt, setTeamPrompt] = useState("");
  const [taskConfiguredAgentId, setTaskConfiguredAgentId] = useState("");
  const [taskModelId, setTaskModelId] = useState(DEFAULT_MODEL_ID);
  const [workflowId, setWorkflowId] = useState(() => createWorkflowId());
  const [workflowTitle, setWorkflowTitle] = useState("Untitled workflow");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft");
  const [workflowRevision, setWorkflowRevision] = useState(1);
  const [workflowConfiguredAgentId, setWorkflowConfiguredAgentId] = useState("");
  const [workflowModelId, setWorkflowModelId] = useState(DEFAULT_MODEL_ID);
  const [workflowObjective, setWorkflowObjective] = useState("");
  const [workflowGraph, setWorkflowGraph] = useState<WorkflowGraph>(initialWorkflowGraph);
  const [workflowGraphReady, setWorkflowGraphReady] = useState(false);
  const [workflowMessages, setWorkflowMessages] = useState<WorkflowGrillMessage[]>(() => initialWorkflowMessages());
  const [workflowReply, setWorkflowReply] = useState("");
  const [workflowError, setWorkflowError] = useState<string | undefined>();
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowRunProgress, setWorkflowRunProgress] = useState<WorkflowRunProgressItem[]>([]);
  const [workflowRunContextDocument, setWorkflowRunContextDocument] = useState("");
  const [workflowContextDocument, setWorkflowContextDocument] = useState("");
  const [workflowFinalReport, setWorkflowFinalReport] = useState("");
  const [workflowRunIds, setWorkflowRunIds] = useState<string[]>([]);
  const [workflowAgentSessionId, setWorkflowAgentSessionId] = useState<string | undefined>();
  const [workflowCreatedAt, setWorkflowCreatedAt] = useState(Date.now());
  const [scheduledWorkflowDraft, setScheduledWorkflowDraft] = useState<ScheduledWorkflowDraft>(() =>
    defaultScheduledWorkflowDraft(DEFAULT_SNAPSHOT.workflowStore.workflows, DEFAULT_SNAPSHOT.workflowStore.activeWorkflowId),
  );
  const [scheduledWorkflowMode, setScheduledWorkflowMode] = useState<"detail" | "create">("detail");
  const workflowRequestIdRef = useRef<string | undefined>(undefined);
  const workflowAssistantMessageIdRef = useRef<string | undefined>(undefined);
  const workflowStreamingStartedRef = useRef(false);
  const workflowAssistantContentRef = useRef("");
  const workflowDraftHydratedRef = useRef(false);
  const workflowDraftHydratingRef = useRef(false);
  const workflowDraftSaveTimerRef = useRef<number | undefined>(undefined);
  const snapshotRef = useRef(snapshot);
  const workflowRunningRef = useRef(workflowRunning);
  const workflowStoreIds = snapshot.workflowStore.workflows.map((workflow) => workflow.workflowId).join(":");
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatusFilterValue>("all");
  const [selectedTaskDetailId, setSelectedTaskDetailId] = useState<string | undefined>();
  const [activeFeature, setActiveFeature] = useState<ActiveFeature>("chat");
  const [configChannels, setConfigChannels] = useState<AgentChannel[]>([]);
  const [selectedConfigChannelId, setSelectedConfigChannelId] = useState("");
  const [selectedConfiguredAgentId, setSelectedConfiguredAgentId] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [configStatus, setConfigStatus] = useState("");
  const [codexPluginCatalog, setCodexPluginCatalog] = useState<CodexPluginCatalogItem[]>([]);
  const [pluginCatalogStatus, setPluginCatalogStatus] = useState("");
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme(window.localStorage));
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>(() => loadStoredProviderKeys(window.localStorage));
  const [language, setLanguage] = useState<Language>(() => loadStoredLanguage(window.localStorage));
  const [keepAwake, setKeepAwake] = useState(() => loadStoredKeepAwake(window.localStorage));
  const [agentTestResults, setAgentTestResults] = useState<Record<string, AgentTestUiState>>({});
  const [testingAgentId, setTestingAgentId] = useState<string | undefined>();
  const [agentTestTick, setAgentTestTick] = useState(0);
  const [balanceResults, setBalanceResults] = useState<Record<string, ProviderBalanceResult>>({});
  const [balanceLoadingChannelId, setBalanceLoadingChannelId] = useState<string | undefined>();
  const balanceRefreshInFlightRef = useRef(false);
  const lastBalanceRefreshAtRef = useRef<number | undefined>(undefined);
  const configChannelsRef = useRef<AgentChannel[]>([]);
  const configDirtyRef = useRef(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentContextMenu, setAgentContextMenu] = useState<{ agentId: string; x: number; y: number } | undefined>();
  const [chatContextMenu, setChatContextMenu] = useState<{ chatId: string; x: number; y: number } | undefined>();
  const [workflowContextMenu, setWorkflowContextMenu] = useState<{ workflowId: string; x: number; y: number } | undefined>();
  const [configContextMenu, setConfigContextMenu] = useState<{ channelId: string; x: number; y: number } | undefined>();
  const [workflowRenameDraft, setWorkflowRenameDraft] = useState<{ workflowId: string; title: string } | undefined>();
  const transcriptRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const gChordRef = useRef(0);

  configChannelsRef.current = configChannels;
  configDirtyRef.current = configDirty;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(KEEP_AWAKE_STORAGE_KEY, String(keepAwake));
    void window.multiAgentChat.setKeepAwake(keepAwake).catch((error) => {
      console.warn("Failed to update keep-awake state", error);
    });
  }, [keepAwake]);

  useEffect(() => {
    if (!testingAgentId) return undefined;
    const timer = window.setInterval(() => setAgentTestTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [testingAgentId]);

  useEffect(() => {
    return window.multiAgentChat.onAgentTestEvent((event) => {
      setAgentTestResults((current) => {
        const existing = current[event.agentId];
        if (!existing) return current;
        const transcriptItem: AgentTestTranscriptItem = {
          id: `${event.timestamp}:${existing.transcript.length}:${event.type}`,
          type: event.type,
          content: event.content,
          timestamp: event.timestamp,
        };
        return {
          ...current,
          [event.agentId]: {
            ...existing,
            phase: event.type === "phase" ? event.content : existing.phase,
            message: event.type === "phase" ? event.content : existing.message,
            transcript: [...existing.transcript, transcriptItem].slice(-80),
          },
        };
      });
    });
  }, []);

  useEffect(() => {
    if (snapshot.configuredAgents.length === 0) {
      setSelectedConfiguredAgentId("");
      return;
    }
    const firstAgent = snapshot.configuredAgents[0];
    if (firstAgent && !snapshot.configuredAgents.some((agent) => agent.id === selectedConfiguredAgentId)) {
      setSelectedConfiguredAgentId(firstAgent.id);
    }
  }, [snapshot.configuredAgents, selectedConfiguredAgentId]);

  useEffect(() => {
    if (!agentContextMenu && !chatContextMenu && !workflowContextMenu && !configContextMenu) return;
    const close = (): void => {
      setAgentContextMenu(undefined);
      setChatContextMenu(undefined);
      setWorkflowContextMenu(undefined);
      setConfigContextMenu(undefined);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [agentContextMenu, chatContextMenu, workflowContextMenu, configContextMenu]);

  function applyPersistedWorkflowDraft(draft: WorkflowDraftState): void {
    workflowDraftHydratingRef.current = true;
    setWorkflowId(draft.workflowId);
    setWorkflowTitle(draft.title);
    setWorkflowStatus(draft.status);
    setWorkflowRevision(draft.revision);
    setWorkflowConfiguredAgentId(draft.configuredAgentId);
    setWorkflowModelId(draft.modelId);
    setWorkflowObjective(draft.objective);
    setWorkflowGraph(draft.graph);
    setWorkflowGraphReady(draft.graphReady);
    setWorkflowMessages(draft.messages);
    setWorkflowReply(draft.reply);
    setWorkflowError(draft.error);
    setWorkflowRunProgress(draft.runProgress);
    setWorkflowRunContextDocument(draft.runContextDocument);
    setWorkflowContextDocument(draft.contextDocument);
    setWorkflowFinalReport(draft.finalReport ?? "");
    setWorkflowRunIds(draft.runIds);
    setWorkflowAgentSessionId(draft.agentSessionId);
    setWorkflowCreatedAt(draft.createdAt);
    window.setTimeout(() => {
      workflowDraftHydratingRef.current = false;
    }, 0);
  }

  function buildWorkflowDraft(): WorkflowDraftState | undefined {
    if (
      !workflowDraftShouldPersist({
        workflowId,
        activeWorkflowId: snapshot.workflowStore.activeWorkflowId,
        workflowIds: snapshot.workflowStore.workflows.map((workflow) => workflow.workflowId),
        objective: workflowObjective,
        messages: workflowMessages,
        graphReady: workflowGraphReady,
        reply: workflowReply,
        error: workflowError,
        runProgress: workflowRunProgress,
        runContextDocument: workflowRunContextDocument,
        contextDocument: workflowContextDocument,
        finalReport: workflowFinalReport,
        agentSessionId: workflowAgentSessionId,
      })
    ) {
      return undefined;
    }
    return {
      workflowId,
      title: workflowTitle || workflowGraph.title || workflowObjective || "Untitled workflow",
      status: workflowRunning ? "running" : workflowStatus,
      revision: workflowRevision,
      configuredAgentId: workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
      modelId: configuredAgentModelId(
        workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
        workflowModelId,
        snapshot.configuredAgents,
        snapshot.channels,
      ),
      objective: workflowObjective,
      graph: workflowGraph,
      graphReady: workflowGraphReady,
      messages: workflowMessages,
      reply: workflowReply,
      error: workflowError,
      runProgress: workflowRunProgress,
      runContextDocument: workflowRunContextDocument,
      contextDocument: workflowContextDocument,
      ...(workflowFinalReport.trim() ? { finalReport: workflowFinalReport } : {}),
      runIds: workflowRunIds,
      agentSessionId: workflowAgentSessionId,
      createdAt: workflowCreatedAt,
      updatedAt: Date.now(),
    };
  }

  useEffect(() => {
    void window.multiAgentChat.getSnapshot().then((value) => {
      setSnapshot(value);
    });
    return window.multiAgentChat.onSnapshot((value) => {
      setSnapshot(value);
    });
  }, []);

  useEffect(() => {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      listImportedSkills?: () => Promise<SkillTemplate[]>;
    };
    if (!api.listImportedSkills) return;
    void api.listImportedSkills().then(setImportedSkillTemplates).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (workflowDraftHydratedRef.current || snapshot.detectedAt === 0) return;
    workflowDraftHydratedRef.current = true;
    if (snapshot.workflowDraft) applyPersistedWorkflowDraft(snapshot.workflowDraft);
  }, [snapshot.detectedAt, snapshot.workflowDraft]);

  useEffect(() => {
    const activeWorkflow = snapshot.workflowDraft;
    if (!workflowDraftHydratedRef.current || !activeWorkflow) return;
    if (activeWorkflow.workflowId === workflowId && activeWorkflow.revision === workflowRevision) return;
    applyPersistedWorkflowDraft(activeWorkflow);
  }, [snapshot.workflowStore.activeWorkflowId, snapshot.workflowDraft?.workflowId, snapshot.workflowDraft?.revision]);

  useEffect(() => {
    if (!workflowDraftHydratedRef.current || workflowDraftHydratingRef.current) return;
    if (workflowDraftSaveTimerRef.current) window.clearTimeout(workflowDraftSaveTimerRef.current);
    workflowDraftSaveTimerRef.current = window.setTimeout(() => {
      workflowDraftSaveTimerRef.current = undefined;
      const draft = buildWorkflowDraft();
      if (!draft) return;
      void window.multiAgentChat.updateWorkflowDraft(draft).then(setSnapshot);
    }, 300);
    return () => {
      if (workflowDraftSaveTimerRef.current) window.clearTimeout(workflowDraftSaveTimerRef.current);
    };
  }, [
    workflowId,
    workflowTitle,
    workflowStatus,
    workflowRevision,
    workflowConfiguredAgentId,
    workflowModelId,
    workflowObjective,
    workflowGraph,
    workflowGraphReady,
    workflowMessages,
    workflowReply,
    workflowError,
    workflowRunProgress,
    workflowRunContextDocument,
    workflowContextDocument,
    workflowFinalReport,
    workflowRunIds,
    workflowAgentSessionId,
    workflowCreatedAt,
    snapshot.workflowStore.activeWorkflowId,
    workflowStoreIds,
  ]);

  useEffect(() => {
    if (configDirty) return;
    setConfigChannels(snapshot.channels);
    setSelectedConfigChannelId((current) => {
      return configChannelForSelection(snapshot.channels, current)?.id ?? "";
    });
  }, [configDirty, snapshot.channels]);

  useEffect(() => {
    const fallbackId = defaultConfiguredAgentId(snapshot.configuredAgents);
    if (!fallbackId) return;
    const nextTaskAgentId = snapshot.configuredAgents.some((agent) => agent.id === taskConfiguredAgentId) ? taskConfiguredAgentId : fallbackId;
    const nextWorkflowAgentId = snapshot.configuredAgents.some((agent) => agent.id === workflowConfiguredAgentId) ? workflowConfiguredAgentId : fallbackId;
    if (nextTaskAgentId !== taskConfiguredAgentId) setTaskConfiguredAgentId(nextTaskAgentId);
    if (nextWorkflowAgentId !== workflowConfiguredAgentId) setWorkflowConfiguredAgentId(nextWorkflowAgentId);
    setTaskModelId((current) => configuredAgentModelId(nextTaskAgentId, current, snapshot.configuredAgents, snapshot.channels));
    setWorkflowModelId((current) => configuredAgentModelId(nextWorkflowAgentId, current, snapshot.configuredAgents, snapshot.channels));
  }, [snapshot.configuredAgents, snapshot.channels, taskConfiguredAgentId, workflowConfiguredAgentId]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    workflowRunningRef.current = workflowRunning;
  }, [workflowRunning]);

  useEffect(() => {
    setScheduledWorkflowDraft((current) => {
      if (current.workflowId && snapshot.workflowStore.workflows.some((workflow) => workflow.workflowId === current.workflowId)) return current;
      return defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId);
    });
  }, [snapshot.workflowStore.activeWorkflowId, workflowStoreIds]);

  useEffect(() => {
    if (activeFeature !== "runtimes" || pluginCatalogStatus || codexPluginCatalog.length > 0) return;
    void loadCodexPluginCatalog();
  }, [activeFeature, codexPluginCatalog.length, pluginCatalogStatus]);

  useEffect(() => {
    void refreshRuntimeChannelBalancesIfDue();
  }, [configChannels, configDirty]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshRuntimeChannelBalancesIfDue();
    }, BALANCE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeFeature !== "tasks") setSelectedTaskDetailId(undefined);
  }, [activeFeature]);

  useEffect(() => {
    if (!selectedTaskDetailId) return;
    if (snapshot.tasks.some((task) => task.id === selectedTaskDetailId)) return;
    setSelectedTaskDetailId(undefined);
  }, [selectedTaskDetailId, snapshot.tasks]);

  useEffect(() => {
    return window.multiAgentChat.onScheduledWorkflowEvent((event) => {
      void handleScheduledWorkflowEvent(event);
    });
  }, []);

  useEffect(() => {
    return window.multiAgentChat.onWorkflowAgentEvent((event) => {
      if (event.requestId !== workflowRequestIdRef.current) return;
      const assistantMessageId = workflowAssistantMessageIdRef.current;
      if (!assistantMessageId) return;
      if (event.type === "delta") {
        workflowAssistantContentRef.current += event.content;
        setWorkflowMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: workflowAssistantContentRef.current } : message)),
        );
        workflowStreamingStartedRef.current = workflowAssistantContentRef.current.length > 0;
        return;
      }
      if (event.type === "completed") {
        setWorkflowAgentSessionId(event.sessionId);
        if (event.content) {
          workflowAssistantContentRef.current = event.content;
          setWorkflowMessages((current) =>
            current.map((message) => (message.id === assistantMessageId ? { ...message, content: event.content } : message)),
          );
        }
        applyWorkflowGraphFromAgentContent(workflowAssistantContentRef.current || event.content);
        return;
      }
      if (event.type === "error") {
        setWorkflowError(event.error);
        setWorkflowMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: `Workflow agent error: ${event.error}` } : message)),
        );
      }
    });
  }, []);

  const runtimeMap = useMemo(() => new Map(snapshot.runtimes.map((runtime) => [runtime.id, runtime])), [snapshot.runtimes]);
  const activeChat = useMemo(() => activeChatFrom(snapshot), [snapshot]);
  const activeTask = useMemo(() => activeTaskFrom(snapshot), [snapshot]);
  const activeTeam = useMemo(() => activeTeamFrom(snapshot), [snapshot]);
  const text = UI_TEXT[language];
  const activeTeamRun = useMemo(() => activeTeamRunFrom(snapshot, activeTeam?.id), [snapshot, activeTeam?.id]);
  const visibleTasks = useMemo(
    () => (taskStatusFilter === "all" ? snapshot.tasks : snapshot.tasks.filter((task) => task.progress === taskStatusFilter)),
    [snapshot.tasks, taskStatusFilter],
  );
  const skillTemplates = useMemo(() => {
    const importedIds = new Set(importedSkillTemplates.map((template) => template.id));
    return [...importedSkillTemplates, ...SKILL_TEMPLATES.filter((template) => !importedIds.has(template.id))];
  }, [importedSkillTemplates]);
  const activeChatConfiguredAgent = activeChat ? configuredAgentById(activeChat.configuredAgentId, snapshot.configuredAgents) : undefined;
  const activeChatChannel = resolveConfiguredAgentChannel(activeChatConfiguredAgent, snapshot.channels);
  const activeChatRuntimeId = configuredAgentRuntimeId(activeChatConfiguredAgent, activeChatChannel);
  const activeRuntime = activeChat ? runtimeMap.get(activeChatRuntimeId) ?? fallbackRuntime(activeChatRuntimeId) : undefined;
  const activeModel = configuredAgentModel(activeChatConfiguredAgent, activeChatChannel, activeChat?.modelId);
  const activeChatConfigTitle = [
    activeChatConfiguredAgent?.name,
    activeChatChannel?.label,
    activeModel?.label ?? activeChatConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID,
    activeRuntime ? runtimeStatus(activeRuntime) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  const slashCommandSuggestions = useMemo(
    () => (activeChat ? slashCommandSuggestionsFor(prompt, activeChatRuntimeId) : []),
    [activeChat, activeChatRuntimeId, prompt],
  );
  const promptIsSlashCommand = prompt.trimStart().startsWith("/");
  const canSend = !!activeChat && !activeChat.running && !!prompt.trim() && (promptIsSlashCommand || !!activeRuntime?.available);
  const activeChatLocked = activeChat ? chatConfigLocked(activeChat) : true;
  const selectedTaskDetailActiveId = taskDetailIdFor(activeFeature, selectedTaskDetailId, snapshot.activeTaskId);

  useEffect(() => {
    setSlashCommandIndex((current) => Math.min(current, Math.max(0, slashCommandSuggestions.length - 1)));
  }, [slashCommandSuggestions.length]);

  function toggleTheme(): void {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  useEffect(() => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((current) => !current);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (!paletteOpen) void createChat();
        return;
      }
      if (paletteOpen || isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "g") {
        gChordRef.current = Date.now();
        return;
      }
      if (Date.now() - gChordRef.current < 900) {
        const navMap: Record<string, ActiveFeature> = { c: "chat", t: "tasks", w: "workflow", f: "workflow", r: "runtimes", s: "runtimes" };
        const feature = navMap[event.key.toLowerCase()];
        if (feature) {
          event.preventDefault();
          setActiveFeature(feature);
        }
        gChordRef.current = 0;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !stickToBottomRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [activeChat?.messages, activeChat?.running]);

  function handleTranscriptScroll(): void {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    stickToBottomRef.current = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
  }

  const paletteCommands = useMemo(
    () =>
      buildPaletteCommands({
        chats: snapshot.chats.map((chat) => {
          const agent = configuredAgentById(chat.configuredAgentId, snapshot.configuredAgents);
          const channel = resolveConfiguredAgentChannel(agent, snapshot.channels);
          return { id: chat.id, title: chat.title, agentId: configuredAgentRuntimeId(agent, channel) };
        }),
        theme,
        language,
        onNavigate: setActiveFeature,
        onSelectChat: (chatId) => void selectChat(chatId),
        onNewChat: () => void createChat(),
        onToggleTheme: toggleTheme,
        onChooseWorkDir: () => void chooseWorkDir(),
        onRefreshAgents: () => void refresh(),
      }),
    [snapshot.chats, snapshot.configuredAgents, snapshot.channels, theme, language],
  );

  async function refresh(): Promise<void> {
    const next = await window.multiAgentChat.refreshAgents();
    setSnapshot(next);
  }

  async function createChat(configuredAgentId = activeChat?.configuredAgentId ?? defaultConfiguredAgentId(snapshot.configuredAgents)): Promise<void> {
    const next = await window.multiAgentChat.createChat(configuredAgentId);
    setSnapshot(next);
    setPrompt("");
  }

  async function selectChat(chatId: string): Promise<void> {
    const next = await window.multiAgentChat.selectChat(chatId);
    setSnapshot(next);
    setPrompt("");
  }

  async function setActiveChatConfiguredAgent(configuredAgentId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.configuredAgentId === configuredAgentId) return;
    const next = await window.multiAgentChat.setChatAgent(activeChat.id, configuredAgentId);
    setSnapshot(next);
  }

  async function setActiveChatModel(modelId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.modelId === modelId) return;
    const next = await window.multiAgentChat.setChatModel(activeChat.id, modelId);
    setSnapshot(next);
  }

  function setTaskConfiguredAgent(configuredAgentId: string): void {
    setTaskConfiguredAgentId(configuredAgentId);
    setTaskModelId(configuredAgentModelId(configuredAgentId, undefined, snapshot.configuredAgents, snapshot.channels));
  }

  function setWorkflowConfiguredAgent(configuredAgentId: string): void {
    setWorkflowConfiguredAgentId(configuredAgentId);
    setWorkflowModelId(configuredAgentModelId(configuredAgentId, undefined, snapshot.configuredAgents, snapshot.channels));
  }

  function updateConfigChannels(next: AgentChannel[]): void {
    setConfigChannels(next);
    setConfigDirty(true);
    setConfigStatus("");
    setSelectedConfigChannelId((current) => {
      return configChannelForSelection(next, current)?.id ?? "";
    });
  }

  function addConfigChannel(): void {
    const next = [...configChannels, createChannel("codex", configChannels.map((channel) => channel.id))];
    updateConfigChannels(next);
    setSelectedConfigChannelId(next[next.length - 1]?.id ?? "");
  }

  function openConfigContextMenu(event: MouseEvent, channelId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAgentContextMenu(undefined);
    setChatContextMenu(undefined);
    setWorkflowContextMenu(undefined);
    setSelectedConfigChannelId(channelId);
    setConfigContextMenu({ channelId, x: event.clientX, y: event.clientY });
  }

  function deleteConfigChannel(channelId: string): void {
    setConfigContextMenu(undefined);
    const referencedAgent = snapshot.configuredAgents.find((agent) => agent.channelId === channelId);
    if (referencedAgent) {
      setConfigStatus(`Config is used by ${referencedAgent.name || referencedAgent.id}`);
      return;
    }
    if (configChannels.length <= 1) {
      setConfigStatus("Keep at least one config");
      return;
    }
    const next = configChannels.filter((channel) => channel.id !== channelId);
    setConfigChannels(next);
    setConfigDirty(true);
    setConfigStatus("");
    setBalanceResults((current) => {
      if (!(channelId in current)) return current;
      const nextResults = { ...current };
      delete nextResults[channelId];
      return nextResults;
    });
    setSelectedConfigChannelId((current) => (current === channelId ? (next[0]?.id ?? "") : (configChannelForSelection(next, current)?.id ?? next[0]?.id ?? "")));
  }

  async function persistChannelConfig(): Promise<AppSnapshot> {
    const next = await window.multiAgentChat.saveModelChannels(configChannels);
    setConfigChannels(next.channels);
    setConfigDirty(false);
    setSelectedConfigChannelId((current) => {
      return configChannelForSelection(next.channels, current)?.id ?? "";
    });
    setSnapshot(next);
    return next;
  }

  async function saveChannelConfig(): Promise<void> {
    try {
      await persistChannelConfig();
      setConfigStatus("Saved");
    } catch (error) {
      setConfigStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveConfiguredAgents(agents: ConfiguredAgent[]): Promise<void> {
    const next = await window.multiAgentChat.saveConfiguredAgents(agents);
    setSnapshot(next);
  }

  function openChatContextMenu(event: MouseEvent, chatId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAgentContextMenu(undefined);
    setWorkflowContextMenu(undefined);
    setConfigContextMenu(undefined);
    setChatContextMenu({ chatId, x: event.clientX, y: event.clientY });
  }

  async function deleteChat(chatId: string): Promise<void> {
    setChatContextMenu(undefined);
    if (typeof window.multiAgentChat.deleteChat !== "function") {
      window.alert?.(missingAppCapabilityMessage("Delete chat"));
      return;
    }
    const next = await window.multiAgentChat.deleteChat(chatId);
    setSnapshot(next);
    if (activeChat?.id === chatId) setPrompt("");
  }

  function openWorkflowContextMenu(event: MouseEvent, workflowId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setAgentContextMenu(undefined);
    setChatContextMenu(undefined);
    setConfigContextMenu(undefined);
    setWorkflowContextMenu({ workflowId, x: event.clientX, y: event.clientY });
  }

  function resetWorkflowLocalDraft(): void {
    abandonWorkflowGrillRequest();
    setWorkflowRunning(false);
    setWorkflowObjective("");
    setWorkflowReply("");
    setWorkflowError(undefined);
    setWorkflowMessages(initialWorkflowMessages());
    setWorkflowGraph(createWorkflowGraphFromObjective(""));
    setWorkflowGraphReady(false);
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowContextDocument("");
    setWorkflowFinalReport("");
    setWorkflowRunIds([]);
    setWorkflowAgentSessionId(undefined);
    setWorkflowId(createWorkflowId());
    setWorkflowTitle("Untitled workflow");
    setWorkflowStatus("draft");
    setWorkflowRevision(1);
    setWorkflowCreatedAt(Date.now());
  }

  function startWorkflowRename(workflowId: string): void {
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === workflowId);
    if (!workflow) return;
    setWorkflowContextMenu(undefined);
    setWorkflowRenameDraft({ workflowId, title: workflow.title });
  }

  async function confirmWorkflowRename(): Promise<void> {
    if (!workflowRenameDraft) return;
    const title = workflowRenameDraft.title.trim();
    if (!title) return;
    if (typeof window.multiAgentChat.renameWorkflow !== "function") {
      window.alert?.(missingAppCapabilityMessage("Rename workflow"));
      return;
    }
    const next = await window.multiAgentChat.renameWorkflow(workflowRenameDraft.workflowId, title);
    setWorkflowRenameDraft(undefined);
    setSnapshot(next);
    if (next.workflowDraft) applyPersistedWorkflowDraft(next.workflowDraft);
  }

  async function deleteWorkflow(targetWorkflowId: string): Promise<void> {
    setWorkflowContextMenu(undefined);
    if (workflowRunning && targetWorkflowId === workflowId) return;
    if (typeof window.multiAgentChat.deleteWorkflow !== "function") {
      window.alert?.(missingAppCapabilityMessage("Delete workflow"));
      return;
    }
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === targetWorkflowId);
    const confirmed =
      typeof window.confirm === "function" ? window.confirm(`Delete workflow "${workflow?.title ?? targetWorkflowId}" and its run data?`) : true;
    if (!confirmed) return;
    const next = await window.multiAgentChat.deleteWorkflow(targetWorkflowId);
    setSnapshot(next);
    if (next.workflowDraft) {
      applyPersistedWorkflowDraft(next.workflowDraft);
    } else if (targetWorkflowId === workflowId) {
      resetWorkflowLocalDraft();
    }
  }

  async function testRuntimeChannel(channelId: string): Promise<void> {
    const channel = configChannels.find((item) => item.id === channelId);
    const startedAt = Date.now();
    const baseState: AgentTestUiState = {
      agentId: channelId,
      state: "running",
      phase: "Preparing",
      message: "Preparing execution config test...",
      startedAt,
      testedAt: startedAt,
      elapsedMs: 0,
      runtimeAgentId: channel?.agentId ?? "codex",
      channelId,
      modelId: DEFAULT_MODEL_ID,
      providerLabel: channel?.providerName ?? channel?.label ?? "Provider",
      transcript: [],
    };
    setTestingAgentId(channelId);
    setAgentTestTick((value) => value + 1);
    setAgentTestResults((current) => ({ ...current, [channelId]: baseState }));
    setConfigStatus("");
    try {
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          phase: "Saving config",
          message: "Saving current provider, model, plugin, and credential settings before testing.",
        },
      }));
      await persistChannelConfig();
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          phase: "Running test",
          message: `Starting ${agentLabel(channel?.agentId ?? "codex")} with ${baseState.providerLabel}.`,
        },
      }));
      const result = await window.multiAgentChat.testRuntimeChannel(channelId);
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          agentId: result.agentId,
          state: result.ok ? "passed" : "failed",
          phase: result.ok ? "Completed" : "Failed",
          message: result.message,
          startedAt,
          testedAt: result.testedAt,
          elapsedMs: result.elapsedMs,
          runtimeAgentId: result.runtimeAgentId,
          channelId: result.channelId,
          modelId: result.modelId,
          providerLabel: baseState.providerLabel,
          ...(result.output ? { output: result.output } : {}),
        },
      }));
      setConfigStatus(result.ok ? "Config test passed" : "Config test failed");
    } catch (error) {
      setAgentTestResults((current) => ({
        ...current,
        [channelId]: {
          ...(current[channelId] ?? baseState),
          state: "failed",
          phase: "Failed",
          message: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - startedAt,
        },
      }));
      setConfigStatus("Config test failed");
    } finally {
      setTestingAgentId(undefined);
    }
  }

  async function queryRuntimeChannelBalance(channelId: string, options: { persistBeforeQuery?: boolean; quiet?: boolean } = {}): Promise<void> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      queryRuntimeChannelBalance?: (targetChannelId: string) => Promise<ProviderBalanceResult>;
    };
    if (typeof api.queryRuntimeChannelBalance !== "function") {
      setConfigStatus(missingAppCapabilityMessage("Provider balance query"));
      return;
    }
    setBalanceLoadingChannelId(channelId);
    if (!options.quiet) setConfigStatus("");
    try {
      if (options.persistBeforeQuery !== false) await persistChannelConfig();
      const result = await api.queryRuntimeChannelBalance(channelId);
      setBalanceResults((current) => ({ ...current, [channelId]: result }));
      if (!options.quiet) setConfigStatus(result.status === "success" ? "Balance updated" : result.message);
    } catch (error) {
      if (!options.quiet) setConfigStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBalanceLoadingChannelId(undefined);
    }
  }

  async function refreshRuntimeChannelBalances(channelIds: string[]): Promise<void> {
    for (const channelId of channelIds) {
      await queryRuntimeChannelBalance(channelId, { persistBeforeQuery: false, quiet: true });
    }
  }

  async function refreshRuntimeChannelBalancesIfDue(): Promise<void> {
    const channels = selectConfigChannelsForDisplay(configChannelsRef.current);
    if (
      !shouldRefreshBalances({
        channels,
        configDirty: configDirtyRef.current,
        refreshInFlight: balanceRefreshInFlightRef.current,
        lastRefreshAt: lastBalanceRefreshAtRef.current,
        now: Date.now(),
        intervalMs: BALANCE_REFRESH_INTERVAL_MS,
      })
    ) {
      return;
    }

    balanceRefreshInFlightRef.current = true;
    try {
      await refreshRuntimeChannelBalances(channels.map((channel) => channel.id));
      lastBalanceRefreshAtRef.current = Date.now();
    } finally {
      balanceRefreshInFlightRef.current = false;
    }
  }

  function updateProviderKey(presetId: string, value: string): void {
    setProviderKeys((current) => {
      const next = { ...current };
      if (value.trim()) next[presetId] = value;
      else delete next[presetId];
      window.localStorage.setItem(PROVIDER_KEYS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function loadCodexPluginCatalog(): Promise<void> {
    setPluginCatalogStatus("Loading plugins...");
    try {
      const plugins = await window.multiAgentChat.listCodexPlugins();
      setCodexPluginCatalog(plugins);
      setPluginCatalogStatus(`Loaded ${plugins.length} plugins`);
    } catch (error) {
      setPluginCatalogStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function updateConfigChannel(channelId: string, updater: (channel: AgentChannel) => AgentChannel): void {
    setBalanceResults((current) => {
      if (!(channelId in current)) return current;
      const next = { ...current };
      delete next[channelId];
      return next;
    });
    updateConfigChannels(configChannels.map((channel) => (channel.id === channelId ? updater(channel) : channel)));
  }

  function addConfigModel(channelId: string): void {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: [...channel.models, createModel(channel.models)],
    }));
  }

  function updateConfigModel(channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption): void {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: channel.models.map((model, index) => (index === modelIndex ? updater(model) : model)),
    }));
  }

  function removeConfigModel(channelId: string, modelIndex: number): void {
    updateConfigChannel(channelId, (channel) => ({
      ...channel,
      models: channel.models.filter((_model, index) => index !== modelIndex),
    }));
  }

  async function chooseWorkDir(): Promise<void> {
    const next = await window.multiAgentChat.chooseWorkDir();
    setSnapshot(next);
  }

  async function readLocalFile(filePath: string): Promise<LocalFilePreview> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      readLocalFile?: (path: string) => Promise<LocalFilePreview>;
    };
    if (!api.readLocalFile) throw new Error("文件预览能力需要重启应用后生效。");
    return api.readLocalFile(filePath);
  }

  async function revealSkillInFinder(filePath: string): Promise<void> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      revealPathInFinder?: (path: string) => Promise<string>;
    };
    if (!api.revealPathInFinder) throw new Error("Finder 打开能力需要重启应用后生效。");
    await api.revealPathInFinder(filePath);
  }

  async function refreshImportedSkills(): Promise<SkillTemplate[]> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      listImportedSkills?: () => Promise<SkillTemplate[]>;
    };
    if (!api.listImportedSkills) return [];
    const templates = await api.listImportedSkills();
    setImportedSkillTemplates(templates);
    return templates;
  }

  async function importOnlineSkill(skill: OnlineSkillResult): Promise<ImportedSkillResult> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      importOnlineSkill?: (request: ImportOnlineSkillRequest) => Promise<ImportedSkillResult>;
    };
    if (!api.importOnlineSkill) throw new Error("技能导入能力需要重启应用后生效。");
    const result = await api.importOnlineSkill(findSkillImportRequest(skill));
    await refreshImportedSkills();
    return result;
  }

  async function installSkill(templateId: string, target: SkillInstallTarget): Promise<InstalledSkillResult> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      installSkill?: (request: { templateId: string; target: SkillInstallTarget }) => Promise<InstalledSkillResult>;
    };
    if (!api.installSkill) throw new Error("技能安装能力需要重启应用后生效。");
    return api.installSkill({ templateId, target });
  }

  async function uninstallSkill(templateId: string, target: SkillInstallTarget): Promise<UninstalledSkillResult> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      uninstallSkill?: (request: { templateId: string; target: SkillInstallTarget }) => Promise<UninstalledSkillResult>;
    };
    if (!api.uninstallSkill) throw new Error("技能卸载能力需要重启应用后生效。");
    return api.uninstallSkill({ templateId, target });
  }

  async function clearHistory(): Promise<void> {
    const next = await window.multiAgentChat.clearHistory();
    setSnapshot(next);
    setPrompt("");
    setTaskPrompt("");
    setTeamPrompt("");
    setWorkflowObjective("");
    setWorkflowReply("");
    setWorkflowMessages(initialWorkflowMessages());
    setWorkflowGraphReady(false);
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowContextDocument("");
    setWorkflowFinalReport("");
    setWorkflowRunIds([]);
    setWorkflowAgentSessionId(undefined);
    setWorkflowId(createWorkflowId());
    setWorkflowTitle("Untitled workflow");
    setWorkflowStatus("draft");
    setWorkflowRevision(1);
    setWorkflowCreatedAt(Date.now());
  }

  function abandonWorkflowGrillRequest(): void {
    workflowRequestIdRef.current = undefined;
    workflowAssistantMessageIdRef.current = undefined;
    workflowStreamingStartedRef.current = false;
    workflowAssistantContentRef.current = "";
  }

  function stopWorkflowGrill(): void {
    if (!workflowRunning) return;
    const assistantMessageId = workflowAssistantMessageIdRef.current;
    const partial = workflowAssistantContentRef.current.trim();
    abandonWorkflowGrillRequest();
    setWorkflowRunning(false);
    setWorkflowError(undefined);
    if (assistantMessageId) {
      setWorkflowMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: partial || "已停止：agent 未返回结果，可重试或新建 workflow。" }
            : message,
        ),
      );
    }
  }

  async function createNewWorkflow(): Promise<void> {
    abandonWorkflowGrillRequest();
    setWorkflowRunning(false);
    const now = Date.now();
    const graph = createWorkflowGraphFromObjective("");
    const draft: WorkflowDraftState = {
      workflowId: createWorkflowId(),
      title: "Untitled workflow",
      status: "draft",
      revision: 1,
      configuredAgentId: workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
      modelId: configuredAgentModelId(
        workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
        workflowModelId,
        snapshot.configuredAgents,
        snapshot.channels,
      ),
      objective: "",
      graph,
      graphReady: false,
      messages: initialWorkflowMessages(),
      reply: "",
      error: undefined,
      runProgress: [],
      runContextDocument: "",
      contextDocument: "",
      runIds: [],
      agentSessionId: undefined,
      createdAt: now,
      updatedAt: now,
    };
    applyPersistedWorkflowDraft(draft);
    const next = await window.multiAgentChat.updateWorkflowDraft(draft);
    setSnapshot(next);
    setActiveFeature("workflow");
  }

  async function resetWorkflowSession(): Promise<void> {
    workflowRequestIdRef.current = undefined;
    workflowAssistantMessageIdRef.current = undefined;
    workflowStreamingStartedRef.current = false;
    workflowAssistantContentRef.current = "";
    setWorkflowObjective("");
    setWorkflowReply("");
    setWorkflowError(undefined);
    setWorkflowRunning(false);
    setWorkflowMessages(initialWorkflowMessages());
    setWorkflowGraph(createWorkflowGraphFromObjective(""));
    setWorkflowGraphReady(false);
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowAgentSessionId(undefined);
    const next = await window.multiAgentChat.updateWorkflowDraft(undefined);
    setSnapshot(next);
  }

  async function send(): Promise<void> {
    if (!activeChat || !canSend) return;
    const text = prompt.trim();
    setPrompt("");
    const next = await window.multiAgentChat.sendPrompt(text, activeChat.id);
    setSnapshot(next);
  }

  function completeSlashCommand(command: string): void {
    setPrompt(`${command} `);
    setSlashCommandIndex(0);
  }

  async function stopActiveChat(): Promise<void> {
    if (!activeChat) return;
    const next = await window.multiAgentChat.stopChat(activeChat.id);
    setSnapshot(next);
  }

  async function runTask(): Promise<void> {
    const text = taskPrompt.trim();
    if (!text) return;
    const next = await window.multiAgentChat.runTask({
      prompt: text,
      configuredAgentId: taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents),
      modelId: configuredAgentModelId(taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents), taskModelId, snapshot.configuredAgents, snapshot.channels),
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTaskPrompt("");
  }

  async function connectScheduledRunner(): Promise<void> {
    const next = await window.multiAgentChat.connectScheduledWorkflowRunner();
    setSnapshot(next);
  }

  async function disconnectScheduledRunner(): Promise<void> {
    const next = await window.multiAgentChat.disconnectScheduledWorkflowRunner();
    setSnapshot(next);
  }

  async function refreshScheduledWorkflows(): Promise<void> {
    const next = await window.multiAgentChat.refreshScheduledWorkflowSchedules();
    setSnapshot(next);
  }

  async function selectScheduledWorkflowSchedule(scheduleId: string): Promise<void> {
    setScheduledWorkflowMode("detail");
    const next = await window.multiAgentChat.selectScheduledWorkflowSchedule(scheduleId);
    setSnapshot(next);
  }

  function startCreatingScheduledWorkflow(): void {
    setActiveFeature("schedules");
    setScheduledWorkflowMode("create");
    setScheduledWorkflowDraft(defaultScheduledWorkflowDraft(snapshot.workflowStore.workflows, snapshot.workflowStore.activeWorkflowId));
  }

  async function createScheduledWorkflow(): Promise<void> {
    const workflow = snapshot.workflowStore.workflows.find((item) => item.workflowId === scheduledWorkflowDraft.workflowId);
    if (!workflow) return;
    const next = await window.multiAgentChat.createScheduledWorkflowSchedule({
      workflowId: workflow.workflowId,
      title: scheduledWorkflowDraft.title.trim() || workflow.title,
      enabled: scheduledWorkflowDraft.enabled,
      intervalSeconds: intervalSecondsForFrequency(scheduledWorkflowDraft.frequency),
      frequency: scheduledWorkflowDraft.frequency,
      timeOfDay: normalizeScheduleTimeOfDay(scheduledWorkflowDraft.timeOfDay),
      timezone: scheduledWorkflowDraft.timezone || DEFAULT_SCHEDULED_WORKFLOW_TIMEZONE,
      ...(scheduledWorkflowDraft.frequency === "weekly" ? { weekdays: normalizeScheduleWeekdays(scheduledWorkflowDraft.weekdays) } : {}),
      ...(scheduledWorkflowDraft.frequency === "monthly" ? { dayOfMonth: normalizeScheduleDayOfMonth(scheduledWorkflowDraft.dayOfMonth) } : {}),
    });
    setScheduledWorkflowMode("detail");
    setSnapshot(next);
  }

  async function updateScheduledWorkflow(
    schedule: ScheduledWorkflowSchedule,
    update: Partial<Pick<ScheduledWorkflowSchedule, "enabled" | "title" | "intervalSeconds" | "frequency" | "timeOfDay" | "timezone" | "weekdays" | "dayOfMonth">>,
  ): Promise<void> {
    const next = await window.multiAgentChat.updateScheduledWorkflowSchedule(schedule.scheduleId, update);
    setSnapshot(next);
  }

  async function deleteScheduledWorkflow(scheduleId: string): Promise<void> {
    const next = await window.multiAgentChat.deleteScheduledWorkflowSchedule(scheduleId);
    setSnapshot(next);
  }

  async function triggerScheduledWorkflow(scheduleId: string): Promise<void> {
    await window.multiAgentChat.triggerScheduledWorkflowSchedule(scheduleId);
  }

  async function handleScheduledWorkflowEvent(event: ScheduledWorkflowDueEvent): Promise<void> {
    const target = scheduledWorkflowEventTarget(event);
    if (!target) {
      await window.multiAgentChat.ackScheduledWorkflowEvent(event.eventId, {
        status: "failed",
        message: "Scheduled event payload is missing scheduleId or workflowId.",
      });
      return;
    }
    const currentSnapshot = snapshotRef.current;
    const workflow = currentSnapshot.workflowStore.workflows.find((item) => item.workflowId === target.workflowId);
    const runId = `scheduled_run_${event.eventId}`;
    if (!workflow) {
      const failedSnapshot = await window.multiAgentChat.recordScheduledWorkflowRun({
        runId,
        scheduleId: target.scheduleId,
        workflowId: target.workflowId,
        eventId: event.eventId,
        title: event.title,
        status: "failed",
        startedAt: Date.now(),
        finishedAt: Date.now(),
        message: `Workflow ${target.workflowId} was not found locally.`,
      });
      setSnapshot(failedSnapshot);
      await window.multiAgentChat.ackScheduledWorkflowEvent(event.eventId, {
        status: "failed",
        message: `Workflow ${target.workflowId} was not found locally.`,
      });
      return;
    }

    const runningSnapshot = await window.multiAgentChat.recordScheduledWorkflowRun({
      runId,
      scheduleId: target.scheduleId,
      workflowId: workflow.workflowId,
      eventId: event.eventId,
      title: event.title || workflow.title,
      status: "running",
      startedAt: Date.now(),
      finishedAt: undefined,
      message: event.message || "Runner started workflow.",
    });
    setSnapshot(runningSnapshot);

    const result = await runWorkflowGraphInternal(workflow);
    const finalStatus = result.ok ? "completed" : "failed";
    const message = result.ok ? "Workflow completed." : result.error || "Workflow failed.";
    const finishedSnapshot = await window.multiAgentChat.finishScheduledWorkflowRun(runId, {
      status: finalStatus,
      ...(result.workflowRunId !== undefined ? { workflowRunId: result.workflowRunId } : {}),
      message,
      finishedAt: Date.now(),
    });
    setSnapshot(finishedSnapshot);
    await window.multiAgentChat.ackScheduledWorkflowEvent(event.eventId, {
      status: finalStatus,
      ...(result.workflowRunId !== undefined ? { workflowRunId: result.workflowRunId } : {}),
      message,
    });
  }

  function syncWorkflowGraph(nextGraph: WorkflowGraph): void {
    setWorkflowGraph(nextGraph);
    setWorkflowTitle(nextGraph.title);
    setWorkflowObjective(nextGraph.objective);
    setWorkflowRevision((current) => current + 1);
    setWorkflowStatus("draft");
    setWorkflowRunProgress([]);
    setWorkflowRunContextDocument("");
    setWorkflowFinalReport("");
  }

  function applyWorkflowGraphFromAgentContent(content: string): boolean {
    const nextGraph = parseWorkflowGraphUpsert(content);
    if (!nextGraph) return false;
    syncWorkflowGraph(nextGraph);
    setWorkflowGraphReady(true);
    setWorkflowError(undefined);
    return true;
  }

  function updateWorkflowRunProgress(nodeId: string, update: Partial<WorkflowRunProgressItem>): void {
    setWorkflowRunProgress((current) => current.map((item) => (item.nodeId === nodeId ? { ...item, ...update } : item)));
  }

  function draftWorkflowGraph(): void {
    const nextGraph = createWorkflowGraphFromObjective(workflowObjective);
    syncWorkflowGraph(nextGraph);
    setWorkflowGraphReady(true);
    setWorkflowError(undefined);
  }

  async function askWorkflowAgentFor(
    promptText: string,
    sessionId: string | undefined,
    requestId: string,
    configuredAgentId: string,
    modelId: string,
  ): Promise<string> {
    const request = {
      requestId,
      prompt: promptText,
      configuredAgentId,
      modelId,
      workDir: snapshotRef.current.workDir,
    };
    const response = await window.multiAgentChat.askWorkflowAgent(sessionId ? { ...request, sessionId } : request);
    setWorkflowAgentSessionId(response.sessionId);
    return response.content.trim() || "Workflow agent returned an empty response.";
  }

  async function askSelectedWorkflowAgent(promptText: string, sessionId: string | undefined, requestId: string): Promise<string> {
    const configuredAgentId = workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents);
    return askWorkflowAgentFor(
      promptText,
      sessionId,
      requestId,
      configuredAgentId,
      configuredAgentModelId(configuredAgentId, workflowModelId, snapshot.configuredAgents, snapshot.channels),
    );
  }

  async function sendWorkflowReply(): Promise<void> {
    if (workflowRunning) return;
    const starting = workflowMessages.length === 0;
    const text = (starting ? workflowObjective : workflowReply).trim();
    if (!text) return;
    setWorkflowReply("");
    setWorkflowError(undefined);
    if (starting) {
      setWorkflowObjective(text);
      setWorkflowGraphReady(false);
      setWorkflowAgentSessionId(undefined);
    }
    const requestId = `workflow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const assistantMessageId = `grill-assistant-${Date.now()}`;
    workflowRequestIdRef.current = requestId;
    workflowAssistantMessageIdRef.current = assistantMessageId;
    workflowStreamingStartedRef.current = false;
    workflowAssistantContentRef.current = "";
    const nextMessages: WorkflowGrillMessage[] = [
      ...workflowMessages,
      { id: `grill-user-${Date.now()}`, role: "user", content: text },
      { id: assistantMessageId, role: "assistant", content: WORKFLOW_THINKING_MESSAGE },
    ];
    setWorkflowMessages(nextMessages);
    setWorkflowRunning(true);
    try {
      const assistantContent = await askSelectedWorkflowAgent(
        starting ? buildWorkflowAgentPrompt({ objective: text }) : text,
        starting ? undefined : workflowAgentSessionId,
        requestId,
      );
      // request was stopped / superseded while awaiting — drop its result
      if (workflowRequestIdRef.current !== requestId) return;
      if (!workflowStreamingStartedRef.current && assistantContent) {
        setWorkflowMessages((current) =>
          current.map((message) => (message.id === assistantMessageId ? { ...message, content: assistantContent } : message)),
        );
      }
      applyWorkflowGraphFromAgentContent(assistantContent);
    } catch (error) {
      if (workflowRequestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : String(error);
      setWorkflowError(message);
      setWorkflowMessages((current) =>
        current.map((item) => (item.id === assistantMessageId ? { ...item, content: `Workflow agent error: ${message}` } : item)),
      );
    } finally {
      // only clear running if this is still the active request (avoid turning off a newer run)
      if (workflowRequestIdRef.current === requestId) setWorkflowRunning(false);
    }
  }

  function updateWorkflowNode(nodeId: string, update: Partial<WorkflowGraphNode>): void {
    const nextGraph = {
      ...workflowGraph,
      nodes: workflowGraph.nodes.map((node) => (node.id === nodeId ? { ...node, ...update } : node)),
    };
    syncWorkflowGraph(nextGraph);
  }

  async function selectWorkflow(workflowId: string): Promise<void> {
    const next = await window.multiAgentChat.selectWorkflow(workflowId);
    setSnapshot(next);
  }

  async function runWorkflowGraph(): Promise<void> {
    await runWorkflowGraphInternal();
  }

  async function runWorkflowGraphInternal(targetWorkflow?: WorkflowDraftState): Promise<{ ok: boolean; workflowRunId?: string; error?: string }> {
    const runWorkflowId = targetWorkflow?.workflowId ?? workflowId;
    const runGraph = targetWorkflow?.graph ?? workflowGraph;
    const runConfiguredAgentId = targetWorkflow?.configuredAgentId || workflowConfiguredAgentId || defaultConfiguredAgentId(snapshotRef.current.configuredAgents);
    const runModelId = configuredAgentModelId(
      runConfiguredAgentId,
      targetWorkflow?.modelId || workflowModelId,
      snapshotRef.current.configuredAgents,
      snapshotRef.current.channels,
    );
    const initialWorkflowContextDocument = targetWorkflow?.contextDocument ?? workflowContextDocument;
    const runAgentSessionId = targetWorkflow?.agentSessionId ?? workflowAgentSessionId;

    if (targetWorkflow) {
      applyPersistedWorkflowDraft(targetWorkflow);
      setActiveFeature("workflow");
    }

    const validation = validateWorkflowGraph(runGraph);
    if (!validation.valid || workflowRunningRef.current) {
      const error = workflowRunningRef.current ? "Workflow is already running." : validation.errors.join(" ");
      setWorkflowError(error);
      return { ok: false, error };
    }
    const executionLevels = workflowGraphExecutionLevels(runGraph);
    if (executionLevels.length === 0) {
      const error = "Workflow graph has no executable agent nodes.";
      setWorkflowError(error);
      return { ok: false, error };
    }
    setWorkflowRunning(true);
    setWorkflowStatus("running");
    setWorkflowError(undefined);
    setWorkflowFinalReport("");
    let activeWorkflowRunId: string | undefined;
    let latestRunProgress: WorkflowRunProgressItem[] = [];
    let finalRunContextDocument = "";
    let finalReport = "";
    try {
      let latestSnapshot = snapshotRef.current;
      const storagePlan = workflowStoragePlanFor(runWorkflowId);
      const baseWorkflowContextDocument = [initialWorkflowContextDocument.trim(), workflowStoragePlanDocument(storagePlan)].filter(Boolean).join("\n\n");
      latestSnapshot = await window.multiAgentChat.startWorkflowRun({
        workflowId: runWorkflowId,
        contextDocument: baseWorkflowContextDocument,
      });
      setSnapshot(latestSnapshot);
      const runningWorkflow = latestSnapshot.workflowStore.workflows.find((workflow) => workflow.workflowId === runWorkflowId);
      activeWorkflowRunId = runningWorkflow?.runIds.at(-1);
      if (!activeWorkflowRunId) throw new Error("Workflow run did not start.");
      setWorkflowRunIds(runningWorkflow?.runIds ?? workflowRunIds);
      const nodeById = new Map(runGraph.nodes.map((node) => [node.id, node]));
      latestRunProgress = executionLevels.flat().map((nodeId) => {
        const node = nodeById.get(nodeId);
        return {
          nodeId,
          title: node?.title ?? nodeId,
          status: "queued",
        };
      });
      setWorkflowRunProgress(latestRunProgress);
      const updateWorkflowRunProgress = (nodeId: string, update: Partial<WorkflowRunProgressItem>): void => {
        latestRunProgress = latestRunProgress.map((item) => (item.nodeId === nodeId ? { ...item, ...update } : item));
        setWorkflowRunProgress(latestRunProgress);
      };
      const clearWorkflowRunProgressTaskId = (nodeId: string): void => {
        latestRunProgress = latestRunProgress.map((item) => {
          if (item.nodeId !== nodeId || item.taskId === undefined) return item;
          const next = { ...item };
          delete next.taskId;
          return next;
        });
        setWorkflowRunProgress(latestRunProgress);
      };
      const cleanupWorkflowTask = async (taskId: string): Promise<void> => {
        try {
          latestSnapshot = await window.multiAgentChat.deleteTask(taskId);
          setSnapshot(latestSnapshot);
        } catch (error) {
          console.warn("Failed to clean up workflow task", taskId, error);
        }
      };
      setWorkflowRunContextDocument(baseWorkflowContextDocument);
      const artifactsByNodeId = new Map<string, string>();
      const contextArtifacts: Array<{ nodeId: string; title: string; summary: string }> = [];
      let runContextDocument = baseWorkflowContextDocument;
      finalRunContextDocument = baseWorkflowContextDocument;
      const upstreamAgentNodeIdsByNodeId = new Map<string, string[]>();
      for (const nodeId of validation.executableNodeIds) upstreamAgentNodeIdsByNodeId.set(nodeId, []);
      for (const edge of runGraph.edges) {
        const fromNode = nodeById.get(edge.fromNodeId);
        if (fromNode?.kind !== "agent" || !upstreamAgentNodeIdsByNodeId.has(edge.toNodeId)) continue;
        upstreamAgentNodeIdsByNodeId.get(edge.toNodeId)?.push(edge.fromNodeId);
      }

      const startWorkflowTask = async (request: {
        prompt: string;
        configuredAgentId: string;
        modelId: string;
        workDir: string;
      }): Promise<TaskRun> => {
        const existingTaskIds = new Set(latestSnapshot.tasks.map((task) => task.id));
        latestSnapshot = await window.multiAgentChat.runTask(request);
        setSnapshot(latestSnapshot);
        const task = latestSnapshot.tasks
          .filter((item) => !existingTaskIds.has(item.id))
          .sort((left, right) => right.createdAt - left.createdAt)
          .find((item) => item.prompt === request.prompt && item.configuredAgentId === request.configuredAgentId);
        if (task) return task;
        const fallbackTask = latestSnapshot.tasks.filter((item) => !existingTaskIds.has(item.id)).sort((left, right) => right.createdAt - left.createdAt)[0];
        if (!fallbackTask) throw new Error("Workflow task creation did not return a new task.");
        return fallbackTask;
      };

      const waitForTask = async (taskId: string, onTaskUpdate?: (task: TaskRun) => void): Promise<TaskRun> => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < WORKFLOW_TASK_TIMEOUT_MS) {
          const polledSnapshot = await window.multiAgentChat.getSnapshot();
          latestSnapshot = polledSnapshot;
          setSnapshot(polledSnapshot);
          const task = polledSnapshot.tasks.find((item) => item.id === taskId);
          if (!task) throw new Error(`Workflow task ${taskId} was deleted before completion.`);
          onTaskUpdate?.(task);
          if (task.status === "completed") return task;
          if (task.status === "failed" || task.status === "stopped") {
            throw new Error(task.lastError || `Workflow task ${task.title} ${task.status}.`);
          }
          await delay(WORKFLOW_TASK_POLL_MS);
        }
        throw new Error(`Workflow task ${taskId} timed out.`);
      };

      const upstreamArtifactsForNode = (node: WorkflowGraphNode): Array<{ node: WorkflowGraphNode; artifact: string }> =>
        (upstreamAgentNodeIdsByNodeId.get(node.id) ?? [])
          .map((upstreamNodeId) => {
            const upstreamNode = nodeById.get(upstreamNodeId);
            const artifact = artifactsByNodeId.get(upstreamNodeId);
            return upstreamNode && artifact ? { node: upstreamNode, artifact } : undefined;
          })
          .filter((item): item is { node: WorkflowGraphNode; artifact: string } => Boolean(item));

      const nodeAttemptPrompt = (node: WorkflowGraphNode, attempt: number, retryPrompt: string, contextDocument: string): string => {
        const basePrompt = workflowNodeRunPrompt(runGraph, node, upstreamArtifactsForNode(node), contextDocument, storagePlan);
        if (!retryPrompt.trim()) return basePrompt;
        return [
          basePrompt,
          "",
          `This is retry attempt ${attempt} of ${WORKFLOW_NODE_MAX_ATTEMPTS}.`,
          "The workflow judge rejected the previous attempt. Address this retry instruction exactly:",
          retryPrompt.trim(),
        ].join("\n");
      };

      const startNodeAttempt = async (
        node: WorkflowGraphNode,
        attempt: number,
        retryPrompt: string,
        contextDocument: string,
      ): Promise<{ node: WorkflowGraphNode; taskId: string; attempt: number }> => {
        const prompt = nodeAttemptPrompt(node, attempt, retryPrompt, contextDocument);
        const task = await startWorkflowTask({
          prompt,
          configuredAgentId: runConfiguredAgentId,
          modelId: runModelId,
          workDir: latestSnapshot.workDir,
        });
        updateWorkflowRunProgress(node.id, {
          status: "running",
          detail: attempt === 1 ? "Task running" : `Retry ${attempt}/${WORKFLOW_NODE_MAX_ATTEMPTS} running`,
          taskId: task.id,
        });
        return { node, taskId: task.id, attempt };
      };

      const waitForNodeAttempt = async (startedTask: {
        node: WorkflowGraphNode;
        taskId: string;
        attempt: number;
      }): Promise<{ node: WorkflowGraphNode; task: TaskRun; attempt: number }> => {
        try {
          return {
            node: startedTask.node,
            task: await waitForTask(startedTask.taskId, (task) =>
              updateWorkflowRunProgress(startedTask.node.id, {
                status: "running",
                detail: workflowTaskLiveDetail(task),
                taskId: startedTask.taskId,
              }),
            ),
            attempt: startedTask.attempt,
          };
        } catch (error) {
          updateWorkflowRunProgress(startedTask.node.id, {
            status: "failed",
            detail: error instanceof Error ? error.message : String(error),
            taskId: startedTask.taskId,
          });
          await cleanupWorkflowTask(startedTask.taskId);
          clearWorkflowRunProgressTaskId(startedTask.node.id);
          throw error;
        }
      };

      const evaluateNodeAttempt = async (
        node: WorkflowGraphNode,
        artifact: string,
        attempt: number,
        contextDocument: string,
      ): Promise<WorkflowJudgeResult> => {
        updateWorkflowRunProgress(node.id, {
          status: "running",
          detail: `Evaluating attempt ${attempt}/${WORKFLOW_NODE_MAX_ATTEMPTS}`,
        });
        const judgeTask = await startWorkflowTask({
          prompt: workflowJudgePrompt(runGraph, node, artifact, contextDocument, attempt, WORKFLOW_NODE_MAX_ATTEMPTS),
          configuredAgentId: runConfiguredAgentId,
          modelId: runModelId,
          workDir: latestSnapshot.workDir,
        });
        const completedJudgeTask = await (async (): Promise<TaskRun> => {
          try {
            return await waitForTask(judgeTask.id, (task) =>
              updateWorkflowRunProgress(node.id, {
                status: "running",
                detail: `Judge: ${workflowTaskLiveDetail(task)}`,
              }),
            );
          } finally {
            await cleanupWorkflowTask(judgeTask.id);
          }
        })();
        const result = parseWorkflowJudgeResult(taskArtifact(completedJudgeTask));
        if (!result) throw new Error(`Workflow judge for ${node.title} did not return workflowEvaluation.submit(...).`);
        return result;
      };

      for (const level of executionLevels) {
        const levelContextDocument = runContextDocument;
        let pendingNodes = level.map((nodeId) => nodeById.get(nodeId)).filter((node): node is WorkflowGraphNode => Boolean(node && node.kind === "agent"));
        const attemptsByNodeId = new Map<string, number>();
        const retryPromptByNodeId = new Map<string, string>();

        while (pendingNodes.length > 0) {
          const startedTasks: Array<{ node: WorkflowGraphNode; taskId: string; attempt: number }> = [];
          for (const node of pendingNodes) {
            const attempt = (attemptsByNodeId.get(node.id) ?? 0) + 1;
            attemptsByNodeId.set(node.id, attempt);
            startedTasks.push(await startNodeAttempt(node, attempt, retryPromptByNodeId.get(node.id) ?? "", levelContextDocument));
          }

          const completedTasks = await Promise.all(startedTasks.map(waitForNodeAttempt));
          const nextPendingNodes: WorkflowGraphNode[] = [];
          for (const completedTask of completedTasks) {
            const artifact = taskArtifact(completedTask.task);
            const judge = await (async (): Promise<WorkflowJudgeResult> => {
              try {
                return await evaluateNodeAttempt(completedTask.node, artifact, completedTask.attempt, levelContextDocument);
              } finally {
                await cleanupWorkflowTask(completedTask.task.id);
              }
            })();
            if (judge.complete) {
              artifactsByNodeId.set(completedTask.node.id, artifact);
              contextArtifacts.push({
                nodeId: completedTask.node.id,
                title: completedTask.node.title,
                summary: workflowArtifactSummary(artifact),
              });
              runContextDocument = [baseWorkflowContextDocument.trim(), workflowContextDocumentFromArtifacts(contextArtifacts)].filter(Boolean).join("\n\n");
              finalRunContextDocument = runContextDocument;
              setWorkflowRunContextDocument(runContextDocument);
              updateWorkflowRunProgress(completedTask.node.id, {
                status: "completed",
                detail: `Approved: ${truncateWorkflowContext(judge.reason, 160)}`,
                taskId: completedTask.task.id,
              });
              clearWorkflowRunProgressTaskId(completedTask.node.id);
              continue;
            }

            if (completedTask.attempt < WORKFLOW_NODE_MAX_ATTEMPTS) {
              retryPromptByNodeId.set(completedTask.node.id, judge.retryPrompt || judge.reason);
              updateWorkflowRunProgress(completedTask.node.id, {
                status: "queued",
                detail: `Retry requested: ${truncateWorkflowContext(judge.reason, 160)}`,
                taskId: completedTask.task.id,
              });
              clearWorkflowRunProgressTaskId(completedTask.node.id);
              nextPendingNodes.push(completedTask.node);
              continue;
            }

            updateWorkflowRunProgress(completedTask.node.id, {
              status: "failed",
              detail: `Judge rejected after ${WORKFLOW_NODE_MAX_ATTEMPTS} attempts: ${truncateWorkflowContext(judge.reason, 160)}`,
              taskId: completedTask.task.id,
            });
            clearWorkflowRunProgressTaskId(completedTask.node.id);
            throw new Error(`Workflow node ${completedTask.node.title} did not pass evaluation after ${WORKFLOW_NODE_MAX_ATTEMPTS} attempts: ${judge.reason}`);
          }
          pendingNodes = nextPendingNodes;
        }
      }
      const completedNodeProgress = latestRunProgress;
      const finalReviewProgress: WorkflowRunProgressItem = {
        nodeId: WORKFLOW_FINAL_REVIEW_NODE_ID,
        title: "Main agent review",
        status: "running",
        detail: "Main agent reviewing all node outputs",
      };
      latestRunProgress = [...completedNodeProgress, finalReviewProgress];
      setWorkflowRunProgress(latestRunProgress);
      const nodeArtifacts = validation.executableNodeIds
        .map((nodeId) => {
          const node = nodeById.get(nodeId);
          const artifact = artifactsByNodeId.get(nodeId);
          return node && artifact ? { node, artifact } : undefined;
        })
        .filter((item): item is { node: WorkflowGraphNode; artifact: string } => Boolean(item));
      const finalReviewPrompt = workflowFinalReviewPrompt(runGraph, nodeArtifacts, runContextDocument, completedNodeProgress, storagePlan);
      const finalReviewRequestId = `workflow-final-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const finalAssistantMessageId = `workflow-final-assistant-${Date.now()}`;
      workflowRequestIdRef.current = finalReviewRequestId;
      workflowAssistantMessageIdRef.current = finalAssistantMessageId;
      workflowStreamingStartedRef.current = false;
      workflowAssistantContentRef.current = "";
      setWorkflowMessages((current) => [...current, { id: finalAssistantMessageId, role: "assistant", content: WORKFLOW_THINKING_MESSAGE }]);
      updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
        status: "running",
        detail: "Main agent reviewing all node outputs",
      });
      try {
        finalReport = await askWorkflowAgentFor(finalReviewPrompt, runAgentSessionId, finalReviewRequestId, runConfiguredAgentId, runModelId);
        if (!workflowStreamingStartedRef.current && finalReport) {
          setWorkflowMessages((current) =>
            current.map((message) => (message.id === finalAssistantMessageId ? { ...message, content: finalReport } : message)),
          );
        }
      } catch (error) {
        updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
        setWorkflowMessages((current) =>
          current.map((message) =>
            message.id === finalAssistantMessageId
              ? { ...message, content: `Workflow agent error: ${error instanceof Error ? error.message : String(error)}` }
              : message,
          ),
        );
        throw error;
      }
      setWorkflowFinalReport(finalReport);
      finalRunContextDocument = [
        runContextDocument.trim(),
        ["# Workflow Final Report", "", finalReport].join("\n").trim(),
      ].filter(Boolean).join("\n\n");
      setWorkflowRunContextDocument(finalRunContextDocument);
      updateWorkflowRunProgress(WORKFLOW_FINAL_REVIEW_NODE_ID, {
        status: "completed",
        detail: "Main agent report ready",
      });
      latestSnapshot = await window.multiAgentChat.finishWorkflowRun({
        workflowId: runWorkflowId,
        runId: activeWorkflowRunId,
        status: "completed",
        progress: latestRunProgress,
        contextDocument: finalRunContextDocument,
        finalReport,
      });
      setSnapshot(latestSnapshot);
      setWorkflowStatus("completed");
      return { ok: true, workflowRunId: activeWorkflowRunId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      latestRunProgress = workflowProgressAfterFailure(latestRunProgress, message);
      setWorkflowRunProgress(latestRunProgress);
      if (activeWorkflowRunId) {
        try {
          const failedSnapshot = await window.multiAgentChat.finishWorkflowRun({
            workflowId: runWorkflowId,
            runId: activeWorkflowRunId,
            status: "failed",
            progress: latestRunProgress,
            contextDocument: finalRunContextDocument,
            ...(finalReport ? { finalReport } : {}),
            lastError: message,
          });
          setSnapshot(failedSnapshot);
          setWorkflowStatus("failed");
        } catch {
          setWorkflowStatus("failed");
        }
      } else {
        setWorkflowStatus("failed");
      }
      setWorkflowError(message);
      return {
        ok: false,
        ...(activeWorkflowRunId !== undefined ? { workflowRunId: activeWorkflowRunId } : {}),
        error: message,
      };
    } finally {
      setWorkflowRunning(false);
    }
  }

  async function rerunTask(task: TaskRun): Promise<void> {
    if (task.running) return;
    const next = await window.multiAgentChat.runTask({
      prompt: task.prompt,
      configuredAgentId: task.configuredAgentId,
      modelId: task.modelId,
      workDir: task.workDir || snapshot.workDir,
    });
    setSnapshot(next);
  }

  async function selectTask(taskId: string): Promise<void> {
    const next = await window.multiAgentChat.selectTask(taskId);
    setSnapshot(next);
  }

  async function openTaskDetail(taskId: string): Promise<void> {
    setSelectedTaskDetailId(taskId);
    await selectTask(taskId);
  }

  async function stopTask(taskId: string): Promise<void> {
    const next = await window.multiAgentChat.stopTask(taskId);
    setSnapshot(next);
  }

  async function updateTaskProgress(taskId: string, progress: TaskProgress): Promise<void> {
    const next = await window.multiAgentChat.updateTaskProgress(taskId, progress);
    setSnapshot(next);
  }

  async function deleteTask(taskId: string): Promise<void> {
    const next = await window.multiAgentChat.deleteTask(taskId);
    setSnapshot(next);
  }

  async function createTeam(): Promise<void> {
    const configuredAgentId = defaultConfiguredAgentId(snapshot.configuredAgents);
    const next = await window.multiAgentChat.createTeam({
      name: `Agent Team ${snapshot.teams.length + 1}`,
      mode: "pipeline",
      sharedContext: "",
      members: [
        {
          roleName: "Planner",
          prompt: "Plan the work and identify the main risks.",
          configuredAgentId,
        },
        {
          roleName: "Checker",
          prompt: "Use the previous artifact to verify correctness and missing tests.",
          configuredAgentId,
        },
      ],
    });
    setSnapshot(next);
    setActiveFeature("workflow");
  }

  async function updateTeam(
    teamId: string,
    update: { name?: string; mode?: AgentTeamMode; sharedContext?: string; members?: AgentTeamMember[] },
  ): Promise<void> {
    const next = await window.multiAgentChat.updateTeam(teamId, update);
    setSnapshot(next);
  }

  async function deleteTeam(teamId: string): Promise<void> {
    const next = await window.multiAgentChat.deleteTeam(teamId);
    setSnapshot(next);
  }

  async function selectTeam(teamId: string): Promise<void> {
    const next = await window.multiAgentChat.selectTeam(teamId);
    setSnapshot(next);
  }

  async function selectTeamRun(teamRunId: string): Promise<void> {
    const next = await window.multiAgentChat.selectTeamRun(teamRunId);
    setSnapshot(next);
  }

  async function runTeam(teamId: string): Promise<void> {
    const text = teamPrompt.trim();
    if (!text) return;
    const next = await window.multiAgentChat.runTeam({
      teamId,
      prompt: text,
      target: { kind: "workspace", label: "Workspace", value: snapshot.workDir },
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTeamPrompt("");
  }

  async function stopTeamRun(teamRunId: string): Promise<void> {
    const next = await window.multiAgentChat.stopTeamRun(teamRunId);
    setSnapshot(next);
  }

  return (
    <div className={appShellClass(activeFeature)}>
      <aside className="feature-rail">
        <div className="rail-brand" title="Multi Agent Chat">
          <Bot size={18} />
        </div>
        <nav className="feature-nav" aria-label={text.chrome.featureNav}>
          <button
            className={`feature-nav-item ${activeFeature === "chat" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("chat")}
           
          >
            <MessageSquareText size={15} />
            <span>{text.nav.chat}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "tasks" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("tasks")}
           
          >
            <ClipboardList size={15} />
            <span>{text.nav.tasks}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "workflow" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("workflow")}
          >
            <GitBranch size={15} />
            <span>{text.nav.workflow}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "schedules" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("schedules")}
          >
            <CalendarClock size={15} />
            <span>{text.nav.schedules}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "skills" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("skills")}
          >
            <Wand2 size={15} />
            <span>{text.nav.skills}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "runtimes" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("runtimes")}
          >
            <Cpu size={15} />
            <span>{text.nav.runtimes}</span>
          </button>
        </nav>
        <div className="rail-footer">
          <button
            className="icon-btn"
            onClick={toggleTheme}
            data-tip={theme === "dark" ? text.chrome.lightTheme : text.chrome.darkTheme}
            aria-label={text.chrome.toggleTheme}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button className="icon-btn" onClick={() => setActiveFeature("settings")} data-tip={text.chrome.settings} aria-label={text.chrome.openSettings}>
            <Settings size={14} />
          </button>
        </div>
      </aside>

      <aside className="resource-sidebar">
        <div className="brand resource-brand">
          <div>
            <h1>Multi Agent Chat</h1>
            <p>
              {activeFeature === "chat"
                ? text.nav.chat
                : activeFeature === "tasks"
                  ? text.nav.tasks
                  : activeFeature === "workflow"
                    ? text.nav.workflow
                    : activeFeature === "schedules"
                      ? text.nav.schedules
                      : activeFeature === "skills"
                        ? text.nav.skills
                        : activeFeature === "runtimes"
                          ? text.nav.runtimes
                          : activeFeature === "settings"
                            ? text.nav.settings
                            : text.nav.configuration}
            </p>
          </div>
        </div>

        <button className="sidebar-search-btn" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
          <Search size={13} />
          <span>{text.chrome.search}</span>
          <kbd>⌘K</kbd>
        </button>

        {activeFeature === "chat" ? (
          <ChatHistoryPanel
            chats={snapshot.chats}
            configuredAgents={snapshot.configuredAgents}
            channels={snapshot.channels}
            activeChatId={activeChat?.id}
            contextMenu={chatContextMenu}
            newChatLabel={text.chrome.newChat}
            runningLabel={language === "zh" ? "运行中" : "Running"}
            onCreateChat={createChat}
            onSelectChat={selectChat}
            onOpenContextMenu={openChatContextMenu}
            onDeleteChat={deleteChat}
          />
        ) : activeFeature === "tasks" ? (
          <section className="resource-panel task-list-panel">
            <div className="panel-header">
              <span>Tasks</span>
              <ClipboardList size={14} />
            </div>
            <TaskStatusFilter tasks={snapshot.tasks} value={taskStatusFilter} onChange={setTaskStatusFilter} />
            <div className="task-card-stack">
              {visibleTasks.length === 0 ? (
                <div className="empty-state config-empty">{snapshot.tasks.length === 0 ? "No tasks" : "No tasks in this progress"}</div>
              ) : (
                visibleTasks.map((task) => {
                  const agent = configuredAgentById(task.configuredAgentId, snapshot.configuredAgents);
                  const channel = resolveConfiguredAgentChannel(agent, snapshot.channels);
                  const runtimeId = configuredAgentRuntimeId(agent, channel);
                  return (
                    <button
                      key={task.id}
                      className={`task-nav-card ${task.id === activeTask?.id ? "is-active" : ""}`}
                      onClick={() => void selectTask(task.id)}
                    >
                      <div className="task-nav-card-head">
                        <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{agent?.name || agentLabel(runtimeId)}</span>
                        <TaskStatusChip label={task.running ? "Running" : taskProgressLabel(task.progress)} tone={task.running ? "running" : task.progress} />
                      </div>
                      <strong>{task.title}</strong>
                      <span>{`${task.status} · ${formatTime(task.updatedAt)}`}</span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        ) : activeFeature === "workflow" ? (
          <WorkflowHistoryPanel
            workflows={snapshot.workflowStore.workflows}
            activeWorkflowId={snapshot.workflowStore.activeWorkflowId}
            running={workflowRunning}
            contextMenu={workflowContextMenu}
            renameDraft={workflowRenameDraft}
            onNewWorkflow={createNewWorkflow}
            onSelectWorkflow={selectWorkflow}
            onOpenContextMenu={openWorkflowContextMenu}
            onStartRename={startWorkflowRename}
            onRenameDraftChange={(title) => setWorkflowRenameDraft((current) => (current ? { ...current, title } : current))}
            onConfirmRename={confirmWorkflowRename}
            onCancelRename={() => setWorkflowRenameDraft(undefined)}
            onDeleteWorkflow={deleteWorkflow}
          />
        ) : activeFeature === "schedules" ? (
          <section className="resource-panel scheduled-nav-panel">
            <div className="panel-header">
              <span>{text.nav.schedules}</span>
              <CalendarClock size={14} />
            </div>
            <div className="scheduled-nav-summary">
              <strong>{snapshot.scheduledWorkflowStore.schedules.length}</strong>
              <span>{language === "zh" ? "个计划" : "schedules"}</span>
            </div>
            <div className="new-chat-menu-wrap">
              <button
                className={`new-chat-compact-btn ${scheduledWorkflowMode === "create" ? "is-active" : ""}`}
                type="button"
                onClick={startCreatingScheduledWorkflow}
              >
                <Plus size={13} />
                <span>{language === "zh" ? "新增定时任务" : "New schedule"}</span>
              </button>
            </div>
            <div className="config-nav-list">
              {snapshot.scheduledWorkflowStore.schedules.length === 0 ? (
                <div className="empty-state config-empty">{language === "zh" ? "暂无定时任务" : "No schedules"}</div>
              ) : (
                snapshot.scheduledWorkflowStore.schedules.map((schedule) => (
                  <button
                    key={schedule.scheduleId}
                    className={`config-nav-row ${schedule.scheduleId === snapshot.scheduledWorkflowStore.activeScheduleId ? "is-active" : ""}`}
                    onClick={() => {
                      setActiveFeature("schedules");
                      void selectScheduledWorkflowSchedule(schedule.scheduleId);
                    }}
                  >
                    <span className={`agent-badge mini ${schedule.enabled ? "agent-api" : "agent-claude"}`}>
                      {schedule.enabled ? (language === "zh" ? "启用" : "On") : (language === "zh" ? "暂停" : "Off")}
                    </span>
                    <strong>{schedule.title}</strong>
                    <span>{formatScheduleRecurrence(schedule, language)}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : activeFeature === "skills" ? (
          <section className="resource-panel skills-nav-panel">
            <div className="panel-header">
              <span>{text.chrome.skillLibrary}</span>
              <Wand2 size={14} />
            </div>
            <div className="skills-nav-list">
              {skillTemplates.length === 0 ? (
                <div className="empty-state config-empty">{text.chrome.noSkills}</div>
              ) : (
                skillTemplates.map((template) => (
                  <div key={template.id} className="skills-nav-row">
                    <strong>{template.name}</strong>
                    <span>{template.tags.join(", ")}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : activeFeature === "settings" ? (
          <section className="resource-panel settings-nav-panel">
            <div className="panel-header">
              <span>{text.nav.settings}</span>
              <Settings size={14} />
            </div>
            <button className="settings-nav-row is-active" type="button">
              <Settings size={13} />
              <span>{language === "zh" ? "语言" : "Language"}</span>
            </button>
          </section>
        ) : null}
      </aside>

      <main
        className={`content ${
          activeFeature === "chat"
            ? "chat-content"
            : activeFeature === "tasks"
              ? "tasks-content"
              : activeFeature === "workflow"
                ? "workflow-content"
                : activeFeature === "schedules"
                  ? "scheduled-content"
                  : activeFeature === "skills"
                    ? "skills-content"
                    : activeFeature === "runtimes"
                      ? "runtime-content"
                      : activeFeature === "settings"
                        ? "settings-content"
                        : "config-content"
        }`}
      >
        {activeFeature === "tasks" ? (
          <TaskPage
            prompt={taskPrompt}
            configuredAgentId={taskConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents)}
            modelId={taskModelId}
            configuredAgents={snapshot.configuredAgents}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            tasks={snapshot.tasks}
            activeTaskId={selectedTaskDetailActiveId}
            onPromptChange={setTaskPrompt}
            onSelectConfiguredAgent={setTaskConfiguredAgent}
            onSelectModel={setTaskModelId}
            onChooseWorkDir={chooseWorkDir}
            onRefresh={refresh}
            onRunTask={runTask}
            onRerunTask={rerunTask}
            onSelectTask={openTaskDetail}
            onCloseTaskDetail={() => setSelectedTaskDetailId(undefined)}
            onStopTask={stopTask}
            onDeleteTask={deleteTask}
            onUpdateTaskProgress={updateTaskProgress}
          />
        ) : activeFeature === "workflow" ? (
          <WorkflowPage
            workflowId={workflowId}
            title={workflowTitle}
            status={workflowStatus}
            graph={workflowGraph}
            graphReady={workflowGraphReady}
            objective={workflowObjective}
            messages={workflowMessages}
            reply={workflowReply}
            error={workflowError}
            configuredAgentId={workflowConfiguredAgentId || defaultConfiguredAgentId(snapshot.configuredAgents)}
            modelId={workflowModelId}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            configuredAgents={snapshot.configuredAgents}
            workDir={snapshot.workDir}
            running={workflowRunning}
            runProgress={workflowRunProgress}
            contextDocument={workflowRunContextDocument}
            finalReport={workflowFinalReport}
            onObjectiveChange={setWorkflowObjective}
            onSelectConfiguredAgent={setWorkflowConfiguredAgent}
            onSelectModel={setWorkflowModelId}
            onDraftGraph={draftWorkflowGraph}
            onReplyChange={setWorkflowReply}
            onSendReply={sendWorkflowReply}
            onUpdateNode={updateWorkflowNode}
            onRunGraph={runWorkflowGraph}
            onResetSession={resetWorkflowSession}
            onStopGrill={stopWorkflowGrill}
            onChooseWorkDir={chooseWorkDir}
            onRefresh={refresh}
            onReadOutputFile={readLocalFile}
            language={language}
          />
        ) : activeFeature === "schedules" ? (
          <ScheduledWorkflowPage
            language={language}
            workflows={snapshot.workflowStore.workflows}
            store={snapshot.scheduledWorkflowStore}
            draft={scheduledWorkflowDraft}
            mode={scheduledWorkflowMode}
            onDraftChange={setScheduledWorkflowDraft}
            onConnectRunner={connectScheduledRunner}
            onDisconnectRunner={disconnectScheduledRunner}
            onRefreshSchedules={refreshScheduledWorkflows}
            onCreateSchedule={createScheduledWorkflow}
            onUpdateSchedule={updateScheduledWorkflow}
            onDeleteSchedule={deleteScheduledWorkflow}
            onTriggerSchedule={triggerScheduledWorkflow}
          />
        ) : activeFeature === "skills" ? (
          <SkillsPage
            language={language}
            templates={skillTemplates}
            configuredAgents={snapshot.configuredAgents}
            onImportOnlineSkill={importOnlineSkill}
            onRevealSkillInFinder={revealSkillInFinder}
            onInstallSkill={installSkill}
            onUninstallSkill={uninstallSkill}
          />
        ) : activeFeature === "runtimes" ? (
          <RuntimePage
            language={language}
            channels={configChannels}
            selectedChannelId={selectedConfigChannelId}
            providerKeys={providerKeys}
            codexPluginCatalog={codexPluginCatalog}
            pluginCatalogStatus={pluginCatalogStatus}
            agentTestResults={agentTestResults}
            testingAgentId={testingAgentId}
            agentTestTick={agentTestTick}
            balanceResults={balanceResults}
            balanceLoadingChannelId={balanceLoadingChannelId}
            contextMenu={configContextMenu}
            onUpdateChannel={updateConfigChannel}
            onAddModel={addConfigModel}
            onUpdateModel={updateConfigModel}
            onRemoveModel={removeConfigModel}
            onSave={saveChannelConfig}
            onLoadCodexPluginCatalog={loadCodexPluginCatalog}
            onSelectChannel={setSelectedConfigChannelId}
            onAddConfig={addConfigChannel}
            onOpenContextMenu={openConfigContextMenu}
            onDeleteConfig={deleteConfigChannel}
            onTestChannel={testRuntimeChannel}
            onQueryBalance={queryRuntimeChannelBalance}
            onUpdateProviderKey={updateProviderKey}
          />
        ) : activeFeature === "settings" ? (
          <SettingsPage language={language} keepAwake={keepAwake} onLanguageChange={setLanguage} onKeepAwakeChange={setKeepAwake} />
        ) : activeChat ? (
          <>
            <header className="chat-header">
              <div className="chat-title-block">
	                <h2>{activeChat.title}</h2>
	                <div className="chat-subtitle">
	                  <span className={`agent-badge mini ${agentAccent(activeChatRuntimeId)}`} title={activeChatConfigTitle}>
	                    {activeChatConfiguredAgent?.name || agentLabel(activeChatRuntimeId)}
	                  </span>
	                  <span>{activeChat.sessionId ? `session ${activeChat.sessionId}` : "No provider session yet"}</span>
	                </div>
              </div>
              <div className="chat-header-actions">
                {activeChat.running ? (
                  <button className="icon-btn" onClick={() => void stopActiveChat()} title="Stop">
                    <CircleStop size={14} />
                  </button>
                ) : null}
              </div>
            </header>

            <section className="cli-transcript" ref={transcriptRef} onScroll={handleTranscriptScroll}>
              {activeChat.messages.length === 0 ? (
                <div className="empty-state terminal-empty">
                  <Wand2 size={17} />
                  <span>Start this {activeChatConfiguredAgent?.name || agentLabel(activeChatRuntimeId)} chat.</span>
                </div>
              ) : (
                activeChat.messages.map((message) => (
                  <CliMessage
                    key={message.id}
                    message={message}
                    agentId={activeChatRuntimeId}
                    streaming={activeChat.running && message.id === activeChat.pendingAssistantMessageId}
                  />
                ))
              )}
              {activeChat.running ? (
                <div className="cli-status-line">
                  <span className="stream-pill">
                    <span className="stream-spinner" aria-hidden="true" />
                    <span>{agentLabel(activeChatRuntimeId)} is working…</span>
                  </span>
                </div>
              ) : null}
            </section>

            <section className="composer">
              <SlashCommandSuggestions
                suggestions={slashCommandSuggestions}
                activeIndex={slashCommandIndex}
                onSelect={(suggestion) => completeSlashCommand(suggestion.command)}
              />
              <div className="composer-box">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (slashCommandSuggestions.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSlashCommandIndex((current) => (current + 1) % slashCommandSuggestions.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSlashCommandIndex((current) => (current - 1 + slashCommandSuggestions.length) % slashCommandSuggestions.length);
                      return;
                    }
                    if (event.key === "Tab") {
                      event.preventDefault();
                      completeSlashCommand(slashCommandSuggestions[slashCommandIndex]?.command ?? slashCommandSuggestions[0]!.command);
                      return;
                    }
                  }
                  if (shouldSendComposerKey({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                    isComposing: event.nativeEvent.isComposing,
                  })) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={`Message ${activeChatConfiguredAgent?.name || agentLabel(activeChatRuntimeId)} or type /help...`}
                rows={2}
              />
              <div className="composer-footer">
                <ChatControls
                  configuredAgentId={activeChat.configuredAgentId}
                  modelId={activeChat.modelId}
                  configuredAgents={snapshot.configuredAgents}
                  channels={snapshot.channels}
                  locked={activeChatLocked}
                  running={activeChat.running}
                  workDir={snapshot.workDir}
                  runtimes={snapshot.runtimes}
                  onSelectConfiguredAgent={setActiveChatConfiguredAgent}
                  onSelectModel={setActiveChatModel}
                  onChooseWorkDir={chooseWorkDir}
                  onRefresh={refresh}
                />
                <button className="send-btn" onClick={() => void send()} disabled={!canSend}>
                  <Send size={14} />
                  <span>{activeChat.running ? "Running" : "Send"}</span>
                </button>
              </div>
              </div>
              <div className="composer-hint">
                <kbd>↵</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · <kbd>⌘K</kbd> 命令面板
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state page-empty">
            <Plus size={18} />
            <span>Create a chat to start.</span>
          </div>
        )}
      </main>

      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

interface ChatControlsProps {
  configuredAgentId: string;
  modelId?: string;
  configuredAgents?: ConfiguredAgent[];
  channels: AgentChannel[];
  locked: boolean;
  running: boolean;
  workDir: string;
  runtimes: AgentRuntime[];
  onSelectConfiguredAgent: (configuredAgentId: string) => MaybePromise;
  onSelectModel?: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
}

export function ChatControls({
  configuredAgentId,
  modelId,
  configuredAgents = [],
  channels,
  locked,
  running,
  workDir,
  runtimes,
  onSelectConfiguredAgent,
  onSelectModel = () => undefined,
  onChooseWorkDir,
  onRefresh,
}: ChatControlsProps) {
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const selectedAgent = configuredAgentById(configuredAgentId, configuredAgents);
  const selectedChannel = resolveConfiguredAgentChannel(selectedAgent, channels);
  const runtimeId = configuredAgentRuntimeId(selectedAgent, selectedChannel);
  const runtime = runtimeMap.get(runtimeId) ?? fallbackRuntime(runtimeId);
  const selectedModel = configuredAgentModel(selectedAgent, selectedChannel, modelId);
  const modelOptions = selectedChannel?.models.length ? selectedChannel.models : [{ id: DEFAULT_MODEL_ID, label: "Default" }];
  const selectedModelId = selectedModel?.id ?? DEFAULT_MODEL_ID;
  const selectsDisabled = locked || running;
  const configTitle = [
    selectedAgent?.name,
    selectedChannel?.label ?? "No config",
    selectedModel?.label ?? selectedAgent?.modelId ?? DEFAULT_MODEL_ID,
    runtimeStatus(runtime),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="composer-controls">
      <label className="composer-select-wrap" title={configTitle}>
        <span className={`runtime-dot ${agentAccent(runtimeId)}`} />
        <select
          className="composer-select"
          aria-label="Configured agent"
          value={selectedAgent?.id ?? ""}
          disabled={selectsDisabled || configuredAgents.length === 0}
          onChange={(event) => void onSelectConfiguredAgent(event.currentTarget.value)}
        >
          {configuredAgents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name || agent.id}
            </option>
          ))}
        </select>
      </label>
      <label className="composer-select-wrap" title={configTitle}>
        <select
          className="composer-select"
          aria-label="Agent model"
          value={selectedModelId}
          disabled={selectsDisabled || !selectedChannel}
          onChange={(event) => void onSelectModel(event.currentTarget.value)}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label || model.id}
            </option>
          ))}
        </select>
      </label>
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
    </div>
  );
}

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

  function updateMemberConfiguredAgent(index: number, configuredAgentId: string): void {
    updateMember(index, { configuredAgentId });
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

  function shouldSuppressMemberClick(): boolean {
    return false;
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
          shouldSuppressClick={shouldSuppressMemberClick}
          onDropBefore={dropMemberBefore}
          onUpdateRole={(roleName) => updateMember(index, { roleName })}
          onUpdatePrompt={(memberPrompt) => updateMember(index, { prompt: memberPrompt })}
          onUpdateConfiguredAgent={(configuredAgentId) => updateMemberConfiguredAgent(index, configuredAgentId)}
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

interface TaskPageProps {
  prompt: string;
  configuredAgentId: string;
  modelId?: string;
  configuredAgents: ConfiguredAgent[];
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  tasks: TaskRun[];
  activeTaskId: string | undefined;
  onPromptChange: (value: string) => void;
  onSelectConfiguredAgent: (configuredAgentId: string) => MaybePromise;
  onSelectModel?: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
  onRunTask: () => MaybePromise;
  onRerunTask: (task: TaskRun) => MaybePromise;
  onSelectTask: (taskId: string) => MaybePromise;
  onCloseTaskDetail: () => void;
  onStopTask: (taskId: string) => MaybePromise;
  onDeleteTask: (taskId: string) => MaybePromise;
  onUpdateTaskProgress: (taskId: string, progress: TaskProgress) => MaybePromise;
}

export function TaskPage({
  prompt,
  configuredAgentId,
  modelId = DEFAULT_MODEL_ID,
  configuredAgents,
  workDir,
  runtimes,
  channels,
  tasks,
  activeTaskId,
  onPromptChange,
  onSelectConfiguredAgent,
  onSelectModel = () => undefined,
  onChooseWorkDir,
  onRefresh,
  onRunTask,
  onRerunTask,
  onSelectTask,
  onCloseTaskDetail,
  onStopTask,
  onDeleteTask,
  onUpdateTaskProgress,
}: TaskPageProps) {
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const activeTaskConfiguredAgent = activeTask ? configuredAgentById(activeTask.configuredAgentId, configuredAgents) : undefined;
  const activeChannel = resolveConfiguredAgentChannel(activeTaskConfiguredAgent, channels);
  const activeRuntimeId = configuredAgentRuntimeId(activeTaskConfiguredAgent, activeChannel);
  const activeModel = configuredAgentModel(activeTaskConfiguredAgent, activeChannel, activeTask?.modelId);
  const canRun = Boolean(prompt.trim());
  const [draggingTaskId, setDraggingTaskId] = useState<string | undefined>();
  const kanbanColumns = TASK_STATUS_FILTERS.filter((filter): filter is { id: TaskProgress; label: string } => filter.id !== "all");

  function startTaskDrag(event: DragEvent<HTMLElement>, taskId: string): void {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-multi-agent-task", taskId);
    event.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  }

  function dropTaskOnProgress(event: DragEvent<HTMLElement>, progress: TaskProgress): void {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("application/x-multi-agent-task") || event.dataTransfer.getData("text/plain");
    const task = tasks.find((item) => item.id === taskId);
    setDraggingTaskId(undefined);
    if (!task || task.progress === progress) return;
    void onUpdateTaskProgress(task.id, progress);
  }

  return (
    <section className="tasks-page">
      <section className="task-board-shell">
        <section className="task-kanban-board" aria-label="Task board">
          {kanbanColumns.map((column) => {
            const columnTasks = tasks.filter((task) => task.progress === column.id);
            return (
              <section
                key={column.id}
                className={`task-kanban-column ${draggingTaskId ? "is-drop-ready" : ""}`}
                data-progress={column.id}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => dropTaskOnProgress(event, column.id)}
              >
                <div className="task-kanban-column-head">
                  <span>{column.label}</span>
                  <strong>{columnTasks.length}</strong>
                </div>
                <div className="task-kanban-stack">
                  {column.id === "backlog" ? (
                      <TaskInlineCreateCard
                        prompt={prompt}
                        configuredAgentId={configuredAgentId}
                        modelId={modelId}
                        configuredAgents={configuredAgents}
                        workDir={workDir}
                        runtimes={runtimes}
                        channels={channels}
                        canRun={canRun}
                        onPromptChange={onPromptChange}
                        onSelectConfiguredAgent={onSelectConfiguredAgent}
                        onSelectModel={onSelectModel}
                        onChooseWorkDir={onChooseWorkDir}
                        onRefresh={onRefresh}
                      onRunTask={onRunTask}
                    />
                  ) : null}
                  {columnTasks.length === 0 && column.id !== "backlog" ? (
                    <div className="task-kanban-empty">Drop tasks here</div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskKanbanCard
                        key={task.id}
                        task={task}
                        configuredAgents={configuredAgents}
                        channels={channels}
                        active={task.id === activeTask?.id}
                        onSelect={onSelectTask}
                        onDragStart={startTaskDrag}
                        onDragEnd={() => setDraggingTaskId(undefined)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </section>

      </section>

      {activeTask ? (
        <section className="task-detail-overlay" role="dialog" aria-modal="true" aria-label="Task detail" onClick={onCloseTaskDetail}>
          <article className="task-detail-page task-surface-card" onClick={(event) => event.stopPropagation()}>
            <div className="task-section-heading">
              <div>
                <h2>Task detail</h2>
                <span>{formatTime(activeTask.updatedAt)}</span>
              </div>
              <div className="task-detail-page-actions">
                <TaskStatusChip label={taskProgressLabel(activeTask.progress)} tone={activeTask.progress} />
                <button className="icon-btn flat" onClick={onCloseTaskDetail} title="Close task detail" aria-label="Close task detail">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="task-detail-title">
              <h3>{activeTask.title}</h3>
              <span>{activeTask.id}</span>
            </div>
            <div className="task-detail-status-row">
              <span className={`agent-badge mini ${agentAccent(activeRuntimeId)}`}>{activeTaskConfiguredAgent?.name || agentLabel(activeRuntimeId)}</span>
              <TaskStatusChip label={activeTask.running ? "Running" : activeTask.status} tone={activeTask.running ? "running" : activeTask.status} />
              <TaskStatusChip label={activeTask.sessionId ? "Session linked" : "No session"} tone={activeTask.sessionId ? "done" : "backlog"} />
            </div>
            <div className="task-section-divider">
              <span>Metadata</span>
              <i />
            </div>
            <div className="task-detail-meta task-meta-grid">
              <TaskMeta label="Agent" value={activeTaskConfiguredAgent?.name || agentLabel(activeRuntimeId)} />
              <TaskMeta label="Channel" value={activeChannel?.label ?? "No config"} />
              <TaskMeta label="Model" value={activeModel?.label ?? activeTaskConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID} />
              <TaskMeta label="Run status" value={activeTask.status} />
              <TaskMeta label="Progress" value={taskProgressLabel(activeTask.progress)} />
              <TaskMeta label="Work dir" value={activeTask.workDir} />
              <TaskMeta label="Session" value={activeTask.sessionId ?? "not started"} />
            </div>
            <div className="task-section-divider">
              <span>Full prompt</span>
              <i />
            </div>
            <div className="task-prompt-block">
              <MarkdownDocument text={activeTask.prompt} />
            </div>
            <div className="task-detail-actions">
              <label className="task-progress-select-wrap">
                <span>Progress</span>
                <select
                  className="composer-select task-progress-select"
                  aria-label="Task progress"
                  value={activeTask.progress}
                  onChange={(event) => void onUpdateTaskProgress(activeTask.id, event.currentTarget.value as TaskProgress)}
                >
                  {TASK_STATUS_FILTERS.filter((filter): filter is { id: TaskProgress; label: string } => filter.id !== "all").map((filter) => (
                    <option key={filter.id} value={filter.id}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
              {activeTask.running ? (
                <button className="control-btn compact secondary" onClick={() => void onStopTask(activeTask.id)}>
                  <CircleStop size={14} />
                  <span>Stop</span>
                </button>
              ) : (
                <button className="control-btn compact" onClick={() => void onRerunTask(activeTask)}>
                  <Play size={14} />
                  <span>Run Agent</span>
                </button>
              )}
              <button className="icon-btn danger" onClick={() => void onDeleteTask(activeTask.id)} title="Delete task">
                <Trash2 size={14} />
              </button>
            </div>

            <section className="task-run-timeline" aria-label="Execution timeline">
              <div className="task-section-divider">
                <span>Execution timeline</span>
                <i />
              </div>
              <div className="task-log-stream">
                {activeTask.messages.length === 0 ? (
                  <div className="empty-state terminal-empty">
                    <Wand2 size={17} />
                    <span>Waiting for task output.</span>
                  </div>
                ) : (
                  activeTask.messages.map((message) => (
                    <TaskTimelineMessage key={message.id} message={message} agentId={activeRuntimeId} />
                  ))
                )}
                {activeTask.running ? (
                  <div className="task-log-running">
                    <span className={`runtime-dot ${agentAccent(activeRuntimeId)}`} />
                    <span>{agentLabel(activeRuntimeId)} is running this task</span>
                  </div>
                ) : null}
              </div>
            </section>
          </article>
        </section>
      ) : null}
    </section>
  );
}

function TaskKanbanCard({
  task,
  configuredAgents,
  channels,
  active,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRun;
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  active: boolean;
  onSelect: (taskId: string) => MaybePromise;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd: () => void;
}) {
  const agent = configuredAgentById(task.configuredAgentId, configuredAgents);
  const channel = resolveConfiguredAgentChannel(agent, channels);
  const runtimeId = configuredAgentRuntimeId(agent, channel);

  function selectTask(): void {
    void onSelect(task.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectTask();
  }

  return (
    <article
      className={`task-kanban-card ${active ? "is-active" : ""}`}
      role="button"
      tabIndex={0}
      draggable
      data-task-id={task.id}
      onClick={selectTask}
      onKeyDown={handleKeyDown}
      onDragStart={(event) => onDragStart(event, task.id)}
      onDragEnd={onDragEnd}
    >
      <div className="task-kanban-card-head">
        <span className={`agent-badge mini ${agentAccent(runtimeId)}`}>{agent?.name || agentLabel(runtimeId)}</span>
        <TaskStatusChip label={task.running ? "Running" : task.status} tone={task.running ? "running" : task.status} />
      </div>
      <strong>{task.title}</strong>
      <p>{task.prompt}</p>
      <div className="task-kanban-card-meta">
        <span>{task.messages.length} messages</span>
        <span>{formatTime(task.updatedAt)}</span>
      </div>
    </article>
  );
}

function TaskInlineCreateCard({
  prompt,
  configuredAgentId,
  modelId,
  configuredAgents,
  workDir,
  runtimes,
  channels,
  canRun,
  onPromptChange,
  onSelectConfiguredAgent,
  onSelectModel,
  onChooseWorkDir,
  onRefresh,
  onRunTask,
}: {
  prompt: string;
  configuredAgentId: string;
  modelId: string;
  configuredAgents: ConfiguredAgent[];
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  canRun: boolean;
  onPromptChange: (value: string) => void;
  onSelectConfiguredAgent: (configuredAgentId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
  onRunTask: () => MaybePromise;
}) {
  return (
    <article className="task-inline-create-card task-surface-card">
      <div className="task-section-heading">
        <div>
          <h2>New task</h2>
          <span>{workDir || "No work directory selected"}</span>
        </div>
        <TaskStatusChip label={canRun ? "Ready" : "Draft"} tone={canRun ? "todo" : "backlog"} />
      </div>
      <textarea
        aria-label="Task prompt"
        className="task-create-input"
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
            void onRunTask();
          }
        }}
        placeholder="Describe a task..."
        rows={3}
      />
      <div className="task-create-chipbar">
        <ChatControls
          configuredAgentId={configuredAgentId}
          modelId={modelId}
          configuredAgents={configuredAgents}
          channels={channels}
          locked={false}
          running={false}
          workDir={workDir}
          runtimes={runtimes}
          onSelectConfiguredAgent={onSelectConfiguredAgent}
          onSelectModel={onSelectModel}
          onChooseWorkDir={onChooseWorkDir}
          onRefresh={onRefresh}
        />
      </div>
      <button className="send-btn task-run-btn" onClick={() => void onRunTask()} disabled={!canRun}>
        <Play size={14} />
        <span>Run Agent</span>
      </button>
    </article>
  );
}

function TaskMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="task-meta-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskStatusChip({ label, tone }: { label: string; tone: string }) {
  return <span className={`task-status-chip task-status-${tone}`}>{label}</span>;
}

function TaskTimelineMessage({ message, agentId }: { message: ChatMessage; agentId: AgentId }) {
  const label =
    message.role === "user"
      ? "Prompt"
      : message.role === "assistant"
        ? agentLabel(agentId)
        : message.role === "error"
          ? "Error"
          : "Event";

  return (
    <article className={`task-log-entry ${message.role}`}>
      <div className="task-log-marker" />
      <div className="task-log-body">
        <div className="task-log-meta">
          <span>{label}</span>
          <time>{formatTime(message.timestamp)}</time>
        </div>
        {message.events && message.events.length > 0 ? (
          <div className="task-log-events">
            {message.events.map((event) => (
              <MetaMessage key={event.id} content={chatEventDisplayContent(event)} />
            ))}
          </div>
        ) : null}
        {message.content ? (
          message.role === "assistant" || message.role === "user" ? (
            <div className="cli-markdown">
              <Markdown text={message.content} />
            </div>
          ) : (
            <pre>{message.content}</pre>
          )
        ) : null}
      </div>
    </article>
  );
}

interface ChatHistoryPanelProps {
  chats: ChatSession[];
  configuredAgents: ConfiguredAgent[];
  channels: AgentChannel[];
  activeChatId?: string | undefined;
  contextMenu?: { chatId: string; x: number; y: number } | undefined;
  newChatLabel?: string;
  runningLabel?: string;
  onCreateChat: () => MaybePromise;
  onSelectChat: (chatId: string) => MaybePromise;
  onOpenContextMenu: (event: MouseEvent, chatId: string) => void;
  onDeleteChat: (chatId: string) => MaybePromise;
}

export function ChatHistoryPanel({
  chats,
  configuredAgents,
  channels,
  activeChatId,
  contextMenu,
  newChatLabel = "New chat",
  runningLabel = "Running",
  onCreateChat,
  onSelectChat,
  onOpenContextMenu,
  onDeleteChat,
}: ChatHistoryPanelProps) {
  return (
    <section className="resource-panel chat-list-panel">
      <div className="panel-header">
        <span>Chats</span>
        <SquarePen size={14} />
      </div>
      <div className="new-chat-menu-wrap">
        <button className="new-chat-compact-btn" onClick={() => void onCreateChat()}>
          <Plus size={13} />
          <span>{newChatLabel}</span>
        </button>
      </div>
      <div className="chat-list">
        {chats.map((chat) => {
          const agent = configuredAgentById(chat.configuredAgentId, configuredAgents);
          const channel = resolveConfiguredAgentChannel(agent, channels);
          const runtimeId = configuredAgentRuntimeId(agent, channel);
          return (
            <button
              key={chat.id}
              className={`chat-row ${chat.id === activeChatId ? "is-active" : ""}`}
              onClick={() => void onSelectChat(chat.id)}
              onContextMenu={(event) => onOpenContextMenu(event, chat.id)}
              title={chat.title}
            >
              <span className={`runtime-dot ${agentAccent(runtimeId)} ${chat.running ? "is-pulsing" : ""}`} />
              <strong>{chat.title}</strong>
              <span>{chat.running ? runningLabel : formatTime(chat.updatedAt)}</span>
            </button>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="agent-context-menu chat-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" className="agent-context-menu-item danger is-stacked" onClick={() => void onDeleteChat(contextMenu.chatId)}>
            <Trash2 size={13} />
            <div>
              <strong>Delete chat</strong>
              <small>Delete session and data</small>
            </div>
          </button>
        </div>
      ) : null}
    </section>
  );
}

interface WorkflowHistoryPanelProps {
  workflows: WorkflowDraftState[];
  activeWorkflowId?: string | undefined;
  running?: boolean;
  contextMenu?: { workflowId: string; x: number; y: number } | undefined;
  renameDraft?: { workflowId: string; title: string } | undefined;
  onNewWorkflow: () => MaybePromise;
  onSelectWorkflow: (workflowId: string) => MaybePromise;
  onOpenContextMenu?: (event: MouseEvent, workflowId: string) => void;
  onStartRename?: (workflowId: string) => MaybePromise;
  onRenameDraftChange?: (title: string) => void;
  onConfirmRename?: () => MaybePromise;
  onCancelRename?: () => void;
  onDeleteWorkflow?: (workflowId: string) => MaybePromise;
}

export function WorkflowHistoryPanel({
  workflows,
  activeWorkflowId,
  running = false,
  contextMenu,
  renameDraft,
  onNewWorkflow,
  onSelectWorkflow,
  onOpenContextMenu,
  onStartRename,
  onRenameDraftChange,
  onConfirmRename,
  onCancelRename,
  onDeleteWorkflow,
}: WorkflowHistoryPanelProps) {
  return (
    <section className="resource-panel workflow-list-panel">
      <div className="panel-header">
        <span>Workflows</span>
        <GitBranch size={14} />
      </div>
      <div className="new-chat-menu-wrap">
        <button className="new-chat-compact-btn" onClick={() => void onNewWorkflow()}>
          <Plus size={13} />
          <span>New workflow</span>
        </button>
      </div>
      <div className="workflow-history-list" aria-label="Workflow history">
        {workflows.length === 0 ? <div className="workflow-empty-history">No workflows yet</div> : null}
        {workflows.map((workflow) => (
          <button
            key={workflow.workflowId}
            className={`workflow-history-card ${workflow.workflowId === activeWorkflowId ? "is-active" : ""}`}
            onClick={() => void onSelectWorkflow(workflow.workflowId)}
            onContextMenu={(event) => onOpenContextMenu?.(event, workflow.workflowId)}
          >
            <strong>{workflow.title}</strong>
            <span>{`${workflow.status} · ${workflow.graph.nodes.length} nodes · rev ${workflow.revision}`}</span>
            <small>
              {workflow.objective ||
                (workflow.graphReady || workflow.runProgress.length > 0 || Boolean(workflow.contextDocument || workflow.runContextDocument || workflow.finalReport)
                  ? "未保存目标"
                  : "未开始")}
            </small>
          </button>
        ))}
      </div>
      {contextMenu ? (
        <div
          className="agent-context-menu workflow-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" className="agent-context-menu-item" onClick={() => void onStartRename?.(contextMenu.workflowId)}>
            <SquarePen size={13} />
            <span>Rename workflow</span>
          </button>
          <button
            type="button"
            className="agent-context-menu-item danger"
            disabled={running}
            onClick={() => void onDeleteWorkflow?.(contextMenu.workflowId)}
          >
            <Trash2 size={13} />
            <span>Delete workflow</span>
          </button>
        </div>
      ) : null}
      {renameDraft ? (
        <section className="workflow-rename-overlay" role="dialog" aria-modal="true" aria-label="Rename workflow" onClick={onCancelRename}>
          <form
            className="workflow-rename-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void onConfirmRename?.();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong>Rename workflow</strong>
              <button type="button" className="icon-btn" onClick={onCancelRename} aria-label="Close rename workflow">
                <X size={14} />
              </button>
            </header>
            <input
              value={renameDraft.title}
              onChange={(event) => onRenameDraftChange?.(event.currentTarget.value)}
              aria-label="Workflow name"
              autoFocus
            />
            <footer>
              <button type="button" className="control-btn compact" onClick={onCancelRename}>
                <span>Cancel</span>
              </button>
              <button type="submit" className="send-btn compact" disabled={!renameDraft.title.trim()}>
                <span>Save</span>
              </button>
            </footer>
          </form>
        </section>
      ) : null}
    </section>
  );
}

interface WorkflowPageProps {
  workflowId?: string;
  title?: string;
  status?: WorkflowStatus;
  graph: WorkflowGraph;
  graphReady: boolean;
  objective: string;
  messages: WorkflowGrillMessage[];
  reply: string;
  error: string | undefined;
  configuredAgentId: string;
  modelId?: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents?: ConfiguredAgent[];
  workDir: string;
  running: boolean;
  runProgress?: WorkflowRunProgressItem[];
  contextDocument?: string;
  finalReport?: string;
  onObjectiveChange: (value: string) => void;
  onSelectConfiguredAgent: (configuredAgentId: string) => void;
  onSelectModel?: (modelId: string) => void;
  onDraftGraph: () => void;
  onReplyChange: (value: string) => void;
  onSendReply: () => void;
  onUpdateNode: (nodeId: string, update: Partial<WorkflowGraphNode>) => void;
  onRunGraph: () => MaybePromise;
  onResetSession: () => MaybePromise;
  onStopGrill?: () => void;
  onChooseWorkDir?: () => MaybePromise;
  onRefresh?: () => MaybePromise;
  onReadOutputFile?: (filePath: string) => Promise<LocalFilePreview>;
  language?: Language;
  defaultGraphExpanded?: boolean;
}

export function WorkflowPage({
  workflowId,
  title,
  status = "draft",
  graph,
  graphReady,
  objective,
  messages,
  reply,
  error,
  configuredAgentId,
  modelId = DEFAULT_MODEL_ID,
  runtimes,
  channels,
  configuredAgents = [],
  workDir,
  running,
  runProgress = [],
  contextDocument = "",
  finalReport = "",
  onObjectiveChange,
  onSelectConfiguredAgent,
  onSelectModel = () => undefined,
  onDraftGraph,
  onReplyChange,
  onSendReply,
  onUpdateNode,
  onRunGraph,
  onResetSession,
  onStopGrill = () => undefined,
  onChooseWorkDir = () => undefined,
  onRefresh = () => undefined,
  onReadOutputFile,
  language = "en",
  defaultGraphExpanded = false,
}: WorkflowPageProps) {
  const workflowText = UI_TEXT[language].workflow;
  const validation = validateWorkflowGraph(graph);
  const workflowStarted = messages.length > 0;
  const grillComplete = Math.max(0, messages.filter((message) => message.role === "user").length - 1) >= WORKFLOW_TOTAL_QUESTION_COUNT;
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const workflowConfiguredAgent = configuredAgentById(configuredAgentId, configuredAgents);
  const workflowChannel = resolveConfiguredAgentChannel(workflowConfiguredAgent, channels);
  const workflowRuntimeId = configuredAgentRuntimeId(workflowConfiguredAgent, workflowChannel);
  const workflowRuntime = runtimeMap.get(workflowRuntimeId) ?? fallbackRuntime(workflowRuntimeId);
  const workflowModel = configuredAgentModel(workflowConfiguredAgent, workflowChannel, modelId);
  const workflowConfigTitle = [
    workflowConfiguredAgent?.name,
    workflowChannel?.label,
    workflowModel?.label ?? workflowConfiguredAgent?.modelId ?? DEFAULT_MODEL_ID,
    runtimeStatus(workflowRuntime),
  ]
    .filter(Boolean)
    .join(" · ");
  const runProgressByNodeId = new Map(runProgress.map((item) => [item.nodeId, item]));
  const runProgressVisible = runProgress.length > 0;
  const contextDocumentVisible = contextDocument.trim().length > 0;
  const finalReportVisible = finalReport.trim().length > 0;
  const outputDocuments = workflowId
    ? extractWorkflowOutputDocumentsForPlan(
        workflowStoragePlanFor(workflowId),
        finalReport,
        contextDocument,
        messages.map((message) => message.content).join("\n\n"),
      )
    : [];
  const outputDocumentsVisible = outputDocuments.length > 0;
  const graphVisible = graphReady || runProgressVisible || contextDocumentVisible || finalReportVisible;
  const workflowDisplayTitle = title?.trim() || (graphReady ? graph.title : "New workflow");
  const composerValue = workflowStarted ? reply : objective;
  const composerPlaceholder = workflowStarted
    ? graphVisible
      ? workflowText.modifyPlaceholder
      : workflowText.answerPlaceholder
    : workflowText.taskPlaceholder;
  const composerCanSend = Boolean(composerValue.trim()) && !running;
  const composerLocked = workflowStarted || running;
  const [graphExpanded, setGraphExpanded] = useState(defaultGraphExpanded);
  const [editingWorkflowNodeId, setEditingWorkflowNodeId] = useState<string | undefined>(undefined);
  const [filePreview, setFilePreview] = useState<LocalFilePreview | undefined>(undefined);
  const [filePreviewError, setFilePreviewError] = useState<string | undefined>(undefined);
  const [filePreviewLoadingPath, setFilePreviewLoadingPath] = useState<string | undefined>(undefined);
  const grillTranscriptRef = useRef<HTMLElement>(null);
  const grillStickRef = useRef(true);
  const editingWorkflowNode = graph.nodes.find((node) => node.id === editingWorkflowNodeId);

  useEffect(() => {
    const transcript = grillTranscriptRef.current;
    if (!transcript || !grillStickRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!graphExpanded) return;
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        setEditingWorkflowNodeId(undefined);
        setGraphExpanded(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [graphExpanded]);

  useEffect(() => {
    if (!graphExpanded) setEditingWorkflowNodeId(undefined);
  }, [graphExpanded]);

  useEffect(() => {
    if (!filePreview) return;
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") setFilePreview(undefined);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filePreview]);

  function handleGrillTranscriptScroll(): void {
    const transcript = grillTranscriptRef.current;
    if (!transcript) return;
    grillStickRef.current = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48;
  }

  async function openOutputDocument(filePath: string): Promise<void> {
    if (!onReadOutputFile) {
      setFilePreviewError("当前环境不支持应用内文件预览。");
      return;
    }
    setFilePreviewError(undefined);
    setFilePreviewLoadingPath(filePath);
    try {
      setFilePreview(await onReadOutputFile(filePath));
    } catch (error) {
      setFilePreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setFilePreviewLoadingPath(undefined);
    }
  }

  function renderWorkflowNodeCard(node: WorkflowGraphNode, compact: boolean): ReactElement {
    const nodeRunProgress = runProgressByNodeId.get(node.id);
    const nodeMeta = node.kind === "agent" ? (
      <div className="workflow-node-meta-row">
        <span>{truncateWorkflowContext(node.prompt || "No node prompt.", compact ? 80 : 140)}</span>
      </div>
    ) : null;

    const NodeKindIcon = node.kind === "start" ? Play : node.kind === "end" ? CircleStop : Bot;
    const openNodeEditor = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setEditingWorkflowNodeId(node.id);
    };
    const cardHead = (
      <div className="workflow-graph-card-head">
        <span className="workflow-node-type-icon" data-kind={node.kind} aria-hidden="true">
          <NodeKindIcon size={15} strokeWidth={2.2} />
        </span>
        <div className="workflow-graph-card-headings">
          <span className="workflow-node-type-label">{node.kind}</span>
          <strong>{node.title}</strong>
        </div>
        {nodeRunProgress ? <em className={`workflow-node-run-pill is-${nodeRunProgress.status}`}>{workflowRunStatusLabel(nodeRunProgress.status)}</em> : null}
      </div>
    );

    if (compact) {
      return (
        <article
          className={`workflow-graph-card workflow-canvas-node-card is-${node.kind} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`}
          onContextMenu={openNodeEditor}
        >
          {cardHead}
          {nodeMeta}
          {nodeRunProgress?.detail ? <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div> : null}
        </article>
      );
    }

    return (
      <article
        className={`workflow-graph-card workflow-canvas-node-card workflow-expanded-node-card is-${node.kind} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`}
        onContextMenu={openNodeEditor}
      >
        {cardHead}
        {nodeMeta}
        {nodeRunProgress?.detail ? <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div> : null}
      </article>
    );
  }

  function renderWorkflowNodeEditor(node: WorkflowGraphNode): ReactElement {
    const disabled = running;

    return (
      <section className="workflow-node-edit-overlay" role="dialog" aria-modal="true" aria-label="Edit workflow node" onClick={() => setEditingWorkflowNodeId(undefined)}>
        <article className="workflow-node-edit-modal" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.stopPropagation()}>
          <header>
            <div>
              <strong>{node.title}</strong>
              <span>{node.kind === "agent" ? "Agent node" : node.kind === "start" ? "Start node" : "End node"}</span>
            </div>
            <button className="icon-btn" type="button" onClick={() => setEditingWorkflowNodeId(undefined)} aria-label="Close workflow node editor">
              <X size={15} />
            </button>
          </header>
          <label className="workflow-node-edit-field">
            <span>Title</span>
            <input aria-label={`Node ${node.id} title`} value={node.title} disabled={disabled} onChange={(event) => onUpdateNode(node.id, { title: event.currentTarget.value })} />
          </label>
          {node.kind === "agent" ? (
            <>
              <label className="workflow-node-edit-field">
                <span>Prompt</span>
                <textarea
                  aria-label={`Node ${node.id} prompt`}
                  value={node.prompt}
                  disabled={disabled}
                  onChange={(event) => onUpdateNode(node.id, { prompt: event.currentTarget.value })}
                  rows={8}
                />
              </label>
            </>
          ) : null}
        </article>
      </section>
    );
  }

  return (
    <>
      <header className="chat-header workflow-chat-header">
        <div className="chat-title-block">
          <h2>{workflowDisplayTitle}</h2>
          <div className="chat-subtitle">
            <span className={`agent-badge mini ${agentAccent(workflowRuntimeId)}`} title={workflowConfigTitle}>
              {workflowConfiguredAgent?.name || agentLabel(workflowRuntimeId)}
            </span>
            <span>{graphVisible ? `${validation.executableNodeIds.length} ${workflowText.executableNodes}` : status}</span>
            <span>{workDir || workflowText.noWorkDir}</span>
          </div>
        </div>
        <div className="chat-header-actions workflow-page-actions">
          {running && !graphVisible ? (
            <button className="icon-btn danger" onClick={() => onStopGrill()} title="Stop agent">
              <CircleStop size={14} />
            </button>
          ) : null}
          {graphVisible ? (
            <button className="send-btn" onClick={() => void onRunGraph()} disabled={!validation.valid || running}>
              <Play size={14} />
              <span>{running ? workflowText.running : workflowText.runGraph}</span>
            </button>
          ) : null}
        </div>
      </header>

      <section className="cli-transcript workflow-transcript" aria-label="Workflow transcript" ref={grillTranscriptRef} onScroll={handleGrillTranscriptScroll}>
        {!workflowStarted && !graphVisible ? (
          <div className="empty-state terminal-empty">
            <GitBranch size={17} />
            <span>{workflowText.empty}</span>
          </div>
        ) : workflowStarted ? (
          messages.map((message) => (
            <div key={message.id} className={`cli-message ${message.role}`}>
              <div className="cli-agent-line">
                {message.role === "assistant" ? <span className={`runtime-dot ${agentAccent(workflowRuntimeId)}`} /> : null}
                <span>{message.role === "assistant" ? "Workflow agent" : "You"}</span>
              </div>
              {message.role === "user" ? (
                <div className="cli-markdown">
                  <Markdown text={message.content} />
                </div>
              ) : (
                <div className={`cli-markdown ${running && message.content === WORKFLOW_THINKING_MESSAGE ? "is-streaming" : ""}`}>
                  <Markdown text={workflowAssistantDisplayContent(message.content)} />
                  {running && message.content === WORKFLOW_THINKING_MESSAGE ? <span className="stream-cursor" aria-hidden="true" /> : null}
                </div>
              )}
            </div>
          ))
        ) : null}
        {running ? (
          <div className="cli-status-line">
              <span className="stream-pill">
                <span className="stream-spinner" aria-hidden="true" />
              <span>{`${workflowConfiguredAgent?.name || agentLabel(workflowRuntimeId)} ${workflowText.agentWorking}`}</span>
            </span>
          </div>
        ) : null}
        {error ? <div className="workflow-error workflow-inline-error">{error}</div> : null}
        {graphVisible ? (
          <section className="workflow-result-card" aria-label={workflowText.result}>
            <div className="workflow-result-card-head">
              <div>
                <strong>{graph.title}</strong>
                <span>{validation.valid ? workflowText.dagValid : workflowText.dagInvalid}</span>
              </div>
              <div className="workflow-validation-row-actions">
                <TaskStatusChip label={validation.valid ? workflowText.ready : workflowText.invalid} tone={validation.valid ? "done" : "failed"} />
                <button className="icon-btn flat" onClick={() => setGraphExpanded(true)} title="Expand graph board" aria-label="Expand workflow graph board">
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
            {validation.errors.length > 0 ? (
              <div className="workflow-validation-errors">
                {validation.errors.map((error) => (
                  <span key={error}>{error}</span>
                ))}
              </div>
            ) : null}
            {runProgressVisible ? (
              <section className="workflow-run-progress" aria-label={workflowText.runProgress}>
                <div className="workflow-run-progress-head">
                  <strong>{workflowText.runProgress}</strong>
                  <span>{workflowRunProgressSummary(runProgress)}</span>
                </div>
                <div className="workflow-run-progress-list">
                  {runProgress.map((item) => (
                    <div key={item.nodeId} className={`workflow-run-progress-item is-${item.status}`}>
                      <span>{workflowRunStatusLabel(item.status)}</span>
                      <strong>{item.title}</strong>
                      {item.detail ? <small>{item.detail}</small> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {finalReportVisible ? (
              <section className="workflow-final-report" aria-label="Workflow final report">
                <div className="workflow-final-report-head">
                  <strong>{workflowText.finalReport}</strong>
                  <span>{workflowText.completed}</span>
                </div>
                <div className="workflow-final-report-body">
                  <Markdown text={finalReport} />
                </div>
              </section>
            ) : null}
            {outputDocumentsVisible ? (
              <section className="workflow-output-documents" aria-label="Workflow output documents">
                <div className="workflow-output-documents-head">
                  <strong>{workflowText.outputDocuments}</strong>
                  <span>{`${outputDocuments.length} ${workflowText.files}`}</span>
                </div>
                <div className="workflow-output-document-list">
                  {outputDocuments.map((document) => (
                    <button
                      key={document.path}
                      className="workflow-output-document"
                      onClick={() => void openOutputDocument(document.path)}
                      disabled={filePreviewLoadingPath === document.path}
                      title={document.path}
                    >
                      <FileInput size={14} />
                      <span>{document.title}</span>
                      <small>{filePreviewLoadingPath === document.path ? workflowText.loading : document.path}</small>
                    </button>
                  ))}
                </div>
                {filePreviewError ? <div className="workflow-error">{filePreviewError}</div> : null}
              </section>
            ) : null}
            {graphExpanded ? (
              <>
                <div className="workflow-graph-backdrop" onClick={() => setGraphExpanded(false)} />
                <button className="workflow-graph-close icon-btn" onClick={() => setGraphExpanded(false)} title="Close graph board" aria-label="Close workflow graph board">
                  <X size={15} />
                </button>
                <WorkflowCanvasBoard graph={graph} expanded onNodePositionChange={(nodeId, position) => onUpdateNode(nodeId, { position })} renderNodeCard={(node) => renderWorkflowNodeCard(node, false)} />
                {editingWorkflowNode ? renderWorkflowNodeEditor(editingWorkflowNode) : null}
              </>
            ) : (
              <WorkflowCanvasBoard graph={graph} runProgressByNodeId={runProgressByNodeId} onExpand={() => setGraphExpanded(true)} onNodePositionChange={(nodeId, position) => onUpdateNode(nodeId, { position })} renderNodeCard={(node) => renderWorkflowNodeCard(node, true)} />
            )}
          </section>
        ) : null}
      </section>

      {filePreview ? (
        <section className="workflow-file-preview-overlay" role="dialog" aria-modal="true" aria-label="Workflow output document preview" onClick={() => setFilePreview(undefined)}>
          <article className="workflow-file-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>{filePreview.title}</strong>
                <span>{filePreview.path}</span>
              </div>
              <button className="icon-btn" onClick={() => setFilePreview(undefined)} title={workflowText.closePreview} aria-label={workflowText.closePreview}>
                <X size={15} />
              </button>
            </header>
            {filePreview.truncated ? <div className="workflow-file-preview-note">{workflowText.largeFile}</div> : null}
            <div className="workflow-file-preview-content">
              {isMarkdownFilePath(filePreview.path) ? <MarkdownDocument className="workflow-file-preview-body" text={filePreview.content} /> : <pre>{filePreview.content}</pre>}
            </div>
          </article>
        </section>
      ) : null}

      <section className="composer workflow-composer">
        <div className="composer-box">
          <textarea
            aria-label={workflowStarted ? (graphVisible ? workflowText.replyToAgent : workflowText.replyToQuestion) : workflowText.task}
            value={composerValue}
            onChange={(event) => {
              if (workflowStarted) onReplyChange(event.currentTarget.value);
              else onObjectiveChange(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (shouldSendComposerKey({
                key: event.key,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                isComposing: event.nativeEvent.isComposing,
              })) {
                event.preventDefault();
                if (composerCanSend) void onSendReply();
              }
            }}
            placeholder={composerPlaceholder}
            rows={2}
          />
          <div className="composer-footer">
            <ChatControls
              configuredAgentId={configuredAgentId}
              modelId={modelId}
              configuredAgents={configuredAgents}
              channels={channels}
              locked={composerLocked}
              running={running}
              workDir={workDir}
              runtimes={runtimes}
              onSelectConfiguredAgent={onSelectConfiguredAgent}
              onSelectModel={onSelectModel}
              onChooseWorkDir={onChooseWorkDir}
              onRefresh={onRefresh}
            />
            <div className="workflow-composer-actions">
              {!graphVisible && grillComplete ? (
                <button className="control-btn compact secondary" onClick={onDraftGraph} disabled={running}>
                  <Wand2 size={14} />
                  <span>Generate Graph</span>
                </button>
              ) : null}
              <button className="send-btn" onClick={onSendReply} disabled={!composerCanSend}>
                <Send size={14} />
                <span>{running ? "Running" : workflowStarted ? "Send" : "Start"}</span>
              </button>
            </div>
          </div>
        </div>
        <div className="composer-hint">
          <kbd>↵</kbd> 发送 · <kbd>⇧↵</kbd> 换行 · {graphVisible ? "继续对话可修改 workflow" : "先对话生成 workflow"}
        </div>
      </section>
    </>
  );
}

type WorkflowFlowNodeData = {
  graphNode: WorkflowGraphNode;
  layerSize: number;
};

type WorkflowFlowNode = ReactFlowNode<WorkflowFlowNodeData, "workflowNode">;
type WorkflowFlowEdge = ReactFlowEdge<Record<string, never>, "smoothstep">;

const workflowFlowNodeTypes = {
  workflowNode: WorkflowFlowNodeCard,
};

// Render callback + run progress are injected through context so they can change
// every render without forcing the laid-out node array (and thus dragged
// positions) to be rebuilt.
const WorkflowCanvasNodeContext = createContext<{
  renderNodeCard: (node: WorkflowGraphNode) => ReactElement;
  runProgressByNodeId: Map<string, WorkflowRunProgressItem>;
}>({
  renderNodeCard: () => <span />,
  runProgressByNodeId: new Map<string, WorkflowRunProgressItem>(),
});

function WorkflowFlowNodeCard({ data }: ReactFlowNodeProps<WorkflowFlowNode>) {
  const { graphNode, layerSize } = data;
  const { renderNodeCard, runProgressByNodeId } = useContext(WorkflowCanvasNodeContext);
  const runProgress = runProgressByNodeId.get(graphNode.id);
  return (
    <div
      className={`workflow-canvas-node is-${graphNode.kind} ${runProgress ? `run-${runProgress.status}` : ""}`}
      data-layer-size={layerSize}
    >
      <Handle type="target" position={Position.Left} className="workflow-canvas-handle" isConnectable={false} />
      {renderNodeCard(graphNode)}
      <Handle type="source" position={Position.Right} className="workflow-canvas-handle" isConnectable={false} />
    </div>
  );
}

function workflowLayoutFlowNodes(graph: WorkflowGraph, variant: WorkflowCanvasLayoutVariant): WorkflowFlowNode[] {
  const layout = workflowCanvasLayout(graph, variant);
  return layout.nodes.map((layoutNode) => ({
    id: layoutNode.node.id,
    type: "workflowNode",
    position: { x: layoutNode.x, y: layoutNode.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      graphNode: layoutNode.node,
      layerSize: layoutNode.layerSize,
    },
    style: {
      width: layoutNode.width,
      minHeight: layoutNode.height,
    },
  }));
}

function workflowFlowEdges(
  graph: WorkflowGraph,
  variant: WorkflowCanvasLayoutVariant,
  runProgressByNodeId: Map<string, WorkflowRunProgressItem>,
): WorkflowFlowEdge[] {
  const layout = workflowCanvasLayout(graph, variant);
  return layout.edges.map(({ edge }) => ({
    id: edge.id,
    type: "smoothstep",
    source: edge.fromNodeId,
    target: edge.toNodeId,
    animated: Boolean(runProgressByNodeId.get(edge.fromNodeId)?.status === "running" || runProgressByNodeId.get(edge.toNodeId)?.status === "running"),
    selectable: false,
    data: {},
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
    style: {
      strokeWidth: 2,
    },
  }));
}

function workflowMiniMapNodeColor(node: WorkflowFlowNode, runProgress?: WorkflowRunProgressItem): string {
  const graphNode = node.data.graphNode;
  if (runProgress?.status === "failed") return "var(--danger)";
  if (runProgress?.status === "completed") return "var(--ok)";
  if (runProgress?.status === "running") return "var(--accent)";
  if (graphNode.kind === "start") return "var(--ok)";
  if (graphNode.kind === "end") return "var(--muted)";
  return "var(--accent)";
}

function WorkflowCanvasBoard({
  graph,
  expanded = false,
  runProgressByNodeId = new Map<string, WorkflowRunProgressItem>(),
  onExpand,
  onNodePositionChange,
  renderNodeCard,
  className = "",
}: {
  graph: WorkflowGraph;
  expanded?: boolean;
  runProgressByNodeId?: Map<string, WorkflowRunProgressItem>;
  onExpand?: () => void;
  onNodePositionChange?: (nodeId: string, position: { x: number; y: number }) => void;
  renderNodeCard: (node: WorkflowGraphNode) => ReactElement;
  className?: string;
}) {
  const variant: WorkflowCanvasLayoutVariant = expanded ? "expanded" : "preview";
  const layoutNodes = useMemo(() => workflowLayoutFlowNodes(graph, variant), [graph, variant]);
  const edges = useMemo(() => workflowFlowEdges(graph, variant, runProgressByNodeId), [graph, variant, runProgressByNodeId]);
  // Controlled node state so dragged positions survive re-renders; positions are
  // only reset when the structural layout (graph / variant) changes.
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>(layoutNodes);
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  const nodeContextValue = useMemo(() => ({ renderNodeCard, runProgressByNodeId }), [renderNodeCard, runProgressByNodeId]);
  const miniMapNodeColor = useCallback(
    (node: WorkflowFlowNode) => workflowMiniMapNodeColor(node, runProgressByNodeId.get(node.id)),
    [runProgressByNodeId],
  );

  const fitViewOptions = useMemo(
    () => ({
      padding: expanded ? 0.16 : 0.12,
      // Preview keeps nodes at a readable size: when the flow gets long, fitView
      // is clamped at minZoom instead of shrinking everything to fit, and the
      // canvas overflows so it can be panned (Dify-style) rather than squished.
      minZoom: expanded ? 0.24 : 0.82,
      maxZoom: expanded ? 1.05 : 1,
    }),
    [expanded],
  );

  const board = (
    <div
      className={`workflow-canvas-board workflow-graph-board ${className} ${expanded ? "is-expanded" : ""}`}
      aria-label="Workflow graph board"
      onDoubleClick={() => onExpand?.()}
    >
      <div className="workflow-canvas-viewport">
        <WorkflowCanvasNodeContext.Provider value={nodeContextValue}>
          <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
            className="workflow-react-flow-board"
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_event, node) => onNodePositionChange?.(node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) })}
            nodeTypes={workflowFlowNodeTypes}
            fitView
            fitViewOptions={fitViewOptions}
            minZoom={expanded ? 0.18 : 0.32}
            maxZoom={expanded ? 1.35 : 1.28}
            panOnDrag
            panOnScroll
            zoomOnScroll={expanded}
            zoomOnPinch
            zoomOnDoubleClick={false}
            nodesConnectable={false}
            nodesDraggable={Boolean(onNodePositionChange)}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            preventScrolling={expanded}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
              },
            }}
          >
            <Background gap={18} size={1.25} color="var(--workflow-canvas-dot)" />
            <Controls className="workflow-canvas-controls" position="bottom-left" fitViewOptions={fitViewOptions} showInteractive={false} />
            <MiniMap
              className="workflow-canvas-minimap"
              position="bottom-right"
              pannable
              zoomable
              nodeColor={miniMapNodeColor}
              nodeBorderRadius={8}
              bgColor="var(--panel)"
              maskColor="color-mix(in srgb, var(--panel) 42%, transparent)"
            />
          </ReactFlow>
        </WorkflowCanvasNodeContext.Provider>
      </div>
    </div>
  );

  return board;
}

interface ConfigPageProps {
  language?: Language;
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  selectedConfiguredAgentId: string;
  status: string;
  onSave: () => Promise<void>;
  onAddConfiguredAgent: () => MaybePromise;
  onSelectConfiguredAgent: (agentId: string) => void;
  onUpdateConfiguredAgent: (agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent) => void;
}

interface RuntimePageProps {
  language?: Language;
  channels: AgentChannel[];
  selectedChannelId: string;
  providerKeys: Record<string, string>;
  codexPluginCatalog: CodexPluginCatalogItem[];
  pluginCatalogStatus: string;
  agentTestResults: Record<string, AgentTestUiState>;
  testingAgentId: string | undefined;
  agentTestTick: number;
  balanceResults?: Record<string, ProviderBalanceResult>;
  balanceLoadingChannelId?: string | undefined;
  contextMenu?: { channelId: string; x: number; y: number } | undefined;
  onUpdateChannel: (channelId: string, updater: (channel: AgentChannel) => AgentChannel) => void;
  onAddModel: (channelId: string) => void;
  onUpdateModel: (channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption) => void;
  onRemoveModel: (channelId: string, modelIndex: number) => void;
  onSave: () => Promise<void>;
  onLoadCodexPluginCatalog: () => Promise<void>;
  onSelectChannel: (channelId: string) => void;
  onAddConfig: () => void;
  onOpenContextMenu: (event: MouseEvent, channelId: string) => void;
  onDeleteConfig: (channelId: string) => void;
  onTestChannel: (channelId: string) => Promise<void>;
  onQueryBalance?: (channelId: string) => Promise<void>;
  onUpdateProviderKey: (presetId: string, value: string) => void;
}

export function SkillsPage({
  language,
  templates,
  configuredAgents = [],
  onImportOnlineSkill,
  onRevealSkillInFinder,
  onInstallSkill,
  onUninstallSkill,
  defaultFindSkillChatOpen = false,
}: {
  language: Language;
  templates: SkillTemplate[];
  configuredAgents?: ConfiguredAgent[];
  onImportOnlineSkill?: (skill: OnlineSkillResult) => Promise<ImportedSkillResult>;
  onRevealSkillInFinder?: (filePath: string) => Promise<void>;
  onInstallSkill?: (templateId: string, target: SkillInstallTarget) => Promise<InstalledSkillResult>;
  onUninstallSkill?: (templateId: string, target: SkillInstallTarget) => Promise<UninstalledSkillResult>;
  defaultFindSkillChatOpen?: boolean;
}) {
  const text = UI_TEXT[language].chrome;
  const title = text.skillLibrary;
  const description =
    language === "zh"
      ? `${templates.length} 个内置技能，随应用开箱即用，也可搜索 skills.sh 上的公开 Skills`
      : `${templates.length} bundled skills, ready to use, plus skills.sh search`;
  const onlineTitle = language === "zh" ? "搜索网上 Skills" : "Search online skills";
  const onlineDescription =
    language === "zh"
      ? "默认搜索 skills.sh、官方 skill 仓库和 GitHub 仓库。第三方 skill 只当作未审查内容展示。"
      : "Search skills.sh, official skill repositories, and GitHub repositories. Treat third-party skills as untrusted content.";
  const localTitle = language === "zh" ? "内置技能" : "Bundled skills";
  const searchPlaceholder = language === "zh" ? "搜索 code review、testing、pdf、docs..." : "Search code review, testing, pdf, docs...";
  const searchButton = language === "zh" ? "搜索" : "Search";
  const searchingText = language === "zh" ? "搜索中..." : "Searching...";
  const noOnlineResults = language === "zh" ? "没有找到在线 Skills。" : "No online skills found.";
  const openSource = language === "zh" ? "打开来源" : "Open source";
  const localInstall = language === "zh" ? "本地安装" : "Local install";
  const installLinks = language === "zh" ? "安装/更新链接" : "Install/update links";
  const removeLinks = language === "zh" ? "删除本地链接" : "Remove local links";
  const searchDialogTitle = language === "zh" ? "搜索网上 Skills" : "Search online skills";
  const searchDialogDescription =
    language === "zh"
      ? "搜索结果只在这里展示。预览不会安装到本地；关闭弹窗即不安装。"
      : "Results stay in this dialog. Previewing does not install locally; close the dialog to skip.";
  const previewWithoutInstall = language === "zh" ? "预览，不安装" : "Preview, do not install";
  const translateToZh = language === "zh" ? "查看中文" : "View Chinese";
  const showOriginal = language === "zh" ? "查看原文" : "Show original";
  const sourceTitle = language === "zh" ? "出处" : "Source";
  const repositoryTitle = language === "zh" ? "仓库" : "Repository";
  const installCommandTitle = language === "zh" ? "安装命令" : "Install";
  const findSkillTitle = "Find skill";
  const findSkillDescription =
    language === "zh"
      ? "跟 AI 说你想找什么 skill；找到后先看候选，需要时再导入本软件技能库。"
      : "Chat with AI about the skill you need. Review candidates first, then import into this app's skill library if useful.";
  const findSkillPlaceholder = language === "zh" ? "随便描述想找的 skill，或继续问候选差异..." : "Describe the skill you need, or ask about the candidates...";
  const findSkillWelcome =
    language === "zh"
      ? "告诉我你要什么能力。我会先帮你找线上 skill 候选，也可以继续聊候选差异；你确认要装哪个后，我再导入到本软件技能库。"
      : "Tell me what capability you need. I can find online skill candidates and keep discussing the options; after you confirm one, I will import it into this app's skill library.";
  const [query, setQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<OnlineSkillResult[]>([]);
  const [onlineStatus, setOnlineStatus] = useState("");
  const [onlineSearching, setOnlineSearching] = useState(false);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | undefined>();
  const [selectedOnlineSkillKey, setSelectedOnlineSkillKey] = useState<string | undefined>();
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);
  const [installingTarget, setInstallingTarget] = useState<SkillInstallTarget | undefined>();
  const [installAction, setInstallAction] = useState<"install" | "uninstall" | undefined>();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [selectedInstallTargets, setSelectedInstallTargets] = useState<SkillInstallTarget[]>(["codex"]);
  const [installStatus, setInstallStatus] = useState("");
  const [installStatusTone, setInstallStatusTone] = useState<"success" | "error" | undefined>();
  const [translationStatus, setTranslationStatus] = useState("");
  const [showTranslatedSkill, setShowTranslatedSkill] = useState(false);
  const [findSkillChatOpen, setFindSkillChatOpen] = useState(defaultFindSkillChatOpen);
  const [findSkillConfiguredAgentId, setFindSkillConfiguredAgentId] = useState(() => resolveFindSkillConfiguredAgentId(undefined, configuredAgents));
  const [findSkillInput, setFindSkillInput] = useState("");
  const [findSkillRunning, setFindSkillRunning] = useState(false);
  const [findSkillAgentSessionId, setFindSkillAgentSessionId] = useState<string | undefined>();
  const [findSkillMessages, setFindSkillMessages] = useState<Array<{ id: string; role: "assistant" | "user" | "error"; content: string }>>(() => [
    { id: "find-skill-welcome", role: "assistant", content: findSkillWelcome },
  ]);
  const localSkillItems = useMemo(
    () => templates.map((template) => ({ ...template, itemKey: `local:${template.id}`, kind: "local" as const })),
    [templates],
  );
  const onlineSkillItems = useMemo(
    () => onlineResults.map((skill) => ({ ...skill, itemKey: `online:${skill.id}`, kind: "online" as const })),
    [onlineResults],
  );
  const selectedOnlineSkill = onlineSkillItems.find((skill) => skill.itemKey === selectedOnlineSkillKey);
  const selectedSkill = selectedOnlineSkill ?? localSkillItems.find((skill) => skill.itemKey === selectedSkillKey) ?? localSkillItems[0];
  const selectedSkillSourceUrl = selectedSkill ? (selectedSkill.kind === "online" ? selectedSkill.url : selectedSkill.sourceUrl) : undefined;
  const selectedSkillSourcePath = selectedSkill ? (selectedSkill.kind === "online" ? selectedSkill.path : selectedSkill.sourcePath) : undefined;
  const selectedSkillRepositoryUrl = selectedSkill?.kind === "online" ? selectedSkill.repositoryUrl : undefined;
  const selectedSkillInstallCommand = selectedSkill?.kind === "online" ? selectedSkill.installCommand : undefined;
  const selectedSkillContentLabel = selectedSkill?.kind === "online" ? (selectedSkill.contentLabel ?? "SKILL.md") : "SKILL.md";
  const activeFindSkillConfiguredAgentId = resolveFindSkillConfiguredAgentId(findSkillConfiguredAgentId, configuredAgents);

  useEffect(() => {
    const nextConfiguredAgentId = resolveFindSkillConfiguredAgentId(findSkillConfiguredAgentId, configuredAgents);
    if (nextConfiguredAgentId === findSkillConfiguredAgentId) return;
    setFindSkillConfiguredAgentId(nextConfiguredAgentId);
    setFindSkillAgentSessionId(undefined);
  }, [configuredAgents, findSkillConfiguredAgentId]);

  async function searchOnlineSkills(query: string): Promise<OnlineSkillResult[]> {
    const api = window.multiAgentChat as typeof window.multiAgentChat & {
      searchOnlineSkills?: (query: string) => Promise<OnlineSkillResult[]>;
    };
    return api.searchOnlineSkills ? api.searchOnlineSkills(query) : fetchOnlineSkills(query, ONLINE_SKILL_SOURCES);
  }

  async function askFindSkillAgent(text: string, candidates: OnlineSkillResult[], toolResult?: string): Promise<string | undefined> {
    const configuredAgentId = resolveFindSkillConfiguredAgentId(findSkillConfiguredAgentId, configuredAgents);
    if (!configuredAgentId) return undefined;
    try {
      const request = {
        requestId: `find-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prompt: buildFindSkillAgentPrompt(text, candidates, language, toolResult),
        configuredAgentId,
      };
      const response = await window.multiAgentChat.askWorkflowAgent(findSkillAgentSessionId ? { ...request, sessionId: findSkillAgentSessionId } : request);
      setFindSkillAgentSessionId(response.sessionId);
      return response.content.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  function selectFindSkillConfiguredAgent(configuredAgentId: string): void {
    const nextConfiguredAgentId = resolveFindSkillConfiguredAgentId(configuredAgentId, configuredAgents);
    if (nextConfiguredAgentId === findSkillConfiguredAgentId) return;
    setFindSkillConfiguredAgentId(nextConfiguredAgentId);
    setFindSkillAgentSessionId(undefined);
  }

  function updateFindSkillCandidates(candidates: OnlineSkillResult[]): void {
    setOnlineResults(candidates);
    setOnlineStatus(candidates.length === 0 ? noOnlineResults : `${candidates.length} skills`);
    if (candidates[0]) {
      setSelectedOnlineSkillKey(`online:${candidates[0].id}`);
      setSelectedSkillKey(undefined);
      setShowTranslatedSkill(false);
      setTranslationStatus("");
    }
  }

  function findSkillSearchToolResult(query: string, candidates: OnlineSkillResult[]): string {
    return language === "zh"
      ? `skills.search_online 已执行。query: ${query}。返回 ${candidates.length} 个候选。候选已放在“当前搜索候选”里。请用中文自然总结候选；如果用户已经明确要安装某个候选，再调用 skills.import_online。`
      : `skills.search_online executed. query: ${query}. Returned ${candidates.length} candidate(s). The candidates are in "Current search candidates". Summarize them naturally; if the user clearly wants one installed, call skills.import_online.`;
  }

  async function importFindSkillCandidate(candidate: OnlineSkillResult): Promise<void> {
    if (!onImportOnlineSkill) throw new Error(language === "zh" ? "技能导入能力需要重启应用后生效。" : "Skill import requires restarting the app.");
    const result = await onImportOnlineSkill(candidate);
    setSelectedSkillKey(`local:${result.template.id}`);
    setSelectedOnlineSkillKey(undefined);
    setFindSkillMessages((current) => [
      ...current,
      {
        id: `find-skill-assistant-${Date.now()}`,
        role: "assistant",
        content: findSkillImportSuccessMessage(result, language),
      },
    ]);
  }

  async function runOnlineSearch(): Promise<void> {
    setOnlineSearching(true);
    setOnlineStatus(searchingText);
    try {
      const results = await searchOnlineSkills(query);
      setOnlineResults(results);
      setOnlineStatus(results.length === 0 ? noOnlineResults : `${results.length} skills`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : String(error));
      setOnlineResults([]);
    } finally {
      setOnlineSearching(false);
    }
  }

  async function sendFindSkillMessage(): Promise<void> {
    const text = findSkillInput.trim();
    if (!text || findSkillRunning) return;
    setFindSkillInput("");
    const userMessage = { id: `find-skill-user-${Date.now()}`, role: "user" as const, content: text };
    setFindSkillMessages((current) => [...current, userMessage]);
    setFindSkillRunning(true);
    let candidates: OnlineSkillResult[] = onlineResults;
    try {
      let finalContent: string | undefined;
      let toolResult: string | undefined;
      for (let step = 0; step < 4; step += 1) {
        const agentContent = await askFindSkillAgent(text, candidates, toolResult);
        const toolCall = agentContent ? parseFindSkillAgentToolCall(agentContent) : undefined;
        if (!toolCall) {
          finalContent = agentContent;
          break;
        }
        if (toolCall.tool === "skills.search_online") {
          setOnlineSearching(true);
          setOnlineStatus(searchingText);
          try {
            candidates = await searchOnlineSkills(toolCall.query);
          } finally {
            setOnlineSearching(false);
          }
          updateFindSkillCandidates(candidates);
          toolResult = findSkillSearchToolResult(toolCall.query, candidates);
          continue;
        }
        const importCandidate = candidates[toolCall.candidateIndex - 1];
        if (!importCandidate) {
          finalContent =
            language === "zh"
              ? `当前没有第 ${toolCall.candidateIndex} 个候选。可以先让我继续搜索，或者换一个更具体的描述。`
              : `There is no candidate #${toolCall.candidateIndex}. Ask me to search first, or use a more specific description.`;
          break;
        }
        try {
          await importFindSkillCandidate(importCandidate);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setFindSkillMessages((current) => [
            ...current,
            {
              id: `find-skill-assistant-${Date.now()}`,
              role: "assistant",
              content: `${language === "zh" ? "导入失败" : "Import failed"}：${message}`,
            },
          ]);
        }
        return;
      }
      setFindSkillMessages((current) => [
        ...current,
        { id: `find-skill-assistant-${Date.now()}`, role: "assistant", content: finalContent ?? findSkillFallbackMessage(candidates, language) },
      ]);
    } catch (error) {
      setFindSkillMessages((current) => [
        ...current,
        { id: `find-skill-assistant-${Date.now()}`, role: "assistant", content: findSkillFallbackMessage(candidates, language, error instanceof Error ? error.message : String(error)) },
      ]);
    } finally {
      setFindSkillRunning(false);
    }
  }

  function previewOnlineSkill(skill: (typeof onlineSkillItems)[number]): void {
    setSelectedOnlineSkillKey(skill.itemKey);
    setSelectedSkillKey(undefined);
    setInstallStatus("");
    setInstallStatusTone(undefined);
    setTranslationStatus("");
    setShowTranslatedSkill(false);
    setSearchDialogOpen(false);
  }

  function toggleInstallTarget(target: SkillInstallTarget): void {
    setSelectedInstallTargets((current) => (current.includes(target) ? current.filter((item) => item !== target) : [...current, target]));
  }

  async function applyInstallSelection(action: "install" | "uninstall"): Promise<void> {
    if (!selectedSkill || selectedSkill.kind !== "local" || !onInstallSkill) return;
    const targets = selectedInstallTargets;
    if (targets.length === 0) return;
    setInstallAction(action);
    setInstallStatus("");
    setInstallStatusTone(undefined);
    try {
      const results: string[] = [];
      for (const target of targets) {
        setInstallingTarget(target);
        if (action === "install") {
          const result = await onInstallSkill(selectedSkill.id, target);
          results.push(`${targetLabel(target)}: ${result.path}`);
        } else {
          if (!onUninstallSkill) throw new Error("技能卸载能力需要重启应用后生效。");
          const result = await onUninstallSkill(selectedSkill.id, target);
          results.push(`${targetLabel(target)}: ${result.removed ? result.path : "not installed"}`);
        }
      }
      setInstallStatus(
        language === "zh"
          ? `${action === "install" ? "已安装/更新" : "已删除链接"}：${results.join("；")}`
          : `${action === "install" ? "Installed/updated" : "Removed links"}: ${results.join("; ")}`,
      );
      setInstallStatusTone("success");
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : String(error));
      setInstallStatusTone("error");
    } finally {
      setInstallingTarget(undefined);
      setInstallAction(undefined);
    }
  }

  function translateSelectedSkill(): void {
    if (!selectedSkill) return;
    if (showTranslatedSkill) {
      setShowTranslatedSkill(false);
      setTranslationStatus("");
      return;
    }
    if (!selectedSkill.translationZh) {
      setTranslationStatus(language === "zh" ? "当前技能暂无内置中文阅读版。" : "This skill does not have a bundled Chinese reading view.");
      return;
    }
    setShowTranslatedSkill(true);
    setTranslationStatus(
      language === "zh"
        ? "中文阅读版随应用内置，只用于理解；本地安装的 SKILL.md 仍保持原文。"
        : "Bundled Chinese reading view only; local SKILL.md stays original.",
    );
  }

  return (
    <section className="skills-page">
      <header className="skills-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="skills-header-actions">
          <button className="control-btn compact secondary" type="button" onClick={() => setFindSkillChatOpen(true)}>
            <MessageSquareText size={13} />
            <span>{findSkillTitle}</span>
          </button>
          <button className="control-btn compact" type="button" onClick={() => setSearchDialogOpen(true)}>
            <Search size={13} />
            <span>{onlineTitle}</span>
          </button>
        </div>
      </header>

      <div className={`skills-browser ${findSkillChatOpen ? "has-find-chat" : ""}`}>
        <aside className="skill-list-panel">
          <div className="skill-list-head">
            <div>
              <h3>{localTitle}</h3>
              <p>{onlineDescription}</p>
            </div>
            <span>{localSkillItems.length}</span>
          </div>
          <div className="skill-list-scroll" aria-label="Skill list">
            {localSkillItems.length === 0 ? (
              <div className="empty-state config-empty">{text.noSkills}</div>
            ) : (
              <div className="skill-list-group">
                <span>{localTitle}</span>
                {localSkillItems.map((skill) => (
                  <button
                    key={skill.itemKey}
                    className={`skill-list-item ${selectedSkill?.itemKey === skill.itemKey ? "is-active" : ""}`}
                    type="button"
                    onClick={() => {
                      setSelectedSkillKey(skill.itemKey);
                      setSelectedOnlineSkillKey(undefined);
                      setInstallStatus("");
                      setInstallStatusTone(undefined);
                      setTranslationStatus("");
                      setShowTranslatedSkill(false);
                    }}
                  >
                    <strong>{skillDisplayName(skill)}</strong>
                    <small>{skillDisplayDescription(skill)}</small>
                    <span>{skill.tags.join(", ")}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="skill-detail-panel">
          {selectedSkill ? (
            <>
              <header className="skill-detail-head">
                <div>
                  <span>{selectedSkill.sourceLabel ?? (selectedSkill.kind === "online" ? selectedSkill.sourceLabel : localTitle)}</span>
                  <h3>{skillDisplayName(selectedSkill)}</h3>
                  <p>{skillDisplayDescription(selectedSkill)}</p>
                </div>
              </header>
              <div className="skill-tags" aria-label="Skill tags">
                {selectedSkill.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="skill-detail-source">
                <span>{sourceTitle}</span>
                <div className="skill-source-pills">
                  <span className="skill-source-pill strong">{selectedSkill.sourceLabel ?? (selectedSkill.kind === "online" ? selectedSkill.sourceLabel : localTitle)}</span>
                  {selectedSkillSourcePath ? <span className="skill-source-pill muted">{selectedSkillSourcePath}</span> : null}
                  {selectedSkillSourceUrl ? (
                    <a className="skill-source-pill link" href={selectedSkillSourceUrl} target="_blank" rel="noreferrer">
                      {sourceUrlLabel(selectedSkillSourceUrl)}
                    </a>
                  ) : null}
                  {selectedSkillRepositoryUrl ? (
                    <a className="skill-source-pill link" href={selectedSkillRepositoryUrl} target="_blank" rel="noreferrer">
                      {repositoryTitle}: {sourceUrlLabel(selectedSkillRepositoryUrl)}
                    </a>
                  ) : null}
                  {selectedSkillInstallCommand ? <span className="skill-source-pill muted">{installCommandTitle}: {selectedSkillInstallCommand}</span> : null}
                  {!selectedSkillSourcePath && !selectedSkillSourceUrl ? <span className="skill-source-pill muted">{localTitle}</span> : null}
                </div>
              </div>
              <div className="skill-detail-body-head">
                <span>{selectedSkillContentLabel}</span>
                <div>
                  {selectedSkill.kind === "local" && selectedSkillSourcePath && onRevealSkillInFinder ? (
                    <button
                      className="control-btn compact secondary"
                      type="button"
                      onClick={() => {
                        void onRevealSkillInFinder(selectedSkillSourcePath).catch((error) => {
                          setInstallStatus(error instanceof Error ? error.message : String(error));
                          setInstallStatusTone("error");
                        });
                      }}
                    >
                      <FolderOpen size={13} />
                      <span>Finder</span>
                    </button>
                  ) : null}
                  <button
                    className="control-btn compact secondary"
                    type="button"
                    onClick={translateSelectedSkill}
                  >
                    <span>{showTranslatedSkill ? showOriginal : translateToZh}</span>
                  </button>
                  {selectedSkillSourceUrl ? (
                    <a href={selectedSkillSourceUrl} target="_blank" rel="noreferrer">
                      {openSource}
                    </a>
                  ) : null}
                </div>
              </div>
              {selectedSkill.kind === "local" && onInstallSkill ? (
                <div className="skill-install-actions" aria-label="Install bundled skill">
                  <button className="control-btn compact" type="button" onClick={() => setInstallDialogOpen(true)} disabled={Boolean(installingTarget)}>
                    <Save size={13} />
                    <span>{localInstall}</span>
                  </button>
                </div>
              ) : null}
              {installStatus ? <div className={`skill-install-feedback ${installStatusTone ?? ""}`}>{installStatus}</div> : null}
              {translationStatus ? <div className="skill-translation-note">{translationStatus}</div> : null}
              <MarkdownDocument className="skill-detail-body" text={showTranslatedSkill && selectedSkill.translationZh ? selectedSkill.translationZh : selectedSkill.prompt} />
              {installDialogOpen && selectedSkill.kind === "local" ? (
                <div className="skill-install-modal-backdrop" role="presentation" onClick={() => setInstallDialogOpen(false)}>
                  <section className="skill-install-modal" role="dialog" aria-modal="true" aria-label={localInstall} onClick={(event) => event.stopPropagation()}>
                    <header>
                      <div>
                        <strong>{localInstall}</strong>
                        <span>{skillDisplayName(selectedSkill)}</span>
                      </div>
                      <button className="icon-btn" type="button" onClick={() => setInstallDialogOpen(false)} aria-label="Close">
                        <X size={14} />
                      </button>
                    </header>
                    <div className="skill-install-targets">
                      {SKILL_INSTALL_TARGETS.map((target) => (
                        <label key={target.id} className="skill-install-target">
                          <input
                            type="checkbox"
                            checked={selectedInstallTargets.includes(target.id)}
                            onChange={() => toggleInstallTarget(target.id)}
                          />
                          <span>{target.label}</span>
                          <small>{target.path}</small>
                        </label>
                      ))}
                    </div>
                    {installStatus ? <div className={`skill-install-feedback ${installStatusTone ?? ""}`}>{installStatus}</div> : null}
                    <footer>
                      <button className="control-btn compact" type="button" onClick={() => void applyInstallSelection("install")} disabled={selectedInstallTargets.length === 0 || Boolean(installAction)}>
                        <Save size={13} />
                        <span>{installAction === "install" ? searchingText : installLinks}</span>
                      </button>
                      <button
                        className="control-btn compact secondary"
                        type="button"
                        onClick={() => void applyInstallSelection("uninstall")}
                        disabled={selectedInstallTargets.length === 0 || Boolean(installAction)}
                      >
                        <Trash2 size={13} />
                        <span>{installAction === "uninstall" ? searchingText : removeLinks}</span>
                      </button>
                    </footer>
                  </section>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state config-empty">{text.noSkills}</div>
          )}
        </section>
        {findSkillChatOpen ? (
          <aside className="skill-find-chat-panel" aria-label="Find skill assistant">
            <header className="skill-find-chat-head">
              <div>
                <span>Online search</span>
                <h3>{findSkillTitle}</h3>
                <p>{findSkillDescription}</p>
                <label className="skill-find-agent-select">
                  <select
                    aria-label="Find skill agent"
                    value={activeFindSkillConfiguredAgentId}
                    disabled={findSkillRunning || configuredAgents.length === 0}
                    onChange={(event) => selectFindSkillConfiguredAgent(event.currentTarget.value)}
                  >
                    {configuredAgents.length === 0 ? (
                      <option value="">{text.noConfiguredAgents}</option>
                    ) : (
                      configuredAgents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name || agent.id}
                        </option>
                      ))
                    )}
                  </select>
                </label>
              </div>
              <button className="icon-btn flat" type="button" onClick={() => setFindSkillChatOpen(false)} aria-label="Close find skill assistant">
                <X size={14} />
              </button>
            </header>
            <div className="skill-find-chat-messages" aria-label="Find skill conversation">
              {findSkillMessages.map((message) => (
                <article key={message.id} className={`skill-find-message is-${message.role}`}>
                  {message.role === "assistant" ? <Bot size={13} /> : null}
                  <MarkdownDocument text={message.content} />
                </article>
              ))}
              {findSkillRunning ? (
                <article className="skill-find-message is-assistant">
                  <Bot size={13} />
                  <span>{searchingText}</span>
                </article>
              ) : null}
            </div>
            <form
              className="skill-find-chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void sendFindSkillMessage();
              }}
            >
              <textarea
                aria-label="Find skill message"
                value={findSkillInput}
                placeholder={findSkillPlaceholder}
                rows={3}
                onChange={(event) => setFindSkillInput(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (shouldSendComposerKey({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    metaKey: event.metaKey,
                    ctrlKey: event.ctrlKey,
                    isComposing: event.nativeEvent.isComposing,
                  })) {
                    event.preventDefault();
                    void sendFindSkillMessage();
                  }
                }}
              />
              <button className="send-btn compact" type="submit" disabled={!findSkillInput.trim() || findSkillRunning}>
                <Send size={13} />
                <span>{findSkillRunning ? searchingText : "Send"}</span>
              </button>
            </form>
          </aside>
        ) : null}
      </div>
      {searchDialogOpen ? (
        <div className="skill-install-modal-backdrop skill-search-modal-backdrop" role="presentation" onClick={() => setSearchDialogOpen(false)}>
          <section className="skill-search-modal" role="dialog" aria-modal="true" aria-label={searchDialogTitle} onClick={(event) => event.stopPropagation()}>
            <header className="skill-search-modal-head">
              <div>
                <strong>{searchDialogTitle}</strong>
                <span>{searchDialogDescription}</span>
              </div>
              <button className="icon-btn" type="button" onClick={() => setSearchDialogOpen(false)} aria-label="Close">
                <X size={14} />
              </button>
            </header>
            <div className="online-skill-sources" aria-label="Online skill sources">
              <a href={SKILLS_SH_SOURCE.homepage} target="_blank" rel="noreferrer">
                {SKILLS_SH_SOURCE.label}
              </a>
            </div>
            <div className="online-skills-search">
              <Search size={14} />
              <input
                value={query}
                placeholder={searchPlaceholder}
                onChange={(event) => setQuery(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runOnlineSearch();
                }}
                aria-label={onlineTitle}
                autoFocus
              />
              <button className="control-btn compact" type="button" onClick={() => void runOnlineSearch()} disabled={onlineSearching}>
                <span>{onlineSearching ? searchingText : searchButton}</span>
              </button>
            </div>
            {onlineStatus ? <div className="online-skills-status">{onlineStatus}</div> : null}
            <div className="skill-search-results" aria-label="Online skill search results">
              {onlineSkillItems.length === 0 ? (
                <div className="empty-state config-empty">{onlineSearching ? searchingText : noOnlineResults}</div>
              ) : (
                onlineSkillItems.map((skill) => (
                  <article key={skill.itemKey} className="skill-search-result">
                    <div>
                      <strong>{skillDisplayName(skill)}</strong>
                      <small>{skillDisplayDescription(skill)}</small>
                      <span>{skill.installCommand ? `${skill.sourceLabel} · ${skill.installCommand}` : skill.sourceLabel}</span>
                    </div>
                    <div className="skill-search-result-actions">
                      {skill.url ? (
                        <a href={skill.url} target="_blank" rel="noreferrer">
                          {openSource}
                        </a>
                      ) : null}
                      <button className="control-btn compact" type="button" onClick={() => previewOnlineSkill(skill)}>
                        <span>{previewWithoutInstall}</span>
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export interface ScheduledWorkflowDraft {
  workflowId: string;
  title: string;
  intervalSeconds: number;
  frequency: ScheduledWorkflowFrequency;
  timeOfDay: string;
  timezone: string;
  weekdays: number[];
  dayOfMonth: number;
  enabled: boolean;
}

interface ScheduledWorkflowPageProps {
  language?: Language;
  mode?: "detail" | "create";
  workflows: WorkflowDraftState[];
  store: ScheduledWorkflowStoreState;
  draft: ScheduledWorkflowDraft;
  onDraftChange: (draft: ScheduledWorkflowDraft) => void;
  onConnectRunner: () => MaybePromise;
  onDisconnectRunner: () => MaybePromise;
  onRefreshSchedules: () => MaybePromise;
  onCreateSchedule: () => MaybePromise;
  onUpdateSchedule: (
    schedule: ScheduledWorkflowSchedule,
    update: Partial<Pick<ScheduledWorkflowSchedule, "enabled" | "title" | "intervalSeconds" | "frequency" | "timeOfDay" | "timezone" | "weekdays" | "dayOfMonth">>,
  ) => MaybePromise;
  onDeleteSchedule: (scheduleId: string) => MaybePromise;
  onTriggerSchedule: (scheduleId: string) => MaybePromise;
}

export function ScheduledWorkflowPage({
  language = "en",
  mode = "detail",
  workflows,
  store,
  draft,
  onDraftChange,
  onConnectRunner,
  onDisconnectRunner,
  onRefreshSchedules,
  onCreateSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onTriggerSchedule,
}: ScheduledWorkflowPageProps) {
  const zh = language === "zh";
  const draftWorkflow = workflows.find((workflow) => workflow.workflowId === draft.workflowId) ?? workflows[0];
  const selectedSchedule = mode === "detail" ? (store.schedules.find((schedule) => schedule.scheduleId === store.activeScheduleId) ?? store.schedules[0]) : undefined;
  const selectedScheduleWorkflow = selectedSchedule ? workflows.find((workflow) => workflow.workflowId === selectedSchedule.workflowId) : undefined;
  const [scheduleEditDraft, setScheduleEditDraft] = useState(() => ({
    scheduleId: selectedSchedule?.scheduleId ?? "",
    frequency: selectedSchedule?.frequency ?? "daily",
    timeOfDay: normalizeScheduleTimeOfDay(selectedSchedule?.timeOfDay),
    weekdays: normalizeScheduleWeekdays(selectedSchedule?.weekdays),
    dayOfMonth: normalizeScheduleDayOfMonth(selectedSchedule?.dayOfMonth),
  }));
  const runnerConnected = store.runnerStatus.connected;
  const runnerStatusText = store.runnerStatus.connecting
    ? zh ? "本机连接中" : "Local app connecting"
    : runnerConnected
      ? zh ? "本机已连接" : "Local app connected"
      : zh ? "本机未连接" : "Local app disconnected";
  const runnerDetail = runnerConnected
    ? zh ? "定时任务到期后会在这台电脑上执行。" : "Due schedules will run on this computer."
    : zh ? "连接后会自动注册本机，并接收云端定时事件。" : "Connect to register this computer and receive cloud schedule events.";
  const sortedRuns = store.runs.slice().sort((left, right) => right.startedAt - left.startedAt);

  useEffect(() => {
    setScheduleEditDraft({
      scheduleId: selectedSchedule?.scheduleId ?? "",
      frequency: selectedSchedule?.frequency ?? "daily",
      timeOfDay: normalizeScheduleTimeOfDay(selectedSchedule?.timeOfDay),
      weekdays: normalizeScheduleWeekdays(selectedSchedule?.weekdays),
      dayOfMonth: normalizeScheduleDayOfMonth(selectedSchedule?.dayOfMonth),
    });
  }, [selectedSchedule?.dayOfMonth, selectedSchedule?.frequency, selectedSchedule?.scheduleId, selectedSchedule?.timeOfDay, selectedSchedule?.weekdays]);

  const scheduleEditDirty = Boolean(
    selectedSchedule &&
      (scheduleEditDraft.frequency !== selectedSchedule.frequency ||
        scheduleEditDraft.timeOfDay !== normalizeScheduleTimeOfDay(selectedSchedule.timeOfDay) ||
        scheduleEditDraft.dayOfMonth !== normalizeScheduleDayOfMonth(selectedSchedule.dayOfMonth) ||
        normalizeScheduleWeekdays(scheduleEditDraft.weekdays).join(",") !== normalizeScheduleWeekdays(selectedSchedule.weekdays).join(",")),
  );

  function applyScheduleEdit(): void {
    if (!selectedSchedule) return;
    void onUpdateSchedule(selectedSchedule, {
      frequency: scheduleEditDraft.frequency,
      intervalSeconds: intervalSecondsForFrequency(scheduleEditDraft.frequency),
      timeOfDay: normalizeScheduleTimeOfDay(scheduleEditDraft.timeOfDay),
      ...(scheduleEditDraft.frequency === "weekly" ? { weekdays: normalizeScheduleWeekdays(scheduleEditDraft.weekdays) } : {}),
      ...(scheduleEditDraft.frequency === "monthly" ? { dayOfMonth: normalizeScheduleDayOfMonth(scheduleEditDraft.dayOfMonth) } : {}),
    });
  }

  const createForm = (
    <section className="scheduled-panel scheduled-create-panel scheduled-workflow-detail-panel" aria-label={zh ? "新增定时任务" : "Create scheduled task"}>
      <div className="scheduled-panel-head">
        <h3>{zh ? "新增定时任务" : "New schedule"}</h3>
        <p>{draftWorkflow?.title ?? (zh ? "先在 Workflow 页配置好流程" : "Create and save a workflow first")}</p>
      </div>
      <label className="scheduled-field">
        <span>{zh ? "运行 Workflow" : "Workflow to run"}</span>
        <select
          value={draft.workflowId}
          onChange={(event) => onDraftChange({ ...draft, workflowId: event.currentTarget.value })}
          disabled={workflows.length === 0}
        >
          {workflows.length === 0 ? <option value="">{zh ? "暂无 Workflow" : "No workflows"}</option> : null}
          {workflows.map((workflow) => (
            <option key={workflow.workflowId} value={workflow.workflowId}>
              {workflow.title}
            </option>
          ))}
        </select>
      </label>
      <label className="scheduled-field">
        <span>{zh ? "标题" : "Title"}</span>
        <input value={draft.title} onChange={(event) => onDraftChange({ ...draft, title: event.currentTarget.value })} />
      </label>
      <div className="scheduled-field-row">
        <label className="scheduled-field">
          <span>{zh ? "周期" : "Frequency"}</span>
          <select
            value={draft.frequency}
            onChange={(event) => {
              const frequency = event.currentTarget.value as ScheduledWorkflowFrequency;
              onDraftChange({ ...draft, frequency, intervalSeconds: intervalSecondsForFrequency(frequency) });
            }}
          >
            <option value="daily">{zh ? "每天" : "Daily"}</option>
            <option value="weekly">{zh ? "每周" : "Weekly"}</option>
            <option value="monthly">{zh ? "每月" : "Monthly"}</option>
          </select>
        </label>
        <label className="scheduled-field">
          <span>{zh ? "执行时间" : "Run time"}</span>
          <input
            type="time"
            value={normalizeScheduleTimeOfDay(draft.timeOfDay)}
            onChange={(event) => onDraftChange({ ...draft, timeOfDay: normalizeScheduleTimeOfDay(event.currentTarget.value) })}
          />
        </label>
      </div>
      {draft.frequency === "weekly" ? (
        <div className="scheduled-weekday-picker" aria-label={zh ? "选择星期" : "Choose weekdays"}>
          {WEEKDAY_OPTIONS.map((day) => {
            const active = normalizeScheduleWeekdays(draft.weekdays).includes(day.value);
            return (
              <button
                key={day.value}
                className={`control-btn compact ${active ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  const current = normalizeScheduleWeekdays(draft.weekdays);
                  const nextDays = active ? current.filter((item) => item !== day.value) : [...current, day.value];
                  onDraftChange({ ...draft, weekdays: normalizeScheduleWeekdays(nextDays) });
                }}
              >
                <span>{zh ? day.zh : day.en}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {draft.frequency === "monthly" ? (
        <label className="scheduled-field">
          <span>{zh ? "每月几号" : "Day of month"}</span>
          <input
            type="number"
            min={1}
            max={31}
            value={normalizeScheduleDayOfMonth(draft.dayOfMonth)}
            onChange={(event) => onDraftChange({ ...draft, dayOfMonth: normalizeScheduleDayOfMonth(Number(event.currentTarget.value)) })}
          />
        </label>
      ) : null}
      <label className="settings-toggle-row scheduled-toggle-row">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onDraftChange({ ...draft, enabled: event.currentTarget.checked })}
        />
        <span>
          <strong>{zh ? "云端到点触发" : "Trigger on schedule"}</strong>
          <small>{zh ? "开启后服务器到点会通知本机执行；关闭后只保存计划，不触发。" : "When enabled, the server notifies this computer when due; disabled schedules are saved but do not trigger."}</small>
        </span>
      </label>
      <button className="send-btn compact" type="button" disabled={!draft.workflowId || workflows.length === 0} onClick={() => void onCreateSchedule()}>
        <Plus size={13} />
        <span>{zh ? "创建定时任务" : "Create schedule"}</span>
      </button>
    </section>
  );
  const scheduleEditor = selectedSchedule ? (
    <section className="scheduled-panel scheduled-time-panel" aria-label={zh ? "编辑定时任务时间" : "Edit schedule time"}>
      <div className="scheduled-panel-head">
        <h3>{zh ? "计划时间" : "Schedule time"}</h3>
        <p>{formatScheduleRecurrence(selectedSchedule, language)}</p>
      </div>
      <label className="scheduled-field">
        <span>{zh ? "周期" : "Frequency"}</span>
        <select
          value={scheduleEditDraft.frequency}
          onChange={(event) => {
            const frequency = event.currentTarget.value as ScheduledWorkflowFrequency;
            setScheduleEditDraft((current) => ({ ...current, frequency }));
          }}
        >
          <option value="daily">{zh ? "每天" : "Daily"}</option>
          <option value="weekly">{zh ? "每周" : "Weekly"}</option>
          <option value="monthly">{zh ? "每月" : "Monthly"}</option>
        </select>
      </label>
      <label className="scheduled-field">
        <span>{zh ? "执行时间" : "Run time"}</span>
        <input
          type="time"
          value={normalizeScheduleTimeOfDay(scheduleEditDraft.timeOfDay)}
          onChange={(event) => setScheduleEditDraft((current) => ({ ...current, timeOfDay: normalizeScheduleTimeOfDay(event.currentTarget.value) }))}
        />
      </label>
      {scheduleEditDraft.frequency === "weekly" ? (
        <div className="scheduled-field" aria-label={zh ? "选择星期" : "Choose weekdays"}>
          <span>{zh ? "星期" : "Weekdays"}</span>
          <div className="scheduled-weekday-checks">
            {WEEKDAY_OPTIONS.map((day) => {
              const active = normalizeScheduleWeekdays(scheduleEditDraft.weekdays).includes(day.value);
              return (
                <label key={day.value}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => {
                      const current = normalizeScheduleWeekdays(scheduleEditDraft.weekdays);
                      const nextDays = active ? current.filter((item) => item !== day.value) : [...current, day.value];
                      setScheduleEditDraft((currentDraft) => ({ ...currentDraft, weekdays: normalizeScheduleWeekdays(nextDays) }));
                    }}
                  />
                  <span>{zh ? day.zh : day.en}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      {scheduleEditDraft.frequency === "monthly" ? (
        <label className="scheduled-field">
          <span>{zh ? "每月几号" : "Day of month"}</span>
          <input
            type="number"
            min={1}
            max={31}
            value={normalizeScheduleDayOfMonth(scheduleEditDraft.dayOfMonth)}
            onChange={(event) => setScheduleEditDraft((current) => ({ ...current, dayOfMonth: normalizeScheduleDayOfMonth(Number(event.currentTarget.value)) }))}
          />
        </label>
      ) : null}
      <button className="send-btn compact scheduled-apply-btn" type="button" onClick={applyScheduleEdit} disabled={!scheduleEditDirty}>
        <Save size={13} />
        <span>{zh ? "应用" : "Apply"}</span>
      </button>
    </section>
  ) : null;

  return (
    <section className="scheduled-page">
      <header className="scheduled-page-header scheduled-toolbar">
        <div>
          <h2>{zh ? "定时任务" : "Scheduled tasks"}</h2>
          <p>{zh ? "云端保存计划，到点后通知本机执行 Workflow。" : "The cloud stores schedules and asks this computer to run workflows when due."}</p>
        </div>
        <div className="scheduled-toolbar-actions">
          <div className={`scheduled-runner-pill ${runnerConnected ? "is-connected" : ""}`}>
            <CheckCircle2 size={13} />
            <span>{runnerStatusText}</span>
            <small>{zh ? "云端调度服务" : "Cloud scheduler"}</small>
          </div>
          <button className="send-btn compact" type="button" onClick={() => void onConnectRunner()}>
            <RefreshCw size={13} />
            <span>{zh ? "连接" : "Connect"}</span>
          </button>
          <button className="control-btn compact" type="button" onClick={() => void onDisconnectRunner()}>
            <CircleStop size={13} />
            <span>{zh ? "断开" : "Disconnect"}</span>
          </button>
          <button className="icon-btn" type="button" onClick={() => void onRefreshSchedules()} aria-label="Refresh schedules">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>
      {store.runnerStatus.lastError ? <div className="workflow-error">{store.runnerStatus.lastError}</div> : null}

      <div className="scheduled-layout">
        {mode === "create" ? (
          createForm
        ) : (
          <section className="scheduled-panel scheduled-workflow-detail-panel" aria-label={zh ? "定时任务 Workflow 详情" : "Scheduled workflow detail"}>
            <div className="scheduled-panel-head inline scheduled-workflow-detail-head">
              <div>
                <h3>{selectedSchedule?.title ?? (zh ? "Workflow 详情" : "Workflow detail")}</h3>
              <p>
                {selectedSchedule
                  ? `${formatScheduleRecurrence(selectedSchedule, language)} · ${zh ? "Workflow" : "Workflow"}: ${selectedScheduleWorkflow?.title ?? selectedSchedule.workflowId}${
                      selectedSchedule.nextRunAt ? ` · ${zh ? "下次" : "Next"} ${formatTime(selectedSchedule.nextRunAt)}` : ""
                    } · ${runnerDetail}`
                  : runnerDetail}
                </p>
              </div>
              {selectedSchedule ? (
                <div className="scheduled-detail-actions">
                  <button
                    className={`control-btn compact ${selectedSchedule.enabled ? "is-active" : ""}`}
                    type="button"
                    aria-label={selectedSchedule.enabled ? (zh ? "暂停计划" : "Pause schedule") : (zh ? "启用计划" : "Enable schedule")}
                    onClick={() => void onUpdateSchedule(selectedSchedule, { enabled: !selectedSchedule.enabled })}
                  >
                    <span>{selectedSchedule.enabled ? (zh ? "暂停" : "Pause") : (zh ? "启用" : "Enable")}</span>
                  </button>
                  <button className="control-btn compact" type="button" onClick={() => void onTriggerSchedule(selectedSchedule.scheduleId)}>
                    <Play size={13} />
                    <span>{zh ? "立即执行" : "Run"}</span>
                  </button>
                  <button className="control-btn compact danger" type="button" onClick={() => void onDeleteSchedule(selectedSchedule.scheduleId)}>
                    <Trash2 size={13} />
                    <span>{zh ? "删除" : "Delete"}</span>
                  </button>
                </div>
              ) : null}
            </div>
            {selectedScheduleWorkflow ? (
              <ScheduledWorkflowGraphPreview workflow={selectedScheduleWorkflow} language={language} />
            ) : (
              <div className="empty-state config-empty">{zh ? "左侧选择一个计划，或先创建定时任务。" : "Select a schedule on the left, or create one first."}</div>
            )}
          </section>
        )}

        <aside className="scheduled-side-panel">
          {scheduleEditor}
          <section className="scheduled-panel scheduled-runs-panel">
            <div className="scheduled-panel-head">
              <h3>{zh ? "最近执行" : "Recent runs"}</h3>
              <p>{zh ? "本机执行定时任务后的状态。" : "Execution status reported by this computer."}</p>
            </div>
            <div className="scheduled-run-list">
              {sortedRuns.length === 0 ? <div className="empty-state config-empty">{zh ? "暂无执行记录" : "No run history"}</div> : null}
              {sortedRuns.map((run) => (
                <article key={run.runId} className={`scheduled-run-row is-${run.status}`}>
                  <span>{run.status}</span>
                  <strong>{run.title}</strong>
                  <small>{run.message || (run.finishedAt ? formatTime(run.finishedAt) : formatTime(run.startedAt))}</small>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function ScheduledWorkflowGraphPreview({ workflow, language }: { workflow: WorkflowDraftState; language: Language }) {
  const zh = language === "zh";
  const renderScheduleNodeCard = (node: WorkflowGraphNode): ReactElement => (
    <article className={`scheduled-workflow-node workflow-graph-card workflow-canvas-node-card is-${node.kind}`}>
      <div className="workflow-graph-card-head">
        <span>{node.kind}</span>
        <strong>{node.title}</strong>
      </div>
    </article>
  );

  return (
    <div className="scheduled-workflow-detail">
      <div aria-label={zh ? "Workflow 图详情" : "Workflow graph detail"}>
        <WorkflowCanvasBoard graph={workflow.graph} className="scheduled-workflow-graph" renderNodeCard={renderScheduleNodeCard} />
      </div>
    </div>
  );
}

export function SettingsPage({
  language,
  keepAwake = false,
  onLanguageChange,
  onKeepAwakeChange,
}: {
  language: Language;
  keepAwake?: boolean;
  onLanguageChange: (language: Language) => void;
  onKeepAwakeChange?: (enabled: boolean) => void;
}) {
  const configText = UI_TEXT[language].config;
  const title = language === "zh" ? "设置" : "Settings";
  const description = language === "zh" ? "调整应用级偏好。" : "Adjust app-level preferences.";
  const languageTitle = language === "zh" ? "语言" : "Language";
  const languageDescription = language === "zh" ? "选择界面显示语言。" : "Choose the interface language.";
  const powerTitle = language === "zh" ? "定时任务" : "Scheduled tasks";
  const powerDescription =
    language === "zh"
      ? "本地 App 在线等待远程定时任务时，可阻止系统自动进入休眠。"
      : "Prevent automatic sleep while the local app waits for remote scheduled tasks.";
  const keepAwakeTitle = language === "zh" ? "保持唤醒" : "Keep awake";
  const keepAwakeDescription =
    language === "zh"
      ? "只阻止自动休眠，不点亮屏幕；手动合盖、关机或断网仍会中断本地执行。"
      : "Prevents idle sleep without forcing the display on; closing the lid, shutdown, or network loss still interrupts local execution.";

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="settings-layout">
        <section className="settings-panel" aria-label={languageTitle}>
          <div className="settings-panel-head">
            <h3>{languageTitle}</h3>
            <p>{languageDescription}</p>
          </div>
          <label className="settings-language-select">
            <span>{configText.language}</span>
            <select aria-label="Language" value={language} onChange={(event) => onLanguageChange(event.currentTarget.value as Language)}>
              <option value="zh">{configText.zh}</option>
              <option value="en">{configText.en}</option>
            </select>
          </label>
        </section>
        <section className="settings-panel" aria-label={powerTitle}>
          <div className="settings-panel-head">
            <h3>{powerTitle}</h3>
            <p>{powerDescription}</p>
          </div>
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              aria-label="Keep awake for scheduled tasks"
              checked={keepAwake}
              onChange={(event) => onKeepAwakeChange?.(event.currentTarget.checked)}
            />
            <span>
              <strong>{keepAwakeTitle}</strong>
              <small>{keepAwakeDescription}</small>
            </span>
          </label>
        </section>
      </div>
    </section>
  );
}

export function RuntimePage({
  language = "en",
  channels,
  selectedChannelId,
  providerKeys,
  codexPluginCatalog,
  pluginCatalogStatus,
  agentTestResults,
  testingAgentId,
  agentTestTick,
  balanceResults = {},
  balanceLoadingChannelId,
  contextMenu,
  onUpdateChannel,
  onAddModel,
  onUpdateModel,
  onRemoveModel,
  onSave,
  onLoadCodexPluginCatalog,
  onSelectChannel,
  onAddConfig,
  onOpenContextMenu,
  onDeleteConfig,
  onTestChannel,
  onQueryBalance,
  onUpdateProviderKey,
}: RuntimePageProps) {
  const configText = UI_TEXT[language].config;
  const runtimeTitle = language === "zh" ? "配置" : "Config";
  const runtimeDescription =
    language === "zh"
      ? "管理 Codex / Claude / API 执行器、Provider、API Key、插件和模型。"
      : "Manage Codex / Claude / API executors, providers, API keys, plugins, and models.";
  const channelTitle = language === "zh" ? "配置项" : "Configs";
  const addConfigText = language === "zh" ? "新增配置" : "Add config";
  const deleteConfigText = language === "zh" ? "删除配置" : "Delete config";
  const runtimeConfigReady = language === "zh" ? "配置可用" : "Config works";
  const runtimeConfigTesting = language === "zh" ? "测试中" : "Testing";
  const runtimeConfigTest = language === "zh" ? "测试" : "Test";
  const runtimeConfigTestFailed = language === "zh" ? "测试失败" : "Test failed";
  const runtimeConfigTestRunning = language === "zh" ? "正在测试配置" : "Testing config";
  const runtimeExecutorLabel = language === "zh" ? "执行器" : "Executor";
  const balanceTitle = language === "zh" ? "余额" : "Balance";
  const refreshBalanceText = language === "zh" ? "刷新余额" : "Refresh balance";
  const balanceRefreshingText = language === "zh" ? "查询中" : "Checking";
  const balanceIdleText = language === "zh" ? "点击刷新查询当前 Provider 余额。" : "Refresh to query the current provider balance.";
  const balanceNoDataText = language === "zh" ? "Provider 没有返回余额明细。" : "The provider did not return balance details.";
  const visibleRuntimeChannels = useMemo(() => selectConfigChannelsForDisplay(channels), [channels]);
  const selectedRuntimeChannelRecord = useMemo(() => configChannelForSelection(channels, selectedChannelId), [channels, selectedChannelId]);
  const selectedRuntimeChannelId = selectedRuntimeChannelRecord?.id ?? "";
  const configuredPluginIds = useMemo(() => new Set((selectedRuntimeChannelRecord?.plugins ?? []).map((plugin) => plugin.id)), [selectedRuntimeChannelRecord]);
  const availableCodexPlugins = useMemo(() => codexPluginCatalog.filter((plugin) => !configuredPluginIds.has(plugin.id)), [codexPluginCatalog, configuredPluginIds]);
  const selectedRuntime = selectedRuntimeChannelRecord?.agentId ?? "codex";
  const runtimeProviderPresets = useMemo(() => AGENT_PROVIDER_PRESETS.filter((preset) => preset.runtimeAgentId === selectedRuntime), [selectedRuntime]);
  const updateSelectedRuntimeChannel = (updater: (channel: AgentChannel) => AgentChannel): void => {
    if (!selectedRuntimeChannelRecord) return;
    onUpdateChannel(selectedRuntimeChannelRecord.id, updater);
  };
  const selectedRuntimePresetId = selectedRuntimeChannelRecord
    ? (runtimeProviderPresets.find(
        (preset) =>
          preset.runtimeAgentId === selectedRuntime &&
          (preset.modelProvider ?? "") === (selectedRuntimeChannelRecord.modelProvider ?? "") &&
          (preset.baseUrl ?? "") === (selectedRuntimeChannelRecord.baseUrl ?? ""),
      )?.id ?? (selectedRuntime === "codex" ? "custom" : undefined))
    : undefined;
  const selectedRuntimePreset = useMemo(
    () => (selectedRuntimePresetId ? AGENT_PROVIDER_PRESETS.find((preset) => preset.id === selectedRuntimePresetId) : undefined),
    [selectedRuntimePresetId],
  );
  const selectedProviderKey = providerKeyValue(providerKeys, selectedRuntimePreset, selectedRuntimeChannelRecord);
  const presetModelIds = useMemo(() => new Set(selectedRuntimePreset?.models.map((model) => model.id) ?? []), [selectedRuntimePreset]);
  const selectedRuntimeCustomModelId =
    selectedRuntimeChannelRecord?.models.filter((model) => model.id !== DEFAULT_MODEL_ID && !presetModelIds.has(model.id)).at(-1)?.id ?? "";
  const selectedChannelTestResult = selectedRuntimeChannelRecord ? agentTestResults[selectedRuntimeChannelRecord.id] : undefined;
  const selectedChannelTesting = Boolean(selectedRuntimeChannelRecord && testingAgentId === selectedRuntimeChannelRecord.id);
  const selectedBalanceResult = selectedRuntimeChannelRecord ? balanceResults[selectedRuntimeChannelRecord.id] : undefined;
  const selectedBalanceLoading = Boolean(selectedRuntimeChannelRecord && balanceLoadingChannelId === selectedRuntimeChannelRecord.id);
  const selectedChannelTestElapsedMs =
    selectedChannelTestResult?.state === "running"
      ? Date.now() - selectedChannelTestResult.startedAt + agentTestTick * 0
      : (selectedChannelTestResult?.elapsedMs ?? 0);
  const selectedChannelTestModelLabel = selectedChannelTestResult
    ? (selectedRuntimeChannelRecord?.models.find((model) => model.id === selectedChannelTestResult.modelId)?.label ?? selectedChannelTestResult.modelId)
    : "";

  const applyRuntimePreset = (preset: AgentProviderPreset): void => {
    if (!selectedRuntimeChannelRecord) return;
    const cachedProviderKeys = rememberProviderKeyFromChannel(providerKeys, selectedRuntimePreset, selectedRuntimeChannelRecord);
    const cachedSelectedProviderKey = selectedRuntimePreset ? cachedProviderKeys[selectedRuntimePreset.id] : undefined;
    if (selectedRuntimePreset?.usesApiKey && cachedSelectedProviderKey && cachedSelectedProviderKey !== providerKeys[selectedRuntimePreset.id]) {
      onUpdateProviderKey(selectedRuntimePreset.id, cachedSelectedProviderKey);
    }
    const apiKey = cachedProviderKeys[preset.id] ?? (preset.id === selectedRuntimePresetId ? apiKeyFromChannelHeaders(selectedRuntimeChannelRecord, preset) : "");
    updateSelectedRuntimeChannel((channel) => applyProviderPresetToChannel(channel, preset, apiKey));
  };
  const selectRuntime = (runtimeAgentId: AgentId): void => {
    const nextChannel = visibleRuntimeChannels.find((channel) => channel.agentId === runtimeAgentId);
    if (nextChannel) onSelectChannel(nextChannel.id);
  };
  const updateSelectedProviderKey = (value: string): void => {
    if (!selectedRuntimePreset) return;
    onUpdateProviderKey(selectedRuntimePreset.id, value);
    updateSelectedRuntimeChannel((channel) => applyProviderPresetToChannel(channel, selectedRuntimePreset, value));
  };
  const updateSelectedProviderModelId = (value: string): void => {
    const modelId = value.trim();
    const previousModelId = selectedRuntimeCustomModelId;
    updateSelectedRuntimeChannel((channel) => ({
      ...channel,
      models: modelId
        ? channel.models.some((model) => model.id === previousModelId)
          ? channel.models
              .map((model) => (model.id === previousModelId ? { id: modelId, label: modelId } : model))
              .filter((model, index, models) => models.findIndex((item) => item.id === model.id) === index)
          : channel.models.some((model) => model.id === modelId)
            ? channel.models.map((model) => (model.id === modelId ? { ...model, label: model.label || modelId } : model))
            : [...channel.models, { id: modelId, label: modelId }]
        : channel.models.filter((model) => model.id !== previousModelId),
    }));
  };

  return (
    <section className="runtime-page">
      <header className="config-header runtime-header">
        <div>
          <h2>{runtimeTitle}</h2>
          <p>{runtimeDescription}</p>
        </div>
        <button className="control-btn compact" type="button" onClick={() => void onSave()}>
          <Save size={13} />
          <span>{configText.save}</span>
        </button>
      </header>

      <div className="runtime-layout">
        <aside className="runtime-channel-panel">
          <div className="panel-header">
            <span>{channelTitle}</span>
            <Cpu size={14} />
          </div>
          <button className="control-btn compact secondary runtime-add-config-btn" type="button" onClick={onAddConfig}>
            <Plus size={13} />
            <span>{addConfigText}</span>
          </button>
          <div className="runtime-channel-list" aria-label="Config channels">
            {visibleRuntimeChannels.length === 0 ? (
              <div className="empty-state config-empty">No channels</div>
            ) : (
              visibleRuntimeChannels.map((channel) => (
                <button
                  key={channel.id}
                  className={`runtime-channel-row ${channel.id === selectedRuntimeChannelId ? "is-active" : ""}`}
                  type="button"
                  onClick={() => onSelectChannel(channel.id)}
                  onContextMenu={(event) => onOpenContextMenu(event, channel.id)}
                >
                  <span className={`agent-badge mini ${agentAccent(channel.agentId)}`}>{agentLabel(channel.agentId)}</span>
                  <strong>{channel.label || channel.id}</strong>
                  <span>{channel.providerName ?? channel.modelProvider ?? channel.id}</span>
                </button>
              ))
            )}
          </div>
          {contextMenu ? (
            <div
              className="agent-context-menu runtime-config-context-menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className="agent-context-menu-item danger"
                disabled={visibleRuntimeChannels.length <= 1}
                onClick={() => onDeleteConfig(contextMenu.channelId)}
              >
                <Trash2 size={13} />
                <span>{deleteConfigText}</span>
              </button>
            </div>
          ) : null}
        </aside>

        <section className="config-form runtime-editor">
          {selectedRuntimeChannelRecord ? (
            <>
              <div className="runtime-editor-actions">
                <div>
                  <span className={`agent-badge mini ${agentAccent(selectedRuntime)}`}>{agentLabel(selectedRuntime)}</span>
                  <strong>{selectedRuntimeChannelRecord.label || selectedRuntimeChannelRecord.id}</strong>
                </div>
                <button
                  type="button"
                  className="control-btn compact secondary"
                  onClick={() => void onTestChannel(selectedRuntimeChannelRecord.id)}
                  disabled={selectedChannelTesting}
                >
                  <RefreshCw size={13} />
                  <span>{selectedChannelTesting ? runtimeConfigTesting : runtimeConfigTest}</span>
                </button>
              </div>
              {selectedChannelTestResult ? (
                selectedChannelTestResult.state === "passed" ? (
                  <section className="agent-test-result passed collapsed">
                    <div className="agent-test-success-icon" aria-hidden="true">
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="agent-test-success-copy">
                      <strong>{runtimeConfigReady}</strong>
                      <span>{`${selectedChannelTestResult.providerLabel} · ${selectedChannelTestModelLabel}`}</span>
                    </div>
                    <span className="agent-test-success-duration">{formatDuration(selectedChannelTestElapsedMs)}</span>
                  </section>
                ) : (
                  <section className={`agent-test-result ${selectedChannelTestResult.state}`}>
                    <div className="agent-test-result-head">
                      <div>
                        <strong>{selectedChannelTestResult.state === "running" ? runtimeConfigTestRunning : runtimeConfigTestFailed}</strong>
                        <span>{selectedChannelTestResult.phase}</span>
                      </div>
                      <span>{formatDuration(selectedChannelTestElapsedMs)}</span>
                    </div>
                    {selectedChannelTestResult.state === "running" ? <div className="agent-test-progress" aria-hidden="true" /> : null}
                    <dl className="agent-test-meta">
                      <div>
                        <dt>{runtimeExecutorLabel}</dt>
                        <dd>{agentLabel(selectedChannelTestResult.runtimeAgentId)}</dd>
                      </div>
                      <div>
                        <dt>Provider</dt>
                        <dd>{selectedChannelTestResult.providerLabel}</dd>
                      </div>
                      <div>
                        <dt>Model</dt>
                        <dd>{selectedChannelTestResult.modelId}</dd>
                      </div>
                    </dl>
                    <p>{selectedChannelTestResult.message}</p>
                    {selectedChannelTestResult.transcript.length > 0 ? (
                      <div className="agent-test-transcript" aria-label="Config test interaction">
                        {selectedChannelTestResult.transcript.map((item) => (
                          <div key={item.id} className={`agent-test-transcript-row ${item.type}`}>
                            <span>{agentTestEventLabel(item.type)}</span>
                            <pre>{item.content}</pre>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {selectedChannelTestResult.output ? <pre>{selectedChannelTestResult.output}</pre> : null}
                  </section>
                )
              ) : null}
              <section className={`provider-balance-panel ${selectedBalanceResult?.status ?? "idle"}`}>
                <div className="provider-balance-head">
                  <div>
                    <h3>{balanceTitle}</h3>
                    <span>{selectedBalanceResult?.providerName ?? selectedRuntimeChannelRecord.providerName ?? selectedRuntimeChannelRecord.label}</span>
                  </div>
                  <button
                    type="button"
                    className="control-btn compact secondary"
                    onClick={() => void onQueryBalance?.(selectedRuntimeChannelRecord.id)}
                    disabled={selectedBalanceLoading || !onQueryBalance}
                  >
                    <RefreshCw size={13} />
                    <span>{selectedBalanceLoading ? balanceRefreshingText : refreshBalanceText}</span>
                  </button>
                </div>
                {selectedBalanceResult ? (
                  <div className="provider-balance-body">
                    {selectedBalanceResult.items.length > 0 ? (
                      selectedBalanceResult.items.map((item, index) => {
                        const detail = formatBalanceDetail(item, language);
                        return (
                          <div key={`${item.label ?? "balance"}:${index}`} className={`provider-balance-item ${item.isValid === false ? "is-invalid" : ""}`}>
                            <span>{item.label ?? selectedBalanceResult.providerName ?? balanceTitle}</span>
                            <strong>{formatBalanceValue(item)}</strong>
                            {detail ? <small>{detail}</small> : null}
                          </div>
                        );
                      })
                    ) : (
                      <p>{selectedBalanceResult.status === "success" ? balanceNoDataText : selectedBalanceResult.message}</p>
                    )}
                  </div>
                ) : (
                  <p className="provider-balance-idle">{selectedBalanceLoading ? balanceRefreshingText : balanceIdleText}</p>
                )}
              </section>
              <section className="agent-provider-presets">
                <div className="agent-provider-presets-head">
                  <h3>CLI</h3>
                  <span>{configText.cliHelp}</span>
                </div>
                <div className="agent-provider-preset-list">
                  {AGENTS.map((agentId) => (
                    <button
                      type="button"
                      key={agentId}
                      className={`agent-provider-preset ${selectedRuntime === agentId ? "is-active" : ""}`}
                      onClick={() => selectRuntime(agentId)}
                    >
                      <span className={`agent-badge mini ${agentAccent(agentId)}`}>{agentLabel(agentId)}</span>
                      <strong>{agentLabel(agentId)}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="agent-provider-presets">
                <div className="agent-provider-presets-head">
                  <h3>Provider</h3>
                  <span>{`${configText.providerHelp} ${agentLabel(selectedRuntime)}.`}</span>
                </div>
                <div className="agent-provider-preset-list">
                  {runtimeProviderPresets.map((preset) => (
                    <button
                      type="button"
                      key={preset.id}
                      className={`agent-provider-preset ${selectedRuntimePresetId === preset.id ? "is-active" : ""}`}
                      onClick={() => applyRuntimePreset(preset)}
                    >
                      <strong>{preset.label}</strong>
                    </button>
                  ))}
                </div>
                {selectedRuntimePreset?.usesApiKey ? (
                  <label className="agent-provider-key-field">
                    <span>{configText.apiKey}</span>
                    <input
                      aria-label="Provider API key"
                      type="password"
                      value={selectedProviderKey}
                      placeholder={`${configText.usedByAll} ${selectedRuntimePreset.label} agents`}
                      onChange={(event) => updateSelectedProviderKey(event.currentTarget.value)}
                    />
                  </label>
                ) : null}
                {selectedRuntimePreset?.configurableModelId ? (
                  <label className="agent-provider-key-field">
                    <span>{selectedRuntimePreset.configurableModelLabel ?? "Model ID"}</span>
                    <input
                      aria-label="Provider endpoint or model id"
                      value={selectedRuntimeCustomModelId}
                      placeholder={selectedRuntimePreset.configurableModelPlaceholder ?? "model-or-endpoint-id"}
                      onChange={(event) => updateSelectedProviderModelId(event.currentTarget.value)}
                    />
                  </label>
                ) : null}
              </section>

              <details className="agent-advanced-panel">
                <summary>{configText.advancedProvider}</summary>
                <div className="config-field-grid">
                  <label className="config-field">
                    <span>Channel ID</span>
                    <div className="configured-agent-runtime-readonly">
                      <span className={`agent-badge mini ${agentAccent(selectedRuntime)}`}>{agentLabel(selectedRuntime)}</span>
                      <strong>{selectedRuntimeChannelRecord.id}</strong>
                    </div>
                  </label>
                  <label className="config-field">
                    <span>Label</span>
                    <input
                      value={selectedRuntimeChannelRecord.label}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => ({ ...channel, label: event.currentTarget.value }))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Model Provider</span>
                    <input
                      value={selectedRuntimeChannelRecord.modelProvider ?? ""}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => withOptionalString(channel, "modelProvider", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Provider Name</span>
                    <input
                      value={selectedRuntimeChannelRecord.providerName ?? ""}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => withOptionalString(channel, "providerName", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Wire API</span>
                    <input
                      value={selectedRuntimeChannelRecord.wireApi ?? ""}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => withOptionalString(channel, "wireApi", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field config-field-wide">
                    <span>Base URL</span>
                    <input
                      value={selectedRuntimeChannelRecord.baseUrl ?? ""}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => withOptionalString(channel, "baseUrl", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field">
                    <span>Reasoning</span>
                    <input
                      value={selectedRuntimeChannelRecord.modelReasoningEffort ?? ""}
                      onChange={(event) =>
                        updateSelectedRuntimeChannel((channel) => withOptionalString(channel, "modelReasoningEffort", event.currentTarget.value))
                      }
                    />
                  </label>
                  <label className="config-field config-field-wide">
                    <span>Catalog JSON</span>
                    <input
                      value={selectedRuntimeChannelRecord.modelCatalogJson ?? ""}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => withOptionalString(channel, "modelCatalogJson", event.currentTarget.value))}
                    />
                  </label>
                  <label className="config-field config-field-wide">
                    <span>Headers</span>
                    <textarea
                      value={headersToText(selectedRuntimeChannelRecord.httpHeaders)}
                      onChange={(event) => updateSelectedRuntimeChannel((channel) => withOptionalHeaders(channel, event.currentTarget.value))}
                    />
                  </label>
                </div>
              </details>

              {selectedRuntime === "codex" ? (
                <section className="agent-channel-models">
                  <div className="config-models-header">
                    <h3>{configText.plugins}</h3>
                    <div className="config-plugin-actions">
                      <button
                        className="control-btn compact secondary"
                        type="button"
                        onClick={() => void onLoadCodexPluginCatalog()}
                        aria-label="Load Codex plugin catalog"
                      >
                        <RefreshCw size={13} />
                        <span>{configText.loadCatalog}</span>
                      </button>
                      <button
                        className="control-btn compact secondary"
                        type="button"
                        onClick={() =>
                          updateSelectedRuntimeChannel((channel) => ({
                            ...channel,
                            plugins: [...(channel.plugins ?? []), { id: "plugin@marketplace", enabled: true }],
                          }))
                        }
                        aria-label="Add manual plugin"
                      >
                        <Plus size={13} />
                        <span>{configText.manual}</span>
                      </button>
                    </div>
                  </div>
                  <label className="config-field config-plugin-catalog">
                    <span>{configText.catalog}</span>
                    <select
                      aria-label="Codex plugin catalog"
                      value=""
                      onChange={(event) => {
                        const pluginId = event.currentTarget.value;
                        if (!pluginId) return;
                        updateSelectedRuntimeChannel((channel) => addPluginToChannel(channel, pluginId));
                      }}
                      disabled={availableCodexPlugins.length === 0}
                    >
                      <option value="">{availableCodexPlugins.length > 0 ? configText.selectPlugin : configText.noPluginsAvailable}</option>
                      {availableCodexPlugins.map((plugin) => {
                        const state = plugin.enabled ? "enabled" : plugin.installed ? "installed" : "available";
                        return (
                          <option key={plugin.id} value={plugin.id}>
                            {`${plugin.id} (${state})`}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  {pluginCatalogStatus ? <div className="config-plugin-catalog-status">{pluginCatalogStatus}</div> : null}
                  <div className="config-plugin-list">
                    {(selectedRuntimeChannelRecord.plugins ?? []).length === 0 ? (
                      <div className="empty-state config-empty">{configText.noPluginsConfigured}</div>
                    ) : (
                      (selectedRuntimeChannelRecord.plugins ?? []).map((plugin, index) => (
                        <div key={`${plugin.id}:${index}`} className="config-plugin-row">
                          <input
                            aria-label="Plugin id"
                            value={plugin.id}
                            onChange={(event) =>
                              updateSelectedRuntimeChannel((channel) => updatePluginAt(channel, index, (item) => ({ ...item, id: event.currentTarget.value })))
                            }
                          />
                          <label className="config-plugin-toggle">
                            <input
                              type="checkbox"
                              checked={plugin.enabled}
                              onChange={(event) =>
                                updateSelectedRuntimeChannel((channel) =>
                                  updatePluginAt(channel, index, (item) => ({ ...item, enabled: event.currentTarget.checked })),
                                )
                              }
                            />
                            <span>{configText.enabled}</span>
                          </label>
                          <button className="icon-btn danger" type="button" onClick={() => updateSelectedRuntimeChannel((channel) => removePluginAt(channel, index))}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              ) : null}

              <section className="agent-channel-models">
                <div className="config-models-header">
                  <h3>{configText.models}</h3>
                  <button className="control-btn compact secondary" onClick={() => onAddModel(selectedRuntimeChannelRecord.id)}>
                    <Plus size={13} />
                    <span>{configText.addModel}</span>
                  </button>
                </div>
                <div className="config-model-list">
                  {selectedRuntimeChannelRecord.models.map((model, index) => (
                    <div key={`${model.id}:${index}`} className="config-model-row">
                      <input
                        aria-label="Agent model id"
                        value={model.id}
                        onChange={(event) => onUpdateModel(selectedRuntimeChannelRecord.id, index, (item) => ({ ...item, id: event.currentTarget.value }))}
                      />
                      <input
                        aria-label="Agent model label"
                        value={model.label}
                        onChange={(event) => onUpdateModel(selectedRuntimeChannelRecord.id, index, (item) => ({ ...item, label: event.currentTarget.value }))}
                      />
                      <button
                        className="icon-btn danger"
                        onClick={() => onRemoveModel(selectedRuntimeChannelRecord.id, index)}
                        disabled={model.id === DEFAULT_MODEL_ID}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <div className="empty-state config-empty">No config channels</div>
          )}
        </section>
      </div>
    </section>
  );
}

export function ConfigPage({
  language = "en",
  channels,
  configuredAgents,
  selectedConfiguredAgentId,
  status,
  onSave,
  onAddConfiguredAgent,
  onSelectConfiguredAgent,
  onUpdateConfiguredAgent,
}: ConfigPageProps) {
  const configText = UI_TEXT[language].config;
  const selectedConfiguredAgent =
    configuredAgents.find((agent) => agent.id === selectedConfiguredAgentId) ?? configuredAgents[0];
  const selectedAgentChannel = selectedConfiguredAgent ? resolveConfiguredAgentChannel(selectedConfiguredAgent, channels) : undefined;
  const selectedAgentModels =
    selectedAgentChannel && selectedAgentChannel.models.length > 0 ? selectedAgentChannel.models : [{ id: DEFAULT_MODEL_ID, label: "Default" }];
  const selectedAgentModelId = selectedConfiguredAgent && selectedAgentModels.some((model) => model.id === selectedConfiguredAgent.modelId)
    ? selectedConfiguredAgent.modelId
    : DEFAULT_MODEL_ID;

  return (
    <section className="config-page">
      <header className="config-header">
        <div>
          <h2>{configText.title}</h2>
          <p>{configText.description}</p>
        </div>
      </header>

      <div className="config-grid">
        <section className="config-form">
            <section className="configured-agent-panel">
              <section className="configured-agent-editor">
                {selectedConfiguredAgent ? (
                  <>
                    <div className="configured-agent-editor-head">
                      <div>
                        <h3>{selectedConfiguredAgent.name || "Untitled Agent"}</h3>
                        <span>{selectedConfiguredAgent.id}</span>
                      </div>
                      <div className="configured-agent-editor-actions">
                        <button className="control-btn compact" onClick={() => void onSave()}>
                          <Save size={13} />
                          <span>{configText.save}</span>
                        </button>
                      </div>
                    </div>
                    {status ? <div className="config-status">{status}</div> : null}

                    <div className="config-field-grid">
                      <label className="config-field">
                        <span>{configText.name}</span>
                        <input
                          aria-label="Agent name"
                          value={selectedConfiguredAgent.name}
                          onChange={(event) => {
                            const nextName = event.currentTarget.value;
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, name: nextName }));
                          }}
                        />
                      </label>
                      <label className="config-field">
                        <span>ID</span>
                        <input
                          aria-label="Agent config id"
                          value={selectedConfiguredAgent.id}
                          onChange={(event) => {
                            const nextId = event.currentTarget.value;
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, id: nextId }));
                            onSelectConfiguredAgent(nextId);
                          }}
                        />
                      </label>
                      <label className="config-field">
                        <span>{configText.config}</span>
                        <select
                          aria-label="Agent execution config"
                          value={selectedAgentChannel?.id ?? ""}
                          onChange={(event) => {
                            const channel = channels.find((item) => item.id === event.currentTarget.value);
                            if (!channel) return;
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({
                              ...item,
                              runtimeAgentId: channel.agentId,
                              channelId: channel.id,
                              modelId: DEFAULT_MODEL_ID,
                            }));
                          }}
                        >
                          {channels.map((channel) => (
                            <option key={channel.id} value={channel.id}>
                              {`${channel.label || channel.id} · ${agentLabel(channel.agentId)}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span>{configText.model}</span>
                        <select
                          aria-label="Agent model"
                          value={selectedAgentModelId}
                          disabled={!selectedConfiguredAgent || !selectedAgentChannel}
                          onChange={(event) => {
                            const modelId = event.currentTarget.value;
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, modelId }));
                          }}
                        >
                          {selectedAgentModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label || model.id}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="config-field">
                        <span>{configText.tags}</span>
                        <input
                          aria-label="Agent tags"
                          value={selectedConfiguredAgent.tags.join(", ")}
                          onChange={(event) =>
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({
                              ...item,
                              tags: event.currentTarget.value
                                .split(",")
                                .map((tag) => tag.trim())
                                .filter(Boolean),
                            }))
                          }
                        />
                      </label>
                      <label className="config-field config-field-wide">
                        <span>{configText.descriptionField}</span>
                        <input
                          aria-label="Agent description"
                          value={selectedConfiguredAgent.description}
                          onChange={(event) =>
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, description: event.currentTarget.value }))
                          }
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="empty-state config-empty configured-agent-empty">
                    <span>{configText.emptyAgent}</span>
                    <button className="control-btn compact" onClick={() => void onAddConfiguredAgent()}>
                      <Plus size={13} />
                      <span>{UI_TEXT[language].chrome.newAgent}</span>
                    </button>
                  </div>
                )}
              </section>
            </section>
          </section>

      </div>
    </section>
  );
}

function CliMessage({ message, agentId, streaming = false }: { message: ChatMessage; agentId: AgentId; streaming?: boolean }) {
  if (message.role === "user") {
    return (
      <div className="cli-message user">
        <div className="cli-prompt-mark">›</div>
        <div className="cli-agent-line">
          <span>{`You · ${formatTime(message.timestamp)}`}</span>
        </div>
        <div className="cli-markdown">
          <Markdown text={message.content} />
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    return (
      <div className="cli-message assistant">
        <div className="cli-agent-line">
          <span className={`runtime-dot ${agentAccent(agentId)}`} />
          <span>{`${agentLabel(agentId)} · ${formatTime(message.timestamp)}`}</span>
        </div>
        {message.events && message.events.length > 0 ? (
          <div className="cli-message-events">
            {message.events.map((event) => (
              <MetaMessage key={event.id} content={chatEventDisplayContent(event)} />
            ))}
          </div>
        ) : null}
        {message.content ? (
          <div className={`cli-markdown ${streaming ? "is-streaming" : ""}`}>
            <Markdown text={message.content} />
            {streaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
          </div>
        ) : streaming ? (
          <div className="cli-markdown is-streaming">
            <span className="stream-cursor" aria-hidden="true" />
          </div>
        ) : null}
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="cli-message error">
        <div className="cli-agent-line">error</div>
        <pre>{message.content}</pre>
      </div>
    );
  }

  return (
    <div className="cli-message meta">
      <MetaMessage content={message.content} />
    </div>
  );
}

function MetaMessage({ content }: { content: string }) {
  const [summary, ...bodyLines] = content.split("\n");
  const body = bodyLines.join("\n").trim();

  if (!body) {
    return <pre>{summary}</pre>;
  }

  return (
    <details className="cli-meta-details">
      <summary>{summary}</summary>
      <pre>{body}</pre>
    </details>
  );
}
