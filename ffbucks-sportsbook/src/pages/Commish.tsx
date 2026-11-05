import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { LEAGUE_LINES_URL, db, message, num, when, type Line, type Member } from '../lib/supabase';
import { useBook } from '../lib/book';
import { safeTipUrl } from '../lib/odds.mjs';

type Owner = { owner_id: string; name: string | null; team_name: string | null };
type Invite = { code: string; owner_id: string; used_at: string | null };

export default function Commish() {
  const { me, state, refresh } = useBook();
  if (!me?.is_commissioner) return <Navigate to="/" replace />;
  return (
    <div className="page">
      <div className="page-head">
        <h1>Commissioner</h1>
        <p className="muted">
          Last sync {state?.last_sync_at ? when(state.last_sync_at) : 'never'}{state?.last_sync_note ? `: ${state.last_sync_note}` : ''}.
        </p>
      </div>
      <TipLink current={state?.tip_url ?? null} onSaved={refresh} />
      <Invites />
      <PullLine season={state?.season} />
    </div>
  );
}

function TipLink({ current, onSaved }: { current: string | null; onSaved: () => Promise<void> }) {
  const [url, setUrl] = useState(current ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setUrl(current ?? ''), [current]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(''); setNote('');
    if (url.trim() && !safeTipUrl(url)) { setError('The tip link must start with https:// and have no spaces.'); return; }
    const { error: err } = await db().rpc('set_tip_url', { p_url: url });
    if (err) { setError(message(err)); return; }
    setNote(url.trim() ? 'Saved. The tip button now opens this link.' : 'Removed. The footer shows “Tip jar coming soon”.');
    await onSaved();
  }

  return (
    <section className="panel">
      <h2>Tip link</h2>
      <p>Paste your Linktree (or any https link). Leave it blank to hide the button. Tips never give anyone FFBucks.</p>
      <form className="row" onSubmit={save}>
        <input className="grow" type="url" inputMode="url" placeholder="https://linktr.ee/yourname" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Tip link" />
        <button className="btn">Save link</button>
      </form>
      {note && <p className="ok" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Invites() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [manualId, setManualId] = useState('');
  const [manualName, setManualName] = useState('');

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([
      db().from('members').select('*'),
      db().from('invites').select('code,owner_id,used_at').is('used_at', null),
    ]);
    setMembers((m.data ?? []).map((r) => num(r as Member, ['balance'])));
    setInvites((i.data ?? []) as Invite[]);
  }, []);

  useEffect(() => {
    load();
    fetch(`${LEAGUE_LINES_URL}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((file) => setOwners((file?.owners ?? []) as Owner[]))
      .catch(() => setOwners([]));
  }, [load]);

  async function invite(ownerId: string, name: string) {
    setError('');
    const { data, error: err } = await db().rpc('book_invite', { p_owner_id: ownerId, p_display_name: name });
    if (err) { setError(message(err)); return; }
    setFresh((f) => ({ ...f, [ownerId]: String(data) }));
    await load();
  }

  const everyone = new Map<string, { owner_id: string; name: string; team: string | null }>();
  for (const o of owners) everyone.set(o.owner_id, { owner_id: o.owner_id, name: o.name ?? o.owner_id, team: o.team_name });
  for (const m of members) if (!everyone.has(m.owner_id)) everyone.set(m.owner_id, { owner_id: m.owner_id, name: m.display_name, team: null });

  return (
    <section className="panel">
      <h2>Invite members</h2>
      <p>Make a code and text it to the owner. They create an account, enter the code, and get 1,000 free FFBucks the first time. If someone forgets their password, make them a new code: their balance and bets move to the new login.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="invites">
        {[...everyone.values()].map((o) => {
          const member = members.find((m) => m.owner_id === o.owner_id);
          const open = invites.find((i) => i.owner_id === o.owner_id);
          const code = fresh[o.owner_id] ?? open?.code;
          return (
            <li key={o.owner_id}>
              <div>
                <b>{o.name}</b>{o.team && <span className="muted small"> {o.team}</span>}
                <div className="muted small">{member?.user_id ? 'Joined' : code ? 'Invited, not joined yet' : 'Not invited'}</div>
              </div>
              {code && <code className="code">{code}</code>}
              {code && <button className="btn-small" onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>}
              <button className="btn-small" onClick={() => invite(o.owner_id, o.name)}>
                {member?.user_id ? 'New login code' : code ? 'New code' : 'Make code'}
              </button>
            </li>
          );
        })}
      </ul>
      <details>
        <summary>Add someone not on the list</summary>
        <form className="row" onSubmit={(e) => { e.preventDefault(); invite(manualId.trim().toLowerCase(), manualName.trim()); }}>
          <input placeholder="owner id, like first-last" value={manualId} onChange={(e) => setManualId(e.target.value)} aria-label="Owner id" required />
          <input placeholder="Display name" value={manualName} onChange={(e) => setManualName(e.target.value)} aria-label="Display name" required />
          <button className="btn-small">Make code</button>
        </form>
        <p className="fine">Use the same owner id as the league site (the end of their profile link) so the own-game betting rule works.</p>
      </details>
    </section>
  );
}

function PullLine({ season }: { season: number | undefined }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [armed, setArmed] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!season) return;
    const { data } = await db().from('lines').select('*').eq('season', season).eq('status', 'open').order('week');
    setLines((data ?? []).map((r) => num(r as Line, ['week', 'home_spread', 'total'])));
  }, [season]);
  useEffect(() => { load(); }, [load]);

  async function pull(id: string) {
    setError(''); setNote('');
    const { data, error: err } = await db().rpc('pull_line', { p_line_id: id });
    setArmed(null);
    if (err) { setError(message(err)); return; }
    setNote(`Line pulled. ${data} bet${data === 1 ? '' : 's'} refunded.`);
    await load();
  }

  return (
    <section className="panel">
      <h2>Pull a line</h2>
      <p>Emergency only: removes a broken line and refunds every bet on it, including whole parlays that used it. Lines can’t be edited.</p>
      {note && <p className="ok" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {lines.length === 0 && <p className="empty">No open lines right now.</p>}
      <ul className="invites">
        {lines.map((l) => (
          <li key={l.line_id}>
            <div>
              <b>{l.away_team_name} at {l.home_team_name}</b>
              <div className="muted small">Week {l.week}, home {l.home_spread > 0 ? '+' : ''}{l.home_spread}, total {l.total}</div>
            </div>
            {armed === l.line_id
              ? <><button className="btn-small danger" onClick={() => pull(l.line_id)}>Pull and refund</button><button className="linkish" onClick={() => setArmed(null)}>Cancel</button></>
              : <button className="btn-small" onClick={() => setArmed(l.line_id)}>Pull this line</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
