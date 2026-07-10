import { useEffect, useMemo, useState } from "react";
import { Bot, FolderOpen, MessageSquareText, Plus, Save, Search, Send, Trash2, X } from "lucide-react";
import { ONLINE_SKILL_SOURCES, fetchOnlineSkills, type OnlineSkillResult } from "../../../../shared/online-skills";
import type { AssignSkillCategoryRequest, ConfiguredAgent, ImportedSkillResult, InstalledSkillResult, RuntimeConversation, SkillCategory, SkillInstallTarget, SkillTemplate, UninstalledSkillResult } from "../../../../shared/types";
import { resolveFindSkillConfiguredAgentId } from "../../app/agents";
import { shouldSendComposerKey } from "../../app/composer";
import type { Language } from "../../app/language";
import { MarkdownDocument } from "../../ui/MarkdownDocument";
import {
  buildFindSkillAgentPrompt,
  findSkillFallbackMessage,
  findSkillImportRequest,
  findSkillImportSuccessMessage,
  parseFindSkillAgentToolCall,
  skillDisplayDescription,
  skillDisplayName,
} from "./find-skill";
import { filterSkills } from "./skill-library-filter";

const SKILL_INSTALL_TARGETS: Array<{ id: SkillInstallTarget; label: string; path: string }> = [
  { id: "codex", label: "Codex", path: "~/.codex/skills" },
  { id: "claude", label: "Claude", path: "~/.claude/skills" },
  { id: "trae", label: "Trae", path: "~/.trae/skills" },
];

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

