import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Button, LinkButton, Photo, RouteBadges, StatusText, WalkChip } from '../components/ui';
import { EV_MODELS } from '../data/evFallbackSeed';
import { stationToDestination } from '../data/destinations';
import { STATIONS } from '../data/stations';
import { computePrice } from '../engines/pricing';
import { summarizeDays } from '../lib/availability';
import { fmtHour, formatDataMonth, formatRateInput, money } from '../lib/format';
import { estimateWalk, haversineDistanceMeters } from '../lib/geo';
import { useApp } from '../state/AppState';

const PRICE_CARS = ['toyota-prius-prime', 'nissan-leaf', 'tesla-my'].map((id) => EV_MODELS.find((c) => c.id === id)!);

export default function HostHome() {
  const navigate = useNavigate();
  const { user, hostListing: l, update } = useApp();

  if (!l || !user) {
    return (
      <div className="bg-paper">
        <Header />
        <main className="container py-[var(--section-gap-s)]">
          <h1 className="max-w-none text-display-s font-extrabold text-ink">No listing yet</h1>
          <p className="lead mt-4 text-body">List your charger to start earning from idle hours.</p>
          <LinkButton to="/signup/host" size="lg" className="mt-8">
            List your charger
          </LinkButton>
        </main>
      </div>
    );
  }

  const nearest = STATIONS.map((s) => ({ s, d: haversineDistanceMeters(l, s) })).sort((a, b) => a.d - b.d)[0];
  const walk = estimateWalk(nearest.d);
  const firstName = user.name.trim().split(/\s+/)[0];
  const address = l.privateAddress
    ? `${l.privateAddress.line}${l.privateAddress.unit ? ` #${l.privateAddress.unit}` : ''}, ${l.privateAddress.city}, ${l.privateAddress.state} ${l.privateAddress.zip}`
    : `${l.street}, ${l.neighborhood}`;
  const charger = [`${l.level}, ${l.chargerKw} kW`, l.plug];
  if (l.adapters !== 'NONE') charger.push(`adapter to ${l.plug === 'J1772' ? 'NACS' : 'J1772'}`);
  if (l.solarKw > 0) charger.push(`${l.solarKw} kW solar`);

  return (
    <div className="bg-paper">
      <Header />
      <main className="container flex flex-col gap-[var(--space-2xl)] py-12">
        <div className="flex flex-col gap-3">
          <StatusText>Live in search</StatusText>
          <h1 className="max-w-none text-display-s font-extrabold text-ink">You’re listed, {firstName}.</h1>
          <p className="lead text-body">Drivers heading to {nearest.s.name} can book your spot now.</p>
        </div>

        <section aria-label="Your listing" className="grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Photo src={l.photos[0]} priority className="aspect-[4/3] w-full rounded-card" />
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="max-w-none text-[28px] font-extrabold leading-tight text-ink">{l.title}</h2>
              <p className="mt-1 text-[15px] text-muted">{address}</p>
              {l.privateAddress && (
                <p className="text-[14px] text-muted">
                  Drivers see only “{l.street}, {l.neighborhood}” until they book.
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <WalkChip minutes={walk.minutes} />
                <RouteBadges routes={nearest.s.routes} max={5} />
              </div>
            </div>
            <dl className="m-0 divide-y divide-line border-y border-line text-[15px]">
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="font-semibold text-muted">Charger</dt>
                <dd className="m-0 font-semibold text-ink">{charger.join(', ')}</dd>
              </div>
              {l.rateSource && (
                <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                  <dt className="font-semibold text-muted">Electricity rate</dt>
                  <dd className="m-0 text-body">
                    ${formatRateInput(l.rate)}/kWh.{' '}
                    {l.rateSource === 'EIA' && l.rateDataMonth
                      ? `Massachusetts residential average, EIA, ${formatDataMonth(l.rateDataMonth)} (estimate)`
                      : l.rateSource === 'HOST'
                        ? 'Your own rate.'
                        : 'Fallback estimate.'}
                  </dd>
                </div>
              )}
              <div className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="font-semibold text-muted">Available</dt>
                <dd className="m-0">
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body">
                    {l.windows.map((w) => (
                      <li key={w.id}>
                        {summarizeDays(w.days)}, {fmtHour(w.start)} to {fmtHour(w.end)}
                        {w.end <= w.start ? ' (overnight)' : ''}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section aria-labelledby="pays" className="flex flex-col gap-6">
          <h2 id="pays" className="max-w-none text-section font-extrabold text-ink">What drivers pay</h2>
          <table className="w-full border-collapse text-left text-[16px]">
            <thead>
              <tr className="border-b border-ink text-[14px] text-muted">
                <th scope="col" className="py-3 pr-4 font-semibold">Car</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Driver pays</th>
                <th scope="col" className="py-3 pr-4 font-semibold">You keep</th>
                <th scope="col" className="py-3 font-semibold">For power</th>
              </tr>
            </thead>
            <tbody>
              {PRICE_CARS.map((car) => {
                const p = computePrice({
                  charger_kW: l.chargerKw,
                  car_max_AC_kW: car.maxAcKw,
                  local_rate: l.rate,
                  host_earnings_hr: l.earningsHr,
                  booked_hours: 1,
                });
                return (
                  <tr key={car.id} className="border-b border-line">
                    <th scope="row" className="py-4 pr-4 font-semibold text-ink">{car.name}</th>
                    <td className="num py-4 pr-4 text-[20px] font-extrabold text-ink">{p.ok ? `${money(p.value.price_per_hr)}/hr` : 'n/a'}</td>
                    <td className="num py-4 pr-4 text-body">{money(l.earningsHr)}</td>
                    <td className="num py-4 text-body">{p.ok ? money(p.value.electricity_cost_per_hr) : 'n/a'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="flex flex-wrap items-center gap-6">
          <Button
            size="lg"
            onClick={() => {
              update({ destination: stationToDestination(nearest.s) });
              navigate('/search');
            }}
          >
            See it in search
          </Button>
          <p className="text-[15px] font-semibold text-body">Bookings: none yet</p>
        </div>
      </main>
    </div>
  );
}
