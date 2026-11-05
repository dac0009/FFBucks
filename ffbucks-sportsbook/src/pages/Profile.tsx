import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import BankrollChart from '../components/BankrollChart';
import BetCard from '../components/BetCard';
import { loadFeed } from '../lib/feed';
import { db, fmt, message, num, signed, type FeedBet, type Member, type Standing } from '../lib/supabase';
import { useBook } from '../lib/book';
import { profileStats } from '../lib/odds.mjs';

type LedgerRow = { id: number; created_at: string; balance_after: number; kind: string };

export default function Profile() {
  const params = useParams();
  const { me, state } = useBook();
  const owner = params.owner ?? me?.owner_id;
  const [member, setMember] = useState<Member | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [bets, setBets] = useState<FeedBet[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!owner) return;
    (async () => {
      try {
        const [m, s, l, b] = await Promise.all([
          db().from('members').select('*').eq('owner_id', owner).maybeSingle(),
          db().from('leaderboard').select('*').eq('owner_id', owner).maybeSingle(),
          db().from('ledger').select('id,created_at,balance_after,kind').eq('owner_id', owner).order('id').limit(2000),
          loadFeed({ owner, limit: 500 }),
        ]);
        setMember(m.data ? num(m.data as Member, ['balance']) : null);
        setStanding(s.data ? num(s.data as Standing, ['owed_to_pot', 'net']) : null);
        setLedger(((l.data ?? []) as LedgerRow[]).map((r) => num(r, ['id', 'balance_after'])));
        setBets(b);
      } catch (e) { setError(message(e)); }
    })();
  }, [owner]);

  if (!owner) return null;
  const season = bets.filter((b) => b.season === state?.season);
  const stats = profileStats(season);
  const allTime = profileStats(bets);
  const isMe = owner === me?.owner_id;

  return (
    <div className="page">
      <div className="page-head">
        <h1>{member?.display_name ?? owner}</h1>
        <p className="muted">{isMe ? 'Your book.' : 'Everything here is public to the league.'}</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <dl className="stats">
        <div><dt>Balance</dt><dd>{fmt(member?.balance)}</dd></div>
        <div><dt>Owed to the pot</dt><dd>{fmt(standing?.owed_to_pot ?? 0)}</dd></div>
        <div><dt>Season net</dt><dd className={(standing?.net ?? 0) > 0 ? 'up' : (standing?.net ?? 0) < 0 ? 'down' : ''}>{signed(standing?.net ?? 0)}</dd></div>
        <div><dt>Record</dt><dd>{stats.wins}–{stats.losses}{stats.pushes ? `–${stats.pushes}` : ''}</dd></div>
        <div><dt>Return on bets</dt><dd>{stats.roi === null ? '–' : `${(stats.roi * 100).toFixed(1)}%`}</dd></div>
        <div><dt>Open bets</dt><dd>{stats.open}</dd></div>
      </dl>
      <section className="panel">
        <h2>Bankroll</h2>
        <BankrollChart ledger={ledger} />
      </section>
      <div className="two">
        <section className="panel">
          <h2>Best hit</h2>
          {allTime.best ? <BetCard bet={allTime.best} actions={false} /> : <p className="empty">No winners yet.</p>}
        </section>
        <section className="panel">
          <h2>Worst beat</h2>
          {allTime.worst ? <BetCard bet={allTime.worst} actions={false} /> : <p className="empty">No losses yet.</p>}
        </section>
      </div>
      <section className="panel">
        <h2>All bets</h2>
        {bets.length === 0 && <p className="empty">{isMe ? 'No bets yet. Head to the board.' : 'No bets yet.'}</p>}
        <div className="feed">{bets.map((b) => <BetCard key={b.id} bet={b} />)}</div>
      </section>
    </div>
  );
}
