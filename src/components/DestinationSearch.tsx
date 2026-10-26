import { useCallback } from 'react';
import { ADDRESS_SEARCH_CREDIT, DESTINATION_TYPES, searchAddresses, type GeocodedAddress } from '../adapters/addressSearch';
import { addressToDestination, stationToDestination } from '../data/destinations';
import { STATIONS } from '../data/stations';
import type { Destination } from '../types/destination';
import { addressSecondary } from './AddressAutocomplete';
import Combobox, { type ComboOption, type ComboSearch } from './Combobox';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** T stations whose name or alias contains the text. Instant, no network. */
export function matchStations(query: string): ComboOption<Destination>[] {
  const q = norm(query);
  if (!q) return [];
  return STATIONS.filter((s) => norm(s.name).includes(q) || s.aliases?.some((a) => norm(a).includes(q)))
    .slice(0, 4)
    .map((s) => ({ id: `station-${s.id}`, primary: s.name, secondary: s.group, badge: 'T station', payload: stationToDestination(s) }));
}

const badgeFor = (a: GeocodedAddress) => (a.featureType === 'address' ? 'Address' : a.featureType === 'street' ? 'Street' : 'Area');

/**
 * "Where are you headed?" field: T stations match instantly, and any US address, street or neighborhood comes from
 * the address search (Mapbox with a token, otherwise OpenStreetMap). If the lookup fails, stations still work.
 */
export default function DestinationSearch({
  label,
  value,
  onInputChange,
  onSelect,
  onBlur,
  error,
  hint,
  inputId,
  placeholder = 'T station or address',
  labelClassName,
  inputClassName,
}: {
  label: string;
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (destination: Destination) => void;
  onBlur?: () => void;
  error?: string;
  hint?: string;
  inputId?: string;
  placeholder?: string;
  labelClassName?: string;
  inputClassName?: string;
}) {
  const search = useCallback<ComboSearch<Destination>>(async (q, signal) => {
    const r = await searchAddresses(q, { signal, types: DESTINATION_TYPES });
    if (!r.ok) return { ok: false, message: r.message, aborted: r.reason === 'ABORTED' };
    return {
      ok: true,
      options: r.results.map<ComboOption<Destination>>((a) => ({
        id: a.id,
        primary: a.line1,
        secondary: addressSecondary(a),
        badge: badgeFor(a),
        payload: addressToDestination(a),
      })),
    };
  }, []);

  return (
    <Combobox<Destination>
      label={label}
      inputId={inputId}
      value={value}
      onInputChange={onInputChange}
      onSelect={(o) => onSelect(o.payload)}
      onBlur={onBlur}
      search={search}
      localOptions={matchStations}
      placeholder={placeholder}
      hint={hint}
      error={error}
      labelClassName={labelClassName}
      inputClassName={inputClassName}
      unavailableNote="T stations still work."
      footerNote={ADDRESS_SEARCH_CREDIT}
      emptyText="No matching places. Try a T station or a street address."
    />
  );
}
