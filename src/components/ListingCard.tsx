import { Link } from 'react-router-dom';
import type { Evaluation } from '../features/search/evaluateListing';
import type { Destination } from '../types/destination';
import type { Car } from '../types/listing';
import { Plug, Sun } from './Icons';
import { GreenPill, LevelTag, NewBadge, Photo, RouteBadges, WalkChip, WarnNote } from './ui';

export default function ListingCard({
  ev,
  car,
  destination,
  selected,
  onSelect,
}: {
  ev: Evaluation;
  car: Car;
  destination: Destination | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const l = ev.listing;
  // Routes exist only for T stations. Addresses get none: we do not invent transit service.
  const routes = destination?.routes ?? [];
  const usesAdapter = l.plug !== car.plug && ev.plugOk;

  return (
    <article
      onMouseEnter={onSelect}
      onFocusCapture={onSelect}
      className={`flex flex-wrap gap-4 rounded-2xl border bg-white p-3.5 transition-shadow hover:shadow-lg ${
        selected ? 'border-brand shadow-selected ring-1 ring-brand' : 'border-line'
      }`}
    >
      <Photo src={l.photos[0]} index={l.id.length} className="h-[150px] w-[150px] shrink-0 rounded-xl">
        <span className="absolute bottom-2 left-2">
          <LevelTag>
            {l.level} · {l.chargerKw} kW
          </LevelTag>
        </span>
      </Photo>

      <div className="flex min-w-[220px] flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[18px] font-extrabold leading-tight text-ink">
                <Link to={`/listing/${l.id}`} className="hover:text-brand">
                  {l.title}
                </Link>
              </h3>
              {l.isNew && <NewBadge />}
            </div>
            <p className="text-[14px] text-muted">
              {l.street} · {l.neighborhood}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[22px] font-extrabold leading-none text-ink">
              ${ev.pricePerHr.toFixed(2)}
              <span className="text-[13px] font-semibold text-muted">/hr</span>
            </div>
            <div className="mt-1 text-[13px] font-semibold text-muted">${ev.total.toFixed(2)} total</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {ev.walkMinutes !== null && <WalkChip minutes={ev.walkMinutes} />}
          {routes.length > 0 && <RouteBadges routes={routes} max={5} />}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[14px] font-semibold text-body">
          <span className="inline-flex items-center gap-1.5">
            <Plug size={16} />
            {l.plug} · {l.chargerKw} kW
          </span>
          <span title="Estimated miles added" aria-label={`${Math.round(ev.milesAdded)} estimated miles added`}>
            +{Math.round(ev.milesAdded)} mi
          </span>
          {ev.solarShare !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <Sun size={16} />
              {Math.round(ev.solarShare * 100)}% solar
            </span>
          ) : (
            <span className="text-muted">Solar data unavailable</span>
          )}
          {ev.greenScore !== null && <GreenPill score={ev.greenScore} />}
        </div>

        {ev.chargerSlower && car.maxAcKw !== null && (
          <WarnNote>
            Charger slower than your car's max acceptance rate. Charger is {l.chargerKw} kW; your {car.name} can take {car.maxAcKw} kW.
          </WarnNote>
        )}
        {usesAdapter && (
          <p className="text-[14px] text-body">
            Host leaves a {l.plug} → {car.plug} adapter at the charger
          </p>
        )}
      </div>
    </article>
  );
}
