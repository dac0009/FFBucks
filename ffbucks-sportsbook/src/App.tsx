import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BookProvider, useBook } from './lib/book';
import { configured } from './lib/supabase';
import Layout from './components/Layout';
import Board from './pages/Board';
import Feed from './pages/Feed';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import Commish from './pages/Commish';
import { Join, SignIn } from './pages/SignIn';

function Gate() {
  const { ready, session, me } = useBook();
  if (!configured) {
    return (
      <div className="gate"><div className="gate-card">
        <h1 className="gate-title"><span className="wm-ff">FF</span><span className="wm-bucks">Bucks</span></h1>
        <p>This site isn’t connected to its database yet. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY repository variables, then run “Deploy sportsbook”.</p>
      </div></div>
    );
  }
  if (!ready) return <div className="gate"><p className="muted">Loading the book…</p></div>;
  if (!session) return <SignIn />;
  if (!me) return <Join />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Board />} />
        <Route path="feed" element={<Feed />} />
        <Route path="leaderboard" element={<Leaderboard />} />
        <Route path="me" element={<Profile />} />
        <Route path="p/:owner" element={<Profile />} />
        <Route path="commish" element={<Commish />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <BookProvider>
        <Gate />
      </BookProvider>
    </HashRouter>
  );
}
