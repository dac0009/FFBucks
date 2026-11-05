import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useBook } from '../lib/book';
import { useLook, useText } from '../lib/lookContext';
import { db, fmt } from '../lib/supabase';
import { safeTipUrl } from '../lib/odds.mjs';
import LookEditor from './LookEditor';

const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export default function Layout() {
  const { me, state } = useBook();
  const { draft } = useLook();
  const t = useText();
  const [editing, setEditing] = useState(false);
  const tip = safeTipUrl(state?.tip_url ?? null);
  return (
    <div className={`shell${editing ? ' with-editor' : ''}`}>
      <header className="masthead">
        <div className="folio">
          <span>{t('brand.folio')}</span>
          <span>{today()}</span>
        </div>
        <div className="nameplate-row">
          <NavLink to="/" className="nameplate" aria-label={`${t('brand.name')} home`}>
            <span className="kicker">{t('brand.kicker')}</span>
            {t('brand.name')}
          </NavLink>
          <p className="motto">{t('brand.motto')}</p>
          {me && (
            <NavLink to="/me" className="balance" title="Your FFBucks">
              <span className="balance-label">{t('balance.label')}</span>
              <span className="balance-amount">{fmt(me.balance)}</span>
            </NavLink>
          )}
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>{t('nav.board')}</NavLink>
          <NavLink to="/feed">{t('nav.feed')}</NavLink>
          <NavLink to="/leaderboard">{t('nav.standings')}</NavLink>
          <NavLink to="/me">{t('nav.me')}</NavLink>
          {me?.is_commissioner && <NavLink to="/commish">{t('nav.commish')}</NavLink>}
        </nav>
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
            <a className="tip" href={tip} target="_blank" rel="noopener noreferrer">{t('tip.button')}</a>
          ) : (
            <span className="tip tip-off" title="The commissioner hasn't added a tip link yet">{t('tip.soon')}</span>
          )}
          <span className="fine">Tips never buy FFBucks or any advantage.</span>
          <button className="linkish" onClick={() => db().auth.signOut()}>Sign out</button>
        </div>
      </footer>
      {me?.is_commissioner && !editing && (
        <button className="edit-look" onClick={() => setEditing(true)}>
          Edit look{draft ? ' (unsaved)' : ''}
        </button>
      )}
      {me?.is_commissioner && editing && <LookEditor onClose={() => setEditing(false)} />}
    </div>
  );
}
