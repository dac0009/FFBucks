// Runs the real migration in embedded Postgres with simulated Supabase roles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { payout as jsPayout } from '../src/lib/odds.mjs';

const migration = readFileSync(new URL('../supabase/migrations/202611040001_sportsbook.sql', import.meta.url), 'utf8');
const U = {
  dom: '00000000-0000-0000-0000-00000000000d',
  alice: '00000000-0000-0000-0000-00000000000a',
  bob: '00000000-0000-0000-0000-00000000000b',
  carl: '00000000-0000-0000-0000-00000000000c',
  alice2: '00000000-0000-0000-0000-0000000000a2',
  stranger: '00000000-0000-0000-0000-0000000000ff',
};
const hours = (h) => new Date(Date.now() + h * 3600e3).toISOString();

function line(id, home, away, extra = {}) {
  return {
    line_id: id, matchup_id: id, season: 2026, week: 9, game_type: 'regular',
    home_owner_id: home, away_owner_id: away, home_team_name: `${home} FC`, away_team_name: `${away} FC`,
    home_spread: -6.5, total: 240.5, home_ml: -150, away_ml: 130, spread_price: -110, total_price: -110,
    home_expected: 123.5, away_expected: 117, home_win_prob: 0.58, posted_at: hours(-1),
    lock_at: hours(24), lock_game: 'JAX @ BAL', lock_source: 'rosters', ...extra,
  };
}

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    grant usage on schema public to anon,authenticated,service_role;
    insert into auth.users values ${Object.values(U).map((u) => `('${u}')`).join(',')};`);
  await db.exec(migration);
  const as = async (role, uid = '') => {
    await db.exec(`reset role; set role ${role};`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  };
  const su = () => db.exec('reset role;');
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (who, sql, params) => { await as('authenticated', U[who]); return one(sql, params); };
  const sync = async (payload) => { await as('service_role'); const r = await one('select public.sync_board($1::jsonb) r', [JSON.stringify(payload)]); await su(); return r.r; };
  const balance = async (owner) => { await su(); return Number((await one('select balance from public.members where owner_id=$1', [owner])).balance); };
  const bet = (who, legs, stake) => call(who, 'select public.place_bet($1::jsonb,$2) id', [JSON.stringify(legs), stake]).then((r) => Number(r.id));
  const status = async (id) => { await su(); return one('select status, payout::int, potential_payout::int from public.bets where id=$1', [id]); };
  return { db, as, su, one, call, sync, balance, bet, status };
}

async function league() {
  const t = await setup();
  // Dom joins with the code the migration printed; then invites everyone.
  await t.su();
  const domCode = (await t.one("select code from public.invites where owner_id='dominick-cifelli'")).code;
  await t.call('dom', 'select public.claim_invite($1)', [domCode.toLowerCase()]);
  const codes = {};
  for (const [who, owner] of [['alice', 'owner-a'], ['bob', 'owner-b'], ['carl', 'owner-c']]) {
    codes[who] = (await t.call('dom', 'select public.book_invite($1,$2) c', [owner, who])).c;
    await t.call(who, 'select public.claim_invite($1)', [codes[who]]);
  }
  await t.sync({
    season: 2026, season_complete: false,
    lines: [line('L1', 'owner-a', 'owner-b'), line('L2', 'owner-c', 'owner-d'),
      line('L3', 'owner-e', 'owner-f'), line('L4', 'owner-g', 'owner-h'),
      line('LOCKED', 'owner-i', 'owner-j', { lock_at: hours(-1) }),
      line('NOLOCK', 'owner-k', 'owner-l', { lock_at: null })],
    results: [],
  });
  return { ...t, codes };
}

test('payout math is exact and matches the app', async () => {
  const t = await setup();
  const cases = [[100, [-110]], [110, [-110]], [100, [150]], [100, [-110, -110]], [37, [-150, 130, -110, 250, -105, 400]], [1, [-110]]];
  for (const [stake, prices] of cases) {
    const r = await t.one('select public.book_payout($1,$2::int[]) p', [stake, prices]);
    assert.equal(Number(r.p), jsPayout(stake, prices), `${stake} @ ${prices}`);
  }
  assert.equal(jsPayout(100, [-110]), 190);
  assert.equal(jsPayout(110, [-110]), 210);
  assert.equal(jsPayout(100, [150]), 250);
  assert.equal(jsPayout(100, [-110, -110]), 364);
});

test('only members can see the book, and nobody can write tables directly', async () => {
  const t = await league();
  await t.as('anon');
  await assert.rejects(t.db.query('select * from public.lines'), /permission denied/);
  await assert.rejects(t.db.query('select public.place_bet($1::jsonb, 10)', ['[]']), /permission denied/);
  await t.as('authenticated', U.stranger);
  assert.equal((await t.db.query('select * from public.lines')).rows.length, 0);
  assert.equal((await t.db.query('select * from public.bet_feed')).rows.length, 0);
  assert.equal((await t.db.query('select * from public.book_state')).rows.length, 0);
  await assert.rejects(t.db.query(`select public.place_bet('[{"line_id":"L3","market":"ml","side":"home"}]'::jsonb, 10)`), /invite code/);
  await assert.rejects(t.db.query('select public.top_up()'), /invite code/);
  await t.as('authenticated', U.alice);
  assert.equal((await t.db.query('select * from public.lines')).rows.length, 6);
  await assert.rejects(t.db.query("update public.members set balance = 999999 where owner_id='owner-a'"), /permission denied/);
  await assert.rejects(t.db.query("insert into public.ledger(owner_id,season,kind,amount,balance_after) values ('owner-a',2026,'topup',5000,5000)"), /permission denied/);
  await assert.rejects(t.db.query('update public.lines set home_ml = 900'), /permission denied/);
  await assert.rejects(t.db.query("update public.book_state set tip_url = 'https://evil.test'"), /permission denied/);
  await assert.rejects(t.db.query("select public.sync_board('{\"season\":2026}'::jsonb)"), /permission denied/);
  await assert.rejects(t.db.query("select public.book_credit('owner-a', 5000, 'topup', null, 2026)"), /permission denied/);
  await assert.rejects(t.db.query("select public.book_close_season(2026)"), /permission denied/);
  assert.equal((await t.db.query('select * from public.invites')).rows.length, 0); // commissioner only
  await assert.rejects(t.db.query("select public.book_invite('owner-z','Z')"), /Commissioner only/);
  await assert.rejects(t.db.query("select public.pull_line('L1')"), /Commissioner only/);
  await assert.rejects(t.db.query("select public.set_tip_url('https://linktr.ee/x')"), /Commissioner only/);
});

test('invites: one-time codes, 1,000 free FFBucks once ever, re-invite moves the account', async () => {
  const t = await league();
  for (const owner of ['dominick-cifelli', 'owner-a', 'owner-b']) assert.equal(await t.balance(owner), 1000);
  await assert.rejects(t.call('stranger', 'select public.claim_invite($1)', [t.codes.alice]), /not valid/);
  const codeB = (await t.call('dom', 'select public.book_invite($1,$2) c', ['owner-z', 'Zed'])).c;
  await assert.rejects(t.call('alice', 'select public.claim_invite($1)', [codeB]), /already linked/);

  await t.bet('alice', [{ line_id: 'L3', market: 'ml', side: 'home' }], 250);
  // Alice lost her password: Dom re-invites her and she joins on a new login.
  const again = (await t.call('dom', 'select public.book_invite($1,$2) c', ['owner-a', 'Alice'])).c;
  await t.call('alice2', 'select public.claim_invite($1)', [again]);
  await t.su();
  const row = await t.one("select user_id, balance from public.members where owner_id='owner-a'");
  assert.equal(row.user_id, U.alice2);
  assert.equal(Number(row.balance), 750); // no second free grant, bets kept
  assert.equal(Number((await t.one("select count(*) n from public.ledger where owner_id='owner-a' and kind='free'")).n), 1);
  await assert.rejects(t.bet('alice', [{ line_id: 'L3', market: 'ml', side: 'home' }], 10), /invite code/);
});

test('placing bets: prices come from the line, balance and ledger move together', async () => {
  const t = await league();
  const id = await t.bet('bob', [{ line_id: 'L3', market: 'spread', side: 'away', price: 999 }], 110);
  await t.su();
  const leg = await t.one('select point::float, price from public.bet_legs where bet_id=$1', [id]);
  assert.deepEqual(leg, { point: 6.5, price: -110 }); // client-sent price ignored
  assert.deepEqual(await t.status(id), { status: 'open', payout: null, potential_payout: 210 });
  assert.equal(await t.balance('owner-b'), 890);
  const ledger = await t.one('select kind, amount::int, balance_after::int from public.ledger where bet_id=$1', [id]);
  assert.deepEqual(ledger, { kind: 'stake', amount: -110, balance_after: 890 });

  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }], 891), /Not enough FFBucks/);
  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }], 0), /at least 1/);
  await assert.rejects(t.bet('bob', [], 10), /empty/);
  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'prop', side: 'home' }], 10), /Unknown bet type/);
  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'total', side: 'home' }], 10), /Unknown bet type/);
  await assert.rejects(t.bet('bob', [{ line_id: 'NOPE', market: 'ml', side: 'home' }], 10), /does not exist/);
  // A failed bet charges nothing.
  assert.equal(await t.balance('owner-b'), 890);
  // No max bet: the whole bankroll is fine.
  await t.bet('bob', [{ line_id: 'L4', market: 'ml', side: 'away' }], 890);
  assert.equal(await t.balance('owner-b'), 0);
});

test('lock enforcement is server-side', async () => {
  const t = await league();
  await assert.rejects(t.bet('bob', [{ line_id: 'LOCKED', market: 'ml', side: 'home' }], 10), /locked/);
  await assert.rejects(t.bet('bob', [{ line_id: 'NOLOCK', market: 'ml', side: 'home' }], 10), /not open for betting yet/);
  // A Thursday pickup moves the lock earlier: once it passes, betting stops.
  await t.sync({ season: 2026, lines: [line('L3', 'owner-e', 'owner-f', { lock_at: hours(-0.01), lock_game: 'X @ Y' })], results: [] });
  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }], 10), /locked/);
  // ...and a passed lock never reopens, even if the roster changes back.
  await t.sync({ season: 2026, lines: [line('L3', 'owner-e', 'owner-f', { lock_at: hours(48) })], results: [] });
  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }], 10), /locked/);
  // A lock that has not passed can move later, and odds are never re-priced.
  await t.sync({ season: 2026, lines: [line('L4', 'owner-g', 'owner-h', { lock_at: hours(72), home_ml: -900, total: 1 })], results: [] });
  await t.su();
  const l4 = await t.one("select home_ml, total::float, lock_at > now() + interval '71 hours' moved from public.lines where line_id='L4'");
  assert.deepEqual(l4, { home_ml: -150, total: 240.5, moved: true });
  // A parlay with one locked leg is refused entirely, and nothing is charged.
  const before = await t.balance('owner-b');
  await assert.rejects(t.bet('bob', [{ line_id: 'L4', market: 'ml', side: 'home' }, { line_id: 'LOCKED', market: 'ml', side: 'home' }], 50), /locked/);
  assert.equal(await t.balance('owner-b'), before);
});

test('self-betting: on your own team to win or cover only', async () => {
  const t = await league();
  await t.bet('alice', [{ line_id: 'L1', market: 'ml', side: 'home' }], 10);
  await t.bet('alice', [{ line_id: 'L1', market: 'spread', side: 'home' }], 10);
  await t.bet('bob', [{ line_id: 'L1', market: 'spread', side: 'away' }], 10);
  await assert.rejects(t.bet('alice', [{ line_id: 'L1', market: 'ml', side: 'away' }], 10), /never against yourself/);
  await assert.rejects(t.bet('alice', [{ line_id: 'L1', market: 'spread', side: 'away' }], 10), /never against yourself/);
  await assert.rejects(t.bet('alice', [{ line_id: 'L1', market: 'total', side: 'under' }], 10), /Over\/unders/);
  await assert.rejects(t.bet('alice', [{ line_id: 'L1', market: 'total', side: 'over' }], 10), /Over\/unders/);
  // Hidden inside a parlay is still refused.
  await assert.rejects(t.bet('alice', [{ line_id: 'L3', market: 'ml', side: 'home' }, { line_id: 'L1', market: 'ml', side: 'away' }], 10), /never against yourself/);
});

test('parlays: 2 to 6 legs, never two from the same matchup, odds multiply', async () => {
  const t = await league();
  await t.sync({ season: 2026, lines: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].map((id, i) => line(id, `owner-p${i}`, `owner-q${i}`)), results: [] });
  const legs = (n) => ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].slice(0, n).map((line_id) => ({ line_id, market: 'spread', side: 'home' }));
  await assert.rejects(t.bet('bob', legs(7), 10), /at most 6/);
  await assert.rejects(t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }, { line_id: 'L3', market: 'total', side: 'over' }], 10), /same matchup/);
  const id = await t.bet('bob', legs(6), 10);
  await t.su();
  const b = await t.one('select kind, potential_payout::int from public.bets where id=$1', [id]);
  assert.deepEqual(b, { kind: 'parlay', potential_payout: jsPayout(10, Array(6).fill(-110)) });
});

test('grading: moneylines, spreads, totals, pushes, parlays, no double pay', async () => {
  const t = await league();
  await t.sync({ season: 2026, lines: [line('L5', 'owner-m', 'owner-n', { home_spread: -6, total: 240 }),
    line('L6', 'owner-o', 'owner-p', { total: 230 })], results: [] });
  const B = {};
  B.mlWin = await t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }], 150); // -150 -> 250
  B.mlLose = await t.bet('carl', [{ line_id: 'L3', market: 'ml', side: 'away' }], 100);
  B.spreadCover = await t.bet('carl', [{ line_id: 'L3', market: 'spread', side: 'home' }], 110); // home -6.5 wins by 7
  B.spreadPush = await t.bet('bob', [{ line_id: 'L5', market: 'spread', side: 'away' }], 100); // +6, loses by 6 -> push
  B.totalPush = await t.bet('bob', [{ line_id: 'L5', market: 'total', side: 'over' }], 100); // 240 exactly
  B.under = await t.bet('alice', [{ line_id: 'L3', market: 'total', side: 'under' }], 110); // 237 < 240.5
  B.parlayPushLeg = await t.bet('alice', [{ line_id: 'L3', market: 'ml', side: 'home' }, { line_id: 'L5', market: 'total', side: 'under' }], 100);
  B.parlayLost = await t.bet('carl', [{ line_id: 'L3', market: 'spread', side: 'home' }, { line_id: 'L4', market: 'ml', side: 'home' }], 100);
  B.parlayAllPush = await t.bet('dom', [{ line_id: 'L5', market: 'spread', side: 'home' }, { line_id: 'L6', market: 'total', side: 'over' }], 50);
  B.pending = await t.bet('dom', [{ line_id: 'L1', market: 'ml', side: 'away' }, { line_id: 'L3', market: 'ml', side: 'home' }], 40);

  const before = { a: await t.balance('owner-a'), b: await t.balance('owner-b'), c: await t.balance('owner-c'), d: await t.balance('dominick-cifelli') };
  const results = [
    { matchup_id: 'L3', week: 9, home_score: 122.0, away_score: 115.0, winner: 'HOME' },
    { matchup_id: 'L5', week: 9, home_score: 123.0, away_score: 117.0, winner: 'HOME' },
    { matchup_id: 'L4', week: 9, home_score: 100.0, away_score: 130.0, winner: 'AWAY' },
    { matchup_id: 'L6', week: 9, home_score: 115.0, away_score: 115.0, winner: 'TIE' },
    { matchup_id: 'L1', week: 9, home_score: null, away_score: null, winner: 'UNDECIDED' },
  ];
  const r = await t.sync({ season: 2026, lines: [], results });
  assert.equal(r.graded, 4);

  assert.deepEqual(await t.status(B.mlWin), { status: 'won', payout: 250, potential_payout: 250 });
  assert.equal((await t.status(B.mlLose)).status, 'lost');
  assert.deepEqual(await t.status(B.spreadCover), { status: 'won', payout: 210, potential_payout: 210 });
  assert.deepEqual(await t.status(B.spreadPush), { status: 'push', payout: 100, potential_payout: 190 });
  assert.equal((await t.status(B.totalPush)).status, 'push');
  assert.deepEqual(await t.status(B.under), { status: 'won', payout: 210, potential_payout: 210 });
  // L5 under pushed: the leg drops out and the parlay pays as a single at -150.
  assert.deepEqual(await t.status(B.parlayPushLeg), { status: 'won', payout: jsPayout(100, [-150]), potential_payout: jsPayout(100, [-150, -110]) });
  assert.deepEqual(await t.status(B.parlayLost), { status: 'lost', payout: 0, potential_payout: jsPayout(100, [-110, -150]) });
  assert.equal((await t.status(B.parlayAllPush)).status, 'push');
  // One leg still pending (L1 not final) and the other won: stays open.
  assert.equal((await t.status(B.pending)).status, 'open');

  assert.equal(await t.balance('owner-b'), before.b + 250 + 100 + 100);
  assert.equal(await t.balance('owner-a'), before.a + 210 + 166);
  assert.equal(await t.balance('owner-c'), before.c + 210);
  assert.equal(await t.balance('dominick-cifelli'), before.d + 50);

  // Running the same sync again pays nothing twice.
  const again = await t.sync({ season: 2026, lines: [], results });
  assert.equal(again.graded, 0);
  assert.equal(await t.balance('owner-b'), before.b + 450);

  // A late lost leg settles the open parlay as lost.
  await t.sync({ season: 2026, lines: [], results: [{ matchup_id: 'L1', week: 9, home_score: 130, away_score: 90, winner: 'HOME' }] });
  assert.equal((await t.status(B.pending)).status, 'lost');
  // Ties push moneylines.
  await t.sync({ season: 2026, lines: [line('T1', 'owner-r', 'owner-s')], results: [] });
  const tie = await t.bet('bob', [{ line_id: 'T1', market: 'ml', side: 'away' }], 100);
  await t.sync({ season: 2026, lines: [], results: [{ matchup_id: 'T1', week: 9, home_score: 111.1, away_score: 111.1, winner: 'TIE' }] });
  assert.equal((await t.status(tie)).status, 'push');
});

test('tail and fade: copy or take the other side, never against yourself', async () => {
  const t = await league();
  const over = await t.bet('bob', [{ line_id: 'L2', market: 'total', side: 'over' }], 50);
  const tail = Number((await t.call('alice', 'select public.tail_bet($1, 20) id', [over])).id);
  const fade = Number((await t.call('alice', 'select public.fade_bet($1, 30) id', [over])).id);
  await t.su();
  assert.deepEqual((await t.db.query('select b.source, b.source_bet_id::int src, l.market, l.side, l.point::float from public.bets b join public.bet_legs l on l.bet_id=b.id where b.id in ($1,$2) order by b.id', [tail, fade])).rows,
    [{ source: 'tail', src: over, market: 'total', side: 'over', point: 240.5 }, { source: 'fade', src: over, market: 'total', side: 'under', point: 240.5 }]);

  // Carl plays in L2: he can't fade or tail an over/under on his own game.
  await assert.rejects(t.call('carl', 'select public.fade_bet($1, 10)', [over]), /Over\/unders/);
  // Carl backs Alice; Alice can tail (her side) but can't fade (against herself).
  const backsAlice = await t.bet('carl', [{ line_id: 'L1', market: 'spread', side: 'home' }], 10);
  await assert.rejects(t.call('alice', 'select public.fade_bet($1, 10)', [backsAlice]), /never against yourself/);
  await t.call('alice', 'select public.tail_bet($1, 10)', [backsAlice]);
  // Fading a bet on Alice's opponent puts Alice on her own side: allowed.
  const backsBob = await t.bet('carl', [{ line_id: 'L1', market: 'ml', side: 'away' }], 10);
  await t.call('alice', 'select public.fade_bet($1, 10)', [backsBob]);
  await t.su();
  const faded = await t.one("select l.side, l.price from public.bets b join public.bet_legs l on l.bet_id=b.id where b.source='fade' and b.source_bet_id=$1", [backsBob]);
  assert.deepEqual(faded, { side: 'home', price: -150 });

  await assert.rejects(t.call('bob', 'select public.tail_bet($1, 10)', [over]), /your own bet/);
  const parlay = await t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }, { line_id: 'L4', market: 'ml', side: 'home' }], 10);
  await assert.rejects(t.call('alice', 'select public.fade_bet($1, 10)', [parlay]), /Only single bets/);
  await t.call('alice', 'select public.tail_bet($1, 10)', [parlay]);
  await t.su(); await t.db.exec("update public.lines set lock_at = now() - interval '1 minute' where line_id = 'L2'");
  await assert.rejects(t.call('dom', 'select public.tail_bet($1, 10)', [over]), /locked/);
});

test('pull a line: commissioner only, refunds every bet on it, no manual edits', async () => {
  const t = await league();
  const single = await t.bet('bob', [{ line_id: 'L2', market: 'ml', side: 'home' }], 100);
  const parlay = await t.bet('alice', [{ line_id: 'L2', market: 'ml', side: 'home' }, { line_id: 'L3', market: 'ml', side: 'home' }], 200);
  const other = await t.bet('alice', [{ line_id: 'L3', market: 'ml', side: 'away' }], 10);
  await assert.rejects(t.call('bob', "select public.pull_line('L2')"), /Commissioner only/);
  assert.equal((await t.call('dom', "select public.pull_line('L2') n")).n, 2);
  assert.deepEqual(await t.status(single), { status: 'void', payout: 100, potential_payout: 166 });
  assert.equal((await t.status(parlay)).status, 'void');
  assert.equal((await t.status(other)).status, 'open');
  assert.equal(await t.balance('owner-b'), 1000);
  assert.equal(await t.balance('owner-a'), 990);
  await assert.rejects(t.bet('bob', [{ line_id: 'L2', market: 'ml', side: 'home' }], 10), /pulled/);
  await assert.rejects(t.call('dom', "select public.pull_line('L2')"), /already pulled/);
  // A later result for a pulled line changes nothing.
  await t.sync({ season: 2026, lines: [line('L2', 'owner-c', 'owner-d')], results: [{ matchup_id: 'L2', week: 9, home_score: 150, away_score: 90, winner: 'HOME' }] });
  assert.equal((await t.status(single)).status, 'void');
  assert.equal(await t.balance('owner-b'), 1000);
});

test('top-ups, jackpot and a leaderboard ranked by net that top-ups cannot buy', async () => {
  const t = await league();
  for (let i = 0; i < 3; i++) await t.call('bob', 'select public.top_up()');
  await t.call('carl', 'select public.top_up()');
  assert.equal(await t.balance('owner-b'), 4000);
  // Bob bets big with his top-ups and wins 1,000 net; Alice wins 200 net with no top-ups.
  const big = await t.bet('bob', [{ line_id: 'L3', market: 'spread', side: 'home' }], 1100);
  const small = await t.bet('alice', [{ line_id: 'L3', market: 'spread', side: 'home' }], 220);
  await t.sync({ season: 2026, lines: [], results: [{ matchup_id: 'L3', week: 9, home_score: 140, away_score: 100, winner: 'HOME' }] });
  assert.equal((await t.status(big)).payout, 2100);
  assert.equal((await t.status(small)).payout, 420);

  await t.as('authenticated', U.carl);
  const board = (await t.db.query('select owner_id, net::int, betting_net::int, owed_to_pot::int, topups, balance::int from public.leaderboard')).rows;
  assert.deepEqual(board[0], { owner_id: 'owner-a', net: 200, betting_net: 200, owed_to_pot: 0, topups: 0, balance: 1200 });
  const bob = board.find((r) => r.owner_id === 'owner-b');
  assert.deepEqual(bob, { owner_id: 'owner-b', net: -2000, betting_net: 1000, owed_to_pot: 3000, topups: 3, balance: 5000 });
  assert.equal(Number((await t.one('select amount from public.jackpot')).amount), 4000);
  const feed = (await t.db.query('select id, display_name, status, legs from public.bet_feed order by id')).rows;
  assert.equal(feed.length, 2);
  assert.equal(feed[0].legs[0].home_team_name, 'owner-e FC');
});

test('season end: standings and pot saved, fresh leaderboard, balances carry over', async () => {
  const t = await league();
  await t.call('bob', 'select public.top_up()');
  await t.bet('bob', [{ line_id: 'L3', market: 'ml', side: 'home' }], 300);
  const open = await t.bet('alice', [{ line_id: 'L4', market: 'ml', side: 'home' }], 100);
  const r = await t.sync({ season: 2026, season_complete: true, lines: [], results: [{ matchup_id: 'L3', week: 9, home_score: 120, away_score: 100, winner: 'HOME' }] });
  assert.equal(r.season_closed, true);
  // A game that never got a result is refunded when the season closes.
  assert.equal((await t.status(open)).status, 'void');
  await t.su();
  const archive = await t.one('select season, jackpot::int, standings from public.season_archive');
  assert.equal(archive.season, 2026);
  assert.equal(archive.jackpot, 1000);
  assert.equal(archive.standings.find((s) => s.owner_id === 'owner-b').owed_to_pot, 1000);
  assert.equal(Number((await t.one('select season from public.book_state')).season), 2027);
  assert.equal(await t.balance('owner-b'), 2000 - 300 + 500);
  await t.as('authenticated', U.alice);
  assert.equal(Number((await t.one('select amount from public.jackpot')).amount), 0);
  const fresh = (await t.db.query('select net::int, owed_to_pot::int from public.leaderboard')).rows;
  assert.ok(fresh.every((row) => row.net === 0 && row.owed_to_pot === 0));
  // Syncing the old file again doesn't re-close or post old lines; next season's lines post.
  assert.equal((await t.sync({ season: 2026, season_complete: true, lines: [line('OLD', 'owner-a', 'owner-b')], results: [] })).season_closed, false);
  await t.sync({ season: 2027, lines: [line('N1', 'owner-a', 'owner-b', { season: 2027, week: 1 })], results: [] });
  await t.su();
  assert.deepEqual((await t.db.query("select line_id from public.lines where line_id in ('OLD','N1')")).rows, [{ line_id: 'N1' }]);
  const top = await t.call('bob', 'select public.top_up() b');
  assert.equal(Number(top.b), 3200);
  await t.su();
  assert.equal(Number((await t.one("select season from public.ledger where kind='topup' order by id desc limit 1")).season), 2027);
});

test('tip link: commissioner edits it, only https links, never touches FFBucks', async () => {
  const t = await league();
  const before = await t.balance('dominick-cifelli');
  assert.equal((await t.call('dom', "select public.set_tip_url('  https://linktr.ee/dom  ') u")).u, 'https://linktr.ee/dom');
  await t.as('authenticated', U.alice);
  assert.equal((await t.one('select tip_url from public.book_state')).tip_url, 'https://linktr.ee/dom');
  for (const bad of ['http://linktr.ee/dom', 'javascript:alert(1)', 'https://x.test/a b', 'https://x.test/"x', `https://x.test/${'a'.repeat(300)}`]) {
    await assert.rejects(t.call('dom', 'select public.set_tip_url($1)', [bad]), /must start with https/, bad);
  }
  assert.equal((await t.call('dom', "select public.set_tip_url('') u")).u, null);
  await t.su();
  assert.equal((await t.one('select tip_url from public.book_state')).tip_url, null);
  assert.equal(await t.balance('dominick-cifelli'), before);
  assert.equal(Number((await t.one("select count(*) n from public.ledger where owner_id='dominick-cifelli'")).n), 1);
});
