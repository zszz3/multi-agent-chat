import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, FolderOpen, KeyRound,
  Library, ListChecks, Plus, RefreshCw, Search, Settings2, ShieldCheck, Trash2, Wrench, X,
} from "lucide-react";
import type { ConfiguredAgent } from "../../../../shared/types";
import {
  MCP_CATALOG, mcpServerNameForAgent, type McpAgentDiagnostic, type McpCatalogItem,
  type McpDiagnosticStatus, type McpSetupStatus,
} from "../../../../shared/mcp-config";
import type { Language } from "../../app/language";

interface McpPageProps { language: Language; agents: ConfiguredAgent[]; status: McpSetupStatus | undefined; }
type DetailTab = "overview" | "tools" | "configuration" | "activity";
type StatusFilter = "all" | McpDiagnosticStatus;
interface ActivityItem { id: string; catalogId: string; tone: "success" | "error" | "info"; title: string; detail: string; at: number; }

const TOOL_NAMES: Record<string, string[]> = {
  workflow: ["workflow_validate", "workflow_create", "workflow_context_append"],
  filesystem: ["read_file", "write_file"],
  github: ["Repositories", "Issues", "Pull requests", "Code search", "Actions", "Discussions", "Commits", "Branches", "Releases", "Users", "Organizations", "Notifications"],
  "sequential-thinking": ["sequentialthinking"],
};

function statusLabel(value: McpDiagnosticStatus, zh: boolean): string {
  return ({ healthy: zh ? "正常" : "Healthy", needs_setup: zh ? "需要配置" : "Needs setup", error: zh ? "错误" : "Error", unknown: zh ? "未检测" : "Unknown" })[value];
}

function StatusIcon({ value }: { value: McpDiagnosticStatus }) {
  if (value === "healthy") return <CheckCircle2 size={15} />;
  if (value === "needs_setup" || value === "error") return <AlertTriangle size={15} />;
  return <CircleHelp size={15} />;
}

