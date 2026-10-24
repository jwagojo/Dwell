import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { SelectField, Stepper } from '../components/form';
import Header from '../components/Header';
import { Camera, ChevronLeft, Walk } from '../components/Icons';
import { Button, FitNote, Photo, RouteBadges, WarnNote } from '../components/ui';
import { EV_MODELS, carById } from '../data/evFallbackSeed';
import { LINE_STYLES } from '../data/transit';
import { GREEN_REF_CO2_KG, GREEN_REF_TRANSIT_MILES, GREEN_WEIGHTS, LATE_MULTIPLIER, SERVICE_FEE } from '../engines/constants';
import { lateRatePerMinute, settle } from '../engines/billing';
import { evaluateListing } from '../features/search/evaluateListing';
import { todayIndex } from '../lib/availability';
import { fmtHour, money, todayMidnight } from '../lib/format';
import { metersToMiles } from '../lib/geo';
import { useApp } from '../state/AppState';
import type { Booking } from '../types/booking';
import type { Car } from '../types/listing';

const GALLERY_LABELS = ['Driveway from the street', 'Charger', 'Adapter', 'Your spot'];
const MAX_KW_SCALE = 12;
const HOURS_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function FitBar({ label, kw, tone }: { label: string; kw: number | null; tone: 'grey' | 'brand' }) {
  return (
    <div className="grid grid-cols-[120px_1fr_72px] items-center gap-3 text-[14px]">
      <span className="font-semibold text-body">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-chip">
        {kw !== null && (
          <div
            className={`h-full rounded-full ${tone === 'brand' ? 'bg-brand' : 'bg-disabled'}`}
            style={{ width: `${Math.min(kw / MAX_KW_SCALE, 1) * 100}%` }}
          />
        )}
      </div>
      <span className="text-right font-extrabold text-ink">{kw !== null ? `${kw} kW` : 'Unknown'}</span>
    </div>
  );
}

