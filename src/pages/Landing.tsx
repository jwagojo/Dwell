import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Search } from '../components/Icons';
import DestinationSearch from '../components/DestinationSearch';
import MapPreview from '../components/map/MapPreview';
import { CONTROL } from '../components/form';
import { Button, LinkButton, RouteBadge, WalkChip, GreenPill } from '../components/ui';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import { SEEDED_LISTINGS } from '../data/listings';
import { stationIdToDestination, stationToDestination } from '../data/destinations';
import { POPULAR_STATION_IDS, findStation, stationById } from '../data/stations';
import type { Destination } from '../types/destination';
import { evaluateListing } from '../features/search/evaluateListing';
import { todayIndex } from '../lib/availability';
import { useApp } from '../state/AppState';

const STEPS = [
  { title: 'Book', body: 'Pick a charger near your stop. The price is set for your car.' },
  { title: 'Park', body: 'Park in the host’s spot and take an arrival photo. No key handoff, the car never moves, and the host never touches it.' },
  { title: 'Charge', body: 'Set your charge limit in your car’s app, plug in, then head to the T.' },
  { title: 'Go', body: 'Come back, tap Pick up, and take a photo. Your session ends when you do.' },
];

const VALUE_PROPS = [
  { title: 'Priced for your car', body: 'You pay for the lower of the charger’s speed and your car’s, so a Prius Prime doesn’t pay for a Model Y’s appetite.' },
  { title: 'See the whole trip', body: 'Each listing shows the walk to the station and the routes you can ride from there.' },
  { title: 'Green Score, shown as a formula', body: 'Solar share, transit miles and CO₂ avoided, each with its weight. Open any listing to check the math.' },
];

const CHIP_LABEL: Record<string, string> = { central: 'Central', harvard: 'Harvard', kendall: 'Kendall/MIT', porter: 'Porter', alewife: 'Alewife' };

// Four mock listings near Central Square; vl-12 is the featured one under the floating card.
const HERO_FEATURED_ID = 'vl-12';
const HERO_PIN_IDS = ['vl-17', 'vl-13', HERO_FEATURED_ID, 'vl-16'];

