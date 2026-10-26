import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HOST_HOME_PATH, SIGNIN_PATH, SIGNUP_PATH, hostEntryPath } from '../lib/hostEntry';
import { useApp } from '../state/AppState';
import { Bolt } from './Icons';
import { Button, LinkButton } from './ui';

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

/**
 * The one host entry point. One account both drives and hosts, so the label follows what the account has:
 * "Host an EV charger" until something is listed, then "Switch to Hosting". On the host pages it flips to
 * "Switch to Driving" so the button always names the other side.
 */
function HostButton({ className = '' }: { className?: string }) {
  const { user, hostListing } = useApp();
  const { pathname } = useLocation();

  let label = 'Host an EV charger';
  let to = hostEntryPath(user !== null, hostListing !== null);
  if (user && hostListing) {
    const hosting = pathname === HOST_HOME_PATH;
    label = hosting ? 'Switch to Driving' : 'Switch to Hosting';
    to = hosting ? '/search' : HOST_HOME_PATH;
  }
  return (
    <LinkButton to={to} variant="secondary" size="nav" className={className}>
      {label}
    </LinkButton>
  );
}

export default function Header({ wide = false }: { wide?: boolean }) {
  const { user } = useApp();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const links = [
    ...(user ? [{ label: 'My bookings', to: '/session', active: pathname === '/session' }] : []),
  ];

  return (
    <header className="border-b border-line bg-paper">
      <div className={`flex min-h-16 items-center justify-between gap-4 px-6 py-2.5 sm:px-8 ${wide ? '' : 'mx-auto max-w-[1280px]'}`}>
        <Logo />
        {links.length > 0 && (
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
        )}
        {user ? (
          <div className="flex items-center gap-3">
            <HostButton className="max-lg:hidden" />
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full bg-avatar text-[16px] font-semibold text-brand"
              aria-label={`Signed in as ${user.name}`}
              role="img"
            >
              {user.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <Button variant="ghost" size="nav" onClick={() => navigate('/signout', { replace: true })}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <HostButton className="max-lg:hidden" />
            <LinkButton to={SIGNIN_PATH} variant="ghost" size="nav">
              Sign in
            </LinkButton>
            <LinkButton to={SIGNUP_PATH} variant="primary" size="nav">
              Sign up
            </LinkButton>
          </div>
        )}
      </div>
      {/* Below lg the header row is full, so the host button gets its own row. */}
      <div className={`flex justify-end px-6 pb-3 sm:px-8 lg:hidden ${wide ? '' : 'mx-auto max-w-[1280px]'}`}>
        <HostButton className="w-full sm:w-auto" />
      </div>
    </header>
  );
}
