import path from "node:path";
import { describe, expect, test } from "vitest";
import { createPlatformPathPolicy } from "./platform-paths";

const windowsPaths = createPlatformPathPolicy({ pathApi: path.win32, caseSensitive: false });
const posixPaths = createPlatformPathPolicy({ pathApi: path.posix, caseSensitive: true });

describe("PlatformPathPolicy", () => {
  test("expands both Windows and POSIX home prefixes", () => {
    expect(windowsPaths.expandHome("~\\Documents\\说明.md", "C:\\Users\\Demo User"))
      .toBe("C:\\Users\\Demo User\\Documents\\说明.md");
    expect(posixPaths.expandHome("~/Documents/说明.md", "/Users/demo"))
      .toBe("/Users/demo/Documents/说明.md");
  });

  test("normalizes Windows drive letters and compares paths case-insensitively", () => {
    expect(windowsPaths.normalize("c:\\Repo\\..\\工作区\\file.md")).toBe("C:\\工作区\\file.md");
    expect(windowsPaths.isWithin("C:\\Repo With Spaces", "c:\\repo with spaces\\子目录\\file.md")).toBe(true);
    expect(windowsPaths.isWithin("C:\\repo", "C:\\repository\\file.md")).toBe(false);
  });

  test("rejects traversal, cross-drive paths, and Windows device paths", () => {
    expect(windowsPaths.isWithin("C:\\repo", "C:\\repo\\..\\outside.md")).toBe(false);
    expect(windowsPaths.isWithin("C:\\repo", "D:\\repo\\file.md")).toBe(false);
    expect(windowsPaths.isWithin("C:\\repo", "\\\\?\\C:\\repo\\file.md")).toBe(false);
    expect(windowsPaths.isWithin("C:\\repo", "\\\\.\\PIPE\\agent")).toBe(false);
  });

  test("supports UNC roots without widening to sibling shares", () => {
    expect(windowsPaths.isWithin(
      "\\\\server\\workspace share",
      "\\\\SERVER\\workspace share\\outputs\\result.md",
    )).toBe(true);
    expect(windowsPaths.isWithin(
      "\\\\server\\workspace share",
      "\\\\server\\other share\\result.md",
    )).toBe(false);
  });

  test("keeps POSIX comparisons case-sensitive", () => {
    expect(posixPaths.isWithin("/workspace/Repo", "/workspace/Repo/output.md")).toBe(true);
    expect(posixPaths.isWithin("/workspace/Repo", "/workspace/repo/output.md")).toBe(false);
  });
});
