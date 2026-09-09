// @ts-nocheck -- Next.js adapter: preserve copied URDR source under Moirai's stricter TS config.
export const APP_LANGUAGE_OVERRIDE_KEY = "urdr:app-language-override";
export const APP_SETTINGS_STATE_KEY = "urdr:app-settings";

export const appLocales = ["ko", "en"] as const;
export type AppLocale = (typeof appLocales)[number];

const APP_LOCALE_SET = new Set<AppLocale>(appLocales);

export function resolveAppLocale(value: string | null | undefined): AppLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const primary = normalized.split("-")[0];
  return APP_LOCALE_SET.has(primary as AppLocale) ? (primary as AppLocale) : null;
}

export function resolveBrowserLocale(languages: readonly string[] | undefined): AppLocale {
  for (const language of languages ?? []) {
    const resolved = resolveAppLocale(language);
    if (resolved) {
      return resolved;
    }
  }

  return "ko";
}

export function readManualAppLocaleOverride(): AppLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return resolveAppLocale(window.localStorage.getItem(APP_LANGUAGE_OVERRIDE_KEY));
  } catch {
    return null;
  }
}

export function writeManualAppLocaleOverride(locale: AppLocale | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (locale) {
      window.localStorage.setItem(APP_LANGUAGE_OVERRIDE_KEY, locale);
      return;
    }

    window.localStorage.removeItem(APP_LANGUAGE_OVERRIDE_KEY);
  } catch {
  }
}

export type PersistedAppSettings = {
  compositeHullMode?: string;
  xForceLayout?: Record<string, number>;
  compositeSplineTuning?: Record<string, number>;
};

export function readPersistedAppSettings(): PersistedAppSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STATE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as PersistedAppSettings;
  } catch {
    return null;
  }
}

export function writePersistedAppSettings(settings: PersistedAppSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(APP_SETTINGS_STATE_KEY, JSON.stringify(settings));
  } catch {
  }
}
