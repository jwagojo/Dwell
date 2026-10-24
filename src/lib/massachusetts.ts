/** Massachusetts ZIP codes run 01001 to 02791, plus 05501 and 05544 (Andover and Holtsville IRS centers). */
export const isMassachusettsZip = (zip: string): boolean => /^(0(1\d{3}|2[0-7]\d{2})|055(01|44))$/.test(zip);

/** "12 Pearl St" -> "Pearl St". Public listing summaries show the street name only. */
export const stripHouseNumber = (line: string): string => line.trim().replace(/^\d+[A-Za-z]?(?:-\d+)?\s+/, '');
