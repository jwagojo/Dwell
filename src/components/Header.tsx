import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../state/AppState';
import { Bolt } from './Icons';
import { LinkButton } from './ui';

export function Logo() {
  return (
    <Link to="/" className="flex h-11 items-center gap-1.5 rounded-card text-ink" aria-label="Dwell home">
      <span className="text-brand">
        <Bolt size={20} />
      </span>
      <span className="font-display text-[24px] font-semibold leading-none">Dwell</span>
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
    <header className="border-b border-line bg-paper">
      <div className={`flex min-h-16 items-center justify-between gap-4 px-6 py-2.5 sm:px-8 ${wide ? '' : 'mx-auto max-w-[1280px]'}`}>
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              aria-current={l.active ? 'page' : undefined}
              className={`flex h-11 items-center rounded-full px-4 text-[15px] font-medium transition-colors hover:bg-surface active:bg-chip ${
                l.active ? 'text-brand underline decoration-1 underline-offset-[6px]' : 'text-ink'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-[14px] font-medium text-muted sm:inline">{user.role === 'host' ? 'Host' : 'Driver'}</span>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full bg-avatar text-[16px] font-semibold text-brand"
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
            <LinkButton to="/signup" variant="secondary" size="nav">
              Sign up
            </LinkButton>
          </div>
        )}
      </div>
    </header>
  );
}
