import { offsetMeters, type LatLng } from '../lib/geo';
import PinPickerMap from './map/PinPickerMap';
import { ChevronLeft } from './Icons';
import { Button } from './ui';

const NUDGE_METERS = 5;

/**
 * Map + explicit confirmation for the exact charger location.
 * Any move (drag, map click, nudge, GPS) is reported through `onMove`; the parent clears `confirmed` when that happens,
 * so a pin is only ever "confirmed" for the exact spot the host last approved.
 */
export default function PinPicker({
  position,
  confirmed,
  onMove,
  onConfirm,
  onUnconfirm,
  recenterToken,
  fallbackCenter,
  error,
}: {
  position: LatLng | null;
  confirmed: boolean;
  onMove: (p: LatLng) => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  recenterToken: number;
  fallbackCenter: LatLng;
  error?: string;
}) {
  const arrow =
    'flex h-11 w-11 items-center justify-center rounded-full border border-line-strong bg-paper text-[18px] font-medium text-ink hover:border-brand hover:bg-brand-wash active:bg-brand-tint transition-colors disabled:opacity-55 disabled:text-disabled disabled:hover:border-line-strong';
  const step = (n: number, e: number) => () => position && onMove(offsetMeters(position, n, e));

  return (
    <div className="flex flex-col gap-3" data-testid="pin-picker">
      <div>
        <h3 className="text-[16px] font-semibold text-ink">Place the pin on your driveway or charger entrance</h3>
        <p className="text-[14px] text-body">Drag the pin or click the map to the exact spot, then confirm it. Drivers and the pickup check use this point.</p>
      </div>

      <div className="h-[320px] overflow-hidden rounded-card border border-line">
        <PinPickerMap position={position} onMove={onMove} recenterToken={recenterToken} fallbackCenter={fallbackCenter} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Nudge the pin" className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-muted">Nudge {NUDGE_METERS} m</span>
          <button type="button" className={arrow} aria-label="Nudge pin west" disabled={!position} onClick={step(0, -NUDGE_METERS)}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className={arrow} aria-label="Nudge pin north" disabled={!position} onClick={step(NUDGE_METERS, 0)}>
            <ChevronLeft size={18} className="rotate-90" />
          </button>
          <button type="button" className={arrow} aria-label="Nudge pin south" disabled={!position} onClick={step(-NUDGE_METERS, 0)}>
            <ChevronLeft size={18} className="-rotate-90" />
          </button>
          <button type="button" className={arrow} aria-label="Nudge pin east" disabled={!position} onClick={step(0, NUDGE_METERS)}>
            <ChevronLeft size={18} className="rotate-180" />
          </button>
        </div>
      </div>

      {confirmed && position ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-green-bg p-3.5" role="status" data-testid="pin-confirmed">
          <p className="text-[14px] font-medium text-green-ink">
            Pin confirmed at {position.lat.toFixed(5)}, {position.lng.toFixed(5)}.
          </p>
          <Button variant="secondary" size="nav" onClick={onUnconfirm}>
            Move pin
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!position} onClick={onConfirm}>
            Confirm pin location
          </Button>
          {position ? (
            <p className="text-[13px] text-muted">
              Pin at {position.lat.toFixed(5)}, {position.lng.toFixed(5)} (not confirmed yet).
            </p>
          ) : (
            <p className="text-[13px] text-muted">Choose an address or use your location to place the pin.</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] font-medium text-amber-ink">
          {error}
        </p>
      )}
    </div>
  );
}
