import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { AssignSkillCategoryRequest, ResourceSourceType, SkillCategory, SkillTemplate } from "../shared/types";

const require = createRequire(import.meta.url);
const SYSTEM_CATEGORIES = [
  { id: "explore", name: "Explore" },
  { id: "coding", name: "Coding" },
  { id: "writing", name: "Writing" },
  { id: "productivity", name: "Productivity" },
  { id: "life", name: "Life" },
] as const;

interface StatementSync {
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): unknown;
}

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync;
}

type Row = Record<string, unknown>;

export class SkillCategoryStore {
  private db: DatabaseSync | undefined;

  constructor(private readonly dbPath: string) {}

  async list(): Promise<SkillCategory[]> {
    const db = await this.open();
    return db.prepare("select * from skill_categories order by sequence, name collate nocase").all().map((value) => {
      const item = value as Row;
      return {
        id: String(item.id),
        name: String(item.name),
        system: Number(item.is_system) === 1,
        sequence: Number(item.sequence),
      };
    });
  }

  async create(inputName: string): Promise<SkillCategory> {
    const name = inputName.trim();
    if (!name) throw new Error("Category name is required.");
    const db = await this.open();
    const duplicate = db.prepare("select id from skill_categories where name = ? collate nocase").all(name)[0];
    if (duplicate) throw new Error(`Category ${name} already exists.`);
    const sequence = Number((db.prepare("select coalesce(max(sequence), -1) + 1 as value from skill_categories").all()[0] as Row)?.value ?? 0);
    const category: SkillCategory = { id: `category-${randomUUID()}`, name, system: false, sequence };
    db.prepare("insert into skill_categories (id, name, is_system, sequence, created_at, updated_at) values (?, ?, 0, ?, ?, ?)")
      .run(category.id, category.name, category.sequence, Date.now(), Date.now());
    return category;
  }

  async assign(request: AssignSkillCategoryRequest): Promise<void> {
    const db = await this.open();
    const categoryExists = db.prepare("select id from skill_categories where id = ?").all(request.categoryId)[0];
    if (!categoryExists) throw new Error(`Skill category ${request.categoryId} was not found.`);
    db.prepare(
      `insert into skill_category_assignments (source_type, skill_id, category_id, updated_at)
       values (?, ?, ?, ?)
       on conflict(source_type, skill_id) do update set category_id = excluded.category_id, updated_at = excluded.updated_at`,
    ).run(request.sourceType, request.skillId, request.categoryId, Date.now());
  }

  async applyAssignments(skills: SkillTemplate[], sourceType: ResourceSourceType): Promise<SkillTemplate[]> {
    const db = await this.open();
    const assignments = new Map(
      db.prepare("select skill_id, category_id from skill_category_assignments where source_type = ?")
        .all(sourceType)
        .map((value) => value as Row)
        .map((item) => [String(item.skill_id), String(item.category_id)]),
    );
    return skills.map((skill) => {
      const categoryId = assignments.get(skill.id);
      return { ...skill, ...(categoryId ? { categoryId } : {}) };
    });
  }

  async deleteSkillAssignment(sourceType: ResourceSourceType, skillId: string): Promise<void> {
    const db = await this.open();
    db.prepare("delete from skill_category_assignments where source_type = ? and skill_id = ?").run(sourceType, skillId);
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  private async open(): Promise<DatabaseSync> {
    if (this.db) return this.db;
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    const { DatabaseSync } = require("node:sqlite") as SqliteModule;
    const db = new DatabaseSync(this.dbPath);
    db.exec("pragma journal_mode = WAL");
    db.exec("pragma busy_timeout = 5000");
    db.exec("pragma foreign_keys = ON");
    db.exec(`
      create table if not exists skill_categories (
        id text primary key,
        name text not null collate nocase unique,
        is_system integer not null default 0,
        sequence integer not null,
        created_at integer not null,
        updated_at integer not null
      );
      create table if not exists skill_category_assignments (
        source_type text not null check (source_type in ('official', 'user')),
        skill_id text not null,
        category_id text not null references skill_categories(id) on delete cascade,
        updated_at integer not null,
        primary key (source_type, skill_id)
      );
    `);
    const insert = db.prepare(
      "insert or ignore into skill_categories (id, name, is_system, sequence, created_at, updated_at) values (?, ?, 1, ?, ?, ?)",
    );
    SYSTEM_CATEGORIES.forEach((category, sequence) => insert.run(category.id, category.name, sequence, Date.now(), Date.now()));
    this.db = db;
    return db;
  }
}
