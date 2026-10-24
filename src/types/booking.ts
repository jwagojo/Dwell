import type { Destination } from './destination';

export type BookingStatus = 'RESERVED' | 'ACTIVE' | 'COMPLETED';

export interface BookingResult {
  pickupAt: number;
  lateMinutes: number;
  lateFee: number;
  subtotal: number;
  serviceFee: number;
  total: number;
  /** True when location was denied and the host must review the pickup photo */
  flagged: boolean;
  milesAdded: number;
  solarShare: number | null;
  co2Kg: number | null;
  greenScore: number | null;
}

export interface Booking {
  id: string;
  listingId: string;
  /** Midnight (local) of the booking day, epoch ms */
  dayStart: number;
  startHour: number;
  hours: number;
  /**
   * Where the driver was heading, frozen at booking time; used for the transit-miles term of the Green Score.
   * null when they booked from the map without a destination, in which case there is no Green Score.
   */
  destination: Destination | null;
  carName: string;
  carKw: number | null;
  /** Frozen at booking time so settlement cannot drift */
  pEff: number;
  pricePerHr: number;
  total: number;
  status: BookingStatus;
  result?: BookingResult;
}
