import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppState';
import { Bolt } from './Icons';
import { LinkButton } from './ui';

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="VoltLot home">
      <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-brand text-white">
        <Bolt size={18} />
      </span>
      <span className="text-[20px] font-extrabold tracking-[-0.02em] text-ink">VoltLot</span>
    </Link>
  );
}

export default function Header({ wide = false }: { wide?: boolean }) {
  const { user } = useApp();
  const { pathname } = useLocation();

  const links = [
    { label: 'Find parking', to: user ? '/search' : '/signup/driver', active: pathname.startsWith('/search') || pathname.startsWith('/listing') },
    { label: 'Host your charger', to: user?.role === 'host' ? '/host' : '/signup/host', active: pathname.startsWith('/host') || pathname === '/signup/host' },
    ...(user ? [{ label: 'My bookings', to: '/session', active: pathname === '/session' }] : []),
  ];

  return (
    <header className="border-b border-line bg-white">
      <div className={`flex items-center justify-between gap-4 px-6 py-3 ${wide ? '' : 'mx-auto max-w-[1280px]'}`}>
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              aria-current={l.active ? 'page' : undefined}
              className={`flex h-11 items-center rounded-[10px] px-4 text-[15px] font-semibold hover:bg-surface ${
                l.active ? 'text-brand' : 'text-ink'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-[14px] font-semibold text-muted sm:inline">{user.role === 'host' ? 'Host' : 'Driver'}</span>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full bg-avatar text-[16px] font-extrabold text-brand"
              aria-label={`Signed in as ${user.name}`}
              role="img"
            >
              {user.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <LinkButton to="/signup" variant="ghost" size="nav">
              Sign in
            </LinkButton>
            <LinkButton to="/signup" size="nav">
              Sign up
            </LinkButton>
          </div>
        )}
      </div>
    </header>
  );
}
