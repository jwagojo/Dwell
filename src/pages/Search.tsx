import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import DestinationSearch from '../components/DestinationSearch';
import CarPicker from '../components/CarPicker';
import Header from '../components/Header';
import ListingCard from '../components/ListingCard';
import MapView from '../components/MapView';
import NearMeButton from '../components/NearMeButton';
import AiSearchComingSoon from '../components/AiSearchComingSoon';
import { CONTROL, controlBorder, TextField } from '../components/form';
import { Bolt, ChevronDown, Close } from '../components/Icons';
import { InfoNote, Segmented } from '../components/ui';
import { startHasPassed } from '../features/session/bookingGuard';
import { DEFAULT_DESTINATION, placeName } from '../data/destinations';
import {
  SEARCH_RADIUS_M,
  evaluateListing,
  sortEvaluations,
  type Evaluation,
  type SortMode,
} from '../features/search/evaluateListing';
import { filterByRadius, METERS_PER_MILE } from '../features/search/filterListings';
import { todayIndex } from '../lib/availability';
import { fmtHour, fmtRange } from '../lib/format';
import { boundsAround, boundsContain, type GeoBounds } from '../lib/geo';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useApp, type LevelFilter } from '../state/AppState';
import { todaysIrradiance, useLiveDestination, useSunlight, useWalks } from '../state/useLiveData';
import { matchesSearchLimits, NO_SEARCH_LIMITS, type SearchLimits } from '../features/search/searchLimits';

/** Buttons that open the car and filter trays: the same height and border as the fields beside them. */
const TRIGGER =
  'inline-flex h-10 items-center gap-2 rounded-card border border-line-strong bg-paper px-3 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand';
const TRIGGER_OPEN = 'border-brand bg-brand-wash';

/** The captions to the left of the fields in the search bar. One row keeps the bar slim, so the map gets the room. */
const BAR_LABEL = 'shrink-0 text-[14px] font-medium text-ink';

const START_HOURS = Array.from({ length: 24 }, (_, h) => h);
const DURATIONS = Array.from({ length: 12 }, (_, i) => i + 1);
/** Radius choices, miles. The supported range is 0.1 to 25 (Req 2.1). */
const RADII = [0.25, 0.5, 1, 2, 5, 10, 25];
const fmtMiles = (mi: number) => `${mi} mi`;

/** Where an empty search box starts the map. Moving the map overrides it. */
const BROWSE_CENTER = { lat: DEFAULT_DESTINATION.lat, lng: DEFAULT_DESTINATION.lng };

/**
 * From this width the map fills the page and the chargers list floats over its right side (the `lg:` classes below).
 * Narrower, the map sits above the list. Keep the two in step.
 */
const FLOATING_LIST_QUERY = '(min-width: 1024px)';
/** Width of the floating list plus its 12px gap from the map's edge: the strip of map it covers. */
const LIST_COVERS_PX = 520 + 12;

