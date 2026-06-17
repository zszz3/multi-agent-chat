import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import {
  Bot,
  CheckCircle2,
  CircleStop,
  ClipboardList,
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
import { DEFAULT_MODEL_ID, FALLBACK_MODEL_OPTIONS, defaultChannelForAgent, modelsForChannel } from "../../shared/models";
import { AGENT_TEMPLATES } from "../../shared/agent-templates";
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
  AgentTemplate,
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
  LocalFilePreview,
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
} from "../../shared/types";

const AGENTS: AgentId[] = ["codex", "claude", "api"];
const THEME_STORAGE_KEY = "multi-agent-chat-theme";
const PROVIDER_KEYS_STORAGE_KEY = "multi-agent-chat-provider-keys";
const LANGUAGE_STORAGE_KEY = "multi-agent-chat-language";

export type Language = "zh" | "en";

const UI_TEXT = {
  zh: {
    nav: {
      chat: "对话",
      tasks: "任务",
      teams: "团队",
      workflow: "工作流",
      skills: "技能",
      configs: "配置",
      settings: "设置",
      configuration: "设置",
    },
    chrome: {
      featureNav: "功能导航",
      search: "搜索或执行命令...",
      newChat: "新建对话",
      newAgent: "新建 Agent",
      importTemplate: "导入模板",
      configuredAgents: "Agent",
      noConfiguredAgents: "暂无配置的 Agent",
      noChats: "新建对话后开始。",
      skillLibrary: "技能库",
      noSkills: "暂无技能",
      createAgentFromSkill: "用此技能创建 Agent",
      darkTheme: "深色主题",
      lightTheme: "浅色主题",
      toggleTheme: "切换主题",
      settings: "设置",
      openSettings: "打开设置",
    },
    config: {
      title: "Agent 设置",
      description: "选择 Provider 预设，然后只调整这个 Agent 需要的配置。",
      save: "保存",
      language: "界面语言",
      zh: "统一中文",
      en: "English",
      cliHelp: "选择这个 Agent 使用的命令。",
      providerHelp: "选择 Provider 预设。",
      apiKey: "API Key / Token",
      usedByAll: "同一 Provider 的 Agent 共用",
      name: "名称",
      model: "模型",
      tags: "标签",
      descriptionField: "描述",
      prompt: "Prompt",
      advancedProvider: "高级 Provider 设置",
      plugins: "插件",
      loadCatalog: "加载目录",
      manual: "手动添加",
      catalog: "目录",
      selectPlugin: "选择插件...",
      noPluginsAvailable: "暂无可用插件",
      noPluginsConfigured: "暂无插件配置",
      enabled: "启用",
      models: "模型",
      addModel: "添加模型",
      emptyAgent: "新建 Agent 后可绑定 Channel、模型和 Prompt。",
      agentDeployed: "Agent 部署成功",
    },
    workflow: {
      newWorkflow: "新建工作流会话",
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
      skills: "Skills",
      configs: "Configs",
      settings: "Settings",
      configuration: "Configuration",
    },
    chrome: {
      featureNav: "Feature navigation",
      search: "Search or run command...",
      newChat: "New chat",
      newAgent: "New agent",
      importTemplate: "Import template",
      configuredAgents: "Agents",
      noConfiguredAgents: "No configured agents",
      noChats: "Create a chat to start.",
      skillLibrary: "Skill library",
      noSkills: "No skills",
      createAgentFromSkill: "Create agent from skill",
      darkTheme: "Dark theme",
      lightTheme: "Light theme",
      toggleTheme: "Toggle theme",
      settings: "Settings",
      openSettings: "Open settings",
    },
    config: {
      title: "Agents",
      description: "Pick a provider preset, then adjust only what this agent needs.",
      save: "Save",
      language: "Language",
      zh: "统一中文",
      en: "English",
      cliHelp: "Choose the command this agent runs.",
      providerHelp: "Choose a provider preset.",
      apiKey: "API Key / Token",
      usedByAll: "Used by all",
      name: "Name",
      model: "Model",
      tags: "Tags",
      descriptionField: "Description",
      prompt: "Prompt",
      advancedProvider: "Advanced provider settings",
      plugins: "Plugins",
      loadCatalog: "Load catalog",
      manual: "Manual",
      catalog: "Catalog",
      selectPlugin: "Select plugin...",
      noPluginsAvailable: "No plugins available",
      noPluginsConfigured: "No plugins configured",
      enabled: "Enabled",
      models: "Models",
      addModel: "Add model",
      emptyAgent: "Create an agent to bind a channel, model, and prompt.",
      agentDeployed: "Agent deployed",
    },
    workflow: {
      newWorkflow: "New workflow session",
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

export interface AgentProviderPreset {
  id: string;
  label: string;
  runtimeAgentId: AgentId;
  providerName?: string;
  modelProvider?: string;
  baseUrl?: string;
  wireApi?: string;
  modelReasoningEffort?: string;
  models: AgentModelOption[];
  usesApiKey?: boolean;
  apiKeyHeaderName?: string;
  apiKeyPrefix?: string;
  extraHeaders?: Record<string, string>;
  configurableModelId?: boolean;
  configurableModelLabel?: string;
  configurableModelPlaceholder?: string;
}

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

export interface OnlineSkillSource {
  id: string;
  label: string;
  owner: string;
  repo: string;
  branch: string;
  basePath?: string;
  homepage?: string;
  maxFetch?: number;
}

export interface OnlineSkillResult extends AgentTemplate {
  sourceId: string;
  sourceLabel: string;
  path: string;
  url: string;
  rawUrl: string;
}

export const ONLINE_SKILL_SOURCES: OnlineSkillSource[] = [
  {
    id: "openai-skills",
    label: "OpenAI Skills",
    owner: "openai",
    repo: "skills",
    branch: "main",
    basePath: "skills",
    homepage: "https://github.com/openai/skills",
    maxFetch: 80,
  },
  {
    id: "anthropic-skills",
    label: "Anthropic Skills",
    owner: "anthropics",
    repo: "skills",
    branch: "main",
    homepage: "https://github.com/anthropics/skills",
    maxFetch: 80,
  },
];

interface ParsedSkillMarkdown {
  name: string;
  description: string;
  prompt: string;
  tags: string[];
  path: string;
}

export function onlineSkillTreeUrl(source: OnlineSkillSource): string {
  return `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.branch}?recursive=1`;
}

function onlineSkillBlobUrl(source: OnlineSkillSource, path: string): string {
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.branch}/${path}`;
}

function onlineSkillRawUrl(source: OnlineSkillSource, path: string): string {
  return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${path}`;
}

function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function skillNameFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2]! : path.replace(/\/?SKILL\.md$/i, "");
}

export function parseSkillMarkdown(markdown: string, path: string): ParsedSkillMarkdown {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const fields: Record<string, string> = {};
  let body = normalized;

  if (normalized.startsWith("---\n")) {
    const end = normalized.indexOf("\n---", 4);
    if (end >= 0) {
      const frontmatter = normalized.slice(4, end).split("\n");
      for (const line of frontmatter) {
        if (/^\s/.test(line)) continue;
        const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (match) fields[match[1]!.toLowerCase()] = stripYamlQuotes(match[2] ?? "");
      }
      body = normalized.slice(end + 4).trim();
    }
  }

  const fallbackName = skillNameFromPath(path);
  const name = fields.name || fallbackName;
  const description = fields.description || body.split("\n").find((line) => line.trim() && !line.trim().startsWith("#"))?.trim() || "";
  return {
    name,
    description,
    prompt: body,
    tags: [name],
    path,
  };
}

function onlineSkillMatches(skill: ParsedSkillMarkdown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [skill.name, skill.description, skill.prompt, skill.path, ...skill.tags].some((value) => value.toLowerCase().includes(normalized));
}

async function fetchOnlineSkills(query: string, sources: OnlineSkillSource[] = ONLINE_SKILL_SOURCES, fetcher: typeof fetch = fetch): Promise<OnlineSkillResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const results = await Promise.all(
    sources.map(async (source) => {
      const treeResponse = await fetcher(onlineSkillTreeUrl(source), { headers: { Accept: "application/vnd.github+json" } });
      if (!treeResponse.ok) throw new Error(`${source.label}: ${treeResponse.status}`);
      const treePayload = (await treeResponse.json()) as { tree?: Array<{ path?: string; type?: string }> };
      const skillPaths = (treePayload.tree ?? [])
        .map((item) => item.path ?? "")
        .filter((path) => path.endsWith("/SKILL.md") || path === "SKILL.md")
        .filter((path) => !source.basePath || path === source.basePath || path.startsWith(`${source.basePath}/`));
      const pathMatches = normalizedQuery ? skillPaths.filter((path) => path.toLowerCase().includes(normalizedQuery)) : skillPaths;
      const candidates = [...pathMatches, ...skillPaths.filter((path) => !pathMatches.includes(path))].slice(0, source.maxFetch ?? 60);
      const parsed = await Promise.all(
        candidates.map(async (path) => {
          const rawUrl = onlineSkillRawUrl(source, path);
          const rawResponse = await fetcher(rawUrl);
          if (!rawResponse.ok) return undefined;
          const skill = parseSkillMarkdown(await rawResponse.text(), path);
          if (!onlineSkillMatches(skill, query)) return undefined;
          return {
            id: `${source.id}:${path}`,
            name: skill.name,
            description: skill.description,
            prompt: skill.prompt,
            tags: skill.tags,
            sourceId: source.id,
            sourceLabel: source.label,
            path,
            url: onlineSkillBlobUrl(source, path),
            rawUrl,
          } satisfies OnlineSkillResult;
        }),
      );
      return parsed.filter((skill): skill is OnlineSkillResult => Boolean(skill));
    }),
  );
  return results.flat().slice(0, 60);
}

