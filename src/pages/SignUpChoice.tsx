import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import { Check } from '../components/Icons';
import { LinkButton } from '../components/ui';

function Role({ to, title, body, points, cta }: { to: string; title: string; body: string; points: string[]; cta: string }) {
  return (
    <section className="flex flex-col gap-6 py-10 first:pt-0 md:px-10 md:py-0 md:first:pl-0 md:last:pr-0">
      <div>
        <h2 className="max-w-none text-[28px] font-extrabold leading-tight text-ink">{title}</h2>
        <p className="mt-3 max-w-[36ch] text-[17px] leading-[1.55] text-body">{body}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {points.map((b) => (
          <li key={b} className="flex items-start gap-3 text-[16px] text-body">
            <span className="mt-0.5 shrink-0 text-brand">
              <Check size={18} />
            </span>
            {b}
          </li>
        ))}
      </ul>
      <LinkButton to={to} size="lg" className="self-start">
        {cta}
      </LinkButton>
    </section>
  );
}

export default function SignUpChoice() {
  const [params] = useSearchParams();
  const to = params.get('to');
  return (
    <div className="bg-paper">
      <Header />
      <main className="container py-[var(--section-gap-s)]">
        <h1 className="max-w-none text-display-s font-extrabold text-ink">How will you use Dwell?</h1>
        <p className="lead mt-4 text-body">You can add the other role later.</p>
        <div className="mt-14 grid divide-y divide-line border-t border-line pt-10 md:grid-cols-2 md:divide-x md:divide-y-0">
          <Role
            to={to ? `/signup/driver?to=${encodeURIComponent(to)}` : '/signup/driver'}
            title="I drive an EV"
            body="Find a charger near where you’re going and ride the rest of the way."
            points={['Prices are set for your exact car', 'See the walk and the routes before you book', 'No key handoff, ever']}
            cta="Sign up as a driver"
          />
          <Role
            to="/signup/host"
            title="I have a charger"
            body="Earn from a driveway charger that sits idle while you’re out."
            points={['You set your hourly earnings', 'The price covers the power a car can draw', 'You never touch the car']}
            cta="Sign up as a host"
          />
        </div>
        <p className="mt-14 text-[15px] text-muted">
          Already have an account? <span className="font-bold text-brand">Sign in</span> (coming with Cognito)
        </p>
      </main>
    </div>
  );
}
