import { useState, type FormEvent } from 'react';
import { db, message } from '../lib/supabase';
import { useBook } from '../lib/book';

export function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const auth = db().auth;
    const { data, error: err } = mode === 'in'
      ? await auth.signInWithPassword({ email, password })
      : await auth.signUp({ email, password });
    setBusy(false);
    if (err) { setError(message(err)); return; }
    if (mode === 'up' && !data.session) {
      setError('Account made, but sign-in is waiting on email confirmation. Ask the commissioner to turn off "Confirm email" in Supabase.');
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <h1 className="gate-title"><span className="wm-ff">FF</span><span className="wm-bucks">Bucks</span></h1>
        <p className="gate-lede">The FFBFFL book. Bet play money on your friends’ matchups.</p>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
          <button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>First time here</button>
        </div>
        <form onSubmit={submit} className="stack">
          <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
        {mode === 'up' && <p className="fine">You’ll need the invite code the commissioner sent you on the next screen.</p>}
        {mode === 'in' && <p className="fine">Forgot your password? Ask the commissioner for a new invite code and make a new account. Your FFBucks and bets carry over.</p>}
        <p className="notice">Play money only. No real-money wagering.</p>
      </div>
    </div>
  );
}

export function Join() {
  const { refresh, session } = useBook();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await db().rpc('claim_invite', { p_code: code });
    setBusy(false);
    if (err) { setError(message(err)); return; }
    await refresh();
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <h1 className="gate-title"><span className="wm-ff">FF</span><span className="wm-bucks">Bucks</span></h1>
        <p className="gate-lede">Signed in as {session?.user.email}. Enter your invite code to link this login to your team.</p>
        <form onSubmit={submit} className="stack">
          <label>Invite code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" required /></label>
          <button className="btn" disabled={busy}>Join the book</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
        <p className="fine">First time joining gets you 1,000 free FFBucks.</p>
        <button className="linkish" onClick={() => db().auth.signOut()}>Use a different login</button>
      </div>
    </div>
  );
}