export function McpPage({ language, agents, status }: McpPageProps) {
  const zh = language === "zh";
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [diagnostics, setDiagnostics] = useState<McpAgentDiagnostic[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tab, setTab] = useState<DetailTab>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryId, setLibraryId] = useState(MCP_CATALOG[0]?.id ?? "");
  const [allowedPath, setAllowedPath] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const agent = agents.find((item) => item.id === agentId) ?? agents[0];

  useEffect(() => {
    if (agent && agent.id !== agentId) setAgentId(agent.id);
  }, [agent, agentId]);

  async function refresh(targetAgentId = agent?.id): Promise<McpAgentDiagnostic[]> {
    if (!targetAgentId) { setDiagnostics([]); return []; }
    const next = await window.multiAgentChat.listAgentMcps(targetAgentId);
    setDiagnostics(next);
    setSelectedId((current) => next.some((item) => item.catalogId === current) ? current : next[0]?.catalogId ?? "");
    return next;
  }

  useEffect(() => { void refresh(); }, [agent?.id]);

  const visible = useMemo(() => diagnostics.filter((item) => {
    const matchesQuery = `${item.name} ${item.description} ${item.catalogId}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (statusFilter === "all" || item.status === statusFilter);
  }), [diagnostics, query, statusFilter]);
  const selected = diagnostics.find((item) => item.catalogId === selectedId);
  const selectedCatalog = MCP_CATALOG.find((item) => item.id === selected?.catalogId);
  const installedIds = new Set(diagnostics.map((item) => item.catalogId));
  const library = MCP_CATALOG.filter((item) => !installedIds.has(item.id) && `${item.name} ${item.description}`.toLowerCase().includes(libraryQuery.toLowerCase()));
  const librarySelected = MCP_CATALOG.find((item) => item.id === libraryId) ?? library[0] ?? MCP_CATALOG[0];
  const healthyCount = diagnostics.filter((item) => item.status === "healthy").length;
  const issueCount = diagnostics.filter((item) => item.status === "needs_setup" || item.status === "error").length;

  function record(catalogId: string, tone: ActivityItem["tone"], title: string, detail: string): void {
    setActivities((items) => [{ id: `${Date.now()}-${catalogId}`, catalogId, tone, title, detail, at: Date.now() }, ...items].slice(0, 30));
  }

  async function diagnose(): Promise<void> {
    if (!agent || !selected) return;
    setBusy(true);
    try {
      const latest = (await refresh(agent.id)).find((item) => item.catalogId === selected.catalogId) ?? selected;
      const detail = latest.status === "healthy" ? (zh ? "配置完整；重启 Agent 会话后由运行时建立 stdio 连接。" : "Configuration is complete. Restart the agent session to establish the stdio connection.") : latest.missingRequirements.join(", ");
      record(latest.catalogId, latest.status === "healthy" ? "success" : "error", zh ? "配置诊断完成" : "Configuration check completed", detail);
      setMessage(detail);
    } finally { setBusy(false); }
  }

  async function uninstall(): Promise<void> {
    if (!agent || !selected) return;
    setBusy(true); setMessage("");
    try {
      const result = await window.multiAgentChat.uninstallMcp({ agentId: agent.id, catalogId: selected.catalogId });
      record(selected.catalogId, "info", zh ? "已移除 MCP" : "MCP removed", result.serverName);
      await refresh(agent.id);
      setMessage(zh ? "已移除。重启该 Agent 会话后生效。" : "Removed. Restart this agent session to apply.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  async function install(item: McpCatalogItem): Promise<void> {
    if (!agent) return;
    setBusy(true); setMessage("");
    try {
      const result = await window.multiAgentChat.installMcp({
        agentId: agent.id, catalogId: item.id,
        ...(item.requiresPath && allowedPath ? { allowedPath } : {}),
        ...(item.requiresToken && token ? { token } : {}),
      });
      await refresh(agent.id);
      setSelectedId(item.id); setDrawerOpen(false); setAllowedPath(""); setToken("");
      record(item.id, "success", zh ? "已安装 MCP" : "MCP installed", result.serverName);
      setMessage(zh ? "安装完成。重启该 Agent 会话后生效。" : "Installed. Restart this agent session to apply.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }

  return (
    <section className="mcp-console">
      <header className="mcp-console-header">
        <div><span className="eyebrow">Agent capability management</span><h2>{zh ? "MCP 管理" : "MCP Management"}</h2><p>{zh ? "查看当前 Agent 已安装的 MCP、诊断配置并扩展工具能力。" : "Inspect installed MCP servers, diagnose configuration and extend this agent's capabilities."}</p></div>
        <div className="mcp-header-actions">
          <div className="mcp-summary"><strong>{diagnostics.length}</strong><span>{zh ? "已安装" : "installed"}</span><strong>{healthyCount}</strong><span>{zh ? "正常" : "healthy"}</span>{issueCount ? <><strong className="is-warning">{issueCount}</strong><span>{zh ? "待处理" : "needs attention"}</span></> : null}</div>
          <label className="mcp-agent-select"><span>{zh ? "目标 Agent" : "Target agent"}</span><select value={agent?.id ?? ""} onChange={(event) => { setAgentId(event.currentTarget.value); setTab("overview"); setMessage(""); }}>{agents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button className="control-btn compact" disabled={!agent} onClick={() => setDrawerOpen(true)}><Plus size={14} />{zh ? "添加 MCP" : "Add MCP"}</button>
        </div>
      </header>

      <div className="mcp-console-body">
        <aside className="mcp-installed-panel">
          <div className="mcp-panel-title"><div><h3>{zh ? "已安装 MCP" : "Installed MCP"}</h3><p>{agent?.name ?? (zh ? "未选择 Agent" : "No agent selected")}</p></div><span>{diagnostics.length}</span></div>
          <label className="mcp-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={zh ? "搜索已安装 MCP" : "Search installed MCP"} /></label>
          <div className="mcp-status-filters">{(["all", "healthy", "needs_setup", "error"] as StatusFilter[]).map((value) => <button key={value} className={statusFilter === value ? "is-active" : ""} onClick={() => setStatusFilter(value)}>{value === "all" ? (zh ? "全部" : "All") : statusLabel(value, zh)}</button>)}</div>
          <div className="mcp-installed-list">
            {visible.map((item) => <button key={item.serverName} className={`mcp-server-row ${selected?.catalogId === item.catalogId ? "is-active" : ""}`} onClick={() => { setSelectedId(item.catalogId); setTab("overview"); setMessage(""); }}>
              <span className={`mcp-status-icon is-${item.status}`}><StatusIcon value={item.status} /></span><span><strong>{item.name}</strong><small>{item.toolCount} {zh ? "个工具" : "tools"} · {statusLabel(item.status, zh)}</small></span><ChevronRight size={14} />
            </button>)}
            {!visible.length ? <div className="mcp-empty"><Library size={24} /><strong>{diagnostics.length ? (zh ? "没有匹配项" : "No matches") : (zh ? "此 Agent 尚未安装 MCP" : "No MCP installed for this agent")}</strong><p>{zh ? "从 MCP Library 添加能力，配置将只应用到当前 Agent。" : "Add capabilities from the MCP Library. Configuration stays scoped to this agent."}</p><button className="control-btn compact" onClick={() => setDrawerOpen(true)}><Plus size={13} />{zh ? "添加 MCP" : "Add MCP"}</button></div> : null}
          </div>
        </aside>

        <main className="mcp-detail-panel">
          {selected ? <>
            <header className="mcp-detail-header"><div className="mcp-detail-identity"><span className={`mcp-status-icon is-${selected.status}`}><StatusIcon value={selected.status} /></span><div><small>{selectedCatalog?.category ?? "managed"}</small><h3>{selected.name}</h3><p>{selected.description}</p></div></div><div className="mcp-detail-actions"><button className="control-btn compact secondary" disabled={busy} onClick={() => void diagnose()}><RefreshCw size={13} />{zh ? "检测配置" : "Check configuration"}</button><button className="control-btn compact secondary danger" disabled={busy} onClick={() => void uninstall()}><Trash2 size={13} />{zh ? "卸载" : "Uninstall"}</button></div></header>
            <nav className="mcp-tabs">{(["overview", "tools", "configuration", "activity"] as DetailTab[]).map((value) => <button key={value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>{value === "overview" ? <ShieldCheck size={14} /> : value === "tools" ? <Wrench size={14} /> : value === "configuration" ? <Settings2 size={14} /> : <Activity size={14} />}{value[0]!.toUpperCase() + value.slice(1)}</button>)}</nav>
            <div className="mcp-detail-content">
              {tab === "overview" ? <div className="mcp-overview"><section className={`mcp-health-banner is-${selected.status}`}><StatusIcon value={selected.status} /><div><strong>{statusLabel(selected.status, zh)}</strong><p>{selected.status === "healthy" ? (zh ? "受管配置完整。真实连接会在 Agent 会话启动时建立。" : "Managed configuration is complete. The live connection is established when the agent session starts.") : selected.missingRequirements.join(", ") || (zh ? "配置块异常，请重新安装。" : "The managed block is invalid. Reinstall this MCP.")}</p></div></section><div className="mcp-metric-grid"><article><span>{zh ? "工具" : "Tools"}</span><strong>{selected.toolCount}</strong><small>{zh ? "目录声明" : "catalog declaration"}</small></article><article><span>{zh ? "认证" : "Authentication"}</span><strong>{selectedCatalog?.requiresToken ? (selected.envKeys.length ? (zh ? "已配置" : "Configured") : (zh ? "缺失" : "Missing")) : (zh ? "不需要" : "Not required")}</strong><small>{selected.envKeys.join(", ") || (zh ? "无环境变量" : "No environment variables")}</small></article><article><span>{zh ? "权限范围" : "Scope"}</span><strong>{selectedCatalog?.requiresPath ? (zh ? "目录限制" : "Directory bound") : (zh ? "服务定义" : "Server-defined")}</strong><small>{selectedCatalog?.requiresPath ? selected.args.at(-1) : selected.command}</small></article><article><span>{zh ? "应用方式" : "Apply mode"}</span><strong>{zh ? "重启会话" : "Restart session"}</strong><small>{zh ? "配置变更后生效" : "after configuration changes"}</small></article></div><section className="mcp-note"><ListChecks size={16} /><div><strong>{zh ? "诊断边界" : "Diagnostic boundary"}</strong><p>{zh ? "当前检查验证 config.toml 中的命令、参数和必填配置，不会单独启动 stdio 服务。" : "This check validates command, arguments and required config in config.toml. It does not start a standalone stdio process."}</p></div></section></div> : null}
              {tab === "tools" ? <div className="mcp-tool-list">{(TOOL_NAMES[selected.catalogId] ?? []).map((tool) => <article key={tool}><Wrench size={15} /><div><strong>{tool}</strong><p>{zh ? "由此 MCP 在 Agent 会话中提供。具体输入参数由服务端工具定义决定。" : "Provided by this MCP in the agent session. Input parameters are defined by the server tool schema."}</p></div><span>{statusLabel(selected.status, zh)}</span></article>)}{!selected.toolCount ? <div className="mcp-empty"><CircleHelp size={22} /><strong>{zh ? "工具清单未知" : "Tool list unavailable"}</strong></div> : null}</div> : null}
              {tab === "configuration" ? <div className="mcp-config-view"><section><span>{zh ? "Server name" : "Server name"}</span><code>{selected.serverName}</code></section><section><span>{zh ? "命令" : "Command"}</span><code>{selected.command || "—"}</code></section><section><span>{zh ? "参数" : "Arguments"}</span><code>{selected.args.join(" ") || "—"}</code></section><section><span>{zh ? "环境变量键" : "Environment keys"}</span><code>{selected.envKeys.join(", ") || "—"}</code></section><div className="mcp-config-actions">{status ? <button className="control-btn compact secondary" onClick={() => void window.multiAgentChat.revealPath(status.configPath)}><FolderOpen size={13} />{zh ? "打开配置目录" : "Open config folder"}</button> : null}<span>{zh ? "敏感值不会在此页面回显。" : "Secret values are never displayed here."}</span></div></div> : null}
              {tab === "activity" ? <div className="mcp-activity-list">{activities.filter((item) => item.catalogId === selected.catalogId).map((item) => <article key={item.id} className={`is-${item.tone}`}><span>{new Date(item.at).toLocaleTimeString()}</span><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}{!activities.some((item) => item.catalogId === selected.catalogId) ? <div className="mcp-empty"><Activity size={22} /><strong>{zh ? "暂无页面活动" : "No page activity yet"}</strong><p>{zh ? "检测配置、安装和卸载操作会记录在这里。" : "Configuration checks, installs and removals appear here."}</p></div> : null}</div> : null}
            </div>
            {message ? <div className="mcp-feedback" role="status">{message}</div> : null}
          </> : <div className="mcp-empty is-detail"><Library size={30} /><strong>{zh ? "选择一个已安装的 MCP" : "Select an installed MCP"}</strong><p>{zh ? "查看状态、工具、配置与最近活动。" : "Inspect status, tools, configuration and recent activity."}</p></div>}
        </main>
      </div>

      {drawerOpen ? <div className="mcp-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside className="mcp-library-drawer"><header><div><span className="eyebrow">MCP Library</span><h3>{zh ? `为 ${agent?.name ?? "Agent"} 添加 MCP` : `Add MCP for ${agent?.name ?? "Agent"}`}</h3><p>{zh ? "安装内容只写入该 Agent 的受管配置。" : "The installation is written only to this agent's managed configuration."}</p></div><button className="icon-btn flat" onClick={() => setDrawerOpen(false)} aria-label="Close"><X size={17} /></button></header><label className="mcp-search"><Search size={14} /><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.currentTarget.value)} placeholder={zh ? "搜索 MCP Library" : "Search MCP Library"} /></label><div className="mcp-library-body"><div className="mcp-library-list">{library.map((item) => <button key={item.id} className={librarySelected?.id === item.id ? "is-active" : ""} onClick={() => { setLibraryId(item.id); setAllowedPath(""); setToken(""); }}><span>{item.category}</span><strong>{item.name}</strong><p>{item.description}</p></button>)}{!library.length ? <div className="mcp-empty"><CheckCircle2 size={24} /><strong>{zh ? "没有可添加项" : "Nothing else to add"}</strong></div> : null}</div>{librarySelected && !installedIds.has(librarySelected.id) ? <section className="mcp-library-setup"><div><span>{librarySelected.category}</span><h4>{librarySelected.name}</h4><p>{librarySelected.description}</p></div><div className="mcp-prerequisites"><strong>{zh ? "安装要求" : "Requirements"}</strong><span>{librarySelected.requiresPath ? (zh ? "需要允许目录" : "Allowed directory required") : librarySelected.requiresToken ? (zh ? "需要访问令牌" : "Access token required") : (zh ? "无需额外配置" : "No extra configuration")}</span></div>{librarySelected.requiresPath ? <label className="config-field"><span>{zh ? "允许目录" : "Allowed directory"}</span><input value={allowedPath} onChange={(event) => setAllowedPath(event.currentTarget.value)} placeholder="C:\\path\\to\\project" /></label> : null}{librarySelected.requiresToken ? <label className="config-field"><span><KeyRound size={13} /> GitHub PAT</span><input type="password" value={token} onChange={(event) => setToken(event.currentTarget.value)} placeholder="github_pat_..." /></label> : null}<button className="control-btn" disabled={busy || (librarySelected.requiresPath && !allowedPath.trim()) || (librarySelected.requiresToken && !token.trim())} onClick={() => void install(librarySelected)}><Plus size={14} />{busy ? (zh ? "安装中…" : "Installing…") : (zh ? "安装到此 Agent" : "Install for this agent")}</button><small>{zh ? `Server: ${mcpServerNameForAgent(agent?.id ?? "agent", librarySelected.id)}` : `Server: ${mcpServerNameForAgent(agent?.id ?? "agent", librarySelected.id)}`}</small></section> : null}</div></aside></div> : null}
    </section>
  );
}
