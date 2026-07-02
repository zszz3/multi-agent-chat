import type { MultiAgentChatApi } from "../../../../preload";

export function multiAgentChatService(): MultiAgentChatApi {
  return window.multiAgentChat;
}
