import { lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createManagedDirectoryLinkService } from "./managed-directory-link";
import { createPlatformPathPolicy } from "./platform-paths";

const linkType = path.sep === "\\" ? "junction" : "dir";
const directoryLinks = createManagedDirectoryLinkService({
  pathPolicy: createPlatformPathPolicy({
    pathApi: path,
    caseSensitive: path.sep !== "\\",
  }),
  linkType,
});

async function fixture(): Promise<{
  sourceDir: string;
  linkPath: string;
  parentDir: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "multi-agent-chat-link-policy-"));
  const sourceDir = path.join(root, "Managed Source With Spaces");
  const parentDir = path.join(root, "User Profile", ".codex", "skills");
  const linkPath = path.join(parentDir, "managed-skill");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(parentDir, { recursive: true });
  await writeFile(path.join(sourceDir, "SKILL.md"), "managed", "utf8");
  return { sourceDir, linkPath, parentDir };
}

describe("ManagedDirectoryLinkService", () => {
  test("creates and safely replaces an owned link with spaces in its paths", async () => {
    const { sourceDir, linkPath } = await fixture();

    await expect(directoryLinks.replaceOwnedLink(linkPath, sourceDir)).resolves.toBe(false);
    await expect(readFile(path.join(linkPath, "SKILL.md"), "utf8")).resolves.toBe("managed");
    await expect(directoryLinks.replaceOwnedLink(linkPath, sourceDir)).resolves.toBe(true);
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  test("never overwrites a real user directory", async () => {
    const { sourceDir, linkPath } = await fixture();
    await mkdir(linkPath);
    await writeFile(path.join(linkPath, "user.txt"), "keep", "utf8");

    await expect(directoryLinks.replaceOwnedLink(linkPath, sourceDir)).rejects.toThrow(
      "Refusing to overwrite user content",
    );
    await expect(readFile(path.join(linkPath, "user.txt"), "utf8")).resolves.toBe("keep");
  });

  test("never replaces or removes a link owned by another target", async () => {
    const { sourceDir, linkPath, parentDir } = await fixture();
    const foreignTarget = path.join(parentDir, "foreign-source");
    await mkdir(foreignTarget);
    await symlink(foreignTarget, linkPath, linkType);

    await expect(directoryLinks.replaceOwnedLink(linkPath, sourceDir)).rejects.toThrow(
      "not this app's managed skill",
    );
    await expect(directoryLinks.removeOwnedLink(linkPath, sourceDir)).rejects.toThrow(
      "not this app's managed skill",
    );
    expect((await lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  test("uninstall removes only an owned link and preserves its source", async () => {
    const { sourceDir, linkPath } = await fixture();
    await directoryLinks.replaceOwnedLink(linkPath, sourceDir);

    await expect(directoryLinks.removeOwnedLink(linkPath, sourceDir)).resolves.toBe(true);
    await expect(lstat(linkPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(sourceDir, "SKILL.md"), "utf8")).resolves.toBe("managed");
    await expect(directoryLinks.removeOwnedLink(linkPath, sourceDir)).resolves.toBe(false);
  });
});
