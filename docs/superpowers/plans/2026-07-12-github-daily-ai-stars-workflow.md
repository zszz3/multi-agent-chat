# GitHub Daily AI Stars Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and run an editable two-Agent Workflow that reports the 10 most-starred AI repositories created during the previous 24 hours.

**Architecture:** Use the application's existing local MCP bridge to persist a validated Workflow graph. Execute it through the existing Workflow page so the normal Agent runtime, shared context, judging, output document registration, and run persistence paths are exercised without adding product code.

**Tech Stack:** Electron, TypeScript, local MCP HTTP bridge, existing Workflow runtime, GitHub API or `gh` CLI.

---

### Task 1: Create the Workflow graph

**Files:**
- Read: `src/main/bridges/mcp-bridge.ts`
- Read: `src/shared/types.ts`
- Runtime state: `~/Library/Application Support/Multi Agent Chat/`

- [ ] **Step 1: Start the development application**

Run:

```bash
npm run dev
```

Expected: Electron starts, the renderer is available on a local Vite URL, and `mcp-bridge.json` is created in the application user-data directory.

- [ ] **Step 2: Confirm at least one runnable Agent exists**

Call `POST /mcp/agents/list` using the host, port, and bearer token from `mcp-bridge.json`.

Expected: the response has `ok: true` and includes at least one configured Codex, Claude, or API Agent. Use the current default Agent rather than hard-coding a provider model ID.

- [ ] **Step 3: Create the Workflow through the bridge**

Call `POST /mcp/workflow/create` with this graph:

```json
{
  "title": "GitHub 每日 AI 新星榜",
  "objective": "每天发现过去 24 小时内新创建的 AI 相关 GitHub 项目，按当前 Star 数排序，生成前 10 名中文日报。",
  "graph": {
    "title": "GitHub 每日 AI 新星榜",
    "objective": "每天发现过去 24 小时内新创建的 AI 相关 GitHub 项目，按当前 Star 数排序，生成前 10 名中文日报。",
    "nodes": [
      {
        "id": "start",
        "kind": "start",
        "title": "开始",
        "prompt": ""
      },
      {
        "id": "collect",
        "kind": "agent",
        "title": "抓取 GitHub 候选项目",
        "prompt": "计算执行时刻往前 24 小时的 UTC 时间窗口。优先使用已认证的 gh api 或 GitHub Search API，未认证时使用公开 API。围绕 AI、LLM、Agent、RAG、machine learning、deep learning、inference、evaluation、model tooling 等主题执行多组 repository 搜索，只保留在窗口内创建且非 fork、非 archived 的仓库。按 URL 去重，收集足够候选，并核对仓库名称、GitHub URL、描述、topics、主语言、created_at、updated_at、stargazers_count、fork/archive 状态和可获得的 README 证据。把结构化候选列表、准确查询窗口、查询方式、失败或限流信息写入 Workflow 共享上下文。不得把 GitHub token 写入上下文或产物。不要把当前总 Star 说成过去 24 小时新增 Star。"
      },
      {
        "id": "report",
        "kind": "agent",
        "title": "复核并生成中文日报",
        "prompt": "读取上游候选项目及 GitHub 来源链接。根据仓库描述、topics 和 README 证据逐项判断是否实质属于 AI、LLM、Agent、RAG、机器学习、深度学习、推理、评测或模型工具领域；剔除关键词堆砌、空壳、重复和明显无关项目。按当前 stargazers_count 降序排列，最多选择 10 个，不足 10 个时如实输出。必须在运行时 Workflow storage plan 的输出目录写入一份中文 Markdown 日报，文件名使用 github-ai-daily-YYYY-MM-DD.md。报告包含统计窗口、抓取时间、查询与排序口径、排名表（项目名、GitHub 链接、Star、主语言、创建时间、中文简介）、每个项目的 AI 相关性和关注理由，以及 API 限流、数据不完整或数量不足等说明。最终回复只总结结果并给出产物路径，不要在聊天中重复整份日报。"
      },
      {
        "id": "end",
        "kind": "end",
        "title": "完成",
        "prompt": ""
      }
    ],
    "edges": [
      { "id": "start->collect", "fromNodeId": "start", "toNodeId": "collect" },
      { "id": "collect->report", "fromNodeId": "collect", "toNodeId": "report" },
      { "id": "report->end", "fromNodeId": "report", "toNodeId": "end" }
    ]
  }
}
```

Expected: `ok: true`, a new `wf_...` ID, revision `1`, and graph validation with `valid: true`.

- [ ] **Step 4: Read the Workflow back and verify persistence**

Call `POST /mcp/workflow/get` with the returned Workflow ID.

Expected: the title is `GitHub 每日 AI 新星榜`, `graphReady` is `true`, and the graph contains exactly two `agent` nodes.

### Task 2: Run and verify the Workflow

**Files:**
- Runtime output: `.multi-agent-chat/workflows/<workflow-id>/outputs/github-ai-daily-YYYY-MM-DD.md`
- Runtime context: `.multi-agent-chat/workflows/<workflow-id>/memory.md`

- [ ] **Step 1: Start one run from the Workflow page**

Open the created Workflow, keep the current default Agent assignment, and select the run action once.

Expected: one Workflow run is created; `collect` runs before `report`; no duplicate run is started.

- [ ] **Step 2: Wait for a terminal run state**

Monitor the Workflow page and persisted run state until it becomes `completed`, `failed`, or `stopped`.

Expected: nodes do not remain in `queued` or `running` after the run reaches a terminal state.

- [ ] **Step 3: Verify the generated report**

Run:

```bash
find .multi-agent-chat/workflows -path '*/outputs/github-ai-daily-*.md' -type f -print
```

Expected: exactly one new daily report for this run. It is Chinese Markdown, contains GitHub source links, has no more than 10 ranked projects, is ordered by current stars, states the 24-hour creation window, and does not claim to rank by daily star gain.

- [ ] **Step 4: Verify source freshness and failure disclosure**

Check each listed repository's `created_at` against the recorded cutoff and confirm the report includes any rate-limit or missing-data warning encountered during execution.

Expected: every listed project is within the stated window, or the report explicitly identifies and excludes invalid candidates. An empty result still produces a valid report.

- [ ] **Step 5: Report the run result**

Return the Workflow ID, terminal status, report path, number of qualifying repositories, and any GitHub access limitation. Do not create the daily schedule in this task.
