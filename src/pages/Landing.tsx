import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Skyline from '../components/Skyline';
import { Search } from '../components/Icons';
import DestinationSearch from '../components/DestinationSearch';
import { CONTROL } from '../components/form';
import MapPreview from '../components/map/MapPreview';
import { LinkButton, WalkChip } from '../components/ui';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import { SEEDED_LISTINGS } from '../data/listings';
import { stationIdToDestination, stationToDestination } from '../data/destinations';
import { POPULAR_STATION_IDS, findStation, stationById } from '../data/stations';
import type { Destination } from '../types/destination';
import { LINE_STYLES } from '../data/transit';
import { evaluateListing } from '../features/search/evaluateListing';
import { todayIndex } from '../lib/availability';
import { SIGNUP_PATH, hostEntryPath } from '../lib/hostEntry';
import { useApp } from '../state/AppState';

const STEPS = [
  { title: 'Book', body: "Pick a charger near your stop. The price is set for your car, so you only pay for the power it can take." },
  { title: 'Park', body: 'Park in the host’s spot and take an arrival photo. No key handoff, the car never moves, and the host never touches it.' },
  { title: 'Charge', body: 'Set your charge limit in your car’s app and plug in. Then head to the T.' },
  { title: 'Go', body: 'Come back, tap Pick up, and take a photo. Your session ends when you do.' },
];

const VALUE_PROPS = [
  { title: 'Priced for your car', body: 'A car can only draw so much power. Your price uses the lower of the charger’s speed and your car’s, so a Prius Prime doesn’t pay for a Model Y’s appetite.' },
  { title: 'See the whole trip', body: 'Every listing shows the walk to the station and the routes you can ride from there, next to the price.' },
  { title: 'Green Score, shown as a formula', body: 'Solar share, transit miles and CO₂ avoided, each with its weight. Open any listing to check the math.' },
];

const CHIP_LABEL: Record<string, string> = { central: 'Central', harvard: 'Harvard', kendall: 'Kendall/MIT', porter: 'Porter', alewife: 'Alewife' };

// Four mock listings near Central Square; vl-12 is the featured one, highlighted on the map and in the ledger.
const HERO_FEATURED_ID = 'vl-12';
const HERO_PIN_IDS = ['vl-17', 'vl-13', HERO_FEATURED_ID, 'vl-16'];
const HERO_WINDOW = { startHour: 10, hours: 4 };