export default function Search() {
  const { user, cars, activeCar, destination: chosen, startHour, hours, radiusMi, level, sort, listings, update, backend } = useApp();
  // The destination with live MBTA routes when the backend can look them up.
  const destination = useLiveDestination(chosen, backend);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limits, setLimits] = useState<SearchLimits>(NO_SEARCH_LIMITS);
  // Car and the extra filters are set less often than destination and time, so they open on demand.
  const [tray, setTray] = useState<'car' | 'filters' | null>(null);
  const carButton = useRef<HTMLButtonElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // The tray floats over the map like a menu, so a click anywhere outside the bar and the tray puts it away.
  useEffect(() => {
    if (!tray) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setTray(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [tray]);

  // On wide screens the list is a panel over the map that the driver can fold away to see all of it.
  const floating = useMediaQuery(FLOATING_LIST_QUERY);
  const [listOpen, setListOpen] = useState(true);
  const listHidden = floating && !listOpen;
  const covered = floating && listOpen ? LIST_COVERS_PX : 0;
  const showListButton = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterToggle = useRef<'button' | 'heading' | null>(null);
  useEffect(() => {
    // Folding the panel hands focus to the button that brings it back; opening it puts the reader at its top.
    if (focusAfterToggle.current === 'button') showListButton.current?.focus();
    if (focusAfterToggle.current === 'heading') listHeading.current?.focus();
    focusAfterToggle.current = null;
  }, [listOpen]);
  function toggleList(open: boolean) {
    focusAfterToggle.current = open ? 'heading' : 'button';
    setListOpen(open);
  }

  // What the map shows right now. Chargers inside it are the results, whether or not there is a destination.
  const [area, setArea] = useState<GeoBounds>(() => boundsAround(destination ?? BROWSE_CENTER, SEARCH_RADIUS_M));

  // The box may be empty: then the driver is browsing the map and no destination is set.
  const [toText, setToText] = useState(destination?.label ?? '');
  // Keep the box in sync when the destination changes elsewhere (landing, host home).
  useEffect(() => setToText(destination?.label ?? ''), [destination?.id, destination?.label]);
  const dayIndex = todayIndex();

  // With a destination: everything within the radius of it. Without one: whatever the map shows.
  const nearby = useMemo(
    () => (destination ? filterByRadius(listings, destination, radiusMi) : listings.filter((l) => boundsContain(area, l))).filter((l) => level === 'any' || l.level === level),
    [listings, destination, radiusMi, area, level],
  );
  // Live data (tasks.md 18.5). One sunlight lookup for the area; routed walks for the listings in it.
  const sunPoint = destination ?? { lat: (area.north + area.south) / 2, lng: (area.east + area.west) / 2 };
  const { series } = useSunlight(sunPoint);
  const irradiance = todaysIrradiance(series, startHour, hours);
  const walks = useWalks(destination, nearby);

  const { shown, hiddenByPlug, notOpen, outsideLimits } = useMemo(() => {
    const win = { startHour, hours, dayIndex };
    const evaluated = nearby
      .map((l) => evaluateListing(l, activeCar, destination, win, { irradiance, walk: walks.get(l.id) ?? null }))
      .filter((e): e is Evaluation => e !== null);
    return {
      hiddenByPlug: evaluated.filter((e) => !e.plugOk).length,
      notOpen: evaluated.filter((e) => e.plugOk && !e.open).length,
      outsideLimits: evaluated.filter((e) => e.plugOk && e.open && !matchesSearchLimits(e, limits)).length,
      shown: sortEvaluations(
        evaluated.filter((e) => e.plugOk && e.open && matchesSearchLimits(e, limits)),
        sort,
      ),
    };
  }, [nearby, destination, activeCar, startHour, hours, dayIndex, sort, limits, irradiance?.join(','), walks]);
  const radiusArea = useMemo(() => (destination ? boundsAround(destination, radiusMi * METERS_PER_MILE) : null), [destination, radiusMi]);

  if (!user) return <Navigate to="/signup" replace />;

  const activeFilters = (level !== 'any' ? 1 : 0) + (limits.maxTotalUsd !== null ? 1 : 0) + (limits.maxWalkMinutes !== null ? 1 : 0);

  const nowHour = new Date().getHours();
  const startPassed = startHasPassed(startHour, Date.now());
  const effectiveSelected = shown.some((e) => e.listing.id === selectedId) ? selectedId : (shown[0]?.listing.id ?? null);

  return (
    <div className="flex min-h-dvh flex-col lg:h-screen lg:min-h-[640px]">
      <Header wide compact />

      {/* One wrapper, so Escape closes an open tray from anywhere inside the bar or the tray. It stacks above the map. */}
      <div
        ref={barRef}
        className="relative z-40"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && tray) {
            e.stopPropagation();
            (tray === 'car' ? carButton : filtersButton).current?.focus();
            setTray(null);
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-paper px-6 py-2">
          <div className="flex min-w-[280px] flex-1 items-center gap-2 sm:max-w-[560px]">
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
                className="flex items-center gap-2"
                labelClassName={BAR_LABEL}
                inputClassName={`h-10 min-w-0 flex-1 ${CONTROL} ${controlBorder()}`}
              />
            </div>
            <NearMeButton
              size="nav"
              label="Near me"
              className="shrink-0"
              onLocated={(d) => {
                setToText(d.label);
                update({ destination: d });
              }}
              messageClassName="absolute left-0 top-full z-30 mt-1 w-[280px] rounded-card border border-line bg-paper px-3 py-2 shadow-panel"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="search-radius" className={BAR_LABEL}>Within</label>
            <select
              id="search-radius"
              value={radiusMi}
              disabled={!destination}
              title={destination ? undefined : 'Add a destination to search by distance. Without one, the results are what the map shows.'}
              onChange={(e) => update({ radiusMi: Number(e.target.value) })}
              className="h-10 rounded-card border border-line-strong bg-paper px-3 text-[16px] font-medium text-ink disabled:text-muted"
            >
              {(RADII.includes(radiusMi) ? RADII : [...RADII, radiusMi].sort((a, b) => a - b)).map((mi) => (
                <option key={mi} value={mi}>
                  {fmtMiles(mi)}
                </option>
              ))}
            </select>
          </div>

          <div role="group" aria-labelledby="search-when-label" className="flex items-center gap-2">
            <span id="search-when-label" className={BAR_LABEL}>When</span>
            <div className="flex h-10 items-center gap-2 rounded-card border border-line-strong bg-paper px-3 text-[16px] font-medium text-ink">
              Today from
              <select
                aria-label="Start time"
                value={startHour}
                onChange={(e) => update({ startHour: Number(e.target.value) })}
                className="bg-transparent py-1 font-medium text-ink underline decoration-line-strong underline-offset-4"
              >
                {START_HOURS.map((h) => (
                  <option key={h} value={h} disabled={h < nowHour}>
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
          </div>

          <div className="flex items-center gap-2">
            <span className={BAR_LABEL}>Car</span>
            <button
              ref={carButton} type="button" aria-expanded={tray === 'car'} aria-controls="search-tray"
              aria-label={`Your car: ${activeCar.name}. Change car`} title={activeCar.name}
              onClick={() => setTray(tray === 'car' ? null : 'car')}
              className={`${TRIGGER} max-w-[200px] ${tray === 'car' ? TRIGGER_OPEN : ''}`}
            >
              <span className="truncate">{activeCar.name}</span>
              <ChevronDown size={16} className={`shrink-0 transition-transform ${tray === 'car' ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className={BAR_LABEL}>Filters</span>
            <button
              ref={filtersButton} type="button" aria-expanded={tray === 'filters'} aria-controls="search-tray"
              aria-label={activeFilters > 0 ? `Filters, ${activeFilters} applied` : 'Filters'}
              onClick={() => setTray(tray === 'filters' ? null : 'filters')}
              className={`${TRIGGER} ${tray === 'filters' ? TRIGGER_OPEN : ''}`}
            >
              Level, budget, walk
              {activeFilters > 0 && (
                <span aria-hidden="true" className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[12px] font-semibold text-on-ink">{activeFilters}</span>
              )}
              <ChevronDown size={16} className={`shrink-0 transition-transform ${tray === 'filters' ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {tray && (
          // Opens over the map instead of pushing it down.
          <div id="search-tray" className="absolute inset-x-3 top-full mt-1 max-h-[min(70vh,560px)] overflow-y-auto rounded-card border border-line-strong bg-surface px-4 py-3 shadow-panel">
            {tray === 'car' ? (
              <CarPicker cars={cars} value={activeCar} onChange={(next) => update({ car: next })} />
            ) : (
              <div role="group" aria-label="Level, budget and walking limit" className="flex flex-wrap items-end gap-x-5 gap-y-3">
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
                <div className="w-[150px]">
                  <TextField label={limits.budgetExclusive ? 'Total below ($)' : 'Max total ($)'} type="number" min="0" max="10000" step="0.01" placeholder="Any budget"
                    value={limits.maxTotalUsd ?? ''} onChange={(e) => {
                      const value = e.target.value === '' ? null : Number(e.target.value);
                      if (value === null || (Number.isFinite(value) && value >= 0 && value <= 10_000)) setLimits((current) => ({ ...current, maxTotalUsd: value }));
                    }} />
                </div>
                <div className="w-[150px]">
                  <TextField label="Max walk (min)" type="number" min="1" max="120" step="1" placeholder="Any walk"
                    value={limits.maxWalkMinutes ?? ''} onChange={(e) => {
                      const value = e.target.value === '' ? null : Number(e.target.value);
                      if (value === null || (Number.isInteger(value) && value >= 1 && value <= 120)) setLimits((current) => ({ ...current, maxWalkMinutes: value }));
                    }} />
                </div>
                {activeFilters > 0 && (
                  <button type="button" className="min-h-10 px-2 text-[14px] font-medium text-brand underline underline-offset-4"
                    onClick={() => { update({ level: 'any' }); setLimits(NO_SEARCH_LIMITS); }}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Wide screens: the map fills the page and the list floats over its right side. Narrow: the map sits above the list. */}
      <div className="relative flex flex-col lg:min-h-0 lg:flex-1">
        <div
          className="relative h-[380px] shrink-0 lg:absolute lg:inset-0 lg:h-auto"
          aria-label="Map of chargers"
          style={{ '--map-inset-right': `${covered}px` } as CSSProperties}
        >
          <AiSearchComingSoon />
          <MapView
            inset={covered}
            radiusArea={radiusArea}
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

        {listHidden && (
          <button
            ref={showListButton} type="button" aria-expanded={false} aria-controls="search-results" onClick={() => toggleList(true)}
            className="absolute right-3 top-3 z-20 inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-paper px-4 text-[15px] font-semibold text-ink shadow-panel transition-colors hover:border-brand hover:bg-brand-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="text-brand"><Bolt size={16} /></span>
            Show {shown.length} charger{shown.length === 1 ? '' : 's'}
          </button>
        )}

        <section
          id="search-results"
          aria-label="Chargers"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && floating) { e.stopPropagation(); toggleList(false); }
          }}
          className={`flex flex-col gap-4 px-6 py-5 lg:absolute lg:right-3 lg:top-3 lg:z-20 lg:max-h-[calc(100%-1.5rem)] lg:w-[520px] lg:overflow-y-auto lg:rounded-card lg:border lg:border-line-strong lg:bg-paper lg:px-5 lg:pb-5 lg:pt-0 lg:shadow-panel ${listHidden ? 'hidden' : ''}`}
        >
          {/* Stays at the top of the panel while the list scrolls, so the fold-away button is always in reach. */}
          <div className="flex items-start justify-between gap-3 lg:sticky lg:top-0 lg:z-10 lg:-mx-5 lg:bg-paper lg:px-5 lg:pb-1 lg:pt-4">
            <h1 ref={listHeading} tabIndex={-1} className="text-[24px] font-semibold text-ink focus:outline-none">
              {destination ? `Chargers near ${placeName(destination)}` : 'Chargers on the map'}
            </h1>
            {floating && (
              <button
                type="button" aria-label="Hide chargers list" aria-expanded aria-controls="search-results" onClick={() => toggleList(false)}
                className="-mr-1.5 -mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
              >
                <Close size={18} />
              </button>
            )}
          </div>

          <div className="-mt-3 flex flex-col gap-1 lg:-mt-2">
            <p className="text-[14px] font-medium text-muted">
              {shown.length} charger{shown.length === 1 ? '' : 's'}, {fmtRange(startHour, hours)}. Prices for your {activeCar.name}.
            </p>
            <p className="text-[13px] text-muted">
              {destination
                ? `Within ${fmtMiles(radiusMi)} of ${placeName(destination)}. Miles shown are estimated miles added.${walks.size === 0 ? ' Walk times are estimates.' : ''}`
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

          {startPassed && <InfoNote>{fmtHour(startHour)} has already passed today. Pick a later start to book.</InfoNote>}
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
          {(limits.maxTotalUsd !== null || limits.maxWalkMinutes !== null) && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-body" aria-label="Additional search filters">
              {limits.maxTotalUsd !== null && <span className="rounded-full bg-surface px-3 py-1">{limits.budgetExclusive ? 'Under' : 'Up to'} ${limits.maxTotalUsd.toFixed(2)} total, including service fee</span>}
              {limits.maxWalkMinutes !== null && <span className="rounded-full bg-surface px-3 py-1">Estimated walk ≤ {limits.maxWalkMinutes} min</span>}
              <button type="button" className="min-h-10 px-2 text-brand underline" onClick={() => setLimits(NO_SEARCH_LIMITS)}>Clear limits</button>
            </div>
          )}
          {outsideLimits > 0 && <InfoNote>{outsideLimits} compatible, open charger{outsideLimits === 1 ? '' : 's'} in this search area {outsideLimits === 1 ? 'doesn’t' : 'don’t'} meet your budget or walking limit. Adjust or clear the limits to see more.</InfoNote>}
          {limits.maxWalkMinutes !== null && !destination && <InfoNote>Choose a destination to see chargers within your walking limit.</InfoNote>}

          {shown.length === 0 ? (
            <div className="rounded-card border border-line p-6 text-[16px] text-body">
              {destination
                ? `No chargers within ${fmtMiles(radiusMi)} of ${placeName(destination)} for this filter. Try a wider radius.`
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
