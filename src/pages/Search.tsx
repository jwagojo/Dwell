import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import DestinationSearch from '../components/DestinationSearch';
import { SelectField } from '../components/form';
import Header from '../components/Header';
import ListingCard from '../components/ListingCard';
import MapView from '../components/MapView';
import NearMeButton from '../components/NearMeButton';
import { InfoNote, Segmented } from '../components/ui';
import { DEFAULT_DESTINATION, placeName } from '../data/destinations';
import { EV_MODELS, carById } from '../data/evFallbackSeed';
import {
  SEARCH_RADIUS_M,
  evaluateListing,
  sortEvaluations,
  type Evaluation,
  type SortMode,
} from '../features/search/evaluateListing';
import { todayIndex } from '../lib/availability';
import { fmtHour, fmtRange } from '../lib/format';
import { boundsAround, boundsContain, type GeoBounds } from '../lib/geo';
import { useApp, type LevelFilter } from '../state/AppState';
import type { Car } from '../types/listing';

const START_HOURS = Array.from({ length: 24 }, (_, h) => h);
const DURATIONS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Where an empty search box starts the map. Moving the map overrides it. */
const BROWSE_CENTER = { lat: DEFAULT_DESTINATION.lat, lng: DEFAULT_DESTINATION.lng };

export default function Search() {
  const { user, car: ownCar, activeCar, destination, startHour, hours, level, sort, listings, update } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // What the map shows right now. Chargers inside it are the results, whether or not there is a destination.
  const [area, setArea] = useState<GeoBounds>(() => boundsAround(destination ?? BROWSE_CENTER, SEARCH_RADIUS_M));

  // The box may be empty: then the driver is browsing the map and no destination is set.
  const [toText, setToText] = useState(destination?.label ?? '');
  // Keep the box in sync when the destination changes elsewhere (landing, host home).
  useEffect(() => setToText(destination?.label ?? ''), [destination?.id, destination?.label]);
  const dayIndex = todayIndex();

  const { shown, hiddenByPlug, notOpen } = useMemo(() => {
    const win = { startHour, hours, dayIndex };
    const evaluated = listings
      .filter((l) => boundsContain(area, l))
      .filter((l) => level === 'any' || l.level === level)
      .map((l) => evaluateListing(l, activeCar, destination, win))
      .filter((e): e is Evaluation => e !== null);
    return {
      hiddenByPlug: evaluated.filter((e) => !e.plugOk).length,
      notOpen: evaluated.filter((e) => e.plugOk && !e.open).length,
      shown: sortEvaluations(
        evaluated.filter((e) => e.plugOk && e.open),
        sort,
      ),
    };
  }, [listings, area, destination, level, activeCar, startHour, hours, dayIndex, sort]);

  if (!user) return <Navigate to="/signup" replace />;

  const effectiveSelected = shown.some((e) => e.listing.id === selectedId) ? selectedId : (shown[0]?.listing.id ?? null);
  const carOptions: Car[] = ownCar && !carById(ownCar.id) ? [ownCar, ...EV_MODELS] : EV_MODELS;
  const carLabel = (c: Car) => `${c.name}${c.maxAcKw !== null ? `, ${c.maxAcKw} kW` : ''}`;

  return (
    <div className="flex min-h-dvh flex-col lg:h-screen lg:min-h-[640px]">
      <Header wide />

      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-line bg-paper px-6 py-3">
        <div className="flex min-w-[260px] flex-1 items-end gap-2 sm:max-w-[560px]">
          <div className="min-w-0 flex-1">
            <DestinationSearch
              label="To"
              value={toText}
              placeholder="T station or address"
              onInputChange={(t) => {
                setToText(t);
                // Emptying the box clears the destination. The map stays where it is and keeps listing what it shows.
                if (!t.trim() && destination) update({ destination: null });
              }}
              onSelect={(d) => {
                setToText(d.label);
                update({ destination: d });
              }}
              // Leaving the box without choosing a suggestion puts the current destination back (or leaves it empty).
              onBlur={() => setToText(destination?.label ?? '')}
            />
          </div>
          <NearMeButton
            size="md"
            label="Near me"
            className="shrink-0"
            onLocated={(d) => {
              setToText(d.label);
              update({ destination: d });
            }}
            messageClassName="absolute left-0 top-full z-30 mt-1 w-[280px] rounded-card border border-line bg-paper px-3 py-2 shadow-panel"
          />
        </div>

        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[14px] font-medium text-ink">When</legend>
          <div className="flex h-12 items-center gap-2 rounded-card border border-line-strong bg-paper px-3.5 text-[16px] font-medium text-ink">
            Today from
            <select
              aria-label="Start time"
              value={startHour}
              onChange={(e) => update({ startHour: Number(e.target.value) })}
              className="bg-transparent py-1 font-medium text-ink underline decoration-line-strong underline-offset-4"
            >
              {START_HOURS.map((h) => (
                <option key={h} value={h}>
                  {fmtHour(h)}
                </option>
              ))}
            </select>
            for
            <select
              aria-label="Duration in hours"
              value={hours}
              onChange={(e) => update({ hours: Number(e.target.value) })}
              className="bg-transparent py-1 font-medium text-ink underline decoration-line-strong underline-offset-4"
            >
              {DURATIONS.map((h) => (
                <option key={h} value={h}>
                  {h} h
                </option>
              ))}
            </select>
          </div>
        </fieldset>

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
                {carLabel(c)}
              </option>
            ))}
          </SelectField>
        </div>

        <Segmented<LevelFilter>
          label="Level"
          value={level}
          onChange={(v) => update({ level: v })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'L2', label: 'L2' },
            { value: 'L1', label: 'L1' },
          ]}
          className="pb-0.5"
        />
      </div>

      <div className="flex flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        <div className="h-[380px] shrink-0 lg:h-auto lg:flex-1" aria-label="Map of chargers">
          <MapView
            destination={destination}
            browseCenter={BROWSE_CENTER}
            onAreaChange={setArea}
            pins={shown.map((e) => ({
              id: e.listing.id,
              lat: e.listing.lat,
              lng: e.listing.lng,
              price: e.pricePerHr,
              title: e.listing.title,
            }))}
            selectedId={effectiveSelected}
            onSelect={setSelectedId}
          />
        </div>

        <section aria-label="Chargers" className="flex flex-col gap-4 px-6 py-5 lg:w-[min(720px,55%)] lg:shrink-0 lg:overflow-y-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[24px] font-semibold text-ink">
                {destination ? `Chargers near ${placeName(destination)}` : 'Chargers on the map'}
              </h1>
              <p className="text-[14px] font-medium text-muted">
                {shown.length} charger{shown.length === 1 ? '' : 's'}, {fmtRange(startHour, hours)}. Prices for your {activeCar.name}.
              </p>
              <p className="text-[13px] text-muted">
                {destination
                  ? 'Miles shown are estimated miles added. Walk times are estimates.'
                  : 'Miles shown are estimated miles added. Drag the map to search another area, or add a destination to see walks, routes and Green Scores.'}
              </p>
            </div>
            <Segmented<SortMode>
              label="Sort"
              value={sort}
              onChange={(v) => update({ sort: v })}
              options={[
                { value: 'fit', label: 'Best fit' },
                { value: 'price', label: 'Lowest price' },
              ]}
            />
          </div>

          {hiddenByPlug > 0 && (
            <InfoNote>
              {hiddenByPlug === 1
                ? `1 listing is hidden: the plug doesn’t fit your ${activeCar.name} and the host has no adapter.`
                : `${hiddenByPlug} listings are hidden: the plug doesn’t fit your ${activeCar.name} and those hosts have no adapter.`}
            </InfoNote>
          )}
          {notOpen > 0 && (
            <InfoNote>
              {notOpen === 1 ? '1 more isn’t open for this whole time window.' : `${notOpen} more aren’t open for this whole time window.`}
            </InfoNote>
          )}

          {shown.length === 0 ? (
            <div className="rounded-card border border-line p-6 text-[16px] text-body">
              {destination
                ? `No chargers near ${placeName(destination)} for this filter yet.`
                : 'No chargers in this part of the map for this filter. Drag the map or zoom out to look elsewhere.'}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {shown.map((ev) => (
                <ListingCard
                  key={ev.listing.id}
                  ev={ev}
                  car={activeCar}
                  destination={destination}
                  selected={ev.listing.id === effectiveSelected}
                  onSelect={() => setSelectedId(ev.listing.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
