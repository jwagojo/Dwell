---
inclusion: always
---

# Dwell Product Context

Full detail lives in `README.md` (v0.5), `.kiro/specs/voltlot-mvp/requirements.md`, and `design.md`. This file is a short orientation. Copy and backend guardrails are in `voltlot-rules.md` and are not repeated here.

## Purpose

Dwell is peer-to-peer charge-and-ride for Massachusetts EV drivers. Hosts list an idle home charger and driveway. Drivers park near a destination (a T stop or an address), plug in, and walk or ride transit the rest of the way. There is no key handoff, the car never moves, and the host never touches the car.

Many Boston-area drivers cannot charge at home, and public charging is scarce. Idle home chargers fill that gap. Each listing shows the walk and transit options so the whole trip is visible before booking.

## Current workflow (as built in the prototype)

One account does both jobs. There is no driver or host role.

- **Account:** sign up with name, US phone (10 digits), email, a password with upper and lower case, a number and a symbol (the Cognito policy), and the terms (no car is asked for). `?next=host` continues to hosting; otherwise sign-up lands on Search. Sign-in restores the account's car, listing and booking. A dev-only demo login exists (`demo@dwell.test`, see `state/demoAccount.ts`).
- **Landing (`/`):** destination search ("Find chargers", "Use my current location", popular stations), a sample priced ledger and map near Central for a default car (Nissan Leaf), the four steps (Book, park, charge, go), and "Become a host". A banner shows a live booking, the last receipt, or a reservation that ended without a check-in.
- **Host:** the header button "Host an EV charger" (or "Switch to Hosting" once a listing exists, "Switch to Driving" on host pages) opens a 6-step wizard at `/host/new`:
  1. Your spot: address from suggestions or by hand (MA only, ZIP required), a confirmed map pin, spot type, 1 to 4 spots, right to list.
  2. Charger: level, kW (L2 3.0 to 19.2, L1 1.44 to 1.92), plug, one checkbox for the adapter the host leaves at the charger, outdoor-outlet check for L1, solar size.
  3. Pricing: rate auto-filled from EIA (or the labeled $0.30 estimate) and never overwritten once edited; earnings per hour, capped at 2× the suggested $2.75; a live "what drivers pay" table.
  4. Photos (1 to 8) and parking instructions.
  5. Availability windows (days plus whole-hour start and end; overnight allowed).
  6. Review, host terms, publish.
  One listing per account. `/host` shows it and offers edit (`/host/edit`, opens on Review) and remove.
- **Driver:** Search (`/search`) takes a destination (T station, address, or Near me), today's start hour and 1 to 12 hours, the car (8 seeded models), level filter and sort (Best fit or Lowest price). Results are the listings inside the visible map area. Listings whose plug doesn't fit and that have no adapter are hidden with a count note; listings not open for the whole window are hidden with a count note.
- **Listing (`/listing/:id`):** trip, charger fit, Green Score breakdown, instructions, and a booking panel. Booking is blocked for your own listing, while another booking is live, for a past start hour, for a plug mismatch, or outside the availability windows. Booking freezes the price and goes straight to the session (payment is simulated, no confirmation screen).
- **Session (`/session`):** Arrived (arrival photo required, then "I'm plugged in. Start session") → Charging (time left or minutes late, per-minute late rate) → Pickup (location check within 50 m plus a pickup photo; location denied allows a photo-only pickup flagged for host review) → Done (receipt, late fee, service fee, estimated miles added, solar share, CO₂, Green Score). A reservation that is never checked in ends at its booked end with no charge. A demo-controls panel sets the clock and phone position.

## Core product rules

- Price is computed per car and is an upper bound on the host's electricity cost. Formulas are in README §5 and requirements 3.x.
- The session ends at the Pickup tap, not at the booked end time. Early pickup gets no refund. Overstay is billed per minute.
- The host provides any adapters. Drivers are never asked whether they own one.
- Booking is allowed at any hour the listing is open. Solar share is shown honestly, including about 0 overnight.
- Energy is always an estimate ("Estimated Miles Added"), never a promised full charge.
- Drivers see only the street name and neighborhood until they book; the full address appears in the session.

## MVP scope (must work live)

Landing page with a car-based pricing preview; Cognito sign-up (one account for driving and hosting); host listing with S3 photo; destination search with walk time and MBTA routes; listing cards (price for your car, estimated miles added, solar share, Green Score); plug and adapter mismatch handling; charger-slower-than-car badge; booking; arrival photo; geofenced Pickup with photo; late fee. Acceptance criteria: requirements.md 1 to 6. The prototype covers the flows on sample data and `localStorage`. The AWS backend (Cognito, the API, DynamoDB, S3) is built but not deployed or connected to the app; MBTA, Open-Meteo and Mapbox Directions are not built.

