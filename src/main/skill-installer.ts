import { existsSync } from "node:fs";
import { cp, lstat, mkdir, readlink, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_TEMPLATES } from "../shared/skill-templates";
import type { InstalledSkillResult, InstallSkillRequest, SkillTemplate, UninstalledSkillResult, UninstallSkillRequest } from "../shared/types";

const TARGET_DIRS: Record<InstallSkillRequest["target"], string[]> = {
  codex: [".codex", "skills"],
  claude: [".claude", "skills"],
  trae: [".trae", "skills"],
};

function assertSafeTemplateId(templateId: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(templateId)) {
    throw new Error(`Invalid skill template id: ${templateId}`);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultBundledSkillRoot(homeDir: string): string {
  return path.join(homeDir, ".multi-agent-chat", "bundled-skills");
}

function targetSkillDir(request: InstallSkillRequest | UninstallSkillRequest, homeDir: string): string {
  const targetParts = TARGET_DIRS[request.target];
  if (!targetParts) throw new Error(`Unknown skill target: ${request.target}`);
  return path.join(homeDir, ...targetParts, request.templateId);
}

function managedSkillDir(templateId: string, bundledRoot: string): string {
  return path.join(bundledRoot, templateId);
}

function bundledSkillSourceDir(template: SkillTemplate): string | undefined {
  if (!template.sourcePath?.startsWith("src/shared/bundled-skills/")) return undefined;
  const relativeDir = path.dirname(template.sourcePath);
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), relativeDir),
    path.resolve(moduleDir, "..", "..", relativeDir),
    path.resolve(moduleDir, "..", "shared", "bundled-skills", template.id),
  ];
  return candidates.find((candidate) => pathExistsSync(candidate));
}

function pathExistsSync(filePath: string): boolean {
  return existsSync(filePath);
}

async function assertOwnedSymlink(linkPath: string, sourceDir: string): Promise<void> {
  const stats = await lstat(linkPath);
  if (!stats.isSymbolicLink()) {
    throw new Error(`${linkPath} already exists and is not a symlink. Refusing to overwrite user content.`);
  }
  const linkTarget = await readlink(linkPath);
  const resolvedTarget = path.resolve(path.dirname(linkPath), linkTarget);
  if (resolvedTarget !== sourceDir) {
    throw new Error(`${linkPath} points to ${resolvedTarget}, not this app's bundled skill. Refusing to modify it.`);
  }
}

export async function installBundledSkill(request: InstallSkillRequest, homeDir: string, bundledRoot = defaultBundledSkillRoot(homeDir)): Promise<InstalledSkillResult> {
  assertSafeTemplateId(request.templateId);
  const template = SKILL_TEMPLATES.find((item) => item.id === request.templateId);
  if (!template) throw new Error(`Unknown bundled skill: ${request.templateId}`);

  const sourceDir = managedSkillDir(template.id, bundledRoot);
  const sourcePath = path.join(sourceDir, "SKILL.md");
  const linkPath = targetSkillDir(request, homeDir);
  const skillPath = path.join(linkPath, "SKILL.md");
  const existed = await pathExists(linkPath);
  await rm(sourceDir, { recursive: true, force: true });
  const bundledSourceDir = bundledSkillSourceDir(template);
  if (bundledSourceDir) {
    await cp(bundledSourceDir, sourceDir, { recursive: true });
  } else {
    await mkdir(sourceDir, { recursive: true });
    await writeFile(sourcePath, `${template.prompt.trim()}\n`, "utf8");
  }
  await mkdir(path.dirname(linkPath), { recursive: true });
  if (existed) {
    await assertOwnedSymlink(linkPath, sourceDir);
    await unlink(linkPath);
  }
  await symlink(sourceDir, linkPath, process.platform === "win32" ? "junction" : "dir");

  return {
    templateId: template.id,
    target: request.target,
    path: skillPath,
    sourcePath,
    existed,
  };
}

export async function uninstallBundledSkill(
  request: UninstallSkillRequest,
  homeDir: string,
  bundledRoot = defaultBundledSkillRoot(homeDir),
): Promise<UninstalledSkillResult> {
  assertSafeTemplateId(request.templateId);
  const sourceDir = managedSkillDir(request.templateId, bundledRoot);
  const linkPath = targetSkillDir(request, homeDir);
  if (!(await pathExists(linkPath))) {
    return {
      templateId: request.templateId,
      target: request.target,
      path: linkPath,
      removed: false,
    };
  }
  await assertOwnedSymlink(linkPath, sourceDir);
  await unlink(linkPath);
  return {
    templateId: request.templateId,
    target: request.target,
    path: linkPath,
    removed: true,
  };
}
