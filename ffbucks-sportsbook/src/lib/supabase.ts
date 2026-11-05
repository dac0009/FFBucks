import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Both values are public by design (they ship in every page). Set them as
// repository *variables* VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configured = Boolean(url && key);
export const supabase: SupabaseClient | null = configured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export function db(): SupabaseClient {
  if (!supabase) throw new Error('The sportsbook is not connected to its database yet.');
  return supabase;
}

/** The league site's public lines file (owners list for invites, model notes). */
export const LEAGUE_LINES_URL = 'https://dac0009.github.io/FantasyFootballs/data/sportsbook/lines.json';
export const LEAGUE_SITE_URL = 'https://dac0009.github.io/FantasyFootballs/';

export type Member = {
  owner_id: string;
  user_id: string | null;
  display_name: string;
  is_commissioner: boolean;
  balance: number;
  joined_at: string | null;
};

export type BookState = {
  season: number;
  last_sync_at: string | null;
  last_sync_note: string | null;
  tip_url: string | null;
};

export type Line = {
  line_id: string;
  season: number;
  week: number;
  game_type: string | null;
  home_owner_id: string;
  away_owner_id: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_spread: number;
  total: number;
  home_ml: number;
  away_ml: number;
  spread_price: number;
  total_price: number;
  home_win_prob: number | null;
  lock_at: string | null;
  lock_game: string | null;
  status: 'open' | 'pulled' | 'final';
  home_score: number | null;
  away_score: number | null;
  winner: 'HOME' | 'AWAY' | 'TIE' | null;
};

export type Market = 'ml' | 'spread' | 'total';
export type Side = 'home' | 'away' | 'over' | 'under';

export type FeedLeg = {
  leg_no: number;
  line_id: string;
  market: Market;
  side: Side;
  point: number | null;
  price: number;
  result: 'pending' | 'won' | 'lost' | 'push' | 'void';
  week: number;
  home_owner_id: string;
  away_owner_id: string;
  home_team_name: string | null;
  away_team_name: string | null;
  lock_at: string | null;
  line_status: string;
  home_score: number | null;
  away_score: number | null;
};

export type FeedBet = {
  id: number;
  owner_id: string;
  display_name: string;
  season: number;
  stake: number;
  kind: 'single' | 'parlay';
  potential_payout: number;
  status: 'open' | 'won' | 'lost' | 'push' | 'void';
  payout: number | null;
  source: 'slip' | 'tail' | 'fade';
  source_bet_id: number | null;
  placed_at: string;
  settled_at: string | null;
  legs: FeedLeg[];
};

export type Standing = {
  owner_id: string;
  display_name: string;
  balance: number;
  topups: number;
  owed_to_pot: number;
  betting_net: number;
  net: number;
  settled: number;
  wins: number;
  losses: number;
  pushes: number;
  staked: number;
  season: number;
};

/** Numbers come back from Postgres bigint/numeric as strings; make them numbers. */
export function num<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const k of keys) {
    const v = out[k];
    if (v !== null && v !== undefined && v !== '') (out as Record<keyof T, unknown>)[k] = Number(v);
  }
  return out;
}

/** The server's own wording ("That game is locked.") is what people should see. */
export function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const text = String((error as { message: unknown }).message);
    return text.replace(/^.*?ERROR:\s*/, '');
  }
  return 'Something went wrong. Try again.';
}

export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Math.round(n).toLocaleString('en-US');
}

export function signed(n: number): string {
  const s = fmt(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : '0';
}

export function when(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}
