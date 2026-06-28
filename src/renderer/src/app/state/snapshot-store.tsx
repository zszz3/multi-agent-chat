import { createContext, useContext, type ReactNode } from "react";
import type { AppSnapshot } from "../../../../shared/types";
import { DEFAULT_SNAPSHOT } from "../app-state";

export interface SnapshotContextValue {
  snapshot: AppSnapshot;
  setSnapshot: (snapshot: AppSnapshot) => void;
}

const SnapshotContext = createContext<SnapshotContextValue>({
  snapshot: DEFAULT_SNAPSHOT,
  setSnapshot: () => undefined,
});

export function SnapshotProvider({ value, children }: { value: SnapshotContextValue; children: ReactNode }) {
  return <SnapshotContext.Provider value={value}>{children}</SnapshotContext.Provider>;
}

export function useSnapshotStore(): SnapshotContextValue {
  return useContext(SnapshotContext);
}
