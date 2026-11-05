import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase, message } from './supabase';
import { COPY, cleanCopy, cleanTheme, cssVars, fill, fontsHref, themeChanges } from './look.mjs';

export type Look = { theme: Record<string, string>; copy: Record<string, string> };
type Ctx = {
  saved: Look;
  draft: Look | null;
  hasPrevious: boolean;
  setDraft: (look: Look | null) => void;
  save: () => Promise<string | null>;
  restore: () => Promise<string | null>;
  t: (key: keyof typeof COPY | string, vars?: Record<string, string | number>) => string;
};

const empty: Look = { theme: {}, copy: {} };
const LookContext = createContext<Ctx>({
  saved: empty, draft: null, hasPrevious: false, setDraft: () => {},
  save: async () => null, restore: async () => null, t: (key) => String(key),
});

type Stored = { theme?: Record<string, string>; copy?: Record<string, string>; has_previous?: boolean } | null;

export function LookProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Look>(empty);
  const [draft, setDraft] = useState<Look | null>(null);
  const [hasPrevious, setHasPrevious] = useState(false);

  const take = (data: Stored) => {
    setSaved({ theme: cleanTheme(data?.theme ?? {}), copy: cleanCopy(data?.copy ?? {}) });
    setHasPrevious(Boolean(data?.has_previous));
  };

  // The look is readable before sign-in, so the sign-in page matches. If the
  // look editor isn't installed yet, the defaults are used.
  useEffect(() => {
    supabase?.rpc('get_site_look').then(({ data }) => { if (data) take(data as Stored); });
  }, []);

  const active = draft ?? saved;

  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(cssVars(active.theme))) root.style.setProperty(name, value as string);
    const href = fontsHref(active.theme);
    let link = document.getElementById('look-fonts') as HTMLLinkElement | null;
    if (href) {
      if (!link) {
        link = document.createElement('link');
        link.id = 'look-fonts';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      if (link.href !== href) link.href = href;
    } else link?.remove();
  }, [active.theme]);

  const save = useCallback(async () => {
    if (!supabase || !draft) return null;
    const { data, error } = await supabase.rpc('set_site_look', {
      p_theme: themeChanges(draft.theme), p_copy: cleanCopy(draft.copy),
    });
    if (error) return message(error);
    take(data as Stored);
    setDraft(null);
    return null;
  }, [draft]);

  const restore = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('restore_site_look');
    if (error) return message(error);
    take(data as Stored);
    setDraft(null);
    return null;
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const own = active.copy[key];
    const text = own && own.trim() ? own : (COPY as Record<string, { text: string }>)[key]?.text ?? key;
    return fill(text, vars);
  }, [active.copy]);

  const value = useMemo(() => ({ saved, draft, hasPrevious, setDraft, save, restore, t }), [saved, draft, hasPrevious, save, restore, t]);
  return <LookContext.Provider value={value}>{children}</LookContext.Provider>;
}

export const useLook = () => useContext(LookContext);
export const useText = () => useContext(LookContext).t;
