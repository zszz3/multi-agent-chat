import type { Theme } from "../CommandPalette";
import type { Language } from "./language";

export const THEME_STORAGE_KEY = "multi-agent-chat-theme";
export const PROVIDER_KEYS_STORAGE_KEY = "multi-agent-chat-provider-keys";
export const LANGUAGE_STORAGE_KEY = "multi-agent-chat-language";
export const KEEP_AWAKE_STORAGE_KEY = "multi-agent-chat-keep-awake";

export function loadStoredTheme(storage: Pick<Storage, "getItem">): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function loadStoredProviderKeys(storage: Pick<Storage, "getItem">): Record<string, string> {
  try {
    const raw = storage.getItem(PROVIDER_KEYS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .map(([key, value]) => [key, value]),
    );
  } catch {
    return {};
  }
}

export function loadStoredLanguage(storage: Pick<Storage, "getItem">): Language {
  return storage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
}

export function loadStoredKeepAwake(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(KEEP_AWAKE_STORAGE_KEY) === "true";
}
