import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const APP_STATE_ID = 1;
const require = createRequire(import.meta.url);

interface DatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): StatementSync;
  close(): void;
}

interface StatementSync {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => DatabaseSync;
}

interface AppStateRow {
  payload: string;
}

export class SqliteAppStore {
  private db: DatabaseSync | undefined;

  constructor(private readonly dbPath: string) {}

  async load(): Promise<unknown | undefined> {
    const db = await this.open();
    const row = db.prepare("select payload from app_state where id = ?").get(APP_STATE_ID) as AppStateRow | undefined;
    if (!row?.payload) return undefined;
    return JSON.parse(row.payload) as unknown;
  }

  async save(payload: unknown): Promise<void> {
    const db = await this.open();
    db.prepare(
      `insert into app_state (id, payload, updated_at)
       values (?, ?, ?)
       on conflict(id) do update set payload = excluded.payload, updated_at = excluded.updated_at`,
    ).run(APP_STATE_ID, `${JSON.stringify(payload, null, 2)}\n`, Date.now());
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
    db.exec("pragma foreign_keys = ON");
    db.exec(
      `create table if not exists schema_migrations (
        version integer primary key,
        applied_at integer not null
      )`,
    );
    db.exec(
      `create table if not exists app_state (
        id integer primary key check (id = 1),
        payload text not null,
        updated_at integer not null
      )`,
    );
    db.prepare("insert or ignore into schema_migrations (version, applied_at) values (?, ?)").run(1, Date.now());
    this.db = db;
    return db;
  }
}
