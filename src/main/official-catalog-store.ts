import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import type { SkillTemplate, WorkflowGraph } from "../shared/types";
import type { BundledWorkflowDefinition } from "./workflows/bundled-workflows";

const require = createRequire(import.meta.url);

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

function row(value: unknown): Row {
  return value as Row;
}

export class OfficialCatalogStore {
  private db: DatabaseSync | undefined;

  constructor(private readonly dbPath: string) {}

  async rebuild(workflows: BundledWorkflowDefinition[], skills: SkillTemplate[]): Promise<void> {
    const db = await this.open();
    db.exec("begin immediate");
    try {
      db.exec(`
        delete from workflow_template_edges;
        delete from workflow_template_nodes;
        delete from workflow_templates;
        delete from skill_templates;
        delete from catalog_metadata;
      `);
      const now = Date.now();
      db.prepare("insert into catalog_metadata (key, value) values (?, ?)").run("rebuilt_at", String(now));
      for (const workflow of workflows) this.insertWorkflow(db, workflow);
      for (const skill of skills) this.insertSkill(db, skill);
      db.exec("commit");
    } catch (error) {
      db.exec("rollback");
      throw error;
    }
  }

  async listWorkflows(): Promise<BundledWorkflowDefinition[]> {
    const db = await this.open();
    return db
      .prepare("select * from workflow_templates order by sequence")
      .all()
      .map(row)
      .map((template) => ({
        workflowId: String(template.id),
        title: String(template.title),
        objective: String(template.objective),
        graph: this.loadGraph(db, String(template.id), String(template.graph_title), String(template.graph_objective)),
      }));
  }

  async listSkills(): Promise<SkillTemplate[]> {
    const db = await this.open();
    return db
      .prepare("select * from skill_templates order by sequence")
      .all()
      .map(row)
      .map((item) => ({
        id: String(item.id),
        sourceType: "official" as const,
        name: String(item.name),
        description: String(item.description),
        prompt: String(item.prompt),
        tags: JSON.parse(String(item.tags_json)) as string[],
        ...(item.source_label ? { sourceLabel: String(item.source_label) } : {}),
        ...(item.source_path ? { sourcePath: String(item.source_path) } : {}),
        ...(item.source_url ? { sourceUrl: String(item.source_url) } : {}),
        ...(item.translation_zh ? { translationZh: String(item.translation_zh) } : {}),
        ...(item.category_id ? { categoryId: String(item.category_id) } : {}),
      }));
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
    db.exec(`
      create table if not exists catalog_metadata (
        key text primary key,
        value text not null
      );
      create table if not exists workflow_templates (
        id text primary key,
        title text not null,
        objective text not null,
        graph_title text not null,
        graph_objective text not null,
        sequence integer not null
      );
      create table if not exists workflow_template_nodes (
        template_id text not null references workflow_templates(id) on delete cascade,
        node_id text not null,
        kind text not null,
        title text not null,
        prompt text not null,
        configured_agent_id text,
        model_id text,
        position_x real,
        position_y real,
        sequence integer not null,
        primary key (template_id, node_id)
      );
      create table if not exists workflow_template_edges (
        template_id text not null references workflow_templates(id) on delete cascade,
        edge_id text not null,
        from_node_id text not null,
        to_node_id text not null,
        sequence integer not null,
        primary key (template_id, edge_id)
      );
      create table if not exists skill_templates (
        id text primary key,
        name text not null,
        description text not null,
        prompt text not null,
        tags_json text not null,
        source_label text,
        source_path text,
        source_url text,
        translation_zh text,
        category_id text,
        sequence integer not null
      );
    `);
    const skillColumns = db.prepare("pragma table_info(skill_templates)").all().map(row);
    if (!skillColumns.some((column) => column.name === "category_id")) {
      db.exec("alter table skill_templates add column category_id text");
    }
    this.db = db;
    return db;
  }

  private insertWorkflow(db: DatabaseSync, workflow: BundledWorkflowDefinition): void {
    const sequence = Number(db.prepare("select count(*) as count from workflow_templates").all().map(row)[0]?.count ?? 0);
    db.prepare(
      `insert into workflow_templates (id, title, objective, graph_title, graph_objective, sequence)
       values (?, ?, ?, ?, ?, ?)`,
    ).run(workflow.workflowId, workflow.title, workflow.objective, workflow.graph.title, workflow.graph.objective, sequence);
    workflow.graph.nodes.forEach((node, index) => {
      db.prepare(
        `insert into workflow_template_nodes
         (template_id, node_id, kind, title, prompt, configured_agent_id, model_id, position_x, position_y, sequence)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        workflow.workflowId,
        node.id,
        node.kind,
        node.title,
        node.prompt,
        node.configuredAgentId ?? null,
        node.modelId ?? null,
        node.position?.x ?? null,
        node.position?.y ?? null,
        index,
      );
    });
    workflow.graph.edges.forEach((edge, index) => {
      db.prepare(
        `insert into workflow_template_edges (template_id, edge_id, from_node_id, to_node_id, sequence)
         values (?, ?, ?, ?, ?)`,
      ).run(workflow.workflowId, edge.id, edge.fromNodeId, edge.toNodeId, index);
    });
  }

  private insertSkill(db: DatabaseSync, skill: SkillTemplate): void {
    const sequence = Number(db.prepare("select count(*) as count from skill_templates").all().map(row)[0]?.count ?? 0);
    db.prepare(
      `insert into skill_templates
       (id, name, description, prompt, tags_json, source_label, source_path, source_url, translation_zh, category_id, sequence)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      skill.id,
      skill.name,
      skill.description,
      skill.prompt,
      JSON.stringify(skill.tags),
      skill.sourceLabel ?? null,
      skill.sourcePath ?? null,
      skill.sourceUrl ?? null,
      skill.translationZh ?? null,
      skill.categoryId ?? null,
      sequence,
    );
  }

  private loadGraph(db: DatabaseSync, templateId: string, title: string, objective: string): WorkflowGraph {
    const nodes = db
      .prepare("select * from workflow_template_nodes where template_id = ? order by sequence")
      .all(templateId)
      .map(row)
      .map((item) => ({
        id: String(item.node_id),
        kind: String(item.kind) as "start" | "agent" | "end",
        title: String(item.title),
        prompt: String(item.prompt),
        ...(item.configured_agent_id ? { configuredAgentId: String(item.configured_agent_id) } : {}),
        ...(item.model_id ? { modelId: String(item.model_id) } : {}),
        ...(typeof item.position_x === "number" && typeof item.position_y === "number"
          ? { position: { x: item.position_x, y: item.position_y } }
          : {}),
      }));
    const edges = db
      .prepare("select * from workflow_template_edges where template_id = ? order by sequence")
      .all(templateId)
      .map(row)
      .map((item) => ({
        id: String(item.edge_id),
        fromNodeId: String(item.from_node_id),
        toNodeId: String(item.to_node_id),
      }));
    return { title, objective, nodes, edges };
  }
}
