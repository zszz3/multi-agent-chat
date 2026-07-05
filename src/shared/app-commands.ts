import type { AgentId } from "./types";

export type AppCommandId = "help" | "status" | "models" | "plugins";
export type AppCommandHandlerKey = AppCommandId;

export interface AppCommandDescriptor {
  id: AppCommandId;
  command: `/app ${string}`;
  summary: string;
  supportedRuntimeIds?: AgentId[];
  handlerKey: AppCommandHandlerKey;
}

export const APP_COMMAND_PREFIX = "/app";

export const APP_COMMANDS: readonly AppCommandDescriptor[] = [
  {
    id: "help",
    command: "/app help",
    summary: "Show app-local commands.",
    handlerKey: "help",
  },
  {
    id: "status",
    command: "/app status",
    summary: "Read Codex app-server config, model, plugin, and MCP status.",
    supportedRuntimeIds: ["codex"],
    handlerKey: "status",
  },
  {
    id: "models",
    command: "/app models",
    summary: "List models from Codex app-server.",
    supportedRuntimeIds: ["codex"],
    handlerKey: "models",
  },
  {
    id: "plugins",
    command: "/app plugins",
    summary: "List Codex plugins from app-server marketplaces.",
    supportedRuntimeIds: ["codex"],
    handlerKey: "plugins",
  },
] as const;
