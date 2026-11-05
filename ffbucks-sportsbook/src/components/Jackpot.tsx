import { fmt } from '../lib/supabase';
import { useText } from '../lib/lookContext';

/** The pot, drawn like a banknote. */
export default function Jackpot({ amount, season }: { amount: number; season: number | undefined }) {
  const t = useText();
  return (
    <section className="note" aria-label="Season pot">
      <svg className="note-guilloche" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M0 ${60 + Math.sin(i) * 8} C 100 ${10 + i * 7}, 300 ${110 - i * 7}, 400 ${60 - Math.sin(i) * 8}`} />
        ))}
      </svg>
      <div className="note-body">
        <p className="note-title">{t('pot.title', { season: season ?? '' })}</p>
        <p className="note-amount"><span className="note-sign">F$</span>{fmt(amount)}</p>
        <p className="note-sub">{t('pot.sub')}</p>
      </div>
    </section>
  );
}
