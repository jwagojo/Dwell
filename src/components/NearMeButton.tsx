import { useEffect, useRef, useState } from 'react';
import { locateUser } from '../adapters/geolocation';
import { currentLocationDestination } from '../data/destinations';
import { isInMassachusettsArea } from '../lib/massachusetts';
import type { Destination } from '../types/destination';
import { Locate } from './Icons';
import { Button } from './ui';

type Status = { kind: 'idle' } | { kind: 'locating' } | { kind: 'error'; message: string };

const OUTSIDE_MESSAGE = 'You’re outside Massachusetts, where Dwell has no chargers yet. Search for a station or address instead.';

/**
 * "Use my location": asks the browser where the driver is (only when they press it), then hands back a destination
 * so the page can look for chargers around that point. Failures and refusals explain what to do next.
 */
export default function NearMeButton({
  onLocated,
  label = 'Use my current location',
  size = 'nav',
  className = '',
  messageClassName = 'mt-2',
}: {
  onLocated: (destination: Destination) => void;
  label?: string;
  size?: 'nav' | 'md';
  className?: string;
  /** Where the explanation appears, relative to the button (it sits inside a `relative` wrapper) */
  messageClassName?: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function locate() {
    setStatus({ kind: 'locating' });
    const result = await locateUser();
    if (!mounted.current) return;
    if (!result.ok) return setStatus({ kind: 'error', message: result.message });
    if (!isInMassachusettsArea(result.lat, result.lng)) return setStatus({ kind: 'error', message: OUTSIDE_MESSAGE });
    setStatus({ kind: 'idle' });
    onLocated(currentLocationDestination(result.lat, result.lng));
  }

  const locating = status.kind === 'locating';
  return (
    <div className={`relative ${className}`}>
      <Button variant="secondary" size={size} onClick={locate} disabled={locating} aria-busy={locating}>
        <Locate size={18} />
        {locating ? 'Finding you…' : label}
      </Button>
      <span role="status" className="sr-only">
        {locating ? 'Finding your location' : ''}
      </span>
      {status.kind === 'error' && (
        <p role="alert" className={`text-[13px] font-medium text-amber-ink ${messageClassName}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
