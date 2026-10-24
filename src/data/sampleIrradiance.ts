/**
 * SAMPLE clear autumn day: solar irradiance in W/m2 for each hour of the day (index = hour starting 0..23).
 * Not live data. Open-Meteo replaces it in the search integration (tasks.md 18.5).
 */
export const SAMPLE_IRRADIANCE_BY_HOUR: number[] = [
  0, 0, 0, 0, 0, 0, 20, 120, 280, 430, 540, 600, 620, 590, 500, 370, 210, 60, 0, 0, 0, 0, 0, 0,
];

/** Hourly values for a booking that starts at `startHour` and lasts `hours`, wrapping past midnight. */
export function sampleIrradianceFor(startHour: number, hours: number): number[] {
  return Array.from({ length: Math.ceil(hours) }, (_, i) => SAMPLE_IRRADIANCE_BY_HOUR[(startHour + i) % 24]);
}
