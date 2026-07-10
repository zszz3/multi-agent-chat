import { describe, expect, test } from "vitest";
import { loadBundledSkillTemplates } from "./bundled-skill-library";

describe("bundled skill library", () => {
  test("includes the curated frontend, handoff, and skill authoring presets", () => {
    const templates = loadBundledSkillTemplates();

    expect(templates.map((template) => template.id)).toEqual(
      expect.arrayContaining(["frontend-design", "handoff", "skill-creator"]),
    );
    for (const id of ["frontend-design", "handoff", "skill-creator"]) {
      const template = templates.find((item) => item.id === id);
      expect(template).toMatchObject({
        id,
        sourceType: "official",
        sourceLabel: expect.any(String),
        sourceUrl: expect.stringMatching(/^https:\/\/github\.com\//),
        translationZh: expect.stringContaining("---"),
        categoryId: expect.any(String),
      });
      expect(template?.prompt).toContain(`name: ${id}`);
    }
  });
});
