import {
  skillFrontmatterValue,
  type OnlineSkillResult,
} from "../../../../shared/online-skills";
import type { ImportedSkillResult, ImportOnlineSkillRequest, SkillTemplate } from "../../../../shared/types";
import type { Language } from "../../app/language";

export function skillDisplayName(skill: Pick<SkillTemplate, "name" | "prompt">): string {
  return skillFrontmatterValue(skill.prompt, "name") || skill.name;
}

export function skillDisplayDescription(skill: Pick<SkillTemplate, "description" | "prompt">): string {
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
