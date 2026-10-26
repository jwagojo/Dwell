import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import SignUp from './pages/SignUp';
import HostHome from './pages/HostHome';
import HostSignup from './pages/HostSignup';
import Landing from './pages/Landing';
import ListingPage from './pages/ListingPage';
import Search from './pages/Search';
import Session from './pages/Session';
import SignIn from './pages/SignIn';
import SignOut from './pages/SignOut';

// Routes follow the UI design spec §5. Auth is a prototype until Cognito lands (tasks.md 13.1).
export default function App() {
  const { pathname } = useLocation();
  return (
    // Keyed on the path (not the query string) so each page change replays the .page-enter animation in index.css.
    <div key={pathname} className="page-enter">
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/host" element={<HostHome />} />
        <Route path="/host/new" element={<HostSignup />} />
        <Route path="/host/edit" element={<HostSignup mode="edit" />} />
        <Route path="/search" element={<Search />} />
        <Route path="/listing/:id" element={<ListingPage />} />
        <Route path="/session" element={<Session />} />
        <Route path="/signout" element={<SignOut />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
