import { createContext, useContext, type ReactNode } from "react";
import type { Theme } from "../../CommandPalette";
import type { Language } from "../language";

export interface PreferencesContextValue {
  theme: Theme;
  setTheme: (theme: Theme | ((current: Theme) => Theme)) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  keepAwake: boolean;
  setKeepAwake: (enabled: boolean) => void;
  providerKeys: Record<string, string>;
  setProviderKeys: (updater: Record<string, string> | ((current: Record<string, string>) => Record<string, string>)) => void;
}

const noop = () => undefined;
const PreferencesContext = createContext<PreferencesContextValue>({
  theme: "light",
  setTheme: noop,
  language: "zh",
  setLanguage: noop,
  keepAwake: false,
  setKeepAwake: noop,
  providerKeys: {},
  setProviderKeys: noop,
});

export function PreferencesProvider({ value, children }: { value: PreferencesContextValue; children: ReactNode }) {
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferencesStore(): PreferencesContextValue {
  return useContext(PreferencesContext);
}
