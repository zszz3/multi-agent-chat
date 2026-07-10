import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createLocalTextFilePreview } from "./local-file-preview";
import { createPlatformPathPolicy } from "./platform-paths";

const pathPolicy = createPlatformPathPolicy({
  pathApi: process.platform === "win32" ? path.win32 : path.posix,
  caseSensitive: process.platform !== "win32",
});

describe("createLocalTextFilePreview", () => {
  test("previews workflow output documents under the current work directory", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "multi-agent-chat-workflow-"));
    const outputDir = path.join(workDir, ".multi-agent-chat/workflows/wf_review/outputs");
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "learning-highlights.md"), "# Learning\n\nReview notes.", "utf8");

    const preview = await createLocalTextFilePreview(
      ".multi-agent-chat/workflows/wf_review/outputs/learning-highlights.md",
      workDir,
      tmpdir(),
      pathPolicy,
    );

    expect(preview.title).toBe("learning-highlights.md");
    expect(preview.content).toContain("Review notes.");
    expect(preview.truncated).toBe(false);
  });

  test("rejects paths outside the current work directory", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "multi-agent-chat-workflow-"));
    const outsideFile = path.join(tmpdir(), `outside-${Date.now()}.md`);
    await writeFile(outsideFile, "# Outside", "utf8");

    await expect(createLocalTextFilePreview(outsideFile, workDir, tmpdir(), pathPolicy)).rejects.toThrow(
      "Only files under the current work directory can be used.",
    );
  });

  test("rejects a symlink or junction that escapes the work directory", async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), "multi-agent-chat-preview-root-"));
    const outsideDir = await mkdtemp(path.join(tmpdir(), "multi-agent-chat-preview-outside-"));
    await writeFile(path.join(outsideDir, "secret.md"), "outside", "utf8");
    const linkPath = path.join(workDir, "linked-output");
    await symlink(outsideDir, linkPath, process.platform === "win32" ? "junction" : "dir");

    await expect(createLocalTextFilePreview(
      path.join("linked-output", "secret.md"),
      workDir,
      tmpdir(),
      pathPolicy,
    )).rejects.toThrow("Only files under the current work directory can be used.");
  });
});
