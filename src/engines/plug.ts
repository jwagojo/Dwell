export type Plug = 'J1772' | 'NACS';
export type Adapters = 'NONE' | 'J1772_TO_NACS' | 'NACS_TO_J1772' | 'BOTH';

/**
 * A car can charge when the plugs match, or when the host leaves the adapter that converts
 * the charger's plug to the car's plug. Hosts provide adapters; customers are never asked.
 */
export function isPlugBookable(hostPlug: Plug, hostAdapters: Adapters, carPlug: Plug): boolean {
  if (hostPlug === carPlug) return true;
  if (hostAdapters === 'BOTH') return true;
  if (hostPlug === 'J1772' && carPlug === 'NACS') return hostAdapters === 'J1772_TO_NACS';
  if (hostPlug === 'NACS' && carPlug === 'J1772') return hostAdapters === 'NACS_TO_J1772';
  return false;
}
