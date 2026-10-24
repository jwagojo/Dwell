import type { Car } from '../types/listing';

// Seeded fallback subset of Open EV Data (max AC charge rate). Replaced by the EVSpec table in the backend tasks.
export const EV_MODELS: Car[] = [
  { id: 'tesla-my', name: 'Tesla Model Y', maxAcKw: 11.5, plug: 'NACS' },
  { id: 'tesla-m3', name: 'Tesla Model 3', maxAcKw: 11.5, plug: 'NACS' },
  { id: 'chevy-bolt', name: 'Chevy Bolt EV', maxAcKw: 11.5, plug: 'J1772' },
  { id: 'hyundai-ioniq5', name: 'Hyundai IONIQ 5', maxAcKw: 10.9, plug: 'J1772' },
  { id: 'ford-mach-e', name: 'Ford Mustang Mach-E', maxAcKw: 10.5, plug: 'J1772' },
  { id: 'nissan-leaf', name: 'Nissan Leaf', maxAcKw: 6.6, plug: 'J1772' },
  { id: 'toyota-prius-prime', name: 'Toyota Prius Prime', maxAcKw: 3.3, plug: 'J1772' },
  { id: 'rivian-r1s', name: 'Rivian R1S', maxAcKw: 11.5, plug: 'J1772' },
];

export const OTHER_CAR_ID = 'other';
export const DEFAULT_CAR: Car = EV_MODELS.find((c) => c.id === 'nissan-leaf')!;

export const carById = (id: string): Car | undefined => EV_MODELS.find((c) => c.id === id);