export const AGENT_PROVIDER_PRESETS: AgentProviderPreset[] = [
  {
    id: "codex-openai",
    label: "Codex OpenAI",
    runtimeAgentId: "codex",
    providerName: "OpenAI",
    modelProvider: "openai",
    models: FALLBACK_MODEL_OPTIONS.codex,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    runtimeAgentId: "claude",
    models: FALLBACK_MODEL_OPTIONS.claude,
  },
  {
    id: "claude-code-volcengine",
    label: "Volcengine",
    runtimeAgentId: "claude",
    providerName: "Volcengine",
    modelProvider: "volcengine-anthropic",
    baseUrl: "https://ark.cn-beijing.volces.com/api/compatible",
    usesApiKey: true,
    configurableModelId: true,
    configurableModelLabel: "Endpoint / model ID",
    configurableModelPlaceholder: "ep-m-... or doubao-seed-...",
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "doubao-seed-2-0-code-preview-latest", label: "Doubao Seed Code" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    runtimeAgentId: "codex",
    providerName: "DeepSeek",
    modelProvider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    wireApi: "responses",
    modelReasoningEffort: "high",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
  },
  {
    id: "glm",
    label: "GLM",
    runtimeAgentId: "codex",
    providerName: "Zhipu GLM",
    modelProvider: "zhipu-glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    wireApi: "responses",
    modelReasoningEffort: "high",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "glm-5.1", label: "GLM-5.1" },
    ],
  },
  {
    id: "kimi",
    label: "Kimi",
    runtimeAgentId: "codex",
    providerName: "Kimi",
    modelProvider: "kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    wireApi: "responses",
    modelReasoningEffort: "high",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "kimi-k2.6", label: "Kimi K2.6" },
    ],
  },
  {
    id: "longcat",
    label: "LongCat",
    runtimeAgentId: "codex",
    providerName: "LongCat",
    modelProvider: "longcat",
    baseUrl: "https://api.longcat.chat/openai/v1",
    wireApi: "responses",
    modelReasoningEffort: "high",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "LongCat-Flash-Chat", label: "LongCat Flash Chat" },
    ],
  },
  {
    id: "mimo",
    label: "MiMo",
    runtimeAgentId: "codex",
    providerName: "MiMo",
    modelProvider: "xiaomi-mimo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    wireApi: "responses",
    modelReasoningEffort: "high",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro" },
    ],
  },
  {
    id: "codex-volcengine",
    label: "Volcengine",
    runtimeAgentId: "codex",
    providerName: "Volcengine",
    modelProvider: "volcengine",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    wireApi: "responses",
    modelReasoningEffort: "high",
    usesApiKey: true,
    configurableModelId: true,
    configurableModelLabel: "Endpoint / model ID",
    configurableModelPlaceholder: "ep-m-... or doubao-seed-...",
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "doubao-seed-1-6-lite-251015", label: "Doubao Seed 1.6 Lite" },
      { id: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" },
      { id: "doubao-seed-1-6", label: "Doubao Seed 1.6" },
      { id: "doubao-seed-2-0-code-preview-latest", label: "Doubao Seed Code" },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    runtimeAgentId: "codex",
    providerName: "Custom",
    modelProvider: "custom",
    wireApi: "responses",
    usesApiKey: true,
    models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
  },
  {
    id: "api-openai",
    label: "OpenAI API",
    runtimeAgentId: "api",
    providerName: "OpenAI",
    modelProvider: "openai-api",
    baseUrl: "https://api.openai.com/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
    ],
  },
  {
    id: "api-anthropic",
    label: "Anthropic API",
    runtimeAgentId: "api",
    providerName: "Anthropic",
    modelProvider: "anthropic-api",
    baseUrl: "https://api.anthropic.com/v1",
    usesApiKey: true,
    apiKeyHeaderName: "x-api-key",
    apiKeyPrefix: "",
    extraHeaders: { "anthropic-version": "2023-06-01" },
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet" },
      { id: "claude-opus-4-6", label: "Claude Opus" },
    ],
  },
  {
    id: "api-deepseek",
    label: "DeepSeek API",
    runtimeAgentId: "api",
    providerName: "DeepSeek",
    modelProvider: "deepseek-api",
    baseUrl: "https://api.deepseek.com/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
  },
  {
    id: "api-glm",
    label: "GLM API",
    runtimeAgentId: "api",
    providerName: "Zhipu GLM",
    modelProvider: "glm-api",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "glm-5.1", label: "GLM-5.1" },
    ],
  },
  {
    id: "api-kimi",
    label: "Kimi API",
    runtimeAgentId: "api",
    providerName: "Kimi",
    modelProvider: "kimi-api",
    baseUrl: "https://api.moonshot.cn/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "kimi-k2.6", label: "Kimi K2.6" },
    ],
  },
  {
    id: "api-longcat",
    label: "LongCat API",
    runtimeAgentId: "api",
    providerName: "LongCat",
    modelProvider: "longcat-api",
    baseUrl: "https://api.longcat.chat/openai/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "LongCat-Flash-Chat", label: "LongCat Flash Chat" },
    ],
  },
  {
    id: "api-mimo",
    label: "MiMo API",
    runtimeAgentId: "api",
    providerName: "MiMo",
    modelProvider: "mimo-api",
    baseUrl: "https://api.xiaomimimo.com/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "mimo-v2.5-pro", label: "MiMo V2.5 Pro" },
    ],
  },
  {
    id: "api-openrouter",
    label: "OpenRouter",
    runtimeAgentId: "api",
    providerName: "OpenRouter",
    modelProvider: "openrouter-api",
    baseUrl: "https://openrouter.ai/api/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "openai/gpt-4o", label: "OpenAI GPT-4o" },
      { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
    ],
  },
  {
    id: "api-github-models",
    label: "GitHub Models",
    runtimeAgentId: "api",
    providerName: "GitHub Models",
    modelProvider: "github-models-api",
    baseUrl: "https://models.github.ai/inference/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "openai/gpt-4o", label: "GPT-4o" },
      { id: "xai/grok-3-mini", label: "Grok 3 Mini" },
    ],
  },
  {
    id: "api-together",
    label: "Together",
    runtimeAgentId: "api",
    providerName: "Together",
    modelProvider: "together-api",
    baseUrl: "https://api.together.xyz/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2" },
    ],
  },
  {
    id: "api-novita",
    label: "Novita",
    runtimeAgentId: "api",
    providerName: "Novita",
    modelProvider: "novita-api",
    baseUrl: "https://api.novita.ai/v3/openai",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "zai-org/glm-5.1", label: "GLM-5.1" },
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
    ],
  },
  {
    id: "api-nvidia",
    label: "NVIDIA",
    runtimeAgentId: "api",
    providerName: "NVIDIA",
    modelProvider: "nvidia-api",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
    ],
  },
  {
    id: "api-siliconflow",
    label: "SiliconFlow",
    runtimeAgentId: "api",
    providerName: "SiliconFlow",
    modelProvider: "siliconflow-api",
    baseUrl: "https://api.siliconflow.cn/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2" },
      { id: "zai-org/GLM-4.5", label: "GLM-4.5" },
    ],
  },
  {
    id: "api-alibaba-bailian",
    label: "Bailian",
    runtimeAgentId: "api",
    providerName: "Alibaba Bailian",
    modelProvider: "bailian-api",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "qwen3-coder-plus", label: "Qwen3 Coder Plus" },
      { id: "qwen-max", label: "Qwen Max" },
    ],
  },
  {
    id: "api-volcengine",
    label: "Volcengine",
    runtimeAgentId: "api",
    providerName: "Volcengine",
    modelProvider: "volcengine-api",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    usesApiKey: true,
    configurableModelId: true,
    configurableModelLabel: "Endpoint / model ID",
    configurableModelPlaceholder: "ep-m-... or doubao-seed-...",
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "doubao-seed-1-6-lite-251015", label: "Doubao Seed 1.6 Lite" },
      { id: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" },
      { id: "doubao-seed-1-6", label: "Doubao Seed 1.6" },
    ],
  },
  {
    id: "api-tencent-hunyuan",
    label: "Hunyuan",
    runtimeAgentId: "api",
    providerName: "Tencent Hunyuan",
    modelProvider: "hunyuan-api",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "hunyuan-turbos-latest", label: "Hunyuan Turbos" },
    ],
  },
  {
    id: "api-minimax",
    label: "MiniMax",
    runtimeAgentId: "api",
    providerName: "MiniMax",
    modelProvider: "minimax-api",
    baseUrl: "https://api.minimax.chat/v1",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "MiniMax-M2", label: "MiniMax M2" },
    ],
  },
  {
    id: "api-azure-openai",
    label: "Azure OpenAI",
    runtimeAgentId: "api",
    providerName: "Azure OpenAI",
    modelProvider: "azure-openai-api",
    baseUrl: "https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT",
    usesApiKey: true,
    models: [
      { id: DEFAULT_MODEL_ID, label: "Default" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
  },
  {
    id: "api-custom",
    label: "Custom API",
    runtimeAgentId: "api",
    providerName: "Custom API",
    modelProvider: "custom-api",
    baseUrl: "https://example.com/v1",
    usesApiKey: true,
    models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
  },
];

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

export type ActiveFeature = "chat" | "tasks" | "teams" | "workflow" | "skills" | "configs" | "settings";
type MaybePromise = void | Promise<void>;
export type TaskStatusFilterValue = "all" | TaskProgress;
const WORKFLOW_THINKING_MESSAGE = "Agent is thinking...";
const WORKFLOW_TASK_POLL_MS = 1000;
const WORKFLOW_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const WORKFLOW_NODE_MAX_ATTEMPTS = 2;
const WORKFLOW_FINAL_REVIEW_NODE_ID = "__final_review__";
const WORKFLOW_OUTPUT_DOCUMENT_EXTENSIONS = "md|markdown|txt|json|yaml|yml|html|htm";
const WORKFLOW_STORAGE_ROOT = ".multi-agent-chat/workflows";

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
  return activeFeature === "tasks" || activeFeature === "teams" || activeFeature === "workflow" ? `shell ${activeFeature}-shell` : "shell";
}

export function taskDetailIdFor(
  activeFeature: ActiveFeature,
  selectedTaskDetailId: string | undefined,
  persistedActiveTaskId: string | undefined,
): string | undefined {
  void persistedActiveTaskId;
  return activeFeature === "tasks" ? selectedTaskDetailId : undefined;
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
  workflowDraft: undefined,
};

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

function draftWorkflowMembers(mode: AgentTeamMode, channels: AgentChannel[]): AgentTeamMember[] {
  const agentId: AgentId = "codex";
  const channelId = defaultChannelForAgent(agentId, channels);
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
    agentId,
    channelId,
    modelId: DEFAULT_MODEL_ID,
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
  const id = uniqueId(`${agentId}-channel`, existingIds);
  return {
    id,
    agentId,
    label: agentId === "codex" ? "New Codex Channel" : agentId === "claude" ? "New Claude Channel" : "New API Channel",
    models: [{ id: DEFAULT_MODEL_ID, label: "Default" }],
  };
}

function createAgentChannel(agentId: AgentId, agentName: string, existingIds: string[]): AgentChannel {
  const id = uniqueId(`${agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agent"}-channel`, existingIds);
  return {
    ...createChannel(agentId, existingIds),
    id,
    label: agentName,
  };
}

