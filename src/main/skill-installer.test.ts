import { lstat, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { importOnlineSkillToLibrary, installBundledSkill, listImportedSkillTemplates, uninstallBundledSkill } from "./skill-installer";

describe("installBundledSkill", () => {
  test("links a bundled skill into the Codex skills directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-skill-codex-"));
    const bundledRoot = path.join(home, "managed-skills");

    const result = await installBundledSkill({ templateId: "brainstorming", target: "codex" }, home, bundledRoot);

    expect(result).toMatchObject({
      templateId: "brainstorming",
      target: "codex",
      path: path.join(home, ".codex", "skills", "brainstorming", "SKILL.md"),
      sourcePath: path.join(bundledRoot, "brainstorming", "SKILL.md"),
      existed: false,
    });
    expect((await lstat(path.dirname(result.path))).isSymbolicLink()).toBe(true);
    await expect(readFile(result.path, "utf8")).resolves.toContain("name: brainstorming");
    await expect(readFile(path.join(path.dirname(result.path), "references", "visual-companion.md"), "utf8")).resolves.toContain("visual companion");
  });

  test("links companion files and scripts for bundled skills that include references", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-skill-systematic-"));
    const bundledRoot = path.join(home, "managed-skills");

    const result = await installBundledSkill({ templateId: "systematic-debugging", target: "codex" }, home, bundledRoot);
    const skillDir = path.dirname(result.path);

    expect((await lstat(skillDir)).isSymbolicLink()).toBe(true);
    await expect(readFile(result.path, "utf8")).resolves.toContain("name: systematic-debugging");
    await expect(readFile(path.join(skillDir, "root-cause-tracing.md"), "utf8")).resolves.toContain("Trace backward through the call chain");
    await expect(readFile(path.join(skillDir, "find-polluter.sh"), "utf8")).resolves.toContain("find-polluter");
  });

  test("links a bundled skill into the Claude skills directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-skill-claude-"));
    const bundledRoot = path.join(home, "managed-skills");

    const result = await installBundledSkill({ templateId: "resume-optimization", target: "claude" }, home, bundledRoot);

    expect(result.path).toBe(path.join(home, ".claude", "skills", "resume-optimization", "SKILL.md"));
    expect(result.sourcePath).toBe(path.join(bundledRoot, "resume-optimization", "SKILL.md"));
    expect((await lstat(path.dirname(result.path))).isSymbolicLink()).toBe(true);
    await expect(readFile(result.path, "utf8")).resolves.toContain("name: resume-optimization");
  });

  test("links a bundled skill into the Trae skills directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-skill-trae-"));
    const bundledRoot = path.join(home, "managed-skills");

    const result = await installBundledSkill({ templateId: "refactor-review-knowledge", target: "trae" }, home, bundledRoot);

    expect(result.path).toBe(path.join(home, ".trae", "skills", "refactor-review-knowledge", "SKILL.md"));
    expect((await lstat(path.dirname(result.path))).isSymbolicLink()).toBe(true);
    await expect(readFile(result.path, "utf8")).resolves.toContain("name: refactor-review-knowledge");
  });

  test("unlinks a bundled skill without deleting the managed source", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-skill-unlink-"));
    const bundledRoot = path.join(home, "managed-skills");
    const installed = await installBundledSkill({ templateId: "paper-writing", target: "codex" }, home, bundledRoot);

    const result = await uninstallBundledSkill({ templateId: "paper-writing", target: "codex" }, home, bundledRoot);

    expect(result).toEqual({
      templateId: "paper-writing",
      target: "codex",
      path: path.dirname(installed.path),
      removed: true,
    });
    await expect(lstat(path.dirname(installed.path))).rejects.toThrow();
    await expect(readFile(installed.sourcePath, "utf8")).resolves.toContain("name: paper-writing");
  });
});

describe("importOnlineSkillToLibrary", () => {
  test("downloads an online skill into this app's managed skill library", async () => {
    const managedRoot = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-managed-skills-"));

    const result = await importOnlineSkillToLibrary(
      {
        id: "anthropic-skills:skills/frontend-design/SKILL.md",
        name: "frontend-design",
        description: "Guidance for distinctive, intentional visual design.",
        prompt: [
          "---",
          "name: frontend-design",
          "description: Guidance for distinctive, intentional visual design.",
          "---",
          "",
          "# Frontend Design",
        ].join("\n"),
        tags: ["frontend-design"],
        sourceLabel: "Anthropic Skills",
        sourcePath: "skills/frontend-design/SKILL.md",
        sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
      },
      managedRoot,
    );

    expect(result).toMatchObject({
      existed: false,
      path: path.join(managedRoot, "frontend-design", "SKILL.md"),
      template: {
        id: "frontend-design",
        name: "frontend-design",
        sourceLabel: "Anthropic Skills",
        sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
      },
    });
    await expect(readFile(result.path, "utf8")).resolves.toContain("name: frontend-design");
    await expect(readFile(path.join(managedRoot, "frontend-design", "metadata.json"), "utf8")).resolves.toContain("online-import");

    await expect(listImportedSkillTemplates(managedRoot)).resolves.toEqual([
      expect.objectContaining({
        id: "frontend-design",
        name: "frontend-design",
        sourceLabel: "Anthropic Skills",
        sourcePath: path.join(managedRoot, "frontend-design", "SKILL.md"),
      }),
    ]);
  });

  test("lets imported skills use the existing target install flow", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "multi-agent-chat-import-install-"));
    const managedRoot = path.join(home, "managed-skills");
    await importOnlineSkillToLibrary(
      {
        id: "anthropic-skills:skills/frontend-design/SKILL.md",
        name: "frontend-design",
        description: "Guidance for distinctive, intentional visual design.",
        prompt: "---\nname: frontend-design\ndescription: Guidance for distinctive, intentional visual design.\n---\n\n# Frontend Design\n",
        tags: ["frontend-design"],
        sourceLabel: "Anthropic Skills",
        sourcePath: "skills/frontend-design/SKILL.md",
        sourceUrl: "https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md",
      },
      managedRoot,
    );

    const result = await installBundledSkill({ templateId: "frontend-design", target: "codex" }, home, managedRoot);

    expect(result).toMatchObject({
      templateId: "frontend-design",
      path: path.join(home, ".codex", "skills", "frontend-design", "SKILL.md"),
      sourcePath: path.join(managedRoot, "frontend-design", "SKILL.md"),
    });
    expect((await lstat(path.dirname(result.path))).isSymbolicLink()).toBe(true);
    await expect(readFile(result.path, "utf8")).resolves.toContain("name: frontend-design");
  });
});
