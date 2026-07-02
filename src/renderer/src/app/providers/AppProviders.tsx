import type { ReactNode } from "react";
import { NavigationProvider, type NavigationContextValue } from "../state/navigation-store";
import { PreferencesProvider, type PreferencesContextValue } from "../state/preferences-store";
import { SnapshotProvider, type SnapshotContextValue } from "../state/snapshot-store";

export interface AppProvidersProps {
  snapshot: SnapshotContextValue;
  preferences: PreferencesContextValue;
  navigation: NavigationContextValue;
  children: ReactNode;
}

export function AppProviders({ snapshot, preferences, navigation, children }: AppProvidersProps) {
  return (
    <SnapshotProvider value={snapshot}>
      <PreferencesProvider value={preferences}>
        <NavigationProvider value={navigation}>{children}</NavigationProvider>
      </PreferencesProvider>
    </SnapshotProvider>
  );
}