/** The hero's visual: the map of four sample listings near Central and the same four as a priced ledger. */
function HeroLedger() {
  const central = stationById('central');
  const evs = useMemo(() => {
    const win = { ...HERO_WINDOW, dayIndex: todayIndex() };
    return HERO_PIN_IDS.map((id) => SEEDED_LISTINGS.find((l) => l.id === id)!)
      .map((l) => evaluateListing(l, DEFAULT_CAR, central, win))
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [central]);

  return (
    <figure className="m-0 flex min-w-0 flex-col gap-4">
      <div className="relative h-[280px] overflow-hidden rounded-card border border-line sm:h-[300px]">
        <MapPreview
          center={{ lat: 42.358, lng: -71.111 }}
          zoom={13}
          pins={evs.map((e) => ({ id: e.listing.id, lat: e.listing.lat, lng: e.listing.lng, price: e.pricePerHr, selected: e.listing.id === HERO_FEATURED_ID }))}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-b border-line-strong text-[13px] text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">Charger</th>
              <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">Estimated miles added</th>
              <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">Green Score</th>
              <th scope="col" className="whitespace-nowrap py-2 text-right font-medium">Price for your car</th>
            </tr>
          </thead>
          <tbody>
            {evs.map((e) => {
              const featured = e.listing.id === HERO_FEATURED_ID;
              return (
                <tr key={e.listing.id} className={`border-b border-line ${featured ? 'bg-brand-wash' : ''}`}>
                  <th scope="row" className="py-2.5 pr-3 font-normal">
                    <span className={`block text-ink ${featured ? 'font-semibold' : 'font-medium'}`}>{e.listing.title}</span>
                    {e.walkMinutes !== null && (
                      <span className="mt-1 inline-flex">
                        <WalkChip minutes={e.walkMinutes} />
                      </span>
                    )}
                  </th>
                  <td className="py-2.5 pr-3 text-right text-body">+{Math.round(e.milesAdded)} mi</td>
                  <td className="py-2.5 pr-3 text-right text-green-ink">{e.greenScore !== null ? e.greenScore.toFixed(2) : 'n/a'}</td>
                  <td className="whitespace-nowrap py-2.5 text-right font-semibold text-ink">
                    ${e.pricePerHr.toFixed(2)}
                    <span className="text-[13px] font-normal text-muted">/hr</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="text-[13px] text-muted">
        Sample listings near Central (Red Line), priced for a {DEFAULT_CAR.name} from 10 am for 4 hours.
      </figcaption>
    </figure>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user, hostListing, update } = useApp();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Destination | null>(null);
  const [error, setError] = useState('');

  function goTo(destination: Destination) {
    setError('');
    update({ destination });
    navigate(user ? '/search' : destination.kind === 'station' ? `${SIGNUP_PATH}?to=${destination.id}` : SIGNUP_PATH);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    // A suggestion the visitor picked, or typed text that exactly names a station.
    const station = findStation(text);
    const destination = picked ?? (station ? stationToDestination(station) : null);
    if (!destination) {
      setError('Choose a station or an address from the suggestions.');
      return;
    }
    goTo(destination);
  }

  return (
    <div className="min-h-dvh bg-paper">
      <Header />
      <main>
        <section className="relative overflow-hidden border-b border-line">
          <Skyline className="absolute inset-x-0 bottom-0 h-[150px] w-full sm:h-[200px] lg:h-[260px]" />
          <div className="relative mx-auto grid max-w-[1280px] items-center gap-x-16 gap-y-12 px-6 py-12 sm:px-8 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-14">
            <div className="flex min-w-0 flex-col gap-6">
              <h1 className="text-display-s leading-[1.04] text-ink">Park at a neighbor’s charger. Ride the rest of the way.</h1>
              <p className="lead text-pretty text-hero-sub">
                Book a home EV charger near Central, Harvard or Kendall. Plug in, walk away, and come back to more miles.
              </p>

              <form onSubmit={onSubmit} className="flex max-w-[560px] flex-col gap-2" role="search">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[220px] flex-1">
                    <DestinationSearch
                      label="Where are you headed?"
                      inputId="hero-destination"
                      value={text}
                      placeholder="T station or address"
                      onInputChange={(t) => {
                        setText(t);
                        setPicked(null);
                        setError('');
                      }}
                      onSelect={(d) => {
                        setText(d.label);
                        setPicked(d);
                        setError('');
                      }}
                      labelClassName="text-[14px] font-medium text-ink"
                      inputClassName={`h-[52px] ${CONTROL} ${error ? 'border-amber-ink' : 'border-muted'}`}
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand px-7 text-[17px] font-semibold text-on-ink transition-colors duration-200 hover:bg-brand-dark active:bg-green-deep sm:flex-none"
                  >
                    <Search size={20} />
                    Find chargers
                  </button>
                </div>
                {error && (
                  <p role="alert" className="text-[14px] font-medium text-amber-ink">
                    {error}
                  </p>
                )}
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] text-muted">Popular:</span>
                {POPULAR_STATION_IDS.map((id) => {
                  const s = stationById(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => goTo(stationIdToDestination(id))}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-paper px-3.5 text-[14px] font-medium text-ink transition-colors duration-200 hover:border-brand hover:bg-brand-wash active:bg-brand-tint"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: LINE_STYLES.red.stroke }} aria-hidden="true" />
                      {CHIP_LABEL[id] ?? s.name}
                    </button>
                  );
                })}
              </div>

              <p className="text-[16px] text-body">
                Have a charger?{' '}
                <Link
                  to={hostEntryPath(user !== null, hostListing !== null)}
                  className="font-medium text-ink underline decoration-line-strong decoration-1 underline-offset-4 transition-colors hover:text-brand hover:decoration-brand active:text-green-deep"
                >
                  List it and earn from idle hours
                </Link>
              </p>
            </div>

            <HeroLedger />
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1280px] px-6 py-24 sm:px-8 lg:py-36">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end lg:gap-16">
            <h2 className="text-ink">Book, park, charge, go.</h2>
            <p className="lead text-hero-sub">Four steps, and you never meet the host or hand over a key.</p>
          </div>
          <ol className="m-0 mt-16 grid list-none gap-x-8 gap-y-12 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 border-t border-line-strong pt-6">
                <span className="font-display text-[64px] font-semibold leading-[0.9] text-brand" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="text-ink">{s.title}</h3>
                <p className="text-[16px] leading-[1.6] text-body">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="Why Dwell" className="bg-surface">
          <div className="mx-auto max-w-[1280px] px-6 py-20 sm:px-8 lg:py-30">
            <ul className="m-0 list-none p-0">
              {VALUE_PROPS.map((v) => (
                <li
                  key={v.title}
                  className="grid gap-3 border-b border-line py-10 first:pt-0 last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16"
                >
                  <h2 className="max-w-[16ch] text-[clamp(1.75rem,1.5vw+1rem,2.5rem)] leading-[1.1] text-ink">{v.title}</h2>
                  <p className="text-[18px] leading-[1.6] text-body lg:pt-2">{v.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="host" className="bg-ink text-on-ink">
          <div className="mx-auto grid max-w-[1280px] items-end gap-10 px-6 py-24 sm:px-8 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)] lg:py-36">
            <div className="min-w-0">
              <h2 className="text-on-ink">Your charger sits idle all day. List it.</h2>
              <p className="lead mt-6 text-on-ink-muted">
                Set your own hourly earnings. The price is built to cover the most electricity the booked car can draw.
              </p>
            </div>
            <div className="lg:justify-self-end">
              <LinkButton
                to={hostEntryPath(user !== null, hostListing !== null)}
                size="xl"
                className="bg-accent-2! text-ink! hover:bg-paper! active:bg-paper-3!"
              >
                Become a host
              </LinkButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-16 sm:px-8">
          <p className="font-display text-[clamp(2.5rem,4vw+1rem,4.5rem)] font-semibold leading-none text-ink">Dwell</p>
          <div className="flex flex-wrap justify-between gap-x-8 gap-y-2 border-t border-line pt-6 text-[14px] text-muted">
            <span>Hackachusetts 2026, Climate/Energy track</span>
            <span>Payments and notifications are simulated in this demo. Listings, routes and sunlight are sample data.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
