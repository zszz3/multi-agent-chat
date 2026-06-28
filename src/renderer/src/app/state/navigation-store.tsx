import { createContext, useContext, type ReactNode } from "react";
import type { ActiveFeature } from "../shell";

export interface NavigationContextValue {
  activeFeature: ActiveFeature;
  setActiveFeature: (feature: ActiveFeature) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean | ((current: boolean) => boolean)) => void;
}

const noop = () => undefined;
const NavigationContext = createContext<NavigationContextValue>({
  activeFeature: "chat",
  setActiveFeature: noop,
  paletteOpen: false,
  setPaletteOpen: noop,
});

export function NavigationProvider({ value, children }: { value: NavigationContextValue; children: ReactNode }) {
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigationStore(): NavigationContextValue {
  return useContext(NavigationContext);
}
