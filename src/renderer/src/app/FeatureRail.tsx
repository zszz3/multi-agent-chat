import { Beaker, Bot, CalendarClock, ClipboardCheck, ClipboardList, Cpu, Database, GitBranch, MessageSquareText, Moon, Server, SlidersHorizontal, Sun, Wand2 } from "lucide-react";
import type { Theme } from "../CommandPalette";
import type { ActiveFeature } from "./shell";

interface FeatureRailText {
  nav: Record<"chat" | "tasks" | "workflow" | "schedules" | "skills" | "agent" | "mcp" | "datasets" | "evaluators" | "experiments" | "runtimes", string>;
  chrome: {
    featureNav: string;
    lightTheme: string;
    darkTheme: string;
    toggleTheme: string;
  };
}

interface FeatureRailProps {
  activeFeature: ActiveFeature;
  theme: Theme;
  text: FeatureRailText;
  onSelectFeature: (feature: ActiveFeature) => void;
  onToggleTheme: () => void;
}

export function FeatureRail({ activeFeature, theme, text, onSelectFeature, onToggleTheme }: FeatureRailProps) {
  return (
    <aside className="feature-rail">
      <div className="rail-brand" title="Multi Agent Chat">
        <Bot size={18} />
      </div>
      <nav className="feature-nav" aria-label={text.chrome.featureNav}>
        <button className={`feature-nav-item ${activeFeature === "chat" ? "is-active" : ""}`} onClick={() => onSelectFeature("chat")}>
          <MessageSquareText size={15} />
          <span>{text.nav.chat}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "tasks" ? "is-active" : ""}`} onClick={() => onSelectFeature("tasks")}>
          <ClipboardList size={15} />
          <span>{text.nav.tasks}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "workflow" ? "is-active" : ""}`} onClick={() => onSelectFeature("workflow")}>
          <GitBranch size={15} />
          <span>{text.nav.workflow}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "schedules" ? "is-active" : ""}`} onClick={() => onSelectFeature("schedules")}>
          <CalendarClock size={15} />
          <span>{text.nav.schedules}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "skills" ? "is-active" : ""}`} onClick={() => onSelectFeature("skills")}>
          <Wand2 size={15} />
          <span>{text.nav.skills}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "agent" ? "is-active" : ""}`} onClick={() => onSelectFeature("agent")}>
          <SlidersHorizontal size={15} />
          <span>{text.nav.agent}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "mcp" ? "is-active" : ""}`} onClick={() => onSelectFeature("mcp")}>
          <Server size={15} />
          <span>{text.nav.mcp}</span>
        </button>
        <button className={`feature-nav-item ${activeFeature === "datasets" ? "is-active" : ""}`} onClick={() => onSelectFeature("datasets")}><Database size={15} /><span>{text.nav.datasets}</span></button>
        <button className={`feature-nav-item ${activeFeature === "evaluators" ? "is-active" : ""}`} onClick={() => onSelectFeature("evaluators")}><ClipboardCheck size={15} /><span>{text.nav.evaluators}</span></button>
        <button className={`feature-nav-item ${activeFeature === "experiments" ? "is-active" : ""}`} onClick={() => onSelectFeature("experiments")}><Beaker size={15} /><span>{text.nav.experiments}</span></button>
        <button className={`feature-nav-item ${activeFeature === "runtimes" ? "is-active" : ""}`} onClick={() => onSelectFeature("runtimes")}>
          <Cpu size={15} />
          <span>{text.nav.runtimes}</span>
        </button>
      </nav>
      <div className="rail-footer">
        <button
          className="icon-btn"
          onClick={onToggleTheme}
          data-tip={theme === "dark" ? text.chrome.lightTheme : text.chrome.darkTheme}
          aria-label={text.chrome.toggleTheme}
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </aside>
  );
}
