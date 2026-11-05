import test from 'node:test';
import assert from 'node:assert/strict';
import {
  payout, decimalOdds, americanFromDecimal, formatPoint, priceLeg, betBlockedReason,
  slipProblem, gradeLeg, settle, oppositeSide, marketLabel, profileStats, bankrollSeries,
  countdown, safeTipUrl,
} from '../src/lib/odds.mjs';
import { prepare, sync } from '../scripts/sync.mjs';

const line = {
  line_id: 'L1', status: 'open', lock_at: '2099-01-01T00:00:00Z', home_owner_id: 'a', away_owner_id: 'b',
  home_team_name: 'Home FC', away_team_name: 'Away FC',
  home_spread: -6.5, total: 240.5, home_ml: -150, away_ml: 130, spread_price: -110, total_price: -110,
};

test('odds math', () => {
  assert.equal(decimalOdds(-110), 210 / 110);
  assert.equal(decimalOdds(150), 2.5);
  assert.equal(payout(100, [-110]), 190);
  assert.equal(payout(100, [-110, -110]), 364);
  assert.equal(payout(100, []), 100);
  assert.equal(americanFromDecimal(2.5), 150);
  assert.equal(americanFromDecimal(210 / 110), -110);
  assert.equal(formatPoint(0), 'PK');
  assert.equal(formatPoint(6.5), '+6.5');
  assert.throws(() => payout(10, [50]), /bad price/);
});

test('legs are priced from the line', () => {
  assert.deepEqual(priceLeg(line, 'spread', 'away'), { point: 6.5, price: -110 });
  assert.deepEqual(priceLeg({ ...line, home_spread: 0 }, 'spread', 'away'), { point: 0, price: -110 });
  assert.deepEqual(priceLeg(line, 'ml', 'home'), { point: null, price: -150 });
  assert.deepEqual(priceLeg(line, 'total', 'under'), { point: 240.5, price: -110 });
  assert.equal(marketLabel({ ...line, market: 'spread', side: 'away', point: 6.5 }), 'Away FC +6.5');
  assert.equal(oppositeSide('over'), 'under');
});

test('slip rules mirror the server', () => {
  assert.equal(betBlockedReason('z', line, 'total', 'over'), null);
  assert.equal(betBlockedReason('a', line, 'ml', 'home'), null);
  assert.match(betBlockedReason('a', line, 'spread', 'away'), /never against yourself/);
  assert.match(betBlockedReason('b', line, 'total', 'under'), /Over\/unders/);
  assert.match(betBlockedReason('z', { ...line, lock_at: '2000-01-01T00:00:00Z' }, 'ml', 'home'), /locked/);
  assert.match(betBlockedReason('z', { ...line, lock_at: null }, 'ml', 'home'), /not open/);
  assert.match(betBlockedReason('z', { ...line, status: 'pulled' }, 'ml', 'home'), /pulled/);
  assert.match(betBlockedReason('z', { ...line, status: 'final' }, 'ml', 'home'), /graded/);
  const leg = { line_id: 'L1' };
  assert.equal(slipProblem([leg], 10, 100), null);
  assert.match(slipProblem([], 10, 100), /empty/);
  assert.match(slipProblem([leg, leg], 10, 100), /same matchup/);
  assert.match(slipProblem(Array.from({ length: 7 }, (_, i) => ({ line_id: `L${i}` })), 10, 100), /at most 6/);
  assert.match(slipProblem([leg], 101, 100), /Not enough/);
  assert.match(slipProblem([leg], 0.5, 100), /at least 1/);
});

test('grading and settling mirror the server', () => {
  assert.equal(gradeLeg('spread', 'away', 6, 123, 117, 'HOME'), 'push');
  assert.equal(gradeLeg('spread', 'home', -6.5, 123.1, 116.6, 'HOME'), 'push'); // wins by exactly 6.5
  assert.equal(gradeLeg('spread', 'home', -6.5, 123.0, 116.6, 'HOME'), 'lost');
  assert.equal(gradeLeg('spread', 'home', -6.5, 123.2, 116.6, 'HOME'), 'won');
  assert.equal(gradeLeg('total', 'over', 240, 120.1, 119.9, 'HOME'), 'push');
  assert.equal(gradeLeg('total', 'under', 240.5, 120.1, 119.9, 'HOME'), 'won');
  assert.equal(gradeLeg('ml', 'away', null, 100, 100, 'TIE'), 'push');
  assert.equal(gradeLeg('ml', 'away', null, 90, 100, 'AWAY'), 'won');
  assert.deepEqual(settle(100, [{ result: 'won', price: -150 }, { result: 'push', price: -110 }]), { status: 'won', payout: 166 });
  assert.deepEqual(settle(100, [{ result: 'push', price: -150 }, { result: 'push', price: -110 }]), { status: 'push', payout: 100 });
  assert.deepEqual(settle(100, [{ result: 'won', price: -150 }, { result: 'lost', price: -110 }]), { status: 'lost', payout: 0 });
  assert.deepEqual(settle(100, [{ result: 'won', price: -150 }, { result: 'pending', price: -110 }]), { status: 'open', payout: null });
});

