import type { SkillTemplate } from "./types";

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

export interface OnlineSkillResult extends SkillTemplate {
  sourceId: string;
  sourceLabel: string;
  path: string;
  url: string;
  rawUrl: string;
  repositoryUrl?: string;
  installCommand?: string;
  contentLabel?: string;
}

export interface ParsedSkillMarkdown {
  name: string;
  description: string;
  prompt: string;
  tags: string[];
  path: string;
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

export const SKILLS_SH_SOURCE = {
  id: "skills-sh",
  label: "skills.sh Find",
  homepage: "https://www.skills.sh",
  apiBase: "https://skills.sh",
};

export function onlineSkillTreeUrl(source: OnlineSkillSource): string {
  return `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.branch}?recursive=1`;
}

function onlineSkillBlobUrl(source: OnlineSkillSource, path: string): string {
  return `https://github.com/${source.owner}/${source.repo}/blob/${source.branch}/${path}`;
}

function onlineSkillRawUrl(source: OnlineSkillSource, path: string): string {
  return `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${path}`;
}

export function skillsShSearchUrl(query: string, limit = 10): string {
  return `${SKILLS_SH_SOURCE.apiBase}/api/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`;
}

interface SkillsShApiSkill {
  id?: unknown;
  skillId?: unknown;
  name?: unknown;
  installs?: unknown;
  source?: unknown;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(value);
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

function onlineSkillMatches(skill: ParsedSkillMarkdown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [skill.name, skill.description, skill.prompt, skill.path, ...skill.tags].some((value) => value.toLowerCase().includes(normalized));
}

function skillsShWebUrl(id: string): string {
  return `${SKILLS_SH_SOURCE.homepage}/${id.split("/").map(encodeURIComponent).join("/")}`;
}

function skillsShInstallCommand(source: string, name: string): string {
  return `npx skills add ${source}@${name}`;
}

function skillsShPrompt(name: string, source: string, installs: number | undefined, url: string, installCommand: string): string {
  const lines = [
    `# ${name}`,
    "",
    "## Registry profile",
    `- Source: ${SKILLS_SH_SOURCE.label}`,
    `- Package: ${source}@${name}`,
    installs !== undefined ? `- Installs: ${installs}` : undefined,
    `- Directory: ${url}`,
    `- Install: \`${installCommand}\``,
    "",
    "## Review note",
    "skills.sh search returns registry metadata, not the original SKILL.md content. Open the source before installing or copying files locally.",
  ];
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

export function skillFrontmatterValue(markdown: string, key: string): string | undefined {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return undefined;
  const end = normalized.indexOf("\n---", 4);
  if (end < 0) return undefined;
  const frontmatter = normalized.slice(4, end).split("\n");
  const normalizedKey = key.toLowerCase();
  for (const line of frontmatter) {
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match?.[1]?.toLowerCase() === normalizedKey) return stripYamlQuotes(match[2] ?? "");
  }
  return undefined;
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
    prompt: normalized.trim(),
    tags: [name],
    path,
  };
}

export function skillsShResultFromApiSkill(skill: SkillsShApiSkill): OnlineSkillResult | undefined {
  const id = stringValue(skill.id);
  const name = stringValue(skill.name) ?? stringValue(skill.skillId);
  const source = stringValue(skill.source);
  if (!id || !name || !source) return undefined;
  const installs = numberValue(skill.installs);
  const installCommand = skillsShInstallCommand(source, name);
  const url = skillsShWebUrl(id);
  const installSummary = installs !== undefined ? `${formatCompactNumber(installs)} installs` : "Install with npx skills";
  return {
    id: `${SKILLS_SH_SOURCE.id}:${id}`,
    name,
    description: `${installSummary} · ${source}`,
    prompt: skillsShPrompt(name, source, installs, url, installCommand),
    tags: ["skills.sh", source],
    sourceId: SKILLS_SH_SOURCE.id,
    sourceLabel: SKILLS_SH_SOURCE.label,
    sourceUrl: url,
    path: id,
    sourcePath: id,
    url,
    rawUrl: url,
    repositoryUrl: `https://github.com/${source}`,
    installCommand,
    contentLabel: "skills.sh result",
  };
}

function skillsShResultsFromPayload(payload: unknown): OnlineSkillResult[] {
  const record = objectValue(payload);
  if (!Array.isArray(record.skills)) return [];
  return record.skills
    .map((item) => skillsShResultFromApiSkill(objectValue(item) as SkillsShApiSkill))
    .filter((skill): skill is OnlineSkillResult => Boolean(skill));
}

async function fetchSkillsShFindResults(query: string, fetcher: typeof fetch = fetch): Promise<OnlineSkillResult[]> {
  if (!query.trim()) return [];
  const response = await fetcher(skillsShSearchUrl(query), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${SKILLS_SH_SOURCE.label}: ${response.status}`);
  return skillsShResultsFromPayload(await response.json());
}

export async function fetchOnlineSkills(query: string, sources: OnlineSkillSource[] = [], fetcher: typeof fetch = fetch): Promise<OnlineSkillResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const failures: string[] = [];
  let registryResults: OnlineSkillResult[] = [];
  try {
    registryResults = await fetchSkillsShFindResults(query, fetcher);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
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
            const result: OnlineSkillResult = {
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
              contentLabel: "SKILL.md",
            };
            return result;
          }),
        );
        return parsed.filter((skill): skill is OnlineSkillResult => Boolean(skill));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        return [];
      }
    }),
  );
  const merged = [...registryResults, ...results.flat()];
  if (merged.length === 0 && failures.length > 0) throw new Error(failures.join("; "));
  return merged.slice(0, 80);
}
