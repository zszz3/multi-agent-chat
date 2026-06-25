import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Cpu,
  FolderOpen,
  GitBranch,
  MessageSquareText,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Wand2,
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
export type PaletteLanguage = "zh" | "en";

export interface PaletteContext {
  chats: Array<{ id: string; title: string; agentId: string }>;
  theme: Theme;
  language?: PaletteLanguage;
  onNavigate: (feature: "chat" | "tasks" | "workflow" | "skills" | "runtimes" | "settings") => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onToggleTheme: () => void;
  onChooseWorkDir: () => void;
  onRefreshAgents: () => void;
}

export function buildPaletteCommands(context: PaletteContext): PaletteCommand[] {
  const language = context.language ?? "en";
  const label =
    language === "zh"
      ? {
          jump: "跳转",
          action: "操作",
          chats: "对话",
          chat: "对话",
          tasks: "任务",
          workflow: "工作流",
          skills: "技能",
          runtimes: "配置",
          settings: "设置",
          newChat: "新建对话",
          lightTheme: "切换到浅色主题",
          darkTheme: "切换到深色主题",
          workDir: "选择工作目录...",
          refresh: "刷新 Agent 状态",
        }
      : {
          jump: "Navigate",
          action: "Action",
          chats: "Chats",
          chat: "Chat",
          tasks: "Tasks",
          workflow: "Workflow",
          skills: "Skills",
          runtimes: "Config",
          settings: "Settings",
          newChat: "New chat",
          lightTheme: "Switch to light theme",
          darkTheme: "Switch to dark theme",
          workDir: "Choose work directory...",
          refresh: "Refresh agent status",
        };
  const navigation: PaletteCommand[] = [
    { id: "nav-chat", section: label.jump, label: label.chat, hint: "G C", icon: <MessageSquareText size={14} />, run: () => context.onNavigate("chat") },
    { id: "nav-tasks", section: label.jump, label: label.tasks, hint: "G T", icon: <ClipboardList size={14} />, run: () => context.onNavigate("tasks") },
    { id: "nav-workflow", section: label.jump, label: label.workflow, hint: "G F", icon: <GitBranch size={14} />, run: () => context.onNavigate("workflow") },
    { id: "nav-skills", section: label.jump, label: label.skills, icon: <Wand2 size={14} />, run: () => context.onNavigate("skills") },
    { id: "nav-runtimes", section: label.jump, label: label.runtimes, hint: "G R", icon: <Cpu size={14} />, run: () => context.onNavigate("runtimes") },
    { id: "nav-settings", section: label.jump, label: label.settings, icon: <Settings size={14} />, run: () => context.onNavigate("settings") },
  ];
  const actions: PaletteCommand[] = [
    { id: "act-new-chat", section: label.action, label: label.newChat, hint: "⌘N", icon: <Plus size={14} />, run: context.onNewChat },
    {
      id: "act-theme",
      section: label.action,
      label: context.theme === "dark" ? label.lightTheme : label.darkTheme,
      icon: context.theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
      run: context.onToggleTheme,
    },
    { id: "act-workdir", section: label.action, label: label.workDir, icon: <FolderOpen size={14} />, run: context.onChooseWorkDir },
    { id: "act-refresh", section: label.action, label: label.refresh, icon: <RefreshCw size={14} />, run: context.onRefreshAgents },
  ];
  const chats: PaletteCommand[] = context.chats.map((chat) => ({
    id: `chat-${chat.id}`,
    section: label.chats,
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
