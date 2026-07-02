import type { AppSnapshot } from "../../../../shared/types";
import { multiAgentChatService } from "./multi-agent-chat-service";

export interface SnapshotService {
  getSnapshot: () => Promise<AppSnapshot>;
  subscribe: (listener: (snapshot: AppSnapshot) => void) => () => void;
}

export function snapshotService(): SnapshotService {
  const api = multiAgentChatService();
  return {
    getSnapshot: () => api.getSnapshot(),
    subscribe: (listener) => api.onSnapshot(listener),
  };
}
