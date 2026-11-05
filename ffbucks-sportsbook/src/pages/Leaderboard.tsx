import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Jackpot from '../components/Jackpot';
import { db, fmt, message, num, signed, type Standing } from '../lib/supabase';
import { useBook } from '../lib/book';
import { useText } from '../lib/lookContext';

type Archive = { season: number; jackpot: number; standings: Standing[] };

export default function Leaderboard() {
  const { me, state, jackpot, refresh } = useBook();
  const t = useText();
  const [rows, setRows] = useState<Standing[]>([]);
  const [archive, setArchive] = useState<Archive[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  async function load() {
    const [l, a] = await Promise.all([
      db().from('leaderboard').select('*'),
      db().from('season_archive').select('season,jackpot,standings').order('season', { ascending: false }),
    ]);
    if (l.error) { setError(message(l.error)); return; }
    setRows((l.data ?? []).map((r) => num(r as Standing, ['balance', 'owed_to_pot', 'betting_net', 'net', 'staked'])));
    setArchive(((a.data ?? []) as Archive[]).map((r) => ({ ...r, jackpot: Number(r.jackpot) })));
  }
  useEffect(() => { load(); }, []);

  async function topUp() {
    setBusy(true); setError('');
    const { error: e } = await db().rpc('top_up');
    setBusy(false); setConfirm(false);
    if (e) { setError(message(e)); return; }
    await Promise.all([refresh(), load()]);
  }

  return (
    <div className="page">
      <Jackpot amount={jackpot} season={state?.season} />
      <div className="page-head">
        <h1>{t('standings.title', { season: state?.season ?? '' })}</h1>
        <p className="muted">{t('standings.intro')}</p>
      </div>
      <div className="table-wrap">
        <table className="standings">
          <thead>
            <tr><th scope="col">#</th><th scope="col">Member</th><th scope="col">Net</th><th scope="col">Record</th><th scope="col">Owed to pot</th><th scope="col">Balance</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.owner_id} className={r.owner_id === me?.owner_id ? 'me' : ''}>
                <td className="rank">{i + 1}</td>
                <td><Link to={`/p/${r.owner_id}`}>{r.display_name}</Link></td>
                <td className={r.net > 0 ? 'up' : r.net < 0 ? 'down' : ''}>{signed(r.net)}</td>
                <td>{r.wins}–{r.losses}{r.pushes ? `–${r.pushes}` : ''}</td>
                <td>{fmt(r.owed_to_pot)}</td>
                <td>{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel">
        <h2>{t('topup.title')}</h2>
        <p>{t('topup.body')}</p>
        {!confirm
          ? <button className="btn" onClick={() => setConfirm(true)}>{t('topup.button')}</button>
          : <div className="row">
              <button className="btn" disabled={busy} onClick={topUp}>Yes, add 1,000 to my owed tally</button>
              <button className="linkish" onClick={() => setConfirm(false)}>Cancel</button>
            </div>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {archive.length > 0 && (
        <section className="panel">
          <h2>Past seasons</h2>
          {archive.map((a) => (
            <details key={a.season}>
              <summary>{a.season}: {a.standings[0]?.display_name ?? 'nobody'} won. Pot {fmt(a.jackpot)}.</summary>
              <ol className="past">
                {a.standings.map((s) => <li key={s.owner_id}>{s.display_name} {signed(Number(s.net))}, owed {fmt(Number(s.owed_to_pot))}</li>)}
              </ol>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
