import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { Search } from '../components/Icons';
import DestinationSearch from '../components/DestinationSearch';
import MapPreview from '../components/map/MapPreview';
import { AutoGrid, LinkButton, RouteBadge, WalkChip, GreenPill } from '../components/ui';
import { DEFAULT_CAR } from '../data/evFallbackSeed';
import { SEEDED_LISTINGS } from '../data/listings';
import { stationIdToDestination, stationToDestination } from '../data/destinations';
import { POPULAR_STATION_IDS, findStation, stationById } from '../data/stations';
import type { Destination } from '../types/destination';
import { LINE_STYLES } from '../data/transit';
import { evaluateListing } from '../features/search/evaluateListing';
import { todayIndex } from '../lib/availability';
import { useApp } from '../state/AppState';

const STEPS = [
  { n: '01', title: 'Book', body: "Pick a charger near your stop. The price is set for your car, so you only pay for the power it can take." },
  { n: '02', title: 'Park', body: 'Park in the host’s spot and take an arrival photo. No key handoff, the car never moves, and the host never touches it.' },
  { n: '03', title: 'Charge', body: 'Set your charge limit in your car’s app and plug in. Then head to the T.' },
  { n: '04', title: 'Go', body: 'Come back, tap Pick up, and take a photo. Your session ends when you do.' },
];

const VALUE_PROPS = [
  { title: 'Priced for your car', tone: 'bg-surface', body: 'A car can only draw so much power. Your price uses the lower of the charger’s speed and your car’s, so a Prius Prime doesn’t pay for a Model Y’s appetite.' },
  { title: 'See the whole trip', tone: 'bg-surface', body: 'Every listing shows the walk to the station and the routes you can ride from there, next to the price.' },
  { title: 'Green Score, shown as a formula', tone: 'bg-green-bg', body: 'Solar share, transit miles and CO₂ avoided, each with its weight. Open any listing to check the math.' },
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
    <div className="relative h-[440px] w-full max-w-[480px] overflow-hidden rounded-3xl border border-line shadow-panel">
      <MapPreview
        center={{ lat: 42.358, lng: -71.111 }}
        zoom={13}
        pins={evs.map((e) => ({ id: e.listing.id, lat: e.listing.lat, lng: e.listing.lng, price: e.pricePerHr, selected: e.listing.id === HERO_FEATURED_ID }))}
      />
      {featured && (
        // bottom-9 keeps the card clear of Mapbox's attribution
        <div className="absolute bottom-9 right-4 left-4 z-30 flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-panel sm:left-auto sm:w-[290px]">
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
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        <section className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-12 px-6 py-[72px] sm:px-8 sm:py-20">
            <div className="flex flex-[1_1_520px] flex-col gap-6">
              <p className="text-[14px] font-bold uppercase tracking-[0.08em] text-brand">Charge-and-ride · Cambridge</p>
              <h1 className="text-[clamp(40px,6vw,60px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">
                Park at a neighbor’s charger. Ride the rest of the way.
              </h1>
              <p className="max-w-[560px] text-pretty text-[19px] leading-[1.55] text-hero-sub">
                Book a home EV charger near Central, Harvard or Kendall. Plug in, walk away, and come back to more miles.
              </p>

              <form
                onSubmit={onSubmit}
                className="flex max-w-[620px] flex-wrap items-stretch gap-2 rounded-2xl border border-pill bg-white p-2 shadow-hero"
                role="search"
              >
                <div className="min-w-[220px] flex-1 px-4 py-1.5">
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
                    labelClassName="text-[12px] font-bold uppercase tracking-[0.08em] text-muted"
                    inputClassName="h-8 w-full border-0 bg-transparent p-0 text-[17px] font-semibold text-ink outline-none placeholder:text-muted"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-7 text-[17px] font-extrabold text-white hover:bg-brand-dark sm:flex-none"
                >
                  <Search size={20} />
                  Find chargers
                </button>
              </form>
              {error && (
                <p role="alert" className="-mt-3 text-[14px] font-semibold text-amber-ink">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-muted">Popular:</span>
                {POPULAR_STATION_IDS.map((id) => {
                  const s = stationById(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => goTo(stationIdToDestination(id))}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-pill bg-white px-3 text-[14px] font-semibold text-ink hover:border-brand"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: LINE_STYLES.red.stroke }} aria-hidden="true" />
                      {CHIP_LABEL[id] ?? s.name}
                    </button>
                  );
                })}
              </div>

              <p className="text-[16px] text-body">
                Have a charger?{' '}
                <Link to="/signup/host" className="font-bold text-brand hover:underline">
                  List it and earn from idle hours
                </Link>
              </p>
            </div>

            <div className="flex flex-[1_1_420px] justify-center lg:justify-end">
              <HeroArt />
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-8">
          <h2 className="text-[40px] font-extrabold tracking-[-0.03em] text-ink">Book, park, charge, go.</h2>
          <p className="mt-3 max-w-[600px] text-[19px] text-hero-sub">Four steps, and you never meet the host or hand over a key.</p>
          <div className="mt-10">
            <AutoGrid min={260} gap={16}>
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-line p-6">
                  <p className="text-[14px] font-bold uppercase tracking-[0.08em] text-brand">
                    {s.n} · {s.title}
                  </p>
                  <h3 className="mt-3 text-[20px] font-extrabold text-ink">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-body">{s.body}</p>
                </div>
              ))}
            </AutoGrid>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 pb-20 sm:px-8">
          <AutoGrid min={340} gap={16}>
            {VALUE_PROPS.map((v) => (
              <div key={v.title} className={`rounded-2xl p-7 ${v.tone}`}>
                <h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">{v.title}</h3>
                <p className="mt-3 text-[16px] leading-[1.6] text-body">{v.body}</p>
              </div>
            ))}
          </AutoGrid>
        </section>

        <section id="host" className="bg-ink text-white">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-8 px-6 py-20 sm:px-8">
            <div className="max-w-[640px]">
              <h2 className="text-[40px] font-extrabold tracking-[-0.03em]">Your charger sits idle all day. List it.</h2>
              <p className="mt-4 text-[19px] text-[#C9CDD6]">
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
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[14px] text-muted sm:px-8">
          <span>Dwell · Hackachusetts 2026, Climate/Energy track</span>
          <span>Payments and notifications are simulated in this demo. Listings, routes and sunlight are sample data.</span>
        </div>
      </footer>
    </div>
  );
}
