import { bankrollSeries } from '../lib/odds.mjs';
import { fmt } from '../lib/supabase';

type Row = { id: number; created_at: string; balance_after: number; kind: string };

export default function BankrollChart({ ledger }: { ledger: Row[] }) {
  const points = bankrollSeries(ledger);
  if (points.length < 2) return <p className="empty">Your bankroll chart starts after your first bet.</p>;
  const W = 600, H = 160, pad = 8;
  const values = points.map((p) => p.balance);
  const top = Math.max(...values, 1000);
  const bottom = Math.min(...values, 1000);
  const padding = Math.max((top - bottom) * 0.15, 50);
  const max = top + padding;
  const min = Math.max(bottom - padding, 0);
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.balance).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Bankroll over time, now ${fmt(last.balance)} FFBucks`}>
        <line x1={pad} x2={W - pad} y1={y(1000)} y2={y(1000)} className="chart-base" />
        <path d={`${d} L${x(points.length - 1)} ${H - pad} L${x(0)} ${H - pad} Z`} className="chart-fill" />
        <path d={d} className="chart-line" />
        {points.map((p, i) => (p.kind === 'topup' ? <circle key={i} cx={x(i)} cy={y(p.balance)} r="4" className="chart-topup" /> : null))}
      </svg>
      <figcaption>Dashed line is the 1,000 starting stack. Gold dots are top-ups.</figcaption>
    </figure>
  );
}
