import { describe, expect, test } from "vitest";
import type { SkillTemplate } from "../../../../shared/types";
import { filterSkills } from "./skill-library-filter";

function skill(id: string, description: string, tags: string[], categoryId: string, sourceType: "official" | "user" = "official"): SkillTemplate {
  return { id, name: id, description, prompt: "", tags, sourceType, categoryId };
}

const skills = [
  skill("brainstorming", "Explore ideas before implementation", ["planning"], "explore"),
  skill("frontend-design", "Build production interfaces", ["frontend", "ui"], "coding"),
  skill("paper-writing", "Academic writing", ["paper", "writing"], "writing"),
  skill("handoff", "Continue work in another session", ["context", "continuity"], "productivity"),
  skill("personal-finance-planning", "Plan household finances", ["finance", "risk"], "life"),
  skill("custom-research", "Investigate a topic", ["research"], "explore", "user"),
];

describe("skill library filtering", () => {
  test("searches names, descriptions, and tags case-insensitively", () => {
    expect(filterSkills(skills, { query: "PRODUCTION", categoryId: "all" }).map((item) => item.id)).toEqual(["frontend-design"]);
    expect(filterSkills(skills, { query: "risk", categoryId: "all" }).map((item) => item.id)).toEqual(["personal-finance-planning"]);
  });

  test("combines category and search filters across official and user skills", () => {
    expect(filterSkills(skills, { query: "", categoryId: "explore" }).map((item) => item.id)).toEqual(["brainstorming", "custom-research"]);
    expect(filterSkills(skills, { query: "writing", categoryId: "writing" }).map((item) => item.id)).toEqual(["paper-writing"]);
    expect(filterSkills(skills, { query: "frontend", categoryId: "writing" })).toEqual([]);
  });
});
