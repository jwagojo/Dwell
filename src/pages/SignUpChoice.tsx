import type { CSSProperties, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { Bolt, Plug } from '../components/Icons';

function RoleCard({
  to,
  icon,
  title,
  body,
  bullets,
  cta,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  body: string;
  bullets: string[];
  cta: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col gap-5 rounded-card border border-line bg-paper p-7 transition-colors duration-200 hover:border-brand hover:bg-brand-wash active:bg-brand-tint"
    >
      <span className="flex h-10 items-center text-brand">{icon}</span>
      <div>
        <h2 className="text-[26px] font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-[16px] text-body">{body}</p>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {bullets.map((b) => (
          <li key={b} className="border-t border-line py-2.5 text-[15px] text-body">
            {b}
          </li>
        ))}
      </ul>
      <span className="mt-auto flex h-[52px] items-center justify-center whitespace-nowrap rounded-full border border-brand text-[17px] font-semibold text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-on-ink">
        {cta}
      </span>
    </Link>
  );
}

export default function SignUpChoice() {
  const [params] = useSearchParams();
  const to = params.get('to');
  return (
    <div className="min-h-dvh bg-surface">
      <Header />
      <main className="mx-auto max-w-[960px] px-6 pb-16 pt-14">
        <div>
          <h1 className="text-[44px] leading-[1.1] text-ink">How will you use Dwell?</h1>
          <p className="mt-3 text-[18px] text-hero-sub">You can add the other role later.</p>
        </div>
        <div className="auto-grid mt-10" style={{ '--min': '320px', '--gap': '20px' } as CSSProperties}>
          <RoleCard
            to={to ? `/signup/driver?to=${encodeURIComponent(to)}` : '/signup/driver'}
            icon={<Bolt size={26} />}
            title="I drive an EV"
            body="Find a charger near where you’re going and ride the rest of the way."
            bullets={['Prices are set for your exact car', 'See the walk and the routes before you book', 'No key handoff, ever']}
            cta="Sign up as a driver"
          />
          <RoleCard
            to="/signup/host"
            icon={<Plug size={26} />}
            title="I have a charger"
            body="Earn from a driveway charger that sits idle while you’re out."
            bullets={['You set your hourly earnings', 'The price covers the power a car can draw', 'You never touch the car']}
            cta="Sign up as a host"
          />
        </div>
        <p className="mt-8 text-[15px] text-muted">
          Already have an account? <span className="font-medium text-ink">Sign in</span> (coming with Cognito)
        </p>
      </main>
    </div>
  );
}
