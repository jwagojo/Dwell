import { useCallback } from 'react';
import { ADDRESS_SEARCH_CREDIT, ADDRESS_TYPES, isMassachusetts, searchAddresses, type GeocodedAddress } from '../adapters/addressSearch';
import Combobox, { type ComboOption, type ComboSearch } from './Combobox';

export const addressSecondary = (a: GeocodedAddress) => [a.city, `${a.state} ${a.zip}`.trim()].filter(Boolean).join(', ');

/**
 * US street-address autocomplete (Mapbox with a token, otherwise OpenStreetMap through Photon), via the typed adapter.
 * Results outside Massachusetts are listed but flagged; the parent rejects them on selection.
 */
export default function AddressAutocomplete({
  label = 'Street address',
  value,
  onInputChange,
  onSelect,
  error,
  hint,
  inputId,
  placeholder = 'Start typing your street address',
}: {
  label?: string;
  value: string;
  onInputChange: (text: string) => void;
  onSelect: (address: GeocodedAddress) => void;
  error?: string;
  hint?: string;
  inputId?: string;
  placeholder?: string;
}) {
  const search = useCallback<ComboSearch<GeocodedAddress>>(async (q, signal) => {
    const r = await searchAddresses(q, { signal, types: ADDRESS_TYPES });
    if (!r.ok) return { ok: false, message: r.message, aborted: r.reason === 'ABORTED' };
    return {
      ok: true,
      options: r.results.map<ComboOption<GeocodedAddress>>((a) => ({
        id: a.id,
        primary: a.line1,
        secondary: addressSecondary(a),
        badge: isMassachusetts(a) ? undefined : 'Outside Massachusetts',
        payload: a,
      })),
    };
  }, []);

  return (
    <Combobox<GeocodedAddress>
      label={label}
      inputId={inputId}
      value={value}
      onInputChange={onInputChange}
      onSelect={(o) => onSelect(o.payload)}
      search={search}
      placeholder={placeholder}
      hint={hint}
      error={error}
      footerNote={ADDRESS_SEARCH_CREDIT}
    />
  );
}
