import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db, fmt, message, when, type FeedBet } from '../lib/supabase';
import { betBlockedReason, formatPrice, marketLabel, oppositeSide } from '../lib/odds.mjs';
import { useBook } from '../lib/book';

const RESULT: Record<string, string> = { open: 'Open', won: 'Won', lost: 'Lost', push: 'Push', void: 'Refunded' };

export default function BetCard({ bet, onChanged, actions = true }: { bet: FeedBet; onChanged?: () => void; actions?: boolean }) {
  const { me, refresh } = useBook();
  const [mode, setMode] = useState<'tail' | 'fade' | null>(null);
  const [stake, setStake] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mine = me?.owner_id === bet.owner_id;
  const asLine = (leg: FeedBet['legs'][number]) => ({
    status: leg.line_status, lock_at: leg.lock_at, home_owner_id: leg.home_owner_id, away_owner_id: leg.away_owner_id,
  });
  const reason = (kind: 'tail' | 'fade') => {
    if (!me) return 'Sign in first.';
    if (mine) return 'That is your own bet.';
    if (kind === 'fade' && bet.kind !== 'single') return 'Only single bets can be faded.';
    for (const leg of bet.legs) {
      const side = kind === 'fade' ? oppositeSide(leg.side) : leg.side;
      const why = betBlockedReason(me.owner_id, asLine(leg), leg.market, side);
      if (why) return why;
    }
    return null;
  };
  const tailWhy = actions ? reason('tail') : 'x';
  const fadeWhy = actions ? reason('fade') : 'x';

  async function go() {
    if (!mode) return;
    const amount = Number(stake);
    if (!Number.isInteger(amount) || amount < 1) { setError('Bet at least 1 FFBuck.'); return; }
    setBusy(true); setError('');
    const { error: e } = await db().rpc(mode === 'tail' ? 'tail_bet' : 'fade_bet', { p_bet_id: bet.id, p_stake: amount });
    setBusy(false);
    if (e) { setError(message(e)); return; }
    setMode(null); setStake('');
    await refresh();
    onChanged?.();
  }

  const profit = bet.status === 'open' ? null : Number(bet.payout ?? 0) - Number(bet.stake);
  return (
    <article className={`bet bet-${bet.status}`}>
      <header className="bet-head">
        <Link to={`/p/${bet.owner_id}`} className="bet-who">{bet.display_name}</Link>
        <span className="bet-meta">
          {bet.source === 'tail' ? 'tailed' : bet.source === 'fade' ? 'faded' : bet.kind === 'parlay' ? `${bet.legs.length}-leg parlay` : 'single'}
          {' '}{when(bet.placed_at)}
        </span>
        <span className={`pill pill-${bet.status}`}>{RESULT[bet.status]}</span>
      </header>
      <ul className="legs">
        {bet.legs.map((leg) => (
          <li key={leg.leg_no} className={`leg leg-${leg.result}`}>
            <span className="leg-pick">{marketLabel(leg)}</span>
            <span className="leg-price">{formatPrice(leg.price)}</span>
            <span className="leg-game">
              {leg.away_team_name} at {leg.home_team_name}
              {leg.home_score !== null && leg.away_score !== null ? `, final ${Number(leg.away_score)}–${Number(leg.home_score)}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <footer className="bet-foot">
        <span>Risk <b>{fmt(bet.stake)}</b></span>
        {bet.status === 'open'
          ? <span>To win <b>{fmt(bet.potential_payout - bet.stake)}</b></span>
          : <span className={profit! > 0 ? 'up' : profit! < 0 ? 'down' : ''}>Result <b>{profit! > 0 ? '+' : ''}{fmt(profit)}</b></span>}
        {actions && !mine && bet.status === 'open' && (
          <span className="bet-actions">
            <button className="btn-small" disabled={!!tailWhy} title={tailWhy ?? 'Copy this bet'} onClick={() => { setMode('tail'); setError(''); }}>Tail</button>
            <button className="btn-small" disabled={!!fadeWhy} title={fadeWhy ?? 'Take the other side at the same line'} onClick={() => { setMode('fade'); setError(''); }}>Fade</button>
          </span>
        )}
      </footer>
      {mode && (
        <div className="inline-form">
          <label>
            {mode === 'tail' ? 'Tail with' : 'Fade with'}
            <input inputMode="numeric" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9]/g, ''))} placeholder="FFBucks" autoFocus />
          </label>
          <button className="btn" disabled={busy} onClick={go}>{mode === 'tail' ? 'Place tail' : 'Place fade'}</button>
          <button className="linkish" onClick={() => setMode(null)}>Cancel</button>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      )}
    </article>
  );
}