export default function ListingPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, car: ownCar, activeCar, destination, startHour, hours, listings, update } = useApp();

  const listing = listings.find((l) => l.id === id);
  if (!user) return <Navigate to="/signup/driver" replace />;
  if (!listing) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <main className="mx-auto max-w-[1240px] px-8 py-16">
          <h1 className="text-[36px] font-extrabold tracking-[-0.03em] text-ink">We couldn’t find that listing</h1>
          <Link to="/search" className="mt-4 inline-block text-[16px] font-bold text-brand hover:underline">
            Back to search
          </Link>
        </main>
      </div>
    );
  }

  const ev = evaluateListing(listing, activeCar, destination, { startHour, hours, dayIndex: todayIndex() });
  if (!ev) return <Navigate to="/search" replace />;

  const bill = settle({ price_per_hr: ev.pricePerHr, booked_hours: hours, booked_end_timestamp: 0, pickup_timestamp: 0 });
  const subtotal = bill.ok ? bill.value.subtotal : 0;
  const serviceFee = bill.ok ? bill.value.service_fee : 0;
  const lateRate = lateRatePerMinute(ev.pricePerHr);
  const carOptions: Car[] = ownCar && !carById(ownCar.id) ? [ownCar, ...EV_MODELS] : EV_MODELS;
  const usesAdapter = listing.plug !== activeCar.plug && ev.plugOk;
  const carLimits = activeCar.maxAcKw !== null && activeCar.maxAcKw < listing.chargerKw;
  const canBook = ev.plugOk && ev.open;

  function book() {
    if (!ev || !canBook) return;
    const booking: Booking = {
      id: `bk-${Date.now()}`,
      listingId: listing!.id,
      dayStart: todayMidnight(),
      destination,
      startHour,
      hours,
      carName: activeCar.name,
      carKw: activeCar.maxAcKw,
      pEff: ev.pEff,
      pricePerHr: ev.pricePerHr,
      total: ev.total,
      status: 'RESERVED',
    };
    update({ booking });
    navigate('/session');
  }

  const t = ev.greenTerms;
  const gallery = GALLERY_LABELS.map((label, i) => ({ label, src: listing.photos[i] }));

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-6 pb-20 pt-4 sm:px-8">
        <Link to="/search" className="inline-flex h-11 w-fit items-center gap-1 text-[15px] font-semibold text-ink hover:text-brand">
          <ChevronLeft size={18} />
          Back to search
        </Link>

        <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-[18px] sm:grid-cols-2 md:h-[320px] md:grid-cols-4 md:grid-rows-[1fr_1fr]">
          {gallery.map((g, i) => (
            <Photo
              key={g.label}
              src={g.src}
              index={i}
              label={g.label}
              className={i === 0 ? 'min-h-[180px] md:col-span-2 md:row-span-2 md:min-h-0' : 'min-h-[140px] md:min-h-0'}
            />
          ))}
          <div
            className="flex min-h-[140px] flex-col items-center justify-center gap-1 bg-chip text-body md:min-h-0"
            role="img"
            aria-label="View more photos"
          >
            <Camera size={30} />
            <span className="px-2 text-center text-[13px] font-bold">View more photos</span>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-10">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
            <section className="flex flex-col gap-5">
              <div>
                <h1 className="text-[36px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">{listing.title}</h1>
                <p className="mt-2 text-[16px] text-body">
                  {listing.street}, {listing.neighborhood} · exact address after booking · hosted by {listing.hostName}
                </p>
              </div>
              <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
                {[
                  { k: 'Charger', v: `${listing.level} · ${listing.chargerKw} kW` },
                  { k: 'Plug', v: listing.plug, sub: listing.adapters !== 'NONE' ? 'Adapter available' : undefined },
                  { k: 'Solar', v: listing.solarKw > 0 ? `${listing.solarKw} kW` : 'None' },
                  { k: 'Spots', v: String(listing.spots) },
                ].map((c) => (
                  <div key={c.k} className="bg-white p-4">
                    <dt className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">{c.k}</dt>
                    <dd className="m-0 mt-1 text-[18px] font-extrabold text-ink">{c.v}</dd>
                    {c.sub && <p className="text-[13px] text-muted">{c.sub}</p>}
                  </div>
                ))}
              </dl>
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="trip">
              <h2 id="trip" className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Your trip to {destination.label}</h2>
              <div className="divide-y divide-line rounded-2xl border border-line">
                <div className="flex items-center gap-4 p-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-chip text-ink">
                    <Walk size={22} />
                  </span>
                  <div>
                    <p className="text-[16px] font-extrabold text-ink">
                      {ev.walkMinutes} min walk · {metersToMiles(ev.walkMeters).toFixed(1)} mi
                    </p>
                    <p className="text-[14px] text-muted">
                      Estimated from straight-line distance, from {listing.street} to {destination.label}
                    </p>
                  </div>
                </div>
                {destination.routes && destination.routes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-4 p-4">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] font-extrabold text-white"
                      style={{ background: destination.primary ? LINE_STYLES[destination.primary].stroke : '#586070' }}
                      aria-hidden="true"
                    >
                      T
                    </span>
                    <div className="min-w-[200px] flex-1">
                      <p className="text-[16px] font-extrabold text-ink">Routes serving {destination.label}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <RouteBadges routes={destination.routes} max={destination.routes.length} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-[14px] text-muted">
                    Transit routes aren’t shown for addresses yet. Pick a T station as your destination to see the routes that serve it.
                  </div>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="fit">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <h2 id="fit" className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Charger fit for your car</h2>
                <div className="min-w-[220px]">
                  <SelectField
                    label="Your car"
                    value={activeCar.id}
                    onChange={(e) => {
                      const next = carOptions.find((c) => c.id === e.target.value);
                      if (next) update({ car: next });
                    }}
                  >
                    {carOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.maxAcKw !== null ? ` · ${c.maxAcKw} kW` : ''}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
                <FitBar label="Charger" kw={listing.chargerKw} tone="grey" />
                <FitBar label="Your car max" kw={activeCar.maxAcKw} tone="grey" />
                <FitBar label="You’ll draw" kw={ev.pEff} tone="brand" />
              </div>
              {activeCar.maxAcKw === null ? (
                <FitNote tone="amber">
                  We don’t know your car’s top speed, so the price assumes the charger’s full {listing.chargerKw} kW.
                </FitNote>
              ) : ev.chargerSlower ? (
                <FitNote tone="amber">
                  This charger tops out at {listing.chargerKw} kW. Your {activeCar.name} can take {activeCar.maxAcKw} kW, so charging will be slower than your car allows.
                </FitNote>
              ) : carLimits ? (
                <FitNote tone="green">
                  Your {activeCar.name} tops out at {activeCar.maxAcKw} kW, so you pay for {activeCar.maxAcKw} kW of power, not the charger’s {listing.chargerKw} kW.
                </FitNote>
              ) : (
                <FitNote tone="green">This charger and your {activeCar.name} are a good match at {ev.pEff} kW.</FitNote>
              )}
              {usesAdapter && (
                <p className="text-[15px] text-body">
                  Host leaves a {listing.plug} → {activeCar.plug} adapter at the charger.
                </p>
              )}
              {!ev.plugOk && (
                <WarnNote>
                  The plug doesn’t fit your {activeCar.name} ({activeCar.plug}) and this host has no adapter for it.
                </WarnNote>
              )}
            </section>

            <section className="flex flex-col gap-4" aria-labelledby="green">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="green" className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Green Score</h2>
                {ev.greenScore !== null && (
                  <p className="text-[30px] font-extrabold tracking-[-0.02em] text-green-ink">
                    {ev.greenScore.toFixed(2)} <span className="text-[16px] font-bold text-muted">/ 1.00</span>
                  </p>
                )}
              </div>
              {t && ev.solarShare !== null ? (
                <div className="overflow-x-auto rounded-2xl border border-line">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
                    <thead className="bg-surface text-muted">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-bold">Term</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Your numbers</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Weight</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-line">
                        <th scope="row" className="px-4 py-3 font-semibold text-ink">Solar share</th>
                        <td className="px-4 py-3 text-right font-bold">{Math.round(t.solar.value * 100)}% of the charge</td>
                        <td className="px-4 py-3 text-right">× {GREEN_WEIGHTS.solar.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-extrabold">{t.solar.score.toFixed(3)}</td>
                      </tr>
                      <tr className="border-t border-line">
                        <th scope="row" className="px-4 py-3 font-semibold text-ink">Transit miles replaced</th>
                        <td className="px-4 py-3 text-right font-bold">{t.transit.value.toFixed(1)} mi ÷ {GREEN_REF_TRANSIT_MILES} mi (max 1)</td>
                        <td className="px-4 py-3 text-right">× {GREEN_WEIGHTS.transit.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-extrabold">{t.transit.score.toFixed(3)}</td>
                      </tr>
                      <tr className="border-t border-line">
                        <th scope="row" className="px-4 py-3 font-semibold text-ink">CO₂ avoided vs. gas</th>
                        <td className="px-4 py-3 text-right font-bold">{t.co2.value.toFixed(1)} kg ÷ {GREEN_REF_CO2_KG} kg (max 1)</td>
                        <td className="px-4 py-3 text-right">× {GREEN_WEIGHTS.co2.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-extrabold">{t.co2.score.toFixed(3)}</td>
                      </tr>
                      <tr className="border-t border-line bg-surface">
                        <th scope="row" className="px-4 py-3 font-extrabold text-ink" colSpan={3}>Green Score</th>
                        <td className="px-4 py-3 text-right font-extrabold text-green-ink">{ev.greenScore?.toFixed(3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <WarnNote>Solar data unavailable, so we can’t show a Green Score right now.</WarnNote>
              )}
              <p className="text-[13px] leading-[1.55] text-muted">
                Estimates, not meter readings. Charging while the host’s panels are producing means more of that solar power is used locally (local solar self-consumption), which raises the score. Assumes a 1 kW house load, 80% system efficiency and a sample sunny day. Transit miles are the straight-line distance to {destination.label}. Gas car 0.40 kg CO₂/mi, grid 0.33 kg CO₂/kWh (placeholder values).
              </p>
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="instructions">
              <h2 id="instructions" className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Parking instructions</h2>
              <p className="max-w-[640px] text-[16px] leading-[1.6] text-body">{listing.instructions}</p>
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="know">
              <h2 id="know" className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">Good to know</h2>
              <ul className="m-0 flex max-w-[640px] list-disc flex-col gap-2 pl-5 text-[16px] leading-[1.55] text-body">
                <li>Pickup ends your session. Minutes after your booked end cost {money(lateRate)}/min.</li>
                <li>Leaving early? There’s no refund for unused hours.</li>
                <li>Free cancellation until 12 hours before your start.</li>
                <li>Miles are estimates. Set your own charge limit in your car’s app.</li>
              </ul>
            </section>
          </div>

          <aside
            aria-label="Booking"
            className="flex min-w-0 flex-[1_1_340px] flex-col gap-5 rounded-[18px] border border-line bg-white p-[22px] shadow-panel"
          >
            <div>
              <p className="text-[30px] font-extrabold tracking-[-0.02em] text-ink">
                {money(ev.pricePerHr)}
                <span className="text-[16px] font-semibold text-muted">/hr</span>
              </p>
              <p className="text-[14px] text-muted">for your {activeCar.name}</p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-line-strong rounded-xl border border-line-strong">
              <div className="p-3">
                <label htmlFor="book-start" className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Start</label>
                <select
                  id="book-start"
                  value={startHour}
                  onChange={(e) => update({ startHour: Number(e.target.value) })}
                  className="mt-1 block w-full bg-transparent text-[16px] font-bold text-ink"
                >
                  {HOURS_OPTIONS.map((h) => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
              </div>
              <div className="p-3">
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">End</p>
                <p className="mt-1 py-0.5 text-[16px] font-bold text-ink">{fmtHour(startHour + hours)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-bold text-ink">Hours</span>
              <Stepper label="Hours" value={hours} min={1} max={12} onChange={(n) => update({ hours: n })} format={(n) => `${n} h`} />
            </div>

            <dl className="m-0 flex flex-col gap-2.5 text-[15px] text-body">
              <div className="flex justify-between gap-3">
                <dt>Electricity · {ev.pEff} kW × ${listing.rate.toFixed(2)}</dt>
                <dd className="m-0 font-bold text-ink">{money(ev.electricityPerHr)}/hr</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Host earnings</dt>
                <dd className="m-0 font-bold text-ink">{money(listing.earningsHr)}/hr</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{money(ev.pricePerHr)} × {hours} h</dt>
                <dd className="m-0 font-bold text-ink">{money(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Service fee ({Math.round(SERVICE_FEE * 100)}%)</dt>
                <dd className="m-0 font-bold text-ink">{money(serviceFee)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-3 text-[17px] font-extrabold text-ink">
                <dt>Total</dt>
                <dd className="m-0">{money(ev.total)}</dd>
              </div>
            </dl>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface p-3">
                <div className="text-[12px] font-bold text-muted">Estimated miles added</div>
                <div className="mt-0.5 text-[20px] font-extrabold text-ink">+{Math.round(ev.milesAdded)} mi</div>
              </div>
              <div className="rounded-xl bg-amber-bg p-3">
                <div className="text-[12px] font-bold text-amber-ink">Late rate ({LATE_MULTIPLIER}×)</div>
                <div className="mt-0.5 text-[20px] font-extrabold text-amber-deep">{money(lateRate)}/min</div>
              </div>
            </div>

            {!ev.plugOk ? (
              <WarnNote>This plug doesn’t fit your {activeCar.name} and the host has no adapter, so booking is turned off.</WarnNote>
            ) : !ev.open ? (
              <WarnNote>This charger isn’t open for your whole window. Try another time or charger.</WarnNote>
            ) : (
              <Button size="xl" className="w-full" onClick={book}>
                Book for {money(ev.total)}
              </Button>
            )}
            <p className="text-center text-[13px] text-muted">
              Payment is simulated in this demo. No key handoff, the car never moves, and the host never touches it.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
