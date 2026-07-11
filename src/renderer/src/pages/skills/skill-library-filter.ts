import type { SkillTemplate } from "../../../../shared/types";

export function filterSkills<T extends SkillTemplate>(
  skills: T[],
  filter: { query: string; categoryId: string },
): T[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return skills.filter((skill) => {
    if (filter.categoryId !== "all" && skill.categoryId !== filter.categoryId) return false;
    if (!query) return true;
    const searchable = [skill.id, skill.name, skill.description, ...skill.tags].join("\n").toLocaleLowerCase();
    return searchable.includes(query);
  });
}
