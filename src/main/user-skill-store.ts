import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { SkillTemplate } from "../shared/types";

const require = createRequire(import.meta.url);

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync;
}

type Row = Record<string, unknown>;

export class UserSkillStore {
  private db: DatabaseSync | undefined;

  constructor(private readonly dbPath: string) {}

  async list(): Promise<SkillTemplate[]> {
    const db = await this.open();
    return db
      .prepare("select * from user_skills order by name, id")
      .all()
      .map((value) => value as Row)
      .map((item) => ({
        id: String(item.id),
        sourceType: "user" as const,
        name: String(item.name),
        description: String(item.description),
        prompt: String(item.prompt),
        tags: JSON.parse(String(item.tags_json)) as string[],
        ...(item.source_label ? { sourceLabel: String(item.source_label) } : {}),
        ...(item.source_path ? { sourcePath: String(item.source_path) } : {}),
        ...(item.source_url ? { sourceUrl: String(item.source_url) } : {}),
      }));
  }

  async upsert(template: SkillTemplate): Promise<void> {
    const db = await this.open();
    db.prepare(
      `insert into user_skills
       (id, name, description, prompt, tags_json, source_label, source_path, source_url, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set
         name = excluded.name,
         description = excluded.description,
         prompt = excluded.prompt,
         tags_json = excluded.tags_json,
         source_label = excluded.source_label,
         source_path = excluded.source_path,
         source_url = excluded.source_url,
         updated_at = excluded.updated_at`,
    ).run(
      template.id,
      template.name,
      template.description,
      template.prompt,
      JSON.stringify(template.tags),
      template.sourceLabel ?? null,
      template.sourcePath ?? null,
      template.sourceUrl ?? null,
      Date.now(),
    );
  }

  async delete(templateId: string): Promise<boolean> {
    const db = await this.open();
    const result = db.prepare("delete from user_skills where id = ?").run(templateId) as { changes?: number };
    return Number(result.changes ?? 0) > 0;
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
    db.exec(`
      create table if not exists user_skills (
        id text primary key,
        name text not null,
        description text not null,
        prompt text not null,
        tags_json text not null,
        source_label text,
        source_path text,
        source_url text,
        updated_at integer not null
      )
    `);
    this.db = db;
    return db;
  }
}
