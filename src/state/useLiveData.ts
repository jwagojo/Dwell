import { useEffect, useMemo, useState } from 'react';
import { getWalks, type Walk } from '../adapters/mapboxWalking';
import { getSunlight } from '../adapters/openMeteo';
import type { LatLng } from '../lib/geo';
import { localDate, windowIrradiance, type IrradianceSeries } from '../lib/openMeteo';
import type { Destination } from '../types/destination';
import type { DwellBackend } from './backend';

/**
 * Live data for Search and the listing page (tasks.md 18.5). Each source degrades on its own: sunlight to "solar data
 * unavailable", walks to the straight-line estimate, transit to the sample station routes. Listings always render.
 */

/** Hourly sunlight near `point` (rounded to ~1 km, so a whole search area shares one lookup). */
export function useSunlight(point: LatLng | null): { series: IrradianceSeries | null; loading: boolean } {
  const key = point ? `${point.lat.toFixed(2)},${point.lng.toFixed(2)}` : null;
  const [state, setState] = useState<{ key: string | null; series: IrradianceSeries | null }>({ key: null, series: null });
  useEffect(() => {
    if (!key || !point) return;
    let cancelled = false;
    void getSunlight(point.lat, point.lng).then((r) => {
      if (!cancelled) setState({ key, series: r.ok ? r.series : null });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return { series: state.key === key ? state.series : null, loading: key !== null && state.key !== key };
}

/** Today's booked hours from a sunlight series (Boston date), or null when unavailable. */
export function todaysIrradiance(series: IrradianceSeries | null, startHour: number, hours: number, nowMs = Date.now()): number[] | null {
  return series ? windowIrradiance(series, localDate(nowMs), startHour, hours) : null;
}

/** Routed walks from the destination to each listing; listings it can't route keep the estimate. */
export function useWalks(destination: LatLng | null, listings: (LatLng & { id: string })[]): Map<string, Walk> {
  const ids = listings.map((l) => l.id).join(',');
  const destKey = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : null;
  const [walks, setWalks] = useState<{ key: string; walks: Map<string, Walk> }>({ key: '', walks: new Map() });
  const key = `${destKey}|${ids}`;
  useEffect(() => {
    if (!destination || listings.length === 0) return;
    let cancelled = false;
    void getWalks(destination, listings).then((r) => {
      if (!cancelled && r.ok) setWalks({ key, walks: r.walks });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return walks.key === key ? walks.walks : EMPTY;
}
const EMPTY = new Map<string, Walk>();

/**
 * The destination with live MBTA routes near it (backend mode). Stations keep their sample routes and addresses
 * have none until the lookup answers, or if it fails.
 */
export function useLiveDestination(destination: Destination | null, backend: DwellBackend | null): Destination | null {
  const key = destination ? `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}` : null;
  const [live, setLive] = useState<{ key: string | null; routes: string[] | null }>({ key: null, routes: null });
  useEffect(() => {
    if (!backend || !destination || !key) return;
    let cancelled = false;
    void backend.api.getTransit(destination).then((r) => {
      if (!cancelled) setLive({ key, routes: r.ok && r.data.transit ? r.data.transit.routes : null });
    });
    return () => {
      cancelled = true;
    };
  }, [key, backend]);
  return useMemo(() => {
    if (!destination) return null;
    const routes = live.key === key ? live.routes : null;
    return routes && routes.length > 0 ? { ...destination, routes } : destination;
  }, [destination, live, key]);
}