export function SkillsPage({
  language,
  officialSkills = [],
  userSkills = [],
  categories = [],
  templates,
  configuredAgents = [],
  onImportOnlineSkill,
  onRevealSkillInFinder,
  onInstallSkill,
  onUninstallSkill,
  onDeleteUserSkill,
  onCreateCategory,
  onAssignCategory,
  defaultFindSkillChatOpen = false,
}: {
  language: Language;
  officialSkills?: SkillTemplate[];
  userSkills?: SkillTemplate[];
  categories?: SkillCategory[];
  templates?: SkillTemplate[];
  configuredAgents?: ConfiguredAgent[];
  onImportOnlineSkill?: (skill: OnlineSkillResult) => Promise<ImportedSkillResult>;
  onRevealSkillInFinder?: (filePath: string) => Promise<void>;
  onInstallSkill?: (templateId: string, target: SkillInstallTarget, sourceType: "official" | "user") => Promise<InstalledSkillResult>;
  onUninstallSkill?: (templateId: string, target: SkillInstallTarget) => Promise<UninstalledSkillResult>;
  onDeleteUserSkill?: (templateId: string) => Promise<void>;
  onCreateCategory?: (name: string) => Promise<SkillCategory>;
  onAssignCategory?: (request: AssignSkillCategoryRequest) => Promise<void>;
  defaultFindSkillChatOpen?: boolean;
}) {
  const title = language === "zh" ? "技能库" : "Skill library";
  const noSkills = language === "zh" ? "暂无技能" : "No skills";
  const noConfiguredAgents = language === "zh" ? "暂无配置的 Agent" : "No configured agents";
  const description =
    language === "zh"
      ? `${officialSkills.length} 个官方技能，${userSkills.length} 个我的技能。`
      : `${officialSkills.length} official skills and ${userSkills.length} user skills.`;
  const localDescription =
    language === "zh"
      ? "内置技能随应用一起维护。第三方 skill 只会通过 Find skill 候选预览，不会自动安装。"
      : "Bundled skills are maintained with the app. Third-party skills are only previewed through Find skill candidates and are never installed automatically.";
  const officialTitle = language === "zh" ? "官方技能" : "Official skills";
  const userTitle = language === "zh" ? "我的技能" : "My skills";
  const searchingText = language === "zh" ? "搜索中..." : "Searching...";
  const localInstall = language === "zh" ? "本地安装" : "Local install";
  const installLinks = language === "zh" ? "安装/更新链接" : "Install/update links";
  const removeLinks = language === "zh" ? "删除本地链接" : "Remove local links";
  const translateToZh = language === "zh" ? "查看中文" : "View Chinese";
  const showOriginal = language === "zh" ? "查看原文" : "Show original";
  const allCategories = language === "zh" ? "全部分类" : "All categories";
  const uncategorized = language === "zh" ? "未分类" : "Uncategorized";
  const searchSkillsPlaceholder = language === "zh" ? "搜索名称、描述或标签" : "Search names, descriptions, or tags";
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
  const [onlineResults, setOnlineResults] = useState<OnlineSkillResult[]>([]);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | undefined>();
  const [selectedOnlineSkillKey, setSelectedOnlineSkillKey] = useState<string | undefined>();
  const [installingTarget, setInstallingTarget] = useState<SkillInstallTarget | undefined>();
  const [installAction, setInstallAction] = useState<"install" | "uninstall" | undefined>();
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [selectedInstallTargets, setSelectedInstallTargets] = useState<SkillInstallTarget[]>(["codex"]);
  const [installStatus, setInstallStatus] = useState("");
  const [installStatusTone, setInstallStatusTone] = useState<"success" | "error" | undefined>();
  const [translationStatus, setTranslationStatus] = useState("");
  const [showTranslatedSkill, setShowTranslatedSkill] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [categoryFilterId, setCategoryFilterId] = useState("all");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryActionRunning, setCategoryActionRunning] = useState(false);
  const [findSkillChatOpen, setFindSkillChatOpen] = useState(defaultFindSkillChatOpen);
  const [findSkillConfiguredAgentId, setFindSkillConfiguredAgentId] = useState(() => resolveFindSkillConfiguredAgentId(undefined, configuredAgents));
  const [findSkillInput, setFindSkillInput] = useState("");
  const [findSkillRunning, setFindSkillRunning] = useState(false);
  const [findSkillRuntimeConversation, setFindSkillRuntimeConversation] = useState<RuntimeConversation | undefined>();
  const [findSkillMessages, setFindSkillMessages] = useState<Array<{ id: string; role: "assistant" | "user" | "error"; content: string }>>(() => [
    { id: "find-skill-welcome", role: "assistant", content: findSkillWelcome },
  ]);
  const legacyOfficialSkills = templates ?? [];
  const officialSkillItems = useMemo(
    () => [...officialSkills, ...legacyOfficialSkills].map((template) => ({ ...template, sourceType: "official" as const, itemKey: `official:${template.id}`, kind: "official" as const })),
    [legacyOfficialSkills, officialSkills],
  );
  const userSkillItems = useMemo(
    () => userSkills.map((template) => ({ ...template, sourceType: "user" as const, itemKey: `user:${template.id}`, kind: "user" as const })),
    [userSkills],
  );
  const filteredOfficialSkillItems = useMemo(
    () => filterSkills(officialSkillItems, { query: skillSearch, categoryId: categoryFilterId }),
    [categoryFilterId, officialSkillItems, skillSearch],
  );
  const filteredUserSkillItems = useMemo(
    () => filterSkills(userSkillItems, { query: skillSearch, categoryId: categoryFilterId }),
    [categoryFilterId, skillSearch, userSkillItems],
  );
  const onlineSkillItems = useMemo(
    () => onlineResults.map((skill) => ({ ...skill, itemKey: `online:${skill.id}`, kind: "online" as const })),
    [onlineResults],
  );
  const selectedOnlineSkill = onlineSkillItems.find((skill) => skill.itemKey === selectedOnlineSkillKey);
  const selectedSkill = selectedOnlineSkill
    ?? filteredOfficialSkillItems.find((skill) => skill.itemKey === selectedSkillKey)
    ?? filteredUserSkillItems.find((skill) => skill.itemKey === selectedSkillKey)
    ?? filteredOfficialSkillItems[0]
    ?? filteredUserSkillItems[0];
  const selectedSkillSourceUrl = selectedSkill ? (selectedSkill.kind === "online" ? selectedSkill.url : selectedSkill.sourceUrl) : undefined;
  const selectedSkillSourcePath = selectedSkill ? (selectedSkill.kind === "online" ? selectedSkill.path : selectedSkill.sourcePath) : undefined;
  const activeFindSkillConfiguredAgentId = resolveFindSkillConfiguredAgentId(findSkillConfiguredAgentId, configuredAgents);

  function categoryDisplayName(category: SkillCategory): string {
    if (language !== "zh" || !category.system) return category.name;
    return ({ explore: "探索", coding: "编程", writing: "写作", productivity: "效率", life: "生活" } as Record<string, string>)[category.id] ?? category.name;
  }

  useEffect(() => {
    const nextConfiguredAgentId = resolveFindSkillConfiguredAgentId(findSkillConfiguredAgentId, configuredAgents);
    if (nextConfiguredAgentId === findSkillConfiguredAgentId) return;
    setFindSkillConfiguredAgentId(nextConfiguredAgentId);
    setFindSkillRuntimeConversation(undefined);
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
    const configuredAgent = configuredAgents.find((candidate) => candidate.id === configuredAgentId);
    if (!configuredAgent) return undefined;
    try {
      const request = {
        requestId: `find-skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        prompt: buildFindSkillAgentPrompt(text, candidates, language, toolResult),
        configuredAgentId,
        runtimeId: configuredAgent.runtimeAgentId,
        executionMode: "oneshot" as const,
        continuationPolicy: findSkillRuntimeConversation ? ("resume-preferred" as const) : ("fresh" as const),
        runtimeConfig: { model: configuredAgent.modelId },
        ...(findSkillRuntimeConversation ? { runtimeConversation: findSkillRuntimeConversation } : {}),
      };
      const response = await window.multiAgentChat.askWorkflowAgent(request);
      setFindSkillRuntimeConversation(response.runtimeConversation);
      return response.content.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  function selectFindSkillConfiguredAgent(configuredAgentId: string): void {
    const nextConfiguredAgentId = resolveFindSkillConfiguredAgentId(configuredAgentId, configuredAgents);
    if (nextConfiguredAgentId === findSkillConfiguredAgentId) return;
    setFindSkillConfiguredAgentId(nextConfiguredAgentId);
    setFindSkillRuntimeConversation(undefined);
  }

  function updateFindSkillCandidates(candidates: OnlineSkillResult[]): void {
    setOnlineResults(candidates);
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
          candidates = await searchOnlineSkills(toolCall.query);
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

  function toggleInstallTarget(target: SkillInstallTarget): void {
    setSelectedInstallTargets((current) => (current.includes(target) ? current.filter((item) => item !== target) : [...current, target]));
  }

  async function applyInstallSelection(action: "install" | "uninstall"): Promise<void> {
    if (!selectedSkill || selectedSkill.kind === "online" || !onInstallSkill) return;
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
          const result = await onInstallSkill(selectedSkill.id, target, selectedSkill.sourceType);
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

  async function assignSelectedCategory(categoryId: string): Promise<void> {
    if (!selectedSkill || selectedSkill.kind === "online" || !onAssignCategory) return;
    setCategoryActionRunning(true);
    setInstallStatus("");
    setInstallStatusTone(undefined);
    try {
      await onAssignCategory({ sourceType: selectedSkill.sourceType, skillId: selectedSkill.id, categoryId });
      setInstallStatus(language === "zh" ? "分类已更新。" : "Category updated.");
      setInstallStatusTone("success");
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : String(error));
      setInstallStatusTone("error");
    } finally {
      setCategoryActionRunning(false);
    }
  }

  async function createAndAssignCategory(): Promise<void> {
    const name = newCategoryName.trim();
    if (!name || !onCreateCategory || !selectedSkill || selectedSkill.kind === "online") return;
    setCategoryActionRunning(true);
    setInstallStatus("");
    setInstallStatusTone(undefined);
    try {
      const category = await onCreateCategory(name);
      await onAssignCategory?.({ sourceType: selectedSkill.sourceType, skillId: selectedSkill.id, categoryId: category.id });
      setCategoryFilterId(category.id);
      setNewCategoryName("");
      setCreatingCategory(false);
      setInstallStatus(language === "zh" ? `已新建并归类到“${category.name}”。` : `Created and assigned to “${category.name}”.`);
      setInstallStatusTone("success");
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : String(error));
      setInstallStatusTone("error");
    } finally {
      setCategoryActionRunning(false);
    }
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
        </div>
      </header>

      <div className={`skills-browser ${findSkillChatOpen ? "has-find-chat" : ""}`}>
        <aside className="skill-list-panel">
          <div className="skill-list-head">
            <div>
              <h3>{officialTitle}</h3>
              <p>{localDescription}</p>
            </div>
            <span>{filteredOfficialSkillItems.length + filteredUserSkillItems.length}</span>
          </div>
          <label className="skill-library-search">
            <Search size={13} />
            <input
              type="search"
              value={skillSearch}
              placeholder={searchSkillsPlaceholder}
              aria-label={searchSkillsPlaceholder}
              onChange={(event) => {
                setSkillSearch(event.currentTarget.value);
                setSelectedOnlineSkillKey(undefined);
              }}
            />
            {skillSearch ? (
              <button type="button" onClick={() => setSkillSearch("")} aria-label={language === "zh" ? "清除搜索" : "Clear search"}>
                <X size={12} />
              </button>
            ) : null}
          </label>
          <select
            className="skill-category-filter"
            value={categoryFilterId}
            aria-label={language === "zh" ? "按分类筛选" : "Filter by category"}
            onChange={(event) => {
              setCategoryFilterId(event.currentTarget.value);
              setSelectedOnlineSkillKey(undefined);
            }}
          >
            <option value="all">{allCategories}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{categoryDisplayName(category)}</option>
            ))}
          </select>
          <div className="skill-list-scroll" aria-label="Skill list">
            {officialSkillItems.length === 0 && userSkillItems.length === 0 ? (
              <div className="empty-state config-empty">{noSkills}</div>
            ) : (
              <div className="skill-list-group">
                {filteredOfficialSkillItems.length > 0 ? <span>{officialTitle} · {filteredOfficialSkillItems.length}</span> : null}
                {filteredOfficialSkillItems.map((skill) => (
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
                {filteredUserSkillItems.length > 0 ? <span>{userTitle} · {filteredUserSkillItems.length}</span> : null}
                {filteredUserSkillItems.map((skill) => (
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
                {filteredOfficialSkillItems.length === 0 && filteredUserSkillItems.length === 0 ? (
                  <div className="empty-state config-empty">
                    {language === "zh" ? "没有匹配的技能" : "No matching skills"}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </aside>

        <section className="skill-detail-panel">
          {selectedSkill ? (
            <>
              <header className="skill-detail-head">
                <div>
                  <span>{selectedSkill.sourceLabel ?? (selectedSkill.kind === "official" ? officialTitle : selectedSkill.kind === "user" ? userTitle : selectedSkill.sourceLabel)}</span>
                  <h3>{skillDisplayName(selectedSkill)}</h3>
                  <p>{skillDisplayDescription(selectedSkill)}</p>
                </div>
              </header>
              <div className="skill-tags" aria-label="Skill tags">
                {selectedSkill.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="skill-detail-body-head">
                <div>
                  {selectedSkill.kind !== "online" && onAssignCategory ? (
                    <div className="skill-category-editor">
                      <select
                        value={selectedSkill.categoryId ?? ""}
                        aria-label={language === "zh" ? "技能分类" : "Skill category"}
                        disabled={categoryActionRunning}
                        onChange={(event) => void assignSelectedCategory(event.currentTarget.value)}
                      >
                        <option value="" disabled>{uncategorized}</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>{categoryDisplayName(category)}</option>
                        ))}
                      </select>
                      {onCreateCategory ? (
                        <button
                          className="icon-btn compact secondary"
                          type="button"
                          aria-label={language === "zh" ? "新建分类" : "Create category"}
                          title={language === "zh" ? "新建分类" : "Create category"}
                          onClick={() => setCreatingCategory((current) => !current)}
                        >
                          <Plus size={13} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedSkill.kind !== "online" && selectedSkillSourcePath && onRevealSkillInFinder ? (
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
                  <button className="control-btn compact secondary" type="button" onClick={translateSelectedSkill}>
                    <span>{showTranslatedSkill ? showOriginal : translateToZh}</span>
                  </button>
                  {selectedSkillSourceUrl ? (
                    <a className="control-btn compact secondary skill-source-link" href={selectedSkillSourceUrl} target="_blank" rel="noreferrer">
                      {sourceUrlLabel(selectedSkillSourceUrl)}
                    </a>
                  ) : null}
                  {selectedSkill.kind !== "online" && onInstallSkill ? (
                    <button className="control-btn compact skill-install-trigger" type="button" onClick={() => setInstallDialogOpen(true)} disabled={Boolean(installingTarget)}>
                      <Save size={13} />
                      <span>{localInstall}</span>
                    </button>
                  ) : null}
                  {selectedSkill.kind === "user" && onDeleteUserSkill ? (
                    <button
                      className="control-btn compact danger"
                      type="button"
                      onClick={() => {
                        void onDeleteUserSkill(selectedSkill.id)
                          .then(() => {
                            setSelectedSkillKey(undefined);
                            setInstallStatus(language === "zh" ? "已删除我的技能。" : "User skill deleted.");
                            setInstallStatusTone("success");
                          })
                          .catch((error) => {
                            setInstallStatus(error instanceof Error ? error.message : String(error));
                            setInstallStatusTone("error");
                          });
                      }}
                    >
                      <Trash2 size={13} />
                      <span>{language === "zh" ? "删除" : "Delete"}</span>
                    </button>
                  ) : null}
                </div>
                {creatingCategory && selectedSkill.kind !== "online" ? (
                  <form
                    className="skill-category-create"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createAndAssignCategory();
                    }}
                  >
                    <input
                      autoFocus
                      value={newCategoryName}
                      maxLength={40}
                      placeholder={language === "zh" ? "新分类名称" : "New category name"}
                      aria-label={language === "zh" ? "新分类名称" : "New category name"}
                      onChange={(event) => setNewCategoryName(event.currentTarget.value)}
                    />
                    <button className="control-btn compact" type="submit" disabled={!newCategoryName.trim() || categoryActionRunning}>
                      <Save size={13} />
                      <span>{language === "zh" ? "创建" : "Create"}</span>
                    </button>
                    <button className="icon-btn compact secondary" type="button" onClick={() => setCreatingCategory(false)} aria-label={language === "zh" ? "取消" : "Cancel"}>
                      <X size={13} />
                    </button>
                  </form>
                ) : null}
              </div>
              <div className={`skill-install-feedback ${installStatusTone ?? ""}`} role="status" aria-live="polite">
                {installStatus || (language === "zh" ? "安装结果会显示在这里。" : "Install results will appear here.")}
              </div>
              {translationStatus ? <div className="skill-translation-note">{translationStatus}</div> : null}
              <MarkdownDocument className="skill-detail-body" text={showTranslatedSkill && selectedSkill.translationZh ? selectedSkill.translationZh : selectedSkill.prompt} />
              {installDialogOpen && selectedSkill.kind !== "online" ? (
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
                    <div className={`skill-install-feedback ${installStatusTone ?? ""}`} role="status" aria-live="polite">
                      {installStatus || (language === "zh" ? "选择目标后点击安装/更新，结果会显示在这里。" : "Choose targets, then install/update. The result will appear here.")}
                    </div>
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
                        <span>{installAction === "uninstall" ? searchingText : removeLinks}</span>
                      </button>
                    </footer>
                  </section>
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty-state config-empty">{noSkills}</div>
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
                      <option value="">{noConfiguredAgents}</option>
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
    </section>
  );
}
