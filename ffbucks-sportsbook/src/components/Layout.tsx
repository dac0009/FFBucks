import { NavLink, Outlet } from 'react-router-dom';
import { useBook } from '../lib/book';
import { db, fmt } from '../lib/supabase';
import { safeTipUrl } from '../lib/odds.mjs';

export default function Layout() {
  const { me, state } = useBook();
  const tip = safeTipUrl(state?.tip_url ?? null);
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="wordmark" aria-label="FFBucks home">
          <span className="wm-ff">FF</span><span className="wm-bucks">Bucks</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>Board</NavLink>
          <NavLink to="/feed">Feed</NavLink>
          <NavLink to="/leaderboard">Standings</NavLink>
          <NavLink to="/me">My bets</NavLink>
          {me?.is_commissioner && <NavLink to="/commish">Commish</NavLink>}
        </nav>
        {me && (
          <NavLink to="/me" className="balance" title="Your FFBucks">
            <span className="balance-label">Balance</span>
            <span className="balance-amount">{fmt(me.balance)}</span>
          </NavLink>
        )}
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="footer">
        <p className="notice">Play money only. No real-money wagering.</p>
        <p className="fine">
          FFBucks can never be bought, cashed out or traded for anything. Settling FFBucks results in real
          money between members would make this real gambling. NFL schedule data: nflverse (CC-BY 4.0).
        </p>
        <div className="footer-row">
          {tip ? (
            <a className="tip" href={tip} target="_blank" rel="noopener noreferrer">Tip the commish</a>
          ) : (
            <span className="tip tip-off" title="The commissioner hasn't added a tip link yet">Tip jar coming soon</span>
          )}
          <span className="fine">Tips never buy FFBucks or any advantage.</span>
          <button className="linkish" onClick={() => db().auth.signOut()}>Sign out</button>
        </div>
      </footer>
    </div>
  );
}