## Mocked / seeded

- Payments (simulated; the booking goes straight to the session).
- Notifications and host messaging (not in the demo).
- 34 sample listings, seeded into DynamoDB by `npm run seed` from `scripts/seed-data/`: 30 in Cambridge, Somerville, Allston, Brookline and Dorchester (`mockListings.json`) plus 4 in Jamaica Plain, Roslindale, West Roxbury and Dorchester (`listings.ts`). The app reads them from the API; the landing page shows four of them as a fixed illustration (`src/data/heroPreview.ts`).
- Sunlight (one sample clear-day irradiance profile), T station routes, and walking times (straight-line estimate).

## Flex goals (separate from the MVP, not required for the demo)

Cheapest or fastest trip sort; AI unknown-car lookup via Bedrock; OpenEI time-of-use rates; refund for unused hours when the host rebooks; host earnings dashboard; verification badges; peak avoidance (4 to 9 pm); grid-aware scheduling (ISO-NE); city impact page. In `tasks.md` these are the optional sections after the MVP checkpoint.

## Out of scope

Lockbox or key handoff, smart-meter readings and overage billing, car telematics, reviews, insurance, formal dispute flow. Cancellation, no-show release, host-cancel, and charger-broken reports appear in README edge cases but have no requirement yet, so do not build them without a decision. The listing page says "Cancellation isn't part of this demo yet."

## Demo story (3 minutes)

Book, park, charge, go: problem stat → host lists a charger → driver searches a station, compares, books → arrival photo → Pickup → receipt and Green Score → impact line. The demo-controls panel on `/session` covers late, early and out-of-range pickups.

## Values that are provisional (do not treat as final rules)

README marks these `[PLACEHOLDER]`; requirements.md hardcodes some of them anyway. Each lives in `src/engines/constants.ts`:

- Pickup radius (50 m), late-fee multiplier (1.5×), service fee (10%), cancellation window (12 h, not in requirements or code).
- Suggested host earnings ($2.75/hr, `SUGGESTED_EARNINGS_HR`) and the 2× cap; the README ties the cap to a local parking rate whose source is open.
- Green Score weights (0.5 / 0.25 / 0.25) and reference values (20 mi, 5 kg).
- Gas CO2 per mile (0.40) and the ISO-NE grid factor (0.33 in requirements; README says "to look up").

The L2 minimum (3.0 kW), L1 maximum (1.92 kW) and 50 kW solar bound now live in `engines/constants.ts` (`L2_KW_MIN`, `L1_KW_MAX`, `SOLAR_KW_MAX`).

## Unresolved product decisions

Conflicts between documents are reported here, not resolved. Until the owner decides, follow `requirements.md` for MVP behavior and flag the difference.

- **Car at sign-up vs at search:** the prototype asks for the car in Search and on the listing page (8 seeded models). There is no manual kW or "my car isn't listed" entry yet, so requirement 1.9 is unmet in the UI (the engines accept `null`).
- **Search area:** requirement 2.1 specifies a 0.1 to 25 mile radius (default 2). The prototype lists what is inside the map view, starting 2.5 km around the destination, with no radius control.
- **Time window:** bookings are today only, whole hours, 1 to 12 hours. Requirement 2.1 says "date and time window".
- **Adapters:** the host UI offers one adapter checkbox (the conversion that matters for their plug). `BOTH` exists only in sample data.
- **Bedrock lookup:** README lists it as flex. Requirement 1.9 and the design treat it as part of onboarding. Manual kW entry alone satisfies 1.9.
- **Rate source:** the MVP uses EIA's Massachusetts statewide residential average (an estimate, not ZIP- or utility-specific, a couple of months old, host can override). OpenEI URDB is a separate flex integration; a note at the end of the README still recommends URDB for the MVP.
- **Event destinations and transit miles:** venues are not seeded, and "transit miles replaced" is the straight-line distance from listing to destination (README §10).
- **Host notified** (README edge cases) versus notifications not in the demo: the host-side trigger is undefined.
- **Cancellation and double-booking:** not in the requirements. The prototype allows one live booking per account and does not check other accounts' bookings.
- **Exact pin vs hidden address:** the host's confirmed pin drives public markers, so it reveals the driveway location before booking. Address text is hidden, the point is not.
- **Destinations beyond stations:** addresses work as destinations, but transit routes and real walking times do not exist for them yet.
- **Right to list:** the wizard requires the checkbox but the listing does not store it (design decision 4 wants `right_to_list` on `HostListing`).
