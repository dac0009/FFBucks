// Pulls the league site's public data/sportsbook/lines.json and hands it to
// the sportsbook database's sync_board function, which grades finished games,
// posts new lines and moves lock times. Runs from the "Sync sportsbook"
// GitHub Actions workflow. Never touches ESPN.
//
// Needs two GitHub secrets: SUPABASE_URL and SUPABASE_SECRET_KEY.
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export const DEFAULT_LINES_URL = 'https://dac0009.github.io/FantasyFootballs/data/sportsbook/lines.json';

const LINE_KEYS = ['line_id', 'season', 'week', 'game_type', 'home_owner_id', 'away_owner_id', 'home_team_name',
  'away_team_name', 'home_spread', 'total', 'home_ml', 'away_ml', 'spread_price', 'total_price',
  'home_expected', 'away_expected', 'home_win_prob', 'posted_at', 'lock_at', 'lock_game', 'lock_source'];

/** Check the file looks right and keep only what the database reads. */
export function prepare(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('lines.json is not a JSON object');
  if (payload.schema !== 1) throw new Error(`unexpected lines.json schema ${payload.schema}`);
  if (!Number.isInteger(payload.season)) throw new Error('lines.json has no season');
  if (!Array.isArray(payload.lines) || !Array.isArray(payload.results)) throw new Error('lines.json is missing lines or results');
  for (const line of payload.lines) {
    for (const key of ['line_id', 'home_owner_id', 'away_owner_id']) {
      if (typeof line[key] !== 'string' || !line[key]) throw new Error(`a line is missing ${key}`);
    }
    for (const key of ['home_spread', 'total', 'home_ml', 'away_ml', 'spread_price', 'total_price']) {
      if (typeof line[key] !== 'number' || !Number.isFinite(line[key])) throw new Error(`line ${line.line_id} has a bad ${key}`);
    }
  }
  return {
    season: payload.season,
    season_complete: payload.season_complete === true,
    lines: payload.lines.map((line) => Object.fromEntries(LINE_KEYS.map((k) => [k, line[k] ?? null]))),
    results: payload.results.map(({ matchup_id, week, home_score, away_score, winner }) => ({ matchup_id, week, home_score, away_score, winner })),
  };
}

export async function sync({ env = process.env, fetchImpl = fetch, client } = {}) {
  const url = env.LINES_URL || DEFAULT_LINES_URL;
  if (!client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY secrets are required.');
    }
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  }
  const response = await fetchImpl(`${url}?t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (response.status === 404) return { skipped: 'no lines posted yet' };
  if (!response.ok) throw new Error(`could not read ${url} (HTTP ${response.status})`);
  const payload = prepare(await response.json());
  const { data, error } = await client.rpc('sync_board', { p: payload });
  if (error) throw new Error(`sync_board failed: ${error.message}`);
  return { season: payload.season, lines: payload.lines.length, ...data };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  sync()
    .then((result) => console.log('Synced:', JSON.stringify(result)))
    .catch((error) => { console.error(`SYNC FAILED: ${error.message}`); process.exit(1); });
}
