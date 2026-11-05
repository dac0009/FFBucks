import { useCallback, useEffect, useMemo, useState } from 'react';
import { db, fmt, message, num, when, type Line, type Market, type Side } from '../lib/supabase';
import { useBook, useNow } from '../lib/book';
import {
  MAX_LEGS, americanFromDecimal, betBlockedReason, countdown, decimalOdds, formatPoint, formatPrice,
  payout, priceLeg, slipProblem,
} from '../lib/odds.mjs';
import Jackpot from '../components/Jackpot';

type Pick = { line_id: string; market: Market; side: Side; price: number; point: number | null; label: string; game: string };

const NUMERIC: (keyof Line)[] = ['season', 'week', 'home_spread', 'total', 'home_ml', 'away_ml', 'spread_price',
  'total_price', 'home_win_prob', 'home_score', 'away_score'];

function pickLabel(line: Line, market: Market, side: Side, point: number | null) {
  const team = side === 'home' ? line.home_team_name : line.away_team_name;
  if (market === 'ml') return `${team} to win`;
  if (market === 'spread') return `${team} ${formatPoint(point ?? 0)}`;
  return `${side === 'over' ? 'Over' : 'Under'} ${line.total}`;
}

export default function Board() {
  const { me, state, jackpot, refresh } = useBook();
  const now = useNow(1000);
  const [lines, setLines] = useState<Line[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [slip, setSlip] = useState<Pick[]>([]);
  const [stake, setStake] = useState('');
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState('');
  const [busy, setBusy] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);

  const load = useCallback(async () => {
    if (!state) return;
    const { data, error: e } = await db().from('lines').select('*').eq('season', state.season)
      .order('week', { ascending: false }).order('lock_at', { ascending: true, nullsFirst: false });
    if (e) { setError(message(e)); return; }
    const rows = (data ?? []).map((r) => num(r as Line, NUMERIC));
    const week = rows.length ? Math.max(...rows.map((r) => r.week)) : null;
    setLines(rows.filter((r) => r.week === week));
    setLoaded(true);
  }, [state]);

  useEffect(() => { load(); const id = window.setInterval(load, 60_000); return () => window.clearInterval(id); }, [load]);

  // Drop picks whose game has locked while the slip was open.
  useEffect(() => {
    setSlip((s) => s.filter((p) => {
      const line = lines.find((l) => l.line_id === p.line_id);
      return line && !betBlockedReason(me?.owner_id, line, p.market, p.side, now);
    }));
  }, [lines, me, now]);

  const week = lines[0]?.week;
  const stakeNum = Number(stake || 0);
  const prices = slip.map((p) => p.price);
  const toWin = slip.length && stakeNum > 0 ? payout(stakeNum, prices) - stakeNum : 0;
  const parlayPrice = slip.length > 1 ? americanFromDecimal(prices.reduce((acc, p) => acc * decimalOdds(p), 1)) : null;

  function toggle(line: Line, market: Market, side: Side) {
    setPlaced(''); setError('');
    const existing = slip.find((p) => p.line_id === line.line_id);
    if (existing && existing.market === market && existing.side === side) {
      setSlip(slip.filter((p) => p !== existing));
      return;
    }
    const why = betBlockedReason(me?.owner_id, line, market, side, now);
    if (why) { setError(why); return; }
    const { point, price } = priceLeg(line, market, side);
    const pick: Pick = { line_id: line.line_id, market, side, point, price, label: pickLabel(line, market, side, point),
      game: `${line.away_team_name} at ${line.home_team_name}` };
    const rest = slip.filter((p) => p.line_id !== line.line_id);
    if (rest.length >= MAX_LEGS) { setError(`Parlays can have at most ${MAX_LEGS} legs.`); return; }
    setSlip([...rest, pick]);
  }

  async function place() {
    if (!me) return;
    const problem = slipProblem(slip, stakeNum, me.balance);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    const { error: e } = await db().rpc('place_bet', {
      p_legs: slip.map(({ line_id, market, side }) => ({ line_id, market, side })),
      p_stake: stakeNum,
    });
    setBusy(false);
    if (e) { setError(message(e)); return; }
    setPlaced(slip.length > 1 ? `Parlay placed: ${fmt(stakeNum)} to win ${fmt(toWin)}.` : `Bet placed: ${fmt(stakeNum)} to win ${fmt(toWin)}.`);
    setSlip([]); setStake('');
    await refresh();
  }

  const picked = (line: Line, market: Market, side: Side) =>
    slip.some((p) => p.line_id === line.line_id && p.market === market && p.side === side);

  const openCount = useMemo(() => lines.filter((l) => l.status === 'open' && l.lock_at && Date.parse(l.lock_at) > now).length, [lines, now]);

  return (
    <div className="board-layout">
      <div className="board-main">
        <Jackpot amount={jackpot} season={state?.season} />
        <div className="board-head">
          <h1>{week ? `Week ${week} lines` : 'Lines'}</h1>
          <p className="muted">
            {loaded && lines.length === 0 && 'No lines yet. They post after the Tuesday data refresh.'}
            {lines.length > 0 && `${openCount} of ${lines.length} games open. Each game locks at the first kickoff of any player on either roster.`}
          </p>
        </div>
        <div className="lines">
          {lines.map((line) => {
            const locked = !line.lock_at || Date.parse(line.lock_at) <= now || line.status !== 'open';
            const mine = me && (me.owner_id === line.home_owner_id || me.owner_id === line.away_owner_id);
            const btn = (market: Market, side: Side, top: string, bottom: string) => {
              const why = betBlockedReason(me?.owner_id, line, market, side, now);
              return (
                <button
                  className={`odds${picked(line, market, side) ? ' on' : ''}`}
                  disabled={!!why}
                  title={why ?? 'Add to slip'}
                  aria-pressed={picked(line, market, side)}
                  onClick={() => toggle(line, market, side)}
                >
                  {top && <span className="odds-top">{top}</span>}
                  <span className="odds-price">{bottom}</span>
                </button>
              );
            };
            const row = (side: 'away' | 'home') => {
              const name = side === 'home' ? line.home_team_name : line.away_team_name;
              const spread = side === 'home' ? line.home_spread : -line.home_spread || 0;
              const score = side === 'home' ? line.home_score : line.away_score;
              const won = line.winner && line.winner.toLowerCase() === side;
              return (
                <div className="game-row">
                  <span className={`team${won ? ' won' : ''}`}>
                    {name}{score !== null && <b className="score">{score}</b>}
                  </span>
                  {btn('spread', side, formatPoint(spread), formatPrice(line.spread_price))}
                  {btn('total', side === 'away' ? 'over' : 'under', `${side === 'away' ? 'O' : 'U'} ${line.total}`, formatPrice(line.total_price))}
                  {btn('ml', side, '', formatPrice(side === 'home' ? line.home_ml : line.away_ml))}
                </div>
              );
            };
            return (
              <section key={line.line_id} className={`game${locked ? ' locked' : ''}${mine ? ' mine' : ''}`}>
                <header className="game-head">
                  <span className={`lock${locked ? ' is-locked' : ''}`}>
                    {line.status === 'pulled' ? 'Pulled, bets refunded'
                      : line.status === 'final' ? 'Final'
                      : locked ? 'Locked' : `Locks in ${countdown(line.lock_at, now)}`}
                  </span>
                  {line.lock_game && line.status === 'open' && <span className="muted">{line.lock_game}, {when(line.lock_at)}</span>}
                  {mine && <span className="pill">Your game</span>}
                </header>
                <div className="game-cols" aria-hidden="true"><span /><span>Spread</span><span>Total</span><span>Money</span></div>
                {row('away')}
                {row('home')}
              </section>
            );
          })}
        </div>
      </div>

      <aside className={`slip${slipOpen ? ' open' : ''}`} aria-label="Bet slip">
        <button className="slip-handle" onClick={() => setSlipOpen(!slipOpen)}>
          Bet slip {slip.length > 0 && <span className="count">{slip.length}</span>}
        </button>
        <div className="slip-body">
          {slip.length === 0 && !placed && <p className="empty">Tap any price to add it. Add up to six games for a parlay.</p>}
          {placed && <p className="ok" role="status">{placed}</p>}
          <ul className="slip-legs">
            {slip.map((p) => (
              <li key={p.line_id}>
                <div>
                  <b>{p.label}</b> <span className="price">{formatPrice(p.price)}</span>
                  <div className="muted small">{p.game}</div>
                </div>
                <button className="x" aria-label={`Remove ${p.label}`} onClick={() => setSlip(slip.filter((s) => s !== p))}>×</button>
              </li>
            ))}
          </ul>
          {slip.length > 0 && (
            <div className="stack">
              {parlayPrice !== null && <p className="parlay">{slip.length}-leg parlay at {formatPrice(parlayPrice)}</p>}
              <label>Stake
                <input inputMode="numeric" value={stake} placeholder="FFBucks" onChange={(e) => setStake(e.target.value.replace(/[^0-9]/g, ''))} />
              </label>
              <div className="quick">
                {[50, 100, 250].map((n) => <button key={n} onClick={() => setStake(String(n))}>{n}</button>)}
                <button onClick={() => setStake(String(me?.balance ?? 0))}>All in</button>
              </div>
              <p className="towin">To win <b>{fmt(toWin)}</b> <span className="muted">(returns {fmt(stakeNum + toWin)})</span></p>
              <button className="btn" disabled={busy || !stakeNum} onClick={place}>
                {slip.length > 1 ? 'Place parlay' : 'Place bet'}
              </button>
              <button className="linkish" onClick={() => setSlip([])}>Clear slip</button>
            </div>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </aside>
    </div>
  );
}
