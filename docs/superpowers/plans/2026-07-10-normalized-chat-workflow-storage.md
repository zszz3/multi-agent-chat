# Normalized Chat and Workflow Storage Plan

1. Add SQLite-store tests for schema creation, relational row counts, exact V4
   round trips, replacement saves, foreign keys, and legacy V4 migration.
2. Introduce typed persisted-state contracts outside AgentHub so the storage
   adapter and AgentHub share one boundary.
3. Replace `app_state` writes with transactional writes to chat, runtime-session,
   workflow, graph, node, edge, run, event, and artifact tables.
4. Reconstruct the existing V4 state from normalized rows on load; keep task and
   other excluded domains in `app_aux_state` for now.
5. Import a legacy V4 `app_state` once, retain it as `legacy_app_state`, and make
   normalized tables authoritative.
6. Run focused store tests, AgentHub persistence tests, full Vitest, and
   TypeScript type checking. Inspect a generated database to verify there is no
   live `app_state` table and that graph topology is queryable by SQL.