function HeroArt() {
  const central = stationById('central');
  const evs = useMemo(() => {
    const win = { startHour: 10, hours: 4, dayIndex: todayIndex() };
    return HERO_PIN_IDS.map((id) => SEEDED_LISTINGS.find((l) => l.id === id)!)
      .map((l) => evaluateListing(l, DEFAULT_CAR, central, win))
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }, [central]);
  const featured = evs.find((e) => e.listing.id === HERO_FEATURED_ID);

  return (
    <div
      role="group"
      aria-label="Map of sample chargers near Central Square"
      className="relative h-[480px] w-full max-w-[560px] overflow-hidden [border-radius:var(--radius-card)]"
    >
      <MapPreview
        center={{ lat: 42.358, lng: -71.111 }}
        zoom={13}
        pins={evs.map((e) => ({ id: e.listing.id, lat: e.listing.lat, lng: e.listing.lng, price: e.pricePerHr, selected: e.listing.id === HERO_FEATURED_ID }))}
      />
      {featured && (
        // bottom-9 keeps the card clear of Mapbox's attribution
        <div className="absolute bottom-9 right-4 left-4 z-30 flex flex-col gap-2 rounded-xl bg-paper p-4 shadow-card sm:left-auto sm:w-[290px]">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[16px] font-extrabold text-ink">{featured.listing.title}</div>
            <div className="text-[18px] font-extrabold text-ink">
              ${featured.pricePerHr.toFixed(2)}
              <span className="text-[12px] font-semibold text-muted">/hr</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <WalkChip minutes={featured.walkMinutes} />
            <RouteBadge route="Red Line" />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[14px] font-semibold text-body">
            <span>+{Math.round(featured.milesAdded)} mi</span>
            {featured.greenScore !== null && <GreenPill score={featured.greenScore} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { user, update } = useApp();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Destination | null>(null);
  const [error, setError] = useState('');

  function goTo(destination: Destination) {
    setError('');
    update({ destination });
    navigate(user ? '/search' : destination.kind === 'station' ? `/signup/driver?to=${destination.id}` : '/signup/driver');
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
    <div className="bg-paper">
      <Header />
      <main>
        <section className="border-b border-line bg-surface">
          <div className="container grid min-h-[calc(min(100svh,860px)-68px)] items-center gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div className="flex flex-col gap-6">
              <h1 className="max-w-[16ch] text-display-s font-extrabold text-ink">Park at a neighbor’s charger. Ride the rest of the way.</h1>
              <p className="lead max-w-[46ch] text-body">Book a home EV charger near Central, Harvard or Kendall. Plug in, walk away, and come back to more miles.</p>

              <form onSubmit={onSubmit} className="flex max-w-[620px] flex-wrap items-end gap-3" role="search">
                <div className="min-w-[240px] flex-1">
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
                    labelClassName="text-[14px] font-bold text-ink"
                    inputClassName={`h-[52px] ${CONTROL} border-muted text-[17px]`}
                  />
                </div>
                <Button type="submit" size="xl" className="flex-1 sm:flex-none">
                  <Search size={20} />
                  Find chargers
                </Button>
              </form>
              {error && (
                <p role="alert" className="-mt-3 text-[14px] font-semibold text-amber-ink">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] text-muted">Popular</span>
                {POPULAR_STATION_IDS.map((id) => {
                  const s = stationById(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => goTo(stationIdToDestination(id))}
                      className="inline-flex h-11 items-center rounded-full border border-pill bg-paper px-3.5 text-[14px] font-semibold text-ink transition-colors hover:border-brand hover:text-brand active:bg-chip"
                    >
                      {CHIP_LABEL[id] ?? s.name}
                    </button>
                  );
                })}
              </div>

              <p className="text-[16px] text-body">
                Have a charger?{' '}
                <Link to="/signup/host" className="font-bold text-brand underline">
                  List it and earn from idle hours
                </Link>
              </p>
            </div>

            <div className="flex justify-center lg:relative lg:-top-14 lg:justify-end">
              <HeroArt />
            </div>
          </div>
        </section>

        <section id="how" className="container py-[var(--section-gap-s)]">
          <h2 className="max-w-none text-section font-extrabold text-ink">Book, park, charge, go.</h2>
          <ol className="m-0 mt-12 grid list-none gap-x-8 gap-y-10 p-0 [counter-reset:step] sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.title} className="border-t-2 border-ink pt-5 [counter-increment:step]">
                <span className="num block text-[28px] font-extrabold leading-none text-muted before:content-[counter(step)]" aria-hidden="true" />
                <h3 className="mt-4 text-[22px] font-extrabold text-ink">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] text-[16px] leading-[1.6] text-body">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bg-surface">
          <div className="container grid gap-10 py-[var(--section-gap-s)] lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-line">
            {VALUE_PROPS.map((v, i) => (
              <div key={v.title} className={`flex flex-col gap-3 ${i > 0 ? 'lg:pl-10' : ''} ${i < VALUE_PROPS.length - 1 ? 'lg:pr-10' : ''}`}>
                <h3 className="max-w-none text-[22px] font-extrabold text-ink">{v.title}</h3>
                <p className="max-w-[36ch] text-[16px] leading-[1.6] text-body">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="host" className="on-dark bg-ink text-accent-ink">
          <div className="container flex flex-wrap items-center justify-between gap-8 py-[var(--section-gap-s)]">
            <div className="max-w-[640px]">
              <h2 className="max-w-[22ch] text-section font-extrabold">Your charger sits idle all day. List it.</h2>
              <p className="mt-4 max-w-[52ch] text-[19px] text-ink-on-dark">
                Set your own hourly earnings. The price is built to cover the most electricity the booked car can draw.
              </p>
            </div>
            <LinkButton to="/signup/host" size="xl">
              Become a host
            </LinkButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-6 text-[14px] text-muted">
          <span>Dwell, Hackachusetts 2026, Climate/Energy track</span>
          <span>Payments and notifications are simulated in this demo. Listings, routes and sunlight are sample data.</span>
        </div>
      </footer>
    </div>
  );
}
