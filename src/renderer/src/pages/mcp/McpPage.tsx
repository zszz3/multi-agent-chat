import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Unplug, Wifi } from "lucide-react";
import type { Language } from "../../app/language";
import type { McpServerDefinition } from "../../../../shared/types";

function newServer(): McpServerDefinition {
  const now = Date.now();
  return { id: `mcp-${now}`, name: "New MCP Server", transport: "stdio", args: [], env: {}, enabled: true, tools: [], status: "untested", createdAt: now, updatedAt: now };
}

export function McpPage({ language }: { language: Language }) {
  const zh = language === "zh";
  const [servers, setServers] = useState<McpServerDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<McpServerDefinition>();
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => servers.find((item) => item.id === selectedId), [servers, selectedId]);

  useEffect(() => { void window.multiAgentChat.listMcpServers().then((items) => { setServers(items); setSelectedId(items[0]?.id); }); }, []);
  useEffect(() => { setDraft(selected ? { ...selected, args: [...selected.args], env: { ...selected.env }, tools: [...selected.tools] } : undefined); }, [selected]);

  async function save(): Promise<void> {
    if (!draft?.name.trim()) return;
    const saved = await window.multiAgentChat.saveMcpServer({ ...draft, updatedAt: Date.now() });
    setServers((items) => [...items.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(saved.id);
  }

  async function test(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    try {
      const tested = await window.multiAgentChat.testMcpServer({ ...draft, updatedAt: Date.now() });
      setServers((items) => [...items.filter((item) => item.id !== tested.id), tested].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft(tested);
    } finally { setBusy(false); }
  }

  async function remove(): Promise<void> {
    if (!draft || !window.confirm(zh ? `删除 ${draft.name}？` : `Delete ${draft.name}?`)) return;
    await window.multiAgentChat.deleteMcpServer(draft.id);
    const next = servers.filter((item) => item.id !== draft.id);
    setServers(next); setSelectedId(next[0]?.id);
  }

  return <section className="mcp-page">
    <header className="config-header"><div><h2>MCP</h2><p>{zh ? "管理本地与远程 MCP Server，测试连接并发现工具。" : "Manage MCP servers, test connections, and discover tools."}</p></div>
      <button className="primary-btn" onClick={() => { const item = newServer(); setServers((current) => [...current, item]); setSelectedId(item.id); }}><Plus size={14} />{zh ? "新建" : "New"}</button>
    </header>
    <div className="mcp-workspace">
      <aside className="mcp-server-list">{servers.map((server) => <button key={server.id} className={server.id === selectedId ? "is-active" : ""} onClick={() => setSelectedId(server.id)}><span>{server.name}</span><small>{server.transport.toUpperCase()} · {server.status}</small></button>)}</aside>
      {draft ? <div className="mcp-editor">
        <div className="mcp-editor-actions"><button className="secondary-btn" disabled={busy} onClick={() => void test()}><Wifi size={14} />{busy ? (zh ? "测试中" : "Testing") : (zh ? "测试连接" : "Test")}</button><button className="primary-btn" onClick={() => void save()}><Save size={14} />{zh ? "保存" : "Save"}</button><button className="icon-btn danger" aria-label={zh ? "删除" : "Delete"} onClick={() => void remove()}><Trash2 size={14} /></button></div>
        <label><span>{zh ? "名称" : "Name"}</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <div className="segmented-control"><button className={draft.transport === "stdio" ? "is-active" : ""} onClick={() => setDraft({ ...draft, transport: "stdio" })}>STDIO</button><button className={draft.transport === "http" ? "is-active" : ""} onClick={() => setDraft({ ...draft, transport: "http" })}>HTTP</button></div>
        {draft.transport === "stdio" ? <><label><span>{zh ? "命令" : "Command"}</span><input placeholder="npx" value={draft.command ?? ""} onChange={(event) => setDraft({ ...draft, command: event.target.value })} /></label><label><span>{zh ? "参数（每行一个）" : "Arguments (one per line)"}</span><textarea value={draft.args.join("\n")} onChange={(event) => setDraft({ ...draft, args: event.target.value.split("\n").filter(Boolean) })} /></label></> : <label><span>URL</span><input placeholder="http://127.0.0.1:3000/mcp" value={draft.url ?? ""} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>}
        <div className={`mcp-status is-${draft.status}`}>{draft.status === "connected" ? <Wifi size={14} /> : <Unplug size={14} />}<span>{draft.lastError ?? (draft.status === "connected" ? (zh ? "连接正常" : "Connected") : (zh ? "尚未测试" : "Not tested"))}</span></div>
        <section className="mcp-tools"><h3>{zh ? `工具 (${draft.tools.length})` : `Tools (${draft.tools.length})`}</h3>{draft.tools.length ? draft.tools.map((tool) => <div key={tool.name}><strong>{tool.name}</strong><p>{tool.description || (zh ? "无描述" : "No description")}</p></div>) : <p className="empty-state">{zh ? "测试连接后会显示 Server 提供的工具。" : "Test the connection to discover tools."}</p>}</section>
      </div> : <div className="empty-state">{zh ? "新建一个 MCP Server 开始配置。" : "Create an MCP server to begin."}</div>}
    </div>
  </section>;
}
