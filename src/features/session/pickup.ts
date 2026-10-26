import { PICKUP_RADIUS_M } from '../../engines/constants';

/**
 * The Pickup geofence. The check uses the exact distance, never a rounded one, so 50.4 m is outside a 50 m radius.
 * The distance shown to the driver is rounded toward the answer: down when inside, up when outside. That way the
 * number on screen never contradicts the result (no "50 m away" next to "too far").
 */
export function checkPickupDistance(distanceM: number, radiusM: number = PICKUP_RADIUS_M): { ok: boolean; metersShown: number } {
  const ok = distanceM <= radiusM;
  return { ok, metersShown: ok ? Math.floor(distanceM) : Math.ceil(distanceM) };
}
