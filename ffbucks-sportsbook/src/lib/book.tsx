import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, num, type BookState, type Member } from './supabase';

type Book = {
  session: Session | null;
  ready: boolean;
  me: Member | null;
  state: BookState | null;
  jackpot: number;
  refresh: () => Promise<void>;
};

const BookContext = createContext<Book>({
  session: null, ready: false, me: null, state: null, jackpot: 0, refresh: async () => {},
});

export function BookProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [state, setState] = useState<BookState | null>(null);
  const [jackpot, setJackpot] = useState(0);

  useEffect(() => {
    if (!supabase) { setAuthChecked(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthChecked(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !session) { setMe(null); setState(null); return; }
    const uid = session.user.id;
    try {
      const [m, s, j] = await Promise.all([
        supabase.from('members').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('book_state').select('season,last_sync_at,last_sync_note,tip_url').maybeSingle(),
        supabase.from('jackpot').select('amount').maybeSingle(),
      ]);
      setMe(m.data ? num(m.data as Member, ['balance']) : null);
      setState((s.data as BookState) ?? null);
      setJackpot(Number((j.data as { amount?: number } | null)?.amount ?? 0));
    } finally {
      setLoadedFor(uid);
    }
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(id);
  }, [session, refresh]);

  // Ready once we know who is signed in and, if anyone is, their member row has loaded.
  const ready = authChecked && (!session || loadedFor === session.user.id);
  return (
    <BookContext.Provider value={{ session, ready, me, state, jackpot, refresh }}>
      {children}
    </BookContext.Provider>
  );
}

export const useBook = () => useContext(BookContext);

/** Re-render every `ms` so countdowns tick. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
