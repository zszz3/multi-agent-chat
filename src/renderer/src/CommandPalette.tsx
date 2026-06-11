import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  FolderOpen,
  MessageSquareText,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

export interface PaletteCommand {
  id: string;
  section: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

export function filterPaletteCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const text = query.trim().toLowerCase();
  if (!text) return commands;
  return commands.filter((command) => `${command.section} ${command.label}`.toLowerCase().includes(text));
}

export type Theme = "light" | "dark";

export interface PaletteContext {
  chats: Array<{ id: string; title: string; agentId: string }>;
  theme: Theme;
  onNavigate: (feature: "chat" | "tasks" | "teams" | "workflow" | "configs") => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onToggleTheme: () => void;
  onChooseWorkDir: () => void;
  onRefreshAgents: () => void;
}

export function buildPaletteCommands(context: PaletteContext): PaletteCommand[] {
  const navigation: PaletteCommand[] = [
    { id: "nav-chat", section: "跳转", label: "Chat 对话", hint: "G C", icon: <MessageSquareText size={14} />, run: () => context.onNavigate("chat") },
    { id: "nav-tasks", section: "跳转", label: "Tasks 看板", hint: "G T", icon: <ClipboardList size={14} />, run: () => context.onNavigate("tasks") },
    { id: "nav-teams", section: "跳转", label: "Teams 团队", hint: "G W", icon: <Users size={14} />, run: () => context.onNavigate("teams") },
    { id: "nav-workflow", section: "跳转", label: "Workflow 工作流", hint: "G F", icon: <Users size={14} />, run: () => context.onNavigate("workflow") },
    { id: "nav-configs", section: "跳转", label: "Configs 配置", hint: "G S", icon: <Settings size={14} />, run: () => context.onNavigate("configs") },
  ];
  const actions: PaletteCommand[] = [
    { id: "act-new-chat", section: "操作", label: "新建对话", hint: "⌘N", icon: <Plus size={14} />, run: context.onNewChat },
    {
      id: "act-theme",
      section: "操作",
      label: context.theme === "dark" ? "切换到浅色主题" : "切换到深色主题",
      icon: context.theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
      run: context.onToggleTheme,
    },
    { id: "act-workdir", section: "操作", label: "选择工作目录…", icon: <FolderOpen size={14} />, run: context.onChooseWorkDir },
    { id: "act-refresh", section: "操作", label: "刷新 Agent 状态", icon: <RefreshCw size={14} />, run: context.onRefreshAgents },
  ];
  const chats: PaletteCommand[] = context.chats.map((chat) => ({
    id: `chat-${chat.id}`,
    section: "对话",
    label: chat.title,
    hint: chat.agentId === "codex" ? "Codex" : "Claude",
    icon: <MessageSquareText size={14} />,
    run: () => {
      context.onNavigate("chat");
      context.onSelectChat(chat.id);
    },
  }));
  return [...navigation, ...actions, ...chats];
}

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => filterPaletteCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  if (!open) return null;

  function runCommand(command: PaletteCommand | undefined): void {
    if (!command) return;
    command.run();
    onClose();
  }

  let lastSection = "";
  return (
    <div className="palette-overlay" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="palette">
        <div className="palette-input-row">
          <Search size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索对话,或执行命令…"
            aria-label="Command palette input"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((current) => (visible.length === 0 ? 0 : (current + 1) % visible.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => (visible.length === 0 ? 0 : (current - 1 + visible.length) % visible.length));
              } else if (event.key === "Enter") {
                event.preventDefault();
                runCommand(visible[activeIndex]);
              }
            }}
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" role="listbox" aria-label="Commands">
          {visible.length === 0 ? (
            <div className="palette-empty">无匹配结果</div>
          ) : (
            visible.map((command, index) => {
              const sectionHeader =
                command.section !== lastSection ? <div className="palette-section" key={`section-${command.section}`}>{command.section}</div> : null;
              lastSection = command.section;
              return (
                <div key={command.id}>
                  {sectionHeader}
                  <button
                    className={`palette-item ${index === activeIndex ? "is-active" : ""}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runCommand(command)}
                  >
                    <span className="palette-item-icon">{command.icon}</span>
                    <span className="palette-item-label">{command.label}</span>
                    {command.hint ? <kbd>{command.hint}</kbd> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="palette-foot">
          <span><kbd>↑↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 执行</span>
          <span><kbd>⌘K</kbd> 关闭</span>
        </div>
      </div>
    </div>
  );
}