test('profile numbers', () => {
  const bets = [
    { id: 1, stake: 100, status: 'won', payout: 250 },
    { id: 2, stake: 200, status: 'lost', payout: 0 },
    { id: 3, stake: 50, status: 'push', payout: 50 },
    { id: 4, stake: 10, status: 'open', payout: null },
    { id: 5, stake: 20, status: 'won', payout: 38 },
  ];
  const s = profileStats(bets);
  assert.deepEqual({ w: s.wins, l: s.losses, p: s.pushes, o: s.open, staked: s.staked, net: s.net },
    { w: 2, l: 1, p: 1, o: 1, staked: 370, net: -32 });
  assert.equal(s.roi, -32 / 370);
  assert.equal(s.best.id, 1);
  assert.equal(s.worst.id, 2);
  const empty = profileStats([]);
  assert.equal(empty.roi, null);
  assert.equal(empty.best, null);
  assert.deepEqual(bankrollSeries([{ id: 2, created_at: 'b', balance_after: 900, kind: 'stake' }, { id: 1, created_at: 'a', balance_after: 1000, kind: 'free' }]).map((p) => p.balance), [1000, 900]);
});

test('countdowns and the tip link', () => {
  const now = Date.parse('2026-11-05T00:00:00Z');
  assert.equal(countdown(null, now), 'Not open yet');
  assert.equal(countdown('2026-11-04T23:59:59Z', now), 'Locked');
  assert.equal(countdown('2026-11-06T03:00:00Z', now), '1d 3h');
  assert.equal(countdown('2026-11-05T02:05:00Z', now), '2h 5m');
  assert.equal(countdown('2026-11-05T00:04:09Z', now), '4m 09s');
  assert.equal(safeTipUrl(' https://linktr.ee/dom '), 'https://linktr.ee/dom');
  assert.equal(safeTipUrl('http://linktr.ee/dom'), null);
  assert.equal(safeTipUrl('javascript:alert(1)'), null);
  assert.equal(safeTipUrl('https://x.test/"onmouseover=1'), null);
  assert.equal(safeTipUrl(''), null);
  assert.equal(safeTipUrl(null), null);
});

const file = {
  schema: 1, season: 2026, week: 9, season_complete: false, owners: [{ owner_id: 'a' }],
  lines: [{ ...line, season: 2026, week: 9, nfl_weeks: [9], home_team_id: 3, lock_game: 'JAX @ BAL', lock_source: 'rosters' }],
  results: [{ matchup_id: 'x', week: 8, home_score: 1, away_score: 2, winner: 'AWAY' }],
};

test('sync checks the file and sends only what the database reads', async () => {
  const sent = prepare(file);
  assert.equal(sent.lines[0].home_team_id, undefined);
  assert.equal(sent.lines[0].status, undefined);
  assert.equal(sent.lines[0].lock_game, 'JAX @ BAL');
  assert.equal(sent.owners, undefined);
  assert.throws(() => prepare({ ...file, schema: 2 }), /schema/);
  assert.throws(() => prepare({ ...file, lines: [{ ...file.lines[0], home_ml: 'x' }] }), /bad home_ml/);
  assert.throws(() => prepare({ ...file, lines: [{ ...file.lines[0], home_owner_id: '' }] }), /missing home_owner_id/);

  const calls = [];
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: { graded: 1 }, error: null }; } };
  const fetchImpl = async (url) => { calls.push(['fetch', url]); return { ok: true, status: 200, json: async () => file }; };
  const result = await sync({ env: { LINES_URL: 'https://example.test/lines.json' }, fetchImpl, client });
  assert.deepEqual(result, { season: 2026, lines: 1, graded: 1 });
  assert.match(calls[0][1], /^https:\/\/example\.test\/lines\.json\?t=\d+$/);
  assert.equal(calls[1][0], 'sync_board');

  await assert.rejects(sync({ env: {}, fetchImpl }), /SUPABASE_URL and SUPABASE_SECRET_KEY/);
  const failing = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
  await assert.rejects(sync({ env: {}, fetchImpl, client: failing }), /sync_board failed: boom/);
  await assert.rejects(sync({ env: {}, client, fetchImpl: async () => ({ ok: false, status: 500 }) }), /HTTP 500/);
  // Before the league site has posted any lines, the sync quietly does nothing.
  assert.deepEqual(await sync({ env: {}, client, fetchImpl: async () => ({ ok: false, status: 404 }) }), { skipped: 'no lines posted yet' });
});
