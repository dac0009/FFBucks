import { useCallback, useEffect, useState } from 'react';
import BetCard from '../components/BetCard';
import { loadFeed } from '../lib/feed';
import { message, type FeedBet } from '../lib/supabase';
import { useBook } from '../lib/book';
import { useText } from '../lib/lookContext';

export default function Feed() {
  const { state } = useBook();
  const t = useText();
  const [bets, setBets] = useState<FeedBet[]>([]);
  const [show, setShow] = useState<'all' | 'open' | 'settled'>('all');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try { setBets(await loadFeed({ season: state?.season, limit: 100 })); setLoaded(true); }
    catch (e) { setError(message(e)); }
  }, [state?.season]);
  useEffect(() => { load(); const id = window.setInterval(load, 30_000); return () => window.clearInterval(id); }, [load]);

  const shown = bets.filter((b) => show === 'all' || (show === 'open' ? b.status === 'open' : b.status !== 'open'));
  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('feed.title')}</h1>
        <p className="muted">{t('feed.intro')}</p>
        <div className="tabs" role="tablist">
          {(['all', 'open', 'settled'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={show === k} className={show === k ? 'on' : ''} onClick={() => setShow(k)}>
              {k === 'all' ? 'All' : k === 'open' ? 'Open' : 'Settled'}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && shown.length === 0 && <p className="empty">{t('feed.empty')}</p>}
      <div className="feed">{shown.map((b) => <BetCard key={b.id} bet={b} onChanged={load} />)}</div>
    </div>
  );
}
