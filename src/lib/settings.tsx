'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { translate, type Lang, type TranslationKey } from './i18n';

export type Theme = 'light' | 'dark';
export type ViewMode = 'grid' | 'list';
export type SortKey = 'name' | 'date' | 'size';
export type TileSize = 'sm' | 'md' | 'lg';

interface Settings {
  theme: Theme;
  lang: Lang;
  view: ViewMode;
  sort: SortKey;
  tileSize: TileSize;
}

const DEFAULTS: Settings = {
  theme: 'dark',
  lang: 'en',
  view: 'grid',
  sort: 'name',
  tileSize: 'md',
};

/** localStorage key — also read by the inline anti-FOUC script in layout.tsx. */
export const SETTINGS_STORAGE_KEY = 'jrjr-settings';

interface SettingsContextValue extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted settings after mount (localStorage is client-only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) setSettings((s) => ({ ...s, ...JSON.parse(raw) }));
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, []);

  // Apply the theme and persist — only once hydrated, so the inline script's
  // pre-paint theme is never briefly overridden by the default.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota / privacy errors */
    }
  }, [settings, hydrated]);

  const set = useCallback<SettingsContextValue['set']>((key, value) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const t = useCallback<SettingsContextValue['t']>(
    (key, vars) => translate(settings.lang, key, vars),
    [settings.lang],
  );

  return (
    <SettingsContext.Provider value={{ ...settings, set, t }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

/** Convenience hook for components that only need the translation function. */
export function useT() {
  return useSettings().t;
}
