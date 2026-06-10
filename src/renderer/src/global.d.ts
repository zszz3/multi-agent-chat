import type { MultiAgentChatApi } from "../../preload";

declare global {
  interface Window {
    multiAgentChat: MultiAgentChatApi;
  }
}

export {};
