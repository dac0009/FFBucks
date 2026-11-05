import { fmt } from '../lib/supabase';

/** The pot, drawn like a banknote. */
export default function Jackpot({ amount, season }: { amount: number; season: number | undefined }) {
  return (
    <section className="note" aria-label="Season pot">
      <svg className="note-guilloche" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M0 ${60 + Math.sin(i) * 8} C 100 ${10 + i * 7}, 300 ${110 - i * 7}, 400 ${60 - Math.sin(i) * 8}`} />
        ))}
      </svg>
      <div className="note-body">
        <p className="note-title">The {season ?? ''} pot</p>
        <p className="note-amount"><span className="note-sign">F$</span>{fmt(amount)}</p>
        <p className="note-sub">Every top-up this season adds 1,000. Saved to the record at season end, then starts over.</p>
      </div>
    </section>
  );
}
