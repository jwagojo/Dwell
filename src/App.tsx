import { Navigate, Route, Routes } from 'react-router-dom';
import DriverSignup from './pages/DriverSignup';
import HostHome from './pages/HostHome';
import HostSignup from './pages/HostSignup';
import Landing from './pages/Landing';
import ListingPage from './pages/ListingPage';
import Search from './pages/Search';
import Session from './pages/Session';
import SignUpChoice from './pages/SignUpChoice';

// Routes follow the UI design spec §5. Auth is a prototype until Cognito lands (tasks.md 13.1).
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signup" element={<SignUpChoice />} />
      <Route path="/signup/driver" element={<DriverSignup />} />
      <Route path="/signup/host" element={<HostSignup />} />
      <Route path="/host" element={<HostHome />} />
      <Route path="/search" element={<Search />} />
      <Route path="/listing/:id" element={<ListingPage />} />
      <Route path="/session" element={<Session />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