export function resolveConfiguredAgentChannel(agent: ConfiguredAgent | undefined, channels: AgentChannel[]): AgentChannel | undefined {
  if (!agent) return undefined;
  return channels.find((channel) => channel.id === agent.channelId) ?? channels.find((channel) => channel.agentId === agent.runtimeAgentId) ?? channels[0];
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
  return providerKeys[preset.id] ?? apiKeyFromChannelHeaders(channel, preset);
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
    prompt: "",
    tags: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function applyAgentTemplate(agent: ConfiguredAgent, template: AgentTemplate): ConfiguredAgent {
  return {
    ...agent,
    name: template.name,
    description: template.description,
    prompt: template.prompt,
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

export function workflowTaskLiveDetail(task: TaskRun): string {
  const latestEvent = task.messages
    .flatMap((message) => message.events ?? [])
    .sort((left, right) => left.timestamp - right.timestamp)
    .at(-1);

  if (latestEvent) {
    const name = latestEvent.name ?? "tool";
    const content = compactWorkflowActivity(latestEvent.content);
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

function workflowRunStatusLabel(status: WorkflowRunNodeStatus): string {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  if (status === "failed") return "failed";
  return "queued";
}

export function App() {
  const initialWorkflowGraph = useMemo(() => createWorkflowGraphFromObjective(""), []);
  const [snapshot, setSnapshot] = useState<AppSnapshot>(DEFAULT_SNAPSHOT);
  const [prompt, setPrompt] = useState("");
  const [slashCommandIndex, setSlashCommandIndex] = useState(0);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [teamPrompt, setTeamPrompt] = useState("");
  const [taskAgentId, setTaskAgentId] = useState<AgentId>("codex");
  const [taskChannelId, setTaskChannelId] = useState("");
  const [taskModelId, setTaskModelId] = useState(DEFAULT_MODEL_ID);
  const [workflowId, setWorkflowId] = useState(() => createWorkflowId());
  const [workflowTitle, setWorkflowTitle] = useState("Untitled workflow");
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft");
  const [workflowRevision, setWorkflowRevision] = useState(1);
  const [workflowAgentId, setWorkflowAgentId] = useState<AgentId>("codex");
  const [workflowChannelId, setWorkflowChannelId] = useState("");
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
  const workflowRequestIdRef = useRef<string | undefined>(undefined);
  const workflowAssistantMessageIdRef = useRef<string | undefined>(undefined);
  const workflowStreamingStartedRef = useRef(false);
  const workflowAssistantContentRef = useRef("");
  const workflowDraftHydratedRef = useRef(false);
  const workflowDraftHydratingRef = useRef(false);
  const workflowDraftSaveTimerRef = useRef<number | undefined>(undefined);
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
  const [agentTestResults, setAgentTestResults] = useState<Record<string, AgentTestUiState>>({});
  const [testingAgentId, setTestingAgentId] = useState<string | undefined>();
  const [agentTestTick, setAgentTestTick] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [agentContextMenu, setAgentContextMenu] = useState<{ agentId: string; x: number; y: number } | undefined>();
  const transcriptRef = useRef<HTMLElement>(null);
  const stickToBottomRef = useRef(true);
  const gChordRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

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
    if (!agentContextMenu) return;
    const close = (): void => setAgentContextMenu(undefined);
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
  }, [agentContextMenu]);

  function applyPersistedWorkflowDraft(draft: WorkflowDraftState): void {
    workflowDraftHydratingRef.current = true;
    setWorkflowId(draft.workflowId);
    setWorkflowTitle(draft.title);
    setWorkflowStatus(draft.status);
    setWorkflowRevision(draft.revision);
    setWorkflowAgentId(draft.agentId);
    setWorkflowChannelId(draft.channelId);
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
      agentId: workflowAgentId,
      channelId: workflowChannelId || defaultChannelForAgent(workflowAgentId, snapshot.channels),
      modelId: workflowModelId || DEFAULT_MODEL_ID,
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
    workflowAgentId,
    workflowChannelId,
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
      if (current && snapshot.channels.some((channel) => channel.id === current)) return current;
      return snapshot.channels[0]?.id ?? "";
    });
  }, [configDirty, snapshot.channels]);

  useEffect(() => {
    setTaskChannelId((current) => {
      if (current && snapshot.channels.some((channel) => channel.id === current && channel.agentId === taskAgentId)) return current;
      return defaultChannelForAgent(taskAgentId, snapshot.channels);
    });
  }, [snapshot.channels, taskAgentId]);

  useEffect(() => {
    setTaskModelId((current) => {
      const channelId =
        taskChannelId && snapshot.channels.some((channel) => channel.id === taskChannelId && channel.agentId === taskAgentId)
          ? taskChannelId
          : defaultChannelForAgent(taskAgentId, snapshot.channels);
      const models = modelsForChannel(taskAgentId, channelId, snapshot.channels);
      return models.some((model) => model.id === current) ? current : DEFAULT_MODEL_ID;
    });
  }, [snapshot.channels, taskAgentId, taskChannelId]);

  useEffect(() => {
    setWorkflowChannelId((current) => {
      if (current && snapshot.channels.some((channel) => channel.id === current && channel.agentId === workflowAgentId)) return current;
      return defaultChannelForAgent(workflowAgentId, snapshot.channels);
    });
  }, [snapshot.channels, workflowAgentId]);

  useEffect(() => {
    setWorkflowModelId((current) => {
      const channelId =
        workflowChannelId && snapshot.channels.some((channel) => channel.id === workflowChannelId && channel.agentId === workflowAgentId)
          ? workflowChannelId
          : defaultChannelForAgent(workflowAgentId, snapshot.channels);
      const models = modelsForChannel(workflowAgentId, channelId, snapshot.channels);
      return models.some((model) => model.id === current) ? current : DEFAULT_MODEL_ID;
    });
  }, [snapshot.channels, workflowAgentId, workflowChannelId]);

  useEffect(() => {
    if (activeFeature !== "configs" || pluginCatalogStatus || codexPluginCatalog.length > 0) return;
    void loadCodexPluginCatalog();
  }, [activeFeature, codexPluginCatalog.length, pluginCatalogStatus]);

  useEffect(() => {
    if (activeFeature !== "tasks") setSelectedTaskDetailId(undefined);
  }, [activeFeature]);

  useEffect(() => {
    if (!selectedTaskDetailId) return;
    if (snapshot.tasks.some((task) => task.id === selectedTaskDetailId)) return;
    setSelectedTaskDetailId(undefined);
  }, [selectedTaskDetailId, snapshot.tasks]);

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
  const activeRuntime = activeChat ? runtimeMap.get(activeChat.agentId) ?? fallbackRuntime(activeChat.agentId) : undefined;
  const activeChannel = activeChat ? snapshot.channels.find((channel) => channel.id === activeChat.channelId) : undefined;
  const activeModel = activeChat
    ? modelsForChannel(activeChat.agentId, activeChat.channelId, snapshot.channels).find((model) => model.id === activeChat.modelId)
    : undefined;
  const slashCommandSuggestions = useMemo(
    () => (activeChat ? slashCommandSuggestionsFor(prompt, activeChat.agentId) : []),
    [activeChat?.agentId, prompt],
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
        const navMap: Record<string, ActiveFeature> = { c: "chat", t: "tasks", w: "teams", f: "workflow", s: "configs" };
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
        chats: snapshot.chats.map((chat) => ({ id: chat.id, title: chat.title, agentId: chat.agentId })),
        theme,
        language,
        onNavigate: setActiveFeature,
        onSelectChat: (chatId) => void selectChat(chatId),
        onNewChat: () => void createChat(),
        onToggleTheme: toggleTheme,
        onChooseWorkDir: () => void chooseWorkDir(),
        onRefreshAgents: () => void refresh(),
      }),
    [snapshot.chats, theme, language],
  );

  async function refresh(): Promise<void> {
    const next = await window.multiAgentChat.refreshAgents();
    setSnapshot(next);
  }

  async function createChat(agentId: AgentId = activeChat?.agentId ?? "codex"): Promise<void> {
    const next = await window.multiAgentChat.createChat(agentId);
    setSnapshot(next);
    setPrompt("");
  }

  async function selectChat(chatId: string): Promise<void> {
    const next = await window.multiAgentChat.selectChat(chatId);
    setSnapshot(next);
    setPrompt("");
  }

  async function setActiveChatAgent(agentId: AgentId): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.agentId === agentId) return;
    const next = await window.multiAgentChat.setChatAgent(activeChat.id, agentId);
    setSnapshot(next);
  }

  async function setActiveChatChannel(channelId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.channelId === channelId) return;
    const next = await window.multiAgentChat.setChatChannel(activeChat.id, channelId);
    setSnapshot(next);
  }

  async function setActiveChatModel(modelId: string): Promise<void> {
    if (!activeChat || activeChatLocked || activeChat.modelId === modelId) return;
    const next = await window.multiAgentChat.setChatModel(activeChat.id, modelId);
    setSnapshot(next);
  }

  function setTaskAgent(agentId: AgentId): void {
    setTaskAgentId(agentId);
    setTaskChannelId(defaultChannelForAgent(agentId, snapshot.channels));
    setTaskModelId(DEFAULT_MODEL_ID);
  }

  function setTaskChannel(channelId: string): void {
    setTaskChannelId(channelId);
    setTaskModelId(DEFAULT_MODEL_ID);
  }

  function setTaskModel(modelId: string): void {
    setTaskModelId(modelId);
  }

  function setWorkflowAgent(agentId: AgentId): void {
    setWorkflowAgentId(agentId);
    setWorkflowChannelId(defaultChannelForAgent(agentId, snapshot.channels));
    setWorkflowModelId(DEFAULT_MODEL_ID);
  }

  function setWorkflowChannel(channelId: string): void {
    setWorkflowChannelId(channelId);
    setWorkflowModelId(DEFAULT_MODEL_ID);
  }

  function setWorkflowModel(modelId: string): void {
    setWorkflowModelId(modelId);
  }

  function updateConfigChannels(next: AgentChannel[]): void {
    setConfigChannels(next);
    setConfigDirty(true);
    setConfigStatus("");
    setSelectedConfigChannelId((current) => {
      if (current && next.some((channel) => channel.id === current)) return current;
      return next[0]?.id ?? "";
    });
  }

  async function persistChannelConfig(): Promise<AppSnapshot> {
    const next = await window.multiAgentChat.saveModelChannels(configChannels);
    setConfigChannels(next.channels);
    setConfigDirty(false);
    setSelectedConfigChannelId((current) => {
      if (current && next.channels.some((channel) => channel.id === current)) return current;
      return next.channels[0]?.id ?? "";
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

  async function addConfiguredAgent(template?: AgentTemplate): Promise<void> {
    const existingAgentIds = snapshot.configuredAgents.map((agent) => agent.id);
    let nextAgent = createConfiguredAgent(configChannels, existingAgentIds);
    if (template) {
      nextAgent = {
        ...applyAgentTemplate(nextAgent, template),
        id: uniqueId(template.id, existingAgentIds),
      };
    }
    const defaultPreset = AGENT_PROVIDER_PRESETS[0]!;
    const nextChannel = applyProviderPresetToChannel(
      createAgentChannel(defaultPreset.runtimeAgentId, nextAgent.name, configChannels.map((channel) => channel.id)),
      defaultPreset,
      providerKeys[defaultPreset.id] ?? "",
    );
    nextAgent.channelId = nextChannel.id;
    nextAgent.runtimeAgentId = nextChannel.agentId;
    setSelectedConfiguredAgentId(nextAgent.id);
    const nextChannels = [...configChannels, nextChannel];
    const channelSnapshot = await window.multiAgentChat.saveModelChannels(nextChannels);
    setConfigChannels(channelSnapshot.channels);
    setConfigDirty(false);
    setSelectedConfigChannelId(nextChannel.id);
    const agentSnapshot = await window.multiAgentChat.saveConfiguredAgents([nextAgent, ...snapshot.configuredAgents]);
    setSnapshot(agentSnapshot);
  }

  function removeConfiguredAgent(agentId: string): void {
    setAgentContextMenu(undefined);
    void saveConfiguredAgents(snapshot.configuredAgents.filter((agent) => agent.id !== agentId));
  }

  function openAgentContextMenu(event: MouseEvent, agentId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setSelectedConfiguredAgentId(agentId);
    setAgentContextMenu({ agentId, x: event.clientX, y: event.clientY });
  }

  function updateConfiguredAgent(agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent): void {
    const now = Date.now();
    void saveConfiguredAgents(snapshot.configuredAgents.map((agent) => (agent.id === agentId ? { ...updater(agent), updatedAt: now } : agent)));
  }

  async function testConfiguredAgent(agentId: string): Promise<void> {
    const agent = snapshot.configuredAgents.find((item) => item.id === agentId);
    const channel = agent ? configChannels.find((item) => item.id === agent.channelId) : undefined;
    const startedAt = Date.now();
    const baseState: AgentTestUiState = {
      agentId,
      state: "running",
      phase: "Preparing",
      message: "Preparing agent test...",
      startedAt,
      testedAt: startedAt,
      elapsedMs: 0,
      runtimeAgentId: agent?.runtimeAgentId ?? "codex",
      channelId: agent?.channelId ?? "",
      modelId: agent?.modelId ?? DEFAULT_MODEL_ID,
      providerLabel: channel?.providerName ?? channel?.label ?? "Provider",
      transcript: [],
    };
    setTestingAgentId(agentId);
    setAgentTestTick((value) => value + 1);
    setAgentTestResults((current) => ({ ...current, [agentId]: baseState }));
    setConfigStatus("");
    try {
      setAgentTestResults((current) => ({
        ...current,
        [agentId]: {
          ...(current[agentId] ?? baseState),
          phase: "Saving config",
          message: "Saving current channel, model, and credential settings before testing.",
        },
      }));
      await persistChannelConfig();
      await saveConfiguredAgents(snapshot.configuredAgents);
      setAgentTestResults((current) => ({
        ...current,
        [agentId]: {
          ...(current[agentId] ?? baseState),
          phase: "Running test",
          message: `Starting ${agentLabel(agent?.runtimeAgentId ?? "codex")} with ${baseState.providerLabel}.`,
        },
      }));
      const result = await window.multiAgentChat.testConfiguredAgent(agentId);
      setAgentTestResults((current) => ({
        ...current,
        [agentId]: {
          ...(current[agentId] ?? baseState),
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
      setConfigStatus(result.ok ? "Agent test passed" : "Agent test failed");
    } catch (error) {
      setAgentTestResults((current) => ({
        ...current,
        [agentId]: {
          ...(current[agentId] ?? baseState),
          state: "failed",
          phase: "Failed",
          message: error instanceof Error ? error.message : String(error),
          elapsedMs: Date.now() - startedAt,
        },
      }));
      setConfigStatus("Agent test failed");
    } finally {
      setTestingAgentId(undefined);
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

  function addConfigChannel(agentId: AgentId): void {
    const next = [...configChannels, createChannel(agentId, configChannels.map((channel) => channel.id))];
    updateConfigChannels(next);
    setSelectedConfigChannelId(next[next.length - 1]?.id ?? "");
  }

  function removeConfigChannel(channelId: string): void {
    updateConfigChannels(configChannels.filter((channel) => channel.id !== channelId));
  }

  function updateConfigChannel(channelId: string, updater: (channel: AgentChannel) => AgentChannel): void {
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
    const agentId = workflowAgentId;
    const channelId = workflowChannelId || defaultChannelForAgent(agentId, snapshot.channels);
    const graph = workflowGraphWithSelectedAgent(createWorkflowGraphFromObjective("", snapshot.channels));
    const draft: WorkflowDraftState = {
      workflowId: createWorkflowId(),
      title: "Untitled workflow",
      status: "draft",
      revision: 1,
      agentId,
      channelId,
      modelId: workflowModelId || DEFAULT_MODEL_ID,
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
    const channelId = taskChannelId || defaultChannelForAgent(taskAgentId, snapshot.channels);
    const next = await window.multiAgentChat.runTask({
      prompt: text,
      agentId: taskAgentId,
      channelId,
      modelId: taskModelId || DEFAULT_MODEL_ID,
      workDir: snapshot.workDir,
    });
    setSnapshot(next);
    setTaskPrompt("");
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

  function workflowGraphWithSelectedAgent(graph: WorkflowGraph): WorkflowGraph {
    const channelId = workflowChannelId || defaultChannelForAgent(workflowAgentId, snapshot.channels);
    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "agent"
          ? {
              ...node,
              agentId: workflowAgentId,
              channelId,
              modelId: workflowModelId || DEFAULT_MODEL_ID,
            }
          : node,
      ),
    };
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
    const nextGraph = workflowGraphWithSelectedAgent(createWorkflowGraphFromObjective(workflowObjective, snapshot.channels));
    syncWorkflowGraph(nextGraph);
    setWorkflowGraphReady(true);
    setWorkflowError(undefined);
  }

  async function askSelectedWorkflowAgent(promptText: string, sessionId: string | undefined, requestId: string): Promise<string> {
    const channelId = workflowChannelId || defaultChannelForAgent(workflowAgentId, snapshot.channels);
    const request = {
      requestId,
      prompt: promptText,
      agentId: workflowAgentId,
      channelId,
      modelId: workflowModelId || DEFAULT_MODEL_ID,
      workDir: snapshot.workDir,
    };
    const response = await window.multiAgentChat.askWorkflowAgent(sessionId ? { ...request, sessionId } : request);
    setWorkflowAgentSessionId(response.sessionId);
    return response.content.trim() || "Workflow agent returned an empty response.";
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
    const validation = validateWorkflowGraph(workflowGraph);
    if (!validation.valid || workflowRunning) {
      setWorkflowError(validation.errors.join(" "));
      return;
    }
    const executionLevels = workflowGraphExecutionLevels(workflowGraph);
    if (executionLevels.length === 0) {
      setWorkflowError("Workflow graph has no executable agent nodes.");
      return;
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
      let latestSnapshot = snapshot;
      const storagePlan = workflowStoragePlanFor(workflowId);
      const baseWorkflowContextDocument = [workflowContextDocument.trim(), workflowStoragePlanDocument(storagePlan)].filter(Boolean).join("\n\n");
      latestSnapshot = await window.multiAgentChat.startWorkflowRun({
        workflowId,
        contextDocument: baseWorkflowContextDocument,
      });
      setSnapshot(latestSnapshot);
      const runningWorkflow = latestSnapshot.workflowStore.workflows.find((workflow) => workflow.workflowId === workflowId);
      activeWorkflowRunId = runningWorkflow?.runIds.at(-1);
      if (!activeWorkflowRunId) throw new Error("Workflow run did not start.");
      setWorkflowRunIds(runningWorkflow?.runIds ?? workflowRunIds);
      const nodeById = new Map(workflowGraph.nodes.map((node) => [node.id, node]));
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
      for (const edge of workflowGraph.edges) {
        const fromNode = nodeById.get(edge.fromNodeId);
        if (fromNode?.kind !== "agent" || !upstreamAgentNodeIdsByNodeId.has(edge.toNodeId)) continue;
        upstreamAgentNodeIdsByNodeId.get(edge.toNodeId)?.push(edge.fromNodeId);
      }

      const startWorkflowTask = async (request: {
        prompt: string;
        agentId: AgentId;
        channelId: string;
        modelId: string;
        workDir: string;
      }): Promise<TaskRun> => {
        const existingTaskIds = new Set(latestSnapshot.tasks.map((task) => task.id));
        latestSnapshot = await window.multiAgentChat.runTask(request);
        setSnapshot(latestSnapshot);
        const task = latestSnapshot.tasks
          .filter((item) => !existingTaskIds.has(item.id))
          .sort((left, right) => right.createdAt - left.createdAt)
          .find((item) => item.prompt === request.prompt && item.agentId === request.agentId);
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
        const basePrompt = workflowNodeRunPrompt(workflowGraph, node, upstreamArtifactsForNode(node), contextDocument, storagePlan);
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
        const agentId = node.agentId ?? "codex";
        const channelId = node.channelId || defaultChannelForAgent(agentId, latestSnapshot.channels);
        const prompt = nodeAttemptPrompt(node, attempt, retryPrompt, contextDocument);
        const task = await startWorkflowTask({
          prompt,
          agentId,
          channelId,
          modelId: node.modelId || DEFAULT_MODEL_ID,
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
        const judgeAgentId = workflowAgentId;
        const judgeChannelId = workflowChannelId || defaultChannelForAgent(judgeAgentId, latestSnapshot.channels);
        const judgeTask = await startWorkflowTask({
          prompt: workflowJudgePrompt(workflowGraph, node, artifact, contextDocument, attempt, WORKFLOW_NODE_MAX_ATTEMPTS),
          agentId: judgeAgentId,
          channelId: judgeChannelId,
          modelId: workflowModelId || DEFAULT_MODEL_ID,
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
      const finalReviewPrompt = workflowFinalReviewPrompt(workflowGraph, nodeArtifacts, runContextDocument, completedNodeProgress, storagePlan);
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
        finalReport = await askSelectedWorkflowAgent(finalReviewPrompt, workflowAgentSessionId, finalReviewRequestId);
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
        workflowId,
        runId: activeWorkflowRunId,
        status: "completed",
        progress: latestRunProgress,
        contextDocument: finalRunContextDocument,
        finalReport,
      });
      setSnapshot(latestSnapshot);
      setWorkflowStatus("completed");
    } catch (error) {
      if (activeWorkflowRunId) {
        try {
          const failedSnapshot = await window.multiAgentChat.finishWorkflowRun({
            workflowId,
            runId: activeWorkflowRunId,
            status: "failed",
            progress: latestRunProgress,
            contextDocument: finalRunContextDocument,
            ...(finalReport ? { finalReport } : {}),
            lastError: error instanceof Error ? error.message : String(error),
          });
          setSnapshot(failedSnapshot);
          setWorkflowStatus("failed");
        } catch {
          setWorkflowStatus("failed");
        }
      } else {
        setWorkflowStatus("failed");
      }
      setWorkflowError(error instanceof Error ? error.message : String(error));
    } finally {
      setWorkflowRunning(false);
    }
  }

  async function rerunTask(task: TaskRun): Promise<void> {
    if (task.running) return;
    const next = await window.multiAgentChat.runTask({
      prompt: task.prompt,
      agentId: task.agentId,
      channelId: task.channelId,
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
    const next = await window.multiAgentChat.createTeam({
      name: `Agent Team ${snapshot.teams.length + 1}`,
      mode: "pipeline",
      sharedContext: "",
      members: [
        {
          roleName: "Planner",
          prompt: "Plan the work and identify the main risks.",
          agentId: "codex",
          channelId: defaultChannelForAgent("codex", snapshot.channels),
          modelId: DEFAULT_MODEL_ID,
        },
        {
          roleName: "Checker",
          prompt: "Use the previous artifact to verify correctness and missing tests.",
          agentId: "codex",
          channelId: defaultChannelForAgent("codex", snapshot.channels),
          modelId: DEFAULT_MODEL_ID,
        },
      ],
    });
    setSnapshot(next);
    setActiveFeature("teams");
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
            className={`feature-nav-item ${activeFeature === "teams" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("teams")}
           
          >
            <Users size={15} />
            <span>{text.nav.teams}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "workflow" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("workflow")}
          >
            <GitBranch size={15} />
            <span>{text.nav.workflow}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "skills" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("skills")}
          >
            <Wand2 size={15} />
            <span>{text.nav.skills}</span>
          </button>
          <button
            className={`feature-nav-item ${activeFeature === "configs" ? "is-active" : ""}`}
            onClick={() => setActiveFeature("configs")}
          >
            <Settings size={15} />
            <span>{text.nav.configs}</span>
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
                  : activeFeature === "teams"
                    ? text.nav.teams
                    : activeFeature === "workflow"
                      ? text.nav.workflow
                      : activeFeature === "skills"
                        ? text.nav.skills
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
          <section className="resource-panel chat-list-panel">
            <div className="panel-header">
              <span>Chats</span>
              <SquarePen size={14} />
            </div>
            <div className="new-chat-menu-wrap">
              <button className="new-chat-compact-btn" onClick={() => void createChat()}>
                <Plus size={13} />
              <span>{text.chrome.newChat}</span>
              </button>
            </div>
            <div className="chat-list">
              {snapshot.chats.map((chat) => (
                <button
                  key={chat.id}
                  className={`chat-row ${chat.id === activeChat?.id ? "is-active" : ""}`}
                  onClick={() => void selectChat(chat.id)}
                  title={chat.title}
                >
                  <span className={`runtime-dot ${agentAccent(chat.agentId)} ${chat.running ? "is-pulsing" : ""}`} />
                  <strong>{chat.title}</strong>
                  <span>{chat.running ? "运行中" : formatTime(chat.updatedAt)}</span>
                </button>
              ))}
            </div>
          </section>
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
                visibleTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`task-nav-card ${task.id === activeTask?.id ? "is-active" : ""}`}
                    onClick={() => void selectTask(task.id)}
                  >
                    <div className="task-nav-card-head">
                      <span className={`agent-badge mini ${agentAccent(task.agentId)}`}>{agentLabel(task.agentId)}</span>
                      <TaskStatusChip label={task.running ? "Running" : taskProgressLabel(task.progress)} tone={task.running ? "running" : task.progress} />
                    </div>
                    <strong>{task.title}</strong>
                    <span>{`${task.status} · ${formatTime(task.updatedAt)}`}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        ) : activeFeature === "workflow" ? (
          <WorkflowHistoryPanel
            workflows={snapshot.workflowStore.workflows}
            activeWorkflowId={snapshot.workflowStore.activeWorkflowId}
            running={workflowRunning}
            onNewWorkflow={createNewWorkflow}
            onSelectWorkflow={selectWorkflow}
          />
        ) : activeFeature === "skills" ? (
          <section className="resource-panel skills-nav-panel">
            <div className="panel-header">
              <span>{text.chrome.skillLibrary}</span>
              <Wand2 size={14} />
            </div>
            <div className="skills-nav-list">
              {AGENT_TEMPLATES.length === 0 ? (
                <div className="empty-state config-empty">{text.chrome.noSkills}</div>
              ) : (
                AGENT_TEMPLATES.map((template) => (
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
        ) : (
          <section className="resource-panel config-nav-panel">
            <div className="panel-header">
              <span>{text.chrome.configuredAgents}</span>
              <Bot size={14} />
            </div>
            <div className="config-agent-actions">
              <button className="new-chat-compact-btn" type="button" onClick={() => void addConfiguredAgent()}>
                <Plus size={13} />
                <span>{text.chrome.newAgent}</span>
              </button>
              <details className="agent-template-menu">
                <summary>
                  <FileInput size={13} />
                  <span>{text.chrome.importTemplate}</span>
                </summary>
                <div className="agent-template-menu-list" aria-label="Agent templates">
                  {AGENT_TEMPLATES.map((template) => (
                    <button key={template.id} type="button" className="agent-template-menu-item" onClick={() => void addConfiguredAgent(template)}>
                      <strong>{template.name}</strong>
                      <span>{template.description}</span>
                    </button>
                  ))}
                </div>
              </details>
            </div>
            <div className="config-nav-list">
              {snapshot.configuredAgents.length === 0 ? (
                <div className="empty-state config-empty">{text.chrome.noConfiguredAgents}</div>
              ) : (
                snapshot.configuredAgents.map((agent) => (
                  <button
                    key={agent.id}
                    className={`config-nav-row ${agent.id === selectedConfiguredAgentId ? "is-active" : ""}`}
                    onClick={() => {
                      setAgentContextMenu(undefined);
                      setSelectedConfiguredAgentId(agent.id);
                    }}
                    onContextMenu={(event) => openAgentContextMenu(event, agent.id)}
                  >
                    <span className={`agent-badge mini ${agentAccent(agent.runtimeAgentId)}`}>{agentLabel(agent.runtimeAgentId)}</span>
                    <strong>{agent.name || agent.id}</strong>
                    <span>{agent.tags.length > 0 ? agent.tags.join(", ") : agent.id}</span>
                  </button>
                ))
              )}
            </div>
            {agentContextMenu ? (
              <div
                className="agent-context-menu"
                style={{ left: agentContextMenu.x, top: agentContextMenu.y }}
                onClick={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.preventDefault()}
              >
                <button type="button" className="agent-context-menu-item danger" onClick={() => removeConfiguredAgent(agentContextMenu.agentId)}>
                  <Trash2 size={13} />
                  <span>Delete agent</span>
                </button>
              </div>
            ) : null}
          </section>
        )}
      </aside>

      <main
        className={`content ${
          activeFeature === "chat"
            ? "chat-content"
            : activeFeature === "tasks"
              ? "tasks-content"
                : activeFeature === "teams"
                  ? "teams-content"
                  : activeFeature === "workflow"
                    ? "workflow-content"
                    : activeFeature === "skills"
                      ? "skills-content"
                      : activeFeature === "settings"
                        ? "settings-content"
                        : "config-content"
        }`}
      >
        {activeFeature === "tasks" ? (
          <TaskPage
            prompt={taskPrompt}
            agentId={taskAgentId}
            channelId={taskChannelId || defaultChannelForAgent(taskAgentId, snapshot.channels)}
            modelId={taskModelId}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            tasks={snapshot.tasks}
            activeTaskId={selectedTaskDetailActiveId}
            onPromptChange={setTaskPrompt}
            onSelectAgent={setTaskAgent}
            onSelectChannel={setTaskChannel}
            onSelectModel={setTaskModel}
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
        ) : activeFeature === "teams" ? (
          <TeamPage
            teams={snapshot.teams}
            teamRuns={snapshot.teamRuns}
            activeTeamId={activeTeam?.id}
            activeTeamRunId={activeTeamRun?.id}
            prompt={teamPrompt}
            workDir={snapshot.workDir}
            runtimes={snapshot.runtimes}
            channels={snapshot.channels}
            onPromptChange={setTeamPrompt}
            onCreateTeam={createTeam}
            onUpdateTeam={updateTeam}
            onDeleteTeam={deleteTeam}
            onSelectTeam={selectTeam}
            onSelectTeamRun={selectTeamRun}
            onRunTeam={runTeam}
            onStopTeamRun={stopTeamRun}
            onChooseWorkDir={chooseWorkDir}
            onRefresh={refresh}
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
            agentId={workflowAgentId}
            channelId={workflowChannelId || defaultChannelForAgent(workflowAgentId, snapshot.channels)}
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
            onSelectAgent={setWorkflowAgent}
            onSelectChannel={setWorkflowChannel}
            onSelectModel={setWorkflowModel}
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
        ) : activeFeature === "skills" ? (
          <SkillsPage
            language={language}
            templates={AGENT_TEMPLATES}
            onCreateAgent={(template) => {
              setActiveFeature("configs");
              return addConfiguredAgent(template);
            }}
          />
        ) : activeFeature === "settings" ? (
          <SettingsPage language={language} onLanguageChange={setLanguage} />
        ) : activeFeature === "configs" ? (
          <ConfigPage
            language={language}
            channels={configChannels}
            configuredAgents={snapshot.configuredAgents}
            selectedConfiguredAgentId={selectedConfiguredAgentId}
            providerKeys={providerKeys}
            status={configStatus}
            codexPluginCatalog={codexPluginCatalog}
            pluginCatalogStatus={pluginCatalogStatus}
            agentTestResults={agentTestResults}
            testingAgentId={testingAgentId}
            agentTestTick={agentTestTick}
            onUpdateChannel={updateConfigChannel}
            onAddModel={addConfigModel}
            onUpdateModel={updateConfigModel}
            onRemoveModel={removeConfigModel}
            onSave={saveChannelConfig}
            onLoadCodexPluginCatalog={loadCodexPluginCatalog}
            onAddConfiguredAgent={addConfiguredAgent}
            onSelectConfiguredAgent={setSelectedConfiguredAgentId}
            onUpdateProviderKey={updateProviderKey}
            onUpdateConfiguredAgent={updateConfiguredAgent}
            onRemoveConfiguredAgent={removeConfiguredAgent}
            onTestConfiguredAgent={testConfiguredAgent}
          />
        ) : activeChat ? (
          <>
            <header className="chat-header">
              <div className="chat-title-block">
                <h2>{activeChat.title}</h2>
                <div className="chat-subtitle">
                  <span className={`agent-badge mini ${agentAccent(activeChat.agentId)}`}>{agentLabel(activeChat.agentId)}</span>
                  <span>{activeChannel?.label ?? activeChat.channelId}</span>
                  <span>{activeModel?.label ?? activeChat.modelId}</span>
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
                  <span>Start this {agentLabel(activeChat.agentId)} chat.</span>
                </div>
              ) : (
                activeChat.messages.map((message) => (
                  <CliMessage
                    key={message.id}
                    message={message}
                    agentId={activeChat.agentId}
                    streaming={activeChat.running && message.id === activeChat.pendingAssistantMessageId}
                  />
                ))
              )}
              {activeChat.running ? (
                <div className="cli-status-line">
                  <span className="stream-pill">
                    <span className="stream-spinner" aria-hidden="true" />
                    <span>{agentLabel(activeChat.agentId)} is working…</span>
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
                placeholder={`Message ${agentLabel(activeChat.agentId)} or type /help...`}
                rows={2}
              />
              <div className="composer-footer">
                <ChatControls
                  agentId={activeChat.agentId}
                  channelId={activeChat.channelId}
                  modelId={activeChat.modelId || DEFAULT_MODEL_ID}
                  channels={snapshot.channels}
                  locked={activeChatLocked}
                  running={activeChat.running}
                  workDir={snapshot.workDir}
                  runtimes={snapshot.runtimes}
                  onSelectAgent={setActiveChatAgent}
                  onSelectChannel={setActiveChatChannel}
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
  agentId: AgentId;
  channelId: string;
  modelId: string;
  channels: AgentChannel[];
  locked: boolean;
  running: boolean;
  workDir: string;
  runtimes: AgentRuntime[];
  onSelectAgent: (agentId: AgentId) => MaybePromise;
  onSelectChannel: (channelId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
  onChooseWorkDir: () => MaybePromise;
  onRefresh: () => MaybePromise;
}

export function ChatControls({
  agentId,
  channelId,
  modelId,
  channels,
  locked,
  running,
  workDir,
  runtimes,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
  onChooseWorkDir,
  onRefresh,
}: ChatControlsProps) {
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const channelOptions = channels.filter((channel) => channel.agentId === agentId);
  const fallbackChannelId = defaultChannelForAgent(agentId, channels);
  const effectiveChannels =
    channelOptions.length > 0
      ? channelOptions
      : [{ id: fallbackChannelId, agentId, label: "Default", models: modelsForChannel(agentId, fallbackChannelId, channels) }];
  const selectedChannelId = effectiveChannels.some((channel) => channel.id === channelId) ? channelId : (effectiveChannels[0]?.id ?? fallbackChannelId);
  const modelOptions = modelsForChannel(agentId, selectedChannelId, channels);
  const selectedModelId = modelOptions.some((model) => model.id === modelId) ? modelId : DEFAULT_MODEL_ID;
  const selectsDisabled = locked || running;

  return (
    <div className="composer-controls">
      <label className="composer-select-wrap" title={runtimeStatus(runtimeMap.get(agentId) ?? fallbackRuntime(agentId))}>
        <span className={`runtime-dot ${agentAccent(agentId)}`} />
        <select
          className="composer-select"
          aria-label="Agent"
          value={agentId}
          disabled={selectsDisabled}
          onChange={(event) => void onSelectAgent(event.currentTarget.value as AgentId)}
        >
          {AGENTS.map((candidate) => (
            <option key={candidate} value={candidate}>
              {agentLabel(candidate)}
            </option>
          ))}
        </select>
      </label>
      <label className="composer-select-wrap">
        <select
          className="composer-select"
          aria-label="Channel"
          value={selectedChannelId}
          disabled={selectsDisabled}
          onChange={(event) => void onSelectChannel(event.currentTarget.value)}
        >
          {effectiveChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}
            </option>
          ))}
        </select>
      </label>
      <label className="composer-select-wrap">
        <select
          className="composer-select"
          aria-label="Model"
          value={selectedModelId}
          disabled={selectsDisabled}
          onChange={(event) => void onSelectModel(event.currentTarget.value)}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
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

  function updateMemberAgent(index: number, agentId: AgentId): void {
    const channelId = defaultChannelForAgent(agentId, channels);
    updateMember(index, { agentId, channelId, modelId: DEFAULT_MODEL_ID });
  }

  function updateMemberChannel(index: number, agentId: AgentId, channelId: string): void {
    updateMember(index, { channelId, modelId: DEFAULT_MODEL_ID });
  }

  function addMember(): void {
    if (!activeTeam) return;
    const agentId: AgentId = "codex";
    updateMembers([
      ...activeTeam.members,
      {
        id: `draft-${Date.now()}`,
        roleName: `Agent ${activeTeam.members.length + 1}`,
        prompt: "",
        agentId,
        channelId: defaultChannelForAgent(agentId, channels),
        modelId: DEFAULT_MODEL_ID,
      },
    ]);
  }

  async function buildDraftWorkflow(): Promise<void> {
    if (!activeTeam || draftingWorkflow) return;
    setDraftingWorkflow(true);
    try {
      await onUpdateTeam(activeTeam.id, { members: draftWorkflowMembers(activeTeam.mode, channels) });
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
          onUpdateAgent={(agentId) => updateMemberAgent(index, agentId)}
          onUpdateChannel={(channelId) => updateMemberChannel(index, member.agentId, channelId)}
          onUpdateModel={(modelId) => updateMember(index, { modelId })}
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
              <TeamRunDetail run={activeRun} channels={channels} onStopTeamRun={onStopTeamRun} />
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
  onUpdateAgent,
  onUpdateChannel,
  onUpdateModel,
  onRemove,
}: {
  member: AgentTeamMember;
  index: number;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
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
  onUpdateAgent: (agentId: AgentId) => void;
  onUpdateChannel: (channelId: string) => void;
  onUpdateModel: (modelId: string) => void;
  onRemove: () => void;
}) {
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const channelOptions = channels.filter((channel) => channel.agentId === member.agentId);
  const selectedChannelId = channelOptions.some((channel) => channel.id === member.channelId)
    ? member.channelId
    : defaultChannelForAgent(member.agentId, channels);
  const modelOptions = modelsForChannel(member.agentId, selectedChannelId, channels);
  const selectedModelId = modelOptions.some((model) => model.id === member.modelId) ? member.modelId : DEFAULT_MODEL_ID;
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
  const selectedModel = modelOptions.find((model) => model.id === selectedModelId);
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
            <span className={`agent-badge mini ${agentAccent(member.agentId)}`}>{agentLabel(member.agentId)}</span>
            {workflowStatus !== "idle" ? <span className={`workflow-node-status-pill ${nodeStatusClass}`}>{workflowStatus}</span> : null}
          </div>
          <p>{member.prompt || "No member prompt."}</p>
          <div className="team-member-card-meta">
            <span>{selectedChannel?.label ?? member.channelId}</span>
            <span>{selectedModel?.label ?? member.modelId}</span>
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
                <span className={`agent-badge mini ${agentAccent(member.agentId)}`}>{agentLabel(member.agentId)}</span>
                <strong>{selectedModel?.label ?? member.modelId}</strong>
                <small>{selectedChannel?.label ?? member.channelId}</small>
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
                    aria-label={`Member ${index + 1} agent`}
                    value={member.agentId}
                    onChange={(event) => onUpdateAgent(event.currentTarget.value as AgentId)}
                  >
                    {AGENTS.map((agentId) => (
                      <option key={agentId} value={agentId}>
                        {agentLabel(agentId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="team-member-edit-field">
                  <span>Channel</span>
                  <select
                    className="composer-select"
                    aria-label={`Member ${index + 1} channel`}
                    value={selectedChannelId}
                    onChange={(event) => onUpdateChannel(event.currentTarget.value)}
                  >
                    {channelOptions.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="team-member-edit-field">
                  <span>Model</span>
                  <select
                    className="composer-select"
                    aria-label={`Member ${index + 1} model`}
                    value={selectedModelId}
                    onChange={(event) => onUpdateModel(event.currentTarget.value)}
                  >
                    {modelOptions.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
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
  onStopTeamRun,
}: {
  run: TeamRun;
  channels: AgentChannel[];
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
      <pre className="team-run-prompt">{run.prompt}</pre>

      <div className="task-section-divider">
        <span>Target</span>
        <i />
      </div>
      <pre className="team-run-context">{run.target ? `${run.target.label}: ${run.target.value}` : run.workDir}</pre>

      <div className="task-section-divider">
        <span>Shared Context Snapshot</span>
        <i />
      </div>
      <pre className="team-run-context">{run.sharedContextSnapshot || "No shared context snapshot."}</pre>

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
          const channel = channels.find((item) => item.id === step.channelId);
          const model = modelsForChannel(step.agentId, step.channelId, channels).find((item) => item.id === step.modelId);
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
                <span className={`agent-badge mini ${agentAccent(step.agentId)}`}>{agentLabel(step.agentId)}</span>
                <span>{channel?.label ?? step.channelId}</span>
                <span>{model?.label ?? step.modelId}</span>
              </div>
              {step.artifact ? <pre>{step.artifact}</pre> : <p>{step.lastError ?? "Waiting for artifact."}</p>}
            </article>
          );
        })}
      </div>
    </article>
  );
}

interface TaskPageProps {
  prompt: string;
  agentId: AgentId;
  channelId: string;
  modelId: string;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  tasks: TaskRun[];
  activeTaskId: string | undefined;
  onPromptChange: (value: string) => void;
  onSelectAgent: (agentId: AgentId) => MaybePromise;
  onSelectChannel: (channelId: string) => MaybePromise;
  onSelectModel: (modelId: string) => MaybePromise;
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
  agentId,
  channelId,
  modelId,
  workDir,
  runtimes,
  channels,
  tasks,
  activeTaskId,
  onPromptChange,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
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
  const activeChannel = activeTask ? channels.find((channel) => channel.id === activeTask.channelId) : undefined;
  const activeModel = activeTask
    ? modelsForChannel(activeTask.agentId, activeTask.channelId, channels).find((model) => model.id === activeTask.modelId)
    : undefined;
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
                      agentId={agentId}
                      channelId={channelId}
                      modelId={modelId}
                      workDir={workDir}
                      runtimes={runtimes}
                      channels={channels}
                      canRun={canRun}
                      onPromptChange={onPromptChange}
                      onSelectAgent={onSelectAgent}
                      onSelectChannel={onSelectChannel}
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
              <span className={`agent-badge mini ${agentAccent(activeTask.agentId)}`}>{agentLabel(activeTask.agentId)}</span>
              <TaskStatusChip label={activeTask.running ? "Running" : activeTask.status} tone={activeTask.running ? "running" : activeTask.status} />
              <TaskStatusChip label={activeTask.sessionId ? "Session linked" : "No session"} tone={activeTask.sessionId ? "done" : "backlog"} />
            </div>
            <div className="task-section-divider">
              <span>Metadata</span>
              <i />
            </div>
            <div className="task-detail-meta task-meta-grid">
              <TaskMeta label="Agent" value={agentLabel(activeTask.agentId)} />
              <TaskMeta label="Channel" value={activeChannel?.label ?? activeTask.channelId} />
              <TaskMeta label="Model" value={activeModel?.label ?? activeTask.modelId} />
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
              <pre>{activeTask.prompt}</pre>
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
                    <TaskTimelineMessage key={message.id} message={message} agentId={activeTask.agentId} />
                  ))
                )}
                {activeTask.running ? (
                  <div className="task-log-running">
                    <span className={`runtime-dot ${agentAccent(activeTask.agentId)}`} />
                    <span>{agentLabel(activeTask.agentId)} is running this task</span>
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
  active,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRun;
  active: boolean;
  onSelect: (taskId: string) => MaybePromise;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragEnd: () => void;
}) {
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
        <span className={`agent-badge mini ${agentAccent(task.agentId)}`}>{agentLabel(task.agentId)}</span>
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
  agentId,
  channelId,
  modelId,
  workDir,
  runtimes,
  channels,
  canRun,
  onPromptChange,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
  onChooseWorkDir,
  onRefresh,
  onRunTask,
}: {
  prompt: string;
  agentId: AgentId;
  channelId: string;
  modelId: string;
  workDir: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  canRun: boolean;
  onPromptChange: (value: string) => void;
  onSelectAgent: (agentId: AgentId) => MaybePromise;
  onSelectChannel: (channelId: string) => MaybePromise;
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
          agentId={agentId}
          channelId={channelId}
          modelId={modelId || DEFAULT_MODEL_ID}
          channels={channels}
          locked={false}
          running={false}
          workDir={workDir}
          runtimes={runtimes}
          onSelectAgent={onSelectAgent}
          onSelectChannel={onSelectChannel}
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
          message.role === "assistant" ? (
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

interface WorkflowHistoryPanelProps {
  workflows: WorkflowDraftState[];
  activeWorkflowId?: string | undefined;
  running?: boolean;
  onNewWorkflow: () => MaybePromise;
  onSelectWorkflow: (workflowId: string) => MaybePromise;
}

export function WorkflowHistoryPanel({
  workflows,
  activeWorkflowId,
  running = false,
  onNewWorkflow,
  onSelectWorkflow,
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
  agentId: AgentId;
  channelId: string;
  modelId: string;
  runtimes: AgentRuntime[];
  channels: AgentChannel[];
  configuredAgents?: ConfiguredAgent[];
  workDir: string;
  running: boolean;
  runProgress?: WorkflowRunProgressItem[];
  contextDocument?: string;
  finalReport?: string;
  onObjectiveChange: (value: string) => void;
  onSelectAgent: (agentId: AgentId) => void;
  onSelectChannel: (channelId: string) => void;
  onSelectModel: (modelId: string) => void;
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
  agentId,
  channelId,
  modelId,
  runtimes,
  channels,
  configuredAgents = [],
  workDir,
  running,
  runProgress = [],
  contextDocument = "",
  finalReport = "",
  onObjectiveChange,
  onSelectAgent,
  onSelectChannel,
  onSelectModel,
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
}: WorkflowPageProps) {
  const workflowText = UI_TEXT[language].workflow;
  const validation = validateWorkflowGraph(graph);
  const workflowStarted = messages.length > 0;
  const grillComplete = Math.max(0, messages.filter((message) => message.role === "user").length - 1) >= WORKFLOW_TOTAL_QUESTION_COUNT;
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const displayLayers = workflowGraphDisplayLayers(graph)
    .map((layer) => layer.map((nodeId) => nodeById.get(nodeId)).filter((node): node is WorkflowGraphNode => Boolean(node)))
    .filter((layer) => layer.length > 0);
  const runtimeMap = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const workflowChannelOptions = channels.filter((channel) => channel.agentId === agentId);
  const workflowFallbackChannelId = defaultChannelForAgent(agentId, channels);
  const workflowEffectiveChannels =
    workflowChannelOptions.length > 0
      ? workflowChannelOptions
      : [
          {
            id: workflowFallbackChannelId,
            agentId,
            label: "Default",
            models: modelsForChannel(agentId, workflowFallbackChannelId, channels),
          },
        ];
  const workflowSelectedChannelId = workflowEffectiveChannels.some((channel) => channel.id === channelId)
    ? channelId
    : (workflowEffectiveChannels[0]?.id ?? workflowFallbackChannelId);
  const workflowModelOptions = modelsForChannel(agentId, workflowSelectedChannelId, channels);
  const workflowSelectedModelId = workflowModelOptions.some((model) => model.id === modelId) ? modelId : DEFAULT_MODEL_ID;
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
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [filePreview, setFilePreview] = useState<LocalFilePreview | undefined>(undefined);
  const [filePreviewError, setFilePreviewError] = useState<string | undefined>(undefined);
  const [filePreviewLoadingPath, setFilePreviewLoadingPath] = useState<string | undefined>(undefined);
  const grillTranscriptRef = useRef<HTMLElement>(null);
  const grillStickRef = useRef(true);

  useEffect(() => {
    const transcript = grillTranscriptRef.current;
    if (!transcript || !grillStickRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!graphExpanded) return;
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") setGraphExpanded(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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

  function expandGraphFromBoardClick(event: MouseEvent<HTMLElement>): void {
    const target = event.target instanceof HTMLElement ? event.target : undefined;
    if (target?.closest(".workflow-graph-card")) return;
    setGraphExpanded(true);
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

  return (
    <>
      <header className="chat-header workflow-chat-header">
        <div className="chat-title-block">
          <h2>{workflowDisplayTitle}</h2>
          <div className="chat-subtitle">
            <span className={`agent-badge mini ${agentAccent(agentId)}`}>{agentLabel(agentId)}</span>
            <span>{workflowEffectiveChannels.find((channel) => channel.id === workflowSelectedChannelId)?.label ?? workflowSelectedChannelId}</span>
            <span>{workflowModelOptions.find((model) => model.id === workflowSelectedModelId)?.label ?? workflowSelectedModelId}</span>
            <span>{graphVisible ? `${validation.executableNodeIds.length} ${workflowText.executableNodes}` : status}</span>
            <span>{workDir || workflowText.noWorkDir}</span>
          </div>
        </div>
        <div className="chat-header-actions workflow-page-actions">
          {running && !graphVisible ? (
            <button className="icon-btn danger" onClick={() => onStopGrill()} title="Stop agent">
              <CircleStop size={14} />
            </button>
          ) : workflowStarted || graphVisible ? (
            <button className="icon-btn" onClick={() => void onResetSession()} title={workflowText.newWorkflow} disabled={running}>
              <Plus size={14} />
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
                {message.role === "assistant" ? <span className={`runtime-dot ${agentAccent(agentId)}`} /> : null}
                <span>{message.role === "assistant" ? "Workflow agent" : "You"}</span>
              </div>
              {message.role === "user" ? (
                <pre>{message.content}</pre>
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
              <span>{`${agentLabel(agentId)} ${workflowText.agentWorking}`}</span>
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
              </>
            ) : null}
            <div
              className={`workflow-graph-board ${graphExpanded ? "is-expanded" : ""}`}
              aria-label="Workflow graph board"
              onClick={expandGraphFromBoardClick}
            >
              {displayLayers.map((layer, layerIndex) => (
                <div className="workflow-graph-layer" key={layer.map((node) => node.id).join(":")}>
                  {layerIndex > 0 ? <span className="workflow-graph-edge" /> : null}
                  <div className="workflow-graph-layer-stack">
                    {layer.map((node) => {
                      const agentId = node.agentId ?? "codex";
                      const nodeRunProgress = runProgressByNodeId.get(node.id);
                      const channelOptions = channels.filter((channel) => channel.agentId === agentId);
                      const channelId = channelOptions.some((channel) => channel.id === node.channelId)
                        ? node.channelId!
                        : defaultChannelForAgent(agentId, channels);
                      const modelOptions = modelsForChannel(agentId, channelId, channels);
                      const modelId = modelOptions.some((model) => model.id === node.modelId) ? node.modelId! : DEFAULT_MODEL_ID;
                      const runtime = runtimeMap.get(agentId) ?? fallbackRuntime(agentId);
                      const configuredAgentOptions = configuredAgents.filter((agent) => channels.some((channel) => channel.id === agent.channelId));
                      const selectedConfiguredAgent =
                        configuredAgentOptions.find((agent) => agent.channelId === channelId) ??
                        configuredAgentOptions.find((agent) => agent.runtimeAgentId === agentId) ??
                        configuredAgentOptions[0];
                      const nodeEditingDisabled = running;
                      return (
                        <article className={`workflow-graph-card is-${node.kind} ${nodeRunProgress ? `run-${nodeRunProgress.status}` : ""}`} key={node.id}>
                          <div className="workflow-graph-card-head">
                            <span>{node.kind}</span>
                            <strong>{node.title}</strong>
                            {nodeRunProgress ? (
                              <em className={`workflow-node-run-pill is-${nodeRunProgress.status}`}>{workflowRunStatusLabel(nodeRunProgress.status)}</em>
                            ) : null}
                          </div>
                          <input
                            aria-label={`Node ${node.id} title`}
                            value={node.title}
                            disabled={nodeEditingDisabled}
                            onChange={(event) => onUpdateNode(node.id, { title: event.currentTarget.value })}
                          />
                          {node.kind === "agent" ? (
                            <>
                              <p className="workflow-node-prompt-preview">{node.prompt}</p>
                              <div className="workflow-node-meta-row">
                                <span>{selectedConfiguredAgent?.name || agentLabel(agentId)}</span>
                                <span>{modelOptions.find((model) => model.id === modelId)?.label ?? modelId}</span>
                              </div>
                              <textarea
                                aria-label={`Node ${node.id} prompt`}
                                value={node.prompt}
                                disabled={nodeEditingDisabled}
                                onChange={(event) => onUpdateNode(node.id, { prompt: event.currentTarget.value })}
                                rows={4}
                              />
                              <div className="workflow-node-config-grid">
                                {configuredAgentOptions.length > 0 ? (
                                  <label>
                                    <span>Agent</span>
                                    <select
                                      aria-label={`Node ${node.id} configured agent`}
                                      value={selectedConfiguredAgent?.id ?? ""}
                                      disabled={nodeEditingDisabled}
                                      onChange={(event) => {
                                        const selectedAgent = configuredAgentOptions.find((agent) => agent.id === event.currentTarget.value);
                                        if (!selectedAgent) return;
                                        onUpdateNode(node.id, {
                                          agentId: selectedAgent.runtimeAgentId,
                                          channelId: selectedAgent.channelId,
                                          modelId: selectedAgent.modelId || DEFAULT_MODEL_ID,
                                        });
                                      }}
                                    >
                                      {configuredAgentOptions.map((agent) => (
                                        <option key={agent.id} value={agent.id}>
                                          {agent.name || agent.id}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                ) : (
                                  <>
                                    <label>
                                      <span>Runtime</span>
                                      <select
                                        aria-label={`Node ${node.id} runtime`}
                                        value={agentId}
                                        disabled={nodeEditingDisabled}
                                        onChange={(event) => {
                                          const nextAgentId = event.currentTarget.value as AgentId;
                                          onUpdateNode(node.id, {
                                            agentId: nextAgentId,
                                            channelId: defaultChannelForAgent(nextAgentId, channels),
                                            modelId: DEFAULT_MODEL_ID,
                                          });
                                        }}
                                      >
                                        {AGENTS.map((item) => (
                                          <option key={item} value={item}>
                                            {agentLabel(item)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      <span>Provider</span>
                                      <select
                                        aria-label={`Node ${node.id} provider`}
                                        value={channelId}
                                        disabled={nodeEditingDisabled}
                                        onChange={(event) => onUpdateNode(node.id, { channelId: event.currentTarget.value, modelId: DEFAULT_MODEL_ID })}
                                      >
                                        {channelOptions.map((channel) => (
                                          <option key={channel.id} value={channel.id}>
                                            {channel.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </>
                                )}
                                <label>
                                  <span>Model</span>
                                  <select
                                    aria-label={`Node ${node.id} model`}
                                    value={modelId}
                                    disabled={nodeEditingDisabled}
                                    onChange={(event) => onUpdateNode(node.id, { modelId: event.currentTarget.value })}
                                  >
                                    {modelOptions.map((model) => (
                                      <option key={model.id} value={model.id}>
                                        {model.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="workflow-node-runtime">
                                <span className={`runtime-dot ${agentAccent(agentId)}`} />
                                <span>{runtime.available ? runtimeStatus(runtime) : runtime.error ?? "Unavailable"}</span>
                              </div>
                              {nodeRunProgress?.detail ? (
                                <div className={`workflow-node-run-detail is-${nodeRunProgress.status}`}>{nodeRunProgress.detail}</div>
                              ) : null}
                            </>
                          ) : (
                            <p>{node.kind === "start" ? workflowText.entryNode : workflowText.terminalNode}</p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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
            <pre>{filePreview.content}</pre>
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
              agentId={agentId}
              channelId={workflowSelectedChannelId}
              modelId={workflowSelectedModelId}
              channels={channels}
              locked={composerLocked}
              running={running}
              workDir={workDir}
              runtimes={runtimes}
              onSelectAgent={onSelectAgent}
              onSelectChannel={onSelectChannel}
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

interface ConfigPageProps {
  language?: Language;
  channels: AgentChannel[];
  configuredAgents: ConfiguredAgent[];
  selectedConfiguredAgentId: string;
  providerKeys: Record<string, string>;
  status: string;
  codexPluginCatalog: CodexPluginCatalogItem[];
  pluginCatalogStatus: string;
  agentTestResults: Record<string, AgentTestUiState>;
  testingAgentId: string | undefined;
  agentTestTick: number;
  onUpdateChannel: (channelId: string, updater: (channel: AgentChannel) => AgentChannel) => void;
  onAddModel: (channelId: string) => void;
  onUpdateModel: (channelId: string, modelIndex: number, updater: (model: AgentModelOption) => AgentModelOption) => void;
  onRemoveModel: (channelId: string, modelIndex: number) => void;
  onSave: () => Promise<void>;
  onLoadCodexPluginCatalog: () => Promise<void>;
  onAddConfiguredAgent: () => MaybePromise;
  onSelectConfiguredAgent: (agentId: string) => void;
  onUpdateProviderKey: (presetId: string, value: string) => void;
  onUpdateConfiguredAgent: (agentId: string, updater: (agent: ConfiguredAgent) => ConfiguredAgent) => void;
  onRemoveConfiguredAgent: (agentId: string) => void;
  onTestConfiguredAgent: (agentId: string) => Promise<void>;
}

export function SkillsPage({
  language,
  templates,
  onCreateAgent,
}: {
  language: Language;
  templates: AgentTemplate[];
  onCreateAgent: (template: AgentTemplate) => MaybePromise;
}) {
  const text = UI_TEXT[language].chrome;
  const title = text.skillLibrary;
  const description =
    language === "zh"
      ? `${templates.length} 个本地模板，可继续搜索 GitHub 上的公开 Skills`
      : `${templates.length} local templates, plus online GitHub skill search`;
  const promptLabel = language === "zh" ? "Prompt" : "Prompt";
  const onlineTitle = language === "zh" ? "搜索网上 Skills" : "Search online skills";
  const onlineDescription =
    language === "zh"
      ? "从公开 GitHub skill 仓库读取 SKILL.md 元数据。第三方 skill 只当作未审查内容展示。"
      : "Read SKILL.md metadata from public GitHub skill repositories. Treat third-party skills as untrusted content.";
  const localTitle = language === "zh" ? "本地技能模板" : "Local skill templates";
  const searchPlaceholder = language === "zh" ? "搜索 code review、testing、pdf、docs..." : "Search code review, testing, pdf, docs...";
  const searchButton = language === "zh" ? "搜索" : "Search";
  const searchingText = language === "zh" ? "搜索中..." : "Searching...";
  const noOnlineResults = language === "zh" ? "没有找到在线 Skills。" : "No online skills found.";
  const openSource = language === "zh" ? "打开来源" : "Open source";
  const [query, setQuery] = useState("");
  const [onlineResults, setOnlineResults] = useState<OnlineSkillResult[]>([]);
  const [onlineStatus, setOnlineStatus] = useState("");
  const [onlineSearching, setOnlineSearching] = useState(false);

  async function runOnlineSearch(): Promise<void> {
    setOnlineSearching(true);
    setOnlineStatus(searchingText);
    try {
      const results = await fetchOnlineSkills(query);
      setOnlineResults(results);
      setOnlineStatus(results.length === 0 ? noOnlineResults : `${results.length} skills`);
    } catch (error) {
      setOnlineStatus(error instanceof Error ? error.message : String(error));
      setOnlineResults([]);
    } finally {
      setOnlineSearching(false);
    }
  }

  return (
    <section className="skills-page">
      <header className="skills-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>

      <section className="online-skills-panel">
        <div className="online-skills-head">
          <div>
            <h3>{onlineTitle}</h3>
            <p>{onlineDescription}</p>
          </div>
          <div className="online-skill-sources" aria-label="Online skill sources">
            {ONLINE_SKILL_SOURCES.map((source) => (
              <a key={source.id} href={source.homepage ?? onlineSkillTreeUrl(source)} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ))}
          </div>
        </div>
        <div className="online-skills-search">
          <Search size={14} />
          <input value={query} placeholder={searchPlaceholder} onChange={(event) => setQuery(event.currentTarget.value)} aria-label={onlineTitle} />
          <button className="control-btn compact" type="button" onClick={() => void runOnlineSearch()} disabled={onlineSearching}>
            <span>{onlineSearching ? searchingText : searchButton}</span>
          </button>
        </div>
        {onlineStatus ? <div className="online-skills-status">{onlineStatus}</div> : null}
        {onlineResults.length > 0 ? (
          <div className="online-skills-results" aria-label="Online skill results">
            {onlineResults.map((skill) => (
              <article key={skill.id} className="skill-card online">
                <div className="skill-card-head">
                  <div>
                    <h3>{skill.name}</h3>
                    <p>{skill.description}</p>
                  </div>
                  <button className="control-btn compact" type="button" onClick={() => void onCreateAgent(skill)}>
                    <Plus size={13} />
                    <span>{text.createAgentFromSkill}</span>
                  </button>
                </div>
                <div className="skill-card-source">
                  <span>{skill.sourceLabel}</span>
                  <a href={skill.url} target="_blank" rel="noreferrer">
                    {openSource}
                  </a>
                </div>
                <div className="skill-tags" aria-label="Skill tags">
                  {skill.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="skill-prompt">
                  <span>{promptLabel}</span>
                  <pre>{skill.prompt}</pre>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <div className="skills-section-title">
        <h3>{localTitle}</h3>
      </div>
      <div className="skills-grid" aria-label={localTitle}>
        {templates.length === 0 ? (
          <div className="empty-state config-empty">{text.noSkills}</div>
        ) : (
          templates.map((template) => (
            <article key={template.id} className="skill-card">
              <div className="skill-card-head">
                <div>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                </div>
                <button className="control-btn compact" type="button" onClick={() => void onCreateAgent(template)}>
                  <Plus size={13} />
                  <span>{text.createAgentFromSkill}</span>
                </button>
              </div>
              <div className="skill-tags" aria-label="Skill tags">
                {template.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="skill-prompt">
                <span>{promptLabel}</span>
                <pre>{template.prompt}</pre>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function SettingsPage({
  language,
  onLanguageChange,
}: {
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  const configText = UI_TEXT[language].config;
  const title = language === "zh" ? "设置" : "Settings";
  const description = language === "zh" ? "调整应用级偏好。" : "Adjust app-level preferences.";
  const languageTitle = language === "zh" ? "语言" : "Language";
  const languageDescription = language === "zh" ? "选择界面显示语言。" : "Choose the interface language.";

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
      </div>
    </section>
  );
}

export function ConfigPage({
  language = "en",
  channels,
  configuredAgents,
  selectedConfiguredAgentId,
  providerKeys,
  status,
  codexPluginCatalog,
  pluginCatalogStatus,
  agentTestResults,
  testingAgentId,
  agentTestTick,
  onUpdateChannel,
  onAddModel,
  onUpdateModel,
  onRemoveModel,
  onSave,
  onLoadCodexPluginCatalog,
  onAddConfiguredAgent,
  onSelectConfiguredAgent,
  onUpdateProviderKey,
  onUpdateConfiguredAgent,
  onRemoveConfiguredAgent,
  onTestConfiguredAgent,
}: ConfigPageProps) {
  const configText = UI_TEXT[language].config;
  const selectedConfiguredAgent =
    configuredAgents.find((agent) => agent.id === selectedConfiguredAgentId) ?? configuredAgents[0];
  const selectedAgentChannelRecord = resolveConfiguredAgentChannel(selectedConfiguredAgent, channels);
  const configuredPluginIds = new Set((selectedAgentChannelRecord?.plugins ?? []).map((plugin) => plugin.id));
  const availableCodexPlugins = codexPluginCatalog.filter((plugin) => !configuredPluginIds.has(plugin.id));
  const selectedAgentChannel = selectedAgentChannelRecord?.id ?? channels[0]?.id ?? "";
  const selectedAgentRuntime = selectedAgentChannelRecord?.agentId ?? selectedConfiguredAgent?.runtimeAgentId ?? "codex";
  const selectedAgentModels = selectedConfiguredAgent
    ? modelsForChannel(selectedAgentRuntime, selectedAgentChannel, channels)
    : [];
  const runtimeProviderPresets = AGENT_PROVIDER_PRESETS.filter((preset) => preset.runtimeAgentId === selectedAgentRuntime);
  const updateSelectedAgentChannel = (updater: (channel: AgentChannel) => AgentChannel): void => {
    if (!selectedAgentChannelRecord) return;
    onUpdateChannel(selectedAgentChannelRecord.id, updater);
  };
  const selectedAgentPresetId = selectedAgentChannelRecord
    ? (AGENT_PROVIDER_PRESETS.find(
        (preset) =>
          preset.runtimeAgentId === selectedAgentRuntime &&
          (preset.modelProvider ?? "") === (selectedAgentChannelRecord.modelProvider ?? "") &&
          (preset.baseUrl ?? "") === (selectedAgentChannelRecord.baseUrl ?? ""),
      )?.id ?? "custom")
    : undefined;
  const selectedAgentPreset = selectedAgentPresetId ? AGENT_PROVIDER_PRESETS.find((preset) => preset.id === selectedAgentPresetId) : undefined;
  const selectedProviderKey = providerKeyValue(providerKeys, selectedAgentPreset, selectedAgentChannelRecord);
  const selectedAgentModelId =
    selectedConfiguredAgent && selectedAgentModels.some((model) => model.id === selectedConfiguredAgent.modelId)
      ? selectedConfiguredAgent.modelId
      : DEFAULT_MODEL_ID;
  const selectedAgentTestResult = selectedConfiguredAgent ? agentTestResults[selectedConfiguredAgent.id] : undefined;
  const selectedAgentTesting = Boolean(selectedConfiguredAgent && testingAgentId === selectedConfiguredAgent.id);
  const selectedAgentTestElapsedMs =
    selectedAgentTestResult?.state === "running"
      ? Date.now() - selectedAgentTestResult.startedAt + agentTestTick * 0
      : (selectedAgentTestResult?.elapsedMs ?? 0);
  const selectedAgentTestModelLabel = selectedAgentTestResult
    ? (selectedAgentModels.find((model) => model.id === selectedAgentTestResult.modelId)?.label ?? selectedAgentTestResult.modelId)
    : "";
  const applySelectedAgentPreset = (preset: AgentProviderPreset): void => {
    if (!selectedConfiguredAgent || !selectedAgentChannelRecord) return;
    updateSelectedAgentChannel((channel) =>
      applyProviderPresetToChannel(channel, preset, providerKeys[preset.id] ?? (preset.id === selectedAgentPresetId ? apiKeyFromChannelHeaders(channel, preset) : "")),
    );
    onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => applyProviderPresetToConfiguredAgent(item, selectedAgentChannelRecord, preset));
  };
  const selectAgentRuntime = (runtimeAgentId: AgentId): void => {
    const preset = AGENT_PROVIDER_PRESETS.find((item) => item.runtimeAgentId === runtimeAgentId) ?? AGENT_PROVIDER_PRESETS[0]!;
    applySelectedAgentPreset(preset);
  };
  const updateSelectedProviderKey = (value: string): void => {
    if (!selectedAgentPreset) return;
    onUpdateProviderKey(selectedAgentPreset.id, value);
    updateSelectedAgentChannel((channel) => applyProviderPresetToChannel(channel, selectedAgentPreset, value));
  };
  const updateSelectedProviderModelId = (value: string): void => {
    if (!selectedConfiguredAgent || !selectedAgentChannelRecord) return;
    const result = applyProviderModelIdToAgentConfig(selectedConfiguredAgent, selectedAgentChannelRecord, value);
    onUpdateChannel(selectedAgentChannelRecord.id, () => result.channel);
    onUpdateConfiguredAgent(selectedConfiguredAgent.id, () => result.agent);
  };

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
                        <button
                          type="button"
                          className="control-btn compact secondary"
                          onClick={() => void onTestConfiguredAgent(selectedConfiguredAgent.id)}
                          disabled={selectedAgentTesting}
                        >
                          <RefreshCw size={13} />
                          <span>{selectedAgentTesting ? "Testing" : "Test"}</span>
                        </button>
                      </div>
                    </div>
                    {status ? <div className="config-status">{status}</div> : null}

                    {selectedAgentTestResult ? (
                      selectedAgentTestResult.state === "passed" ? (
                        <section className="agent-test-result passed collapsed">
                          <div className="agent-test-success-icon" aria-hidden="true">
                            <CheckCircle2 size={16} />
                          </div>
                          <div className="agent-test-success-copy">
                            <strong>{configText.agentDeployed}</strong>
                            <span>{`${selectedAgentTestResult.providerLabel} · ${selectedAgentTestModelLabel}`}</span>
                          </div>
                          <span className="agent-test-success-duration">{formatDuration(selectedAgentTestElapsedMs)}</span>
                        </section>
                      ) : (
                        <section className={`agent-test-result ${selectedAgentTestResult.state}`}>
                          <div className="agent-test-result-head">
                            <div>
                              <strong>{selectedAgentTestResult.state === "running" ? "Testing agent" : "Test failed"}</strong>
                              <span>{selectedAgentTestResult.phase}</span>
                            </div>
                            <span>{formatDuration(selectedAgentTestElapsedMs)}</span>
                          </div>
                          {selectedAgentTestResult.state === "running" ? <div className="agent-test-progress" aria-hidden="true" /> : null}
                          <dl className="agent-test-meta">
                            <div>
                              <dt>Runtime</dt>
                              <dd>{agentLabel(selectedAgentTestResult.runtimeAgentId)}</dd>
                            </div>
                            <div>
                              <dt>Provider</dt>
                              <dd>{selectedAgentTestResult.providerLabel}</dd>
                            </div>
                            <div>
                              <dt>Model</dt>
                              <dd>{selectedAgentTestResult.modelId}</dd>
                            </div>
                          </dl>
                          <p>{selectedAgentTestResult.message}</p>
                          {selectedAgentTestResult.transcript.length > 0 ? (
                            <div className="agent-test-transcript" aria-label="Agent test interaction">
                              {selectedAgentTestResult.transcript.map((item) => (
                                <div key={item.id} className={`agent-test-transcript-row ${item.type}`}>
                                  <span>{agentTestEventLabel(item.type)}</span>
                                  <pre>{item.content}</pre>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {selectedAgentTestResult.output ? <pre>{selectedAgentTestResult.output}</pre> : null}
                        </section>
                      )
                    ) : null}

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
                            className={`agent-provider-preset ${selectedAgentRuntime === agentId ? "is-active" : ""}`}
                            onClick={() => selectAgentRuntime(agentId)}
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
                        <span>{`${configText.providerHelp} ${agentLabel(selectedAgentRuntime)}.`}</span>
                      </div>
                      <div className="agent-provider-preset-list">
                        {runtimeProviderPresets.map((preset) => (
                          <button
                            type="button"
                            key={preset.id}
                            className={`agent-provider-preset ${selectedAgentPresetId === preset.id ? "is-active" : ""}`}
                            onClick={() => applySelectedAgentPreset(preset)}
                          >
                            <strong>{preset.label}</strong>
                          </button>
                        ))}
                      </div>
                      {selectedAgentPreset?.usesApiKey ? (
                        <label className="agent-provider-key-field">
                          <span>{configText.apiKey}</span>
                          <input
                            aria-label="Provider API key"
                            type="password"
                            value={selectedProviderKey}
                            placeholder={`${configText.usedByAll} ${selectedAgentPreset.label} agents`}
                            onChange={(event) => updateSelectedProviderKey(event.currentTarget.value)}
                          />
                        </label>
                      ) : null}
                      {selectedAgentPreset?.configurableModelId ? (
                        <label className="agent-provider-key-field">
                          <span>{selectedAgentPreset.configurableModelLabel ?? "Model ID"}</span>
                          <input
                            aria-label="Provider endpoint or model id"
                            value={selectedAgentModelId === DEFAULT_MODEL_ID ? "" : selectedAgentModelId}
                            placeholder={selectedAgentPreset.configurableModelPlaceholder ?? "model-or-endpoint-id"}
                            onChange={(event) => updateSelectedProviderModelId(event.currentTarget.value)}
                          />
                        </label>
                      ) : null}
                    </section>

                    <div className="config-field-grid">
                      <label className="config-field">
                        <span>{configText.name}</span>
                        <input
                          aria-label="Agent name"
                          value={selectedConfiguredAgent.name}
                          onChange={(event) => {
                            const nextName = event.currentTarget.value;
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, name: nextName }));
                            updateSelectedAgentChannel((channel) => ({ ...channel, label: nextName || channel.label }));
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
                        <span>{configText.model}</span>
                        <select
                          aria-label="Agent model"
                          value={selectedAgentModelId}
                          onChange={(event) =>
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, modelId: event.currentTarget.value }))
                          }
                        >
                          {selectedAgentModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
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
                      <label className="config-field config-field-wide">
                        <span>{configText.prompt}</span>
                        <textarea
                          aria-label="Agent prompt"
                          value={selectedConfiguredAgent.prompt}
                          onChange={(event) =>
                            onUpdateConfiguredAgent(selectedConfiguredAgent.id, (item) => ({ ...item, prompt: event.currentTarget.value }))
                          }
                        />
                      </label>
                    </div>
                    {selectedAgentChannelRecord ? (
                      <details className="agent-advanced-panel">
                        <summary>{configText.advancedProvider}</summary>
                        <div className="config-field-grid">
                          <label className="config-field">
                            <span>Channel ID</span>
                            <div className="configured-agent-runtime-readonly">
                              <span className={`agent-badge mini ${agentAccent(selectedAgentRuntime)}`}>{agentLabel(selectedAgentRuntime)}</span>
                              <strong>{selectedAgentChannelRecord.id}</strong>
                            </div>
                          </label>
                          <label className="config-field">
                            <span>Model Provider</span>
                            <input
                              value={selectedAgentChannelRecord.modelProvider ?? ""}
                              onChange={(event) => updateSelectedAgentChannel((channel) => withOptionalString(channel, "modelProvider", event.currentTarget.value))}
                            />
                          </label>
                          <label className="config-field">
                            <span>Provider Name</span>
                            <input
                              value={selectedAgentChannelRecord.providerName ?? ""}
                              onChange={(event) => updateSelectedAgentChannel((channel) => withOptionalString(channel, "providerName", event.currentTarget.value))}
                            />
                          </label>
                          <label className="config-field">
                            <span>Wire API</span>
                            <input
                              value={selectedAgentChannelRecord.wireApi ?? ""}
                              onChange={(event) => updateSelectedAgentChannel((channel) => withOptionalString(channel, "wireApi", event.currentTarget.value))}
                            />
                          </label>
                          <label className="config-field config-field-wide">
                            <span>Base URL</span>
                            <input
                              value={selectedAgentChannelRecord.baseUrl ?? ""}
                              onChange={(event) => updateSelectedAgentChannel((channel) => withOptionalString(channel, "baseUrl", event.currentTarget.value))}
                            />
                          </label>
                          <label className="config-field">
                            <span>Reasoning</span>
                            <input
                              value={selectedAgentChannelRecord.modelReasoningEffort ?? ""}
                              onChange={(event) =>
                                updateSelectedAgentChannel((channel) => withOptionalString(channel, "modelReasoningEffort", event.currentTarget.value))
                              }
                            />
                          </label>
                          <label className="config-field config-field-wide">
                            <span>Catalog JSON</span>
                            <input
                              value={selectedAgentChannelRecord.modelCatalogJson ?? ""}
                              onChange={(event) => updateSelectedAgentChannel((channel) => withOptionalString(channel, "modelCatalogJson", event.currentTarget.value))}
                            />
                          </label>
                          <label className="config-field config-field-wide">
                            <span>Headers</span>
                            <textarea
                              value={headersToText(selectedAgentChannelRecord.httpHeaders)}
                              onChange={(event) => updateSelectedAgentChannel((channel) => withOptionalHeaders(channel, event.currentTarget.value))}
                            />
                          </label>
                        </div>
                      </details>
                    ) : null}
                    {selectedAgentChannelRecord && selectedAgentRuntime === "codex" ? (
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
                                updateSelectedAgentChannel((channel) => ({
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
                              updateSelectedAgentChannel((channel) => addPluginToChannel(channel, pluginId));
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
                          {(selectedAgentChannelRecord.plugins ?? []).length === 0 ? (
                            <div className="empty-state config-empty">{configText.noPluginsConfigured}</div>
                          ) : (
                            (selectedAgentChannelRecord.plugins ?? []).map((plugin, index) => (
                              <div key={`${plugin.id}:${index}`} className="config-plugin-row">
                                <input
                                  aria-label="Plugin id"
                                  value={plugin.id}
                                  onChange={(event) =>
                                    updateSelectedAgentChannel((channel) => updatePluginAt(channel, index, (item) => ({ ...item, id: event.currentTarget.value })))
                                  }
                                />
                                <label className="config-plugin-toggle">
                                  <input
                                    type="checkbox"
                                    checked={plugin.enabled}
                                    onChange={(event) =>
                                      updateSelectedAgentChannel((channel) =>
                                        updatePluginAt(channel, index, (item) => ({ ...item, enabled: event.currentTarget.checked })),
                                      )
                                    }
                                  />
                                  <span>{configText.enabled}</span>
                                </label>
                                <button className="icon-btn danger" type="button" onClick={() => updateSelectedAgentChannel((channel) => removePluginAt(channel, index))}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    ) : null}
                    {selectedAgentChannelRecord ? (
                      <section className="agent-channel-models">
                        <div className="config-models-header">
                          <h3>{configText.models}</h3>
                          <button className="control-btn compact secondary" onClick={() => onAddModel(selectedAgentChannelRecord.id)}>
                            <Plus size={13} />
                            <span>{configText.addModel}</span>
                          </button>
                        </div>
                        <div className="config-model-list">
                          {selectedAgentChannelRecord.models.map((model, index) => (
                            <div key={`${model.id}:${index}`} className="config-model-row">
                              <input
                                aria-label="Agent model id"
                                value={model.id}
                                onChange={(event) => onUpdateModel(selectedAgentChannelRecord.id, index, (item) => ({ ...item, id: event.currentTarget.value }))}
                              />
                              <input
                                aria-label="Agent model label"
                                value={model.label}
                                onChange={(event) => onUpdateModel(selectedAgentChannelRecord.id, index, (item) => ({ ...item, label: event.currentTarget.value }))}
                              />
                              <button
                                className="icon-btn danger"
                                onClick={() => onRemoveModel(selectedAgentChannelRecord.id, index)}
                                disabled={model.id === DEFAULT_MODEL_ID}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ) : null}
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
        <pre>{message.content}</pre>
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
