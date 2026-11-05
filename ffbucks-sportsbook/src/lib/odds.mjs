// Odds math and bet rules used by the app for display. The database
// (supabase/migrations) is the authority and repeats every check; these
// mirror it exactly so the slip shows what the server will actually pay.

export const MAX_LEGS = 6;
export const TOP_UP = 1000;

/** Exact price as a fraction: -110 -> 210/110, +150 -> 250/100. */
export function priceFraction(price) {
  if (!Number.isInteger(price) || (price > -100 && price < 100)) throw new Error(`bad price ${price}`);
  return price > 0 ? [BigInt(price + 100), 100n] : [BigInt(100 - price), BigInt(-price)];
}

export function decimalOdds(price) {
  const [num, den] = priceFraction(price);
  return Number(num) / Number(den);
}

/** Total returned (stake included), rounded down, for a stake at these prices. */
export function payout(stake, prices) {
  let num = BigInt(stake);
  let den = 1n;
  for (const price of prices) {
    const [n, d] = priceFraction(price);
    num *= n;
    den *= d;
  }
  return Number(num / den);
}

/** Parlay price shown in American odds (rounded, display only). */
export function americanFromDecimal(decimal) {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return -Math.round(100 / (decimal - 1));
}

export function formatPrice(price) {
  return price > 0 ? `+${price}` : `${price}`;
}

export function formatPoint(point) {
  if (point === 0) return 'PK';
  return point > 0 ? `+${point}` : `${point}`;
}

/** The point and price a leg gets from a posted line. */
export function priceLeg(line, market, side) {
  if (market === 'ml') return { point: null, price: side === 'home' ? line.home_ml : line.away_ml };
  if (market === 'spread') {
    const home = Number(line.home_spread);
    return { point: side === 'home' ? home : -home || 0, price: line.spread_price };
  }
  return { point: Number(line.total), price: line.total_price };
}

/** null if allowed, otherwise the reason (same wording as the server). */
export function betBlockedReason(ownerId, line, market, side, now = Date.now()) {
  if (line.status === 'pulled') return 'That line was pulled.';
  if (line.status !== 'open') return 'That game is already graded.';
  if (!line.lock_at) return 'That line is not open for betting yet.';
  if (now >= Date.parse(line.lock_at)) return 'That game is locked.';
  const own = ownerId === line.home_owner_id ? 'home' : ownerId === line.away_owner_id ? 'away' : null;
  if (own) {
    if (market === 'total') return 'Over/unders are not allowed on your own game.';
    if (side !== own) return 'You can bet on your own team to win or cover, never against yourself.';
  }
  return null;
}

export function oppositeSide(side) {
  return { home: 'away', away: 'home', over: 'under', under: 'over' }[side];
}

/** Slip-level check before sending. Returns a reason or null. */
export function slipProblem(legs, stake, balance) {
  if (legs.length === 0) return 'Your slip is empty.';
  if (legs.length > MAX_LEGS) return `Parlays can have at most ${MAX_LEGS} legs.`;
  if (new Set(legs.map((l) => l.line_id)).size !== legs.length)
    return 'A parlay cannot have two legs from the same matchup.';
  if (!Number.isInteger(stake) || stake < 1) return 'Bet at least 1 FFBuck.';
  if (stake > balance) return 'Not enough FFBucks. Top up to keep playing.';
  return null;
}

/** Grade one leg exactly like the server. */
export function gradeLeg(market, side, point, homeScore, awayScore, winner) {
  let edge;
  if (market === 'ml') {
    if (winner === 'TIE') return 'push';
    return (winner === 'HOME') === (side === 'home') ? 'won' : 'lost';
  }
  // Scores have at most two decimals; compare in hundredths to avoid float noise.
  const h = Math.round(homeScore * 100);
  const a = Math.round(awayScore * 100);
  const p = Math.round(point * 100);
  if (market === 'spread') edge = side === 'home' ? h + p - a : a + p - h;
  else edge = side === 'over' ? h + a - p : p - (h + a);
  return edge > 0 ? 'won' : edge === 0 ? 'push' : 'lost';
}

/** Settle a whole bet from its legs' results: pushes drop out of a parlay. */
export function settle(stake, legs) {
  if (legs.some((l) => l.result === 'lost')) return { status: 'lost', payout: 0 };
  if (legs.some((l) => l.result === 'pending')) return { status: 'open', payout: null };
  const won = legs.filter((l) => l.result === 'won').map((l) => l.price);
  if (won.length === 0) return { status: 'push', payout: stake };
  return { status: 'won', payout: payout(stake, won) };
}

export function marketLabel(leg) {
  const team = leg.side === 'home' ? leg.home_team_name : leg.side === 'away' ? leg.away_team_name : null;
  if (leg.market === 'ml') return `${team} to win`;
  if (leg.market === 'spread') return `${team} ${formatPoint(Number(leg.point))}`;
  return `${leg.side === 'over' ? 'Over' : 'Under'} ${Number(leg.point)}`;
}

// ---------------------------------------------------------------------------
// Profile numbers (display only)
// ---------------------------------------------------------------------------

/** Win-loss record, return on bets, and best and worst hits from settled bets. */
export function profileStats(bets) {
  const settled = bets.filter((b) => b.status !== 'open');
  const graded = settled.filter((b) => b.status === 'won' || b.status === 'lost');
  const staked = settled.reduce((sum, b) => sum + Number(b.stake), 0);
  const net = settled.reduce((sum, b) => sum + Number(b.payout ?? 0) - Number(b.stake), 0);
  const profit = (b) => Number(b.payout ?? 0) - Number(b.stake);
  const byProfit = [...graded].sort((a, b) => profit(b) - profit(a) || a.id - b.id);
  const best = byProfit.length && profit(byProfit[0]) > 0 ? byProfit[0] : null;
  const worstFirst = [...graded].sort((a, b) => profit(a) - profit(b) || a.id - b.id);
  const worst = worstFirst.length && profit(worstFirst[0]) < 0 ? worstFirst[0] : null;
  return {
    wins: settled.filter((b) => b.status === 'won').length,
    losses: settled.filter((b) => b.status === 'lost').length,
    pushes: settled.filter((b) => b.status === 'push' || b.status === 'void').length,
    open: bets.length - settled.length,
    staked,
    net,
    roi: staked > 0 ? net / staked : null,
    best,
    worst,
  };
}

/** Bankroll over time from ledger rows, oldest first. */
export function bankrollSeries(ledger) {
  return [...ledger]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((row) => ({ at: row.created_at, balance: Number(row.balance_after), kind: row.kind }));
}

/** Time left until a lock, in plain words. */
export function countdown(lockAt, now = Date.now()) {
  if (!lockAt) return 'Not open yet';
  let ms = Date.parse(lockAt) - now;
  if (ms <= 0) return 'Locked';
  const d = Math.floor(ms / 86400000); ms -= d * 86400000;
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** The tip link is only ever shown if it is a plain https link. */
export function safeTipUrl(url) {
  if (typeof url !== 'string') return null;
  const v = url.trim();
  if (!v || v.length > 300 || !/^https:\/\/[^\s<>"'`]+$/.test(v)) return null;
  return v;
}
