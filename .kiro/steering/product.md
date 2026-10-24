---
inclusion: always
---

# VoltLot Product Context

Full detail lives in `README.md` (v0.5), `.kiro/specs/voltlot-mvp/requirements.md`, and `design.md`. This file is a short orientation. Copy and Amplify guardrails are in `voltlot-rules.md` and are not repeated here.

## Purpose

VoltLot is peer-to-peer charge-and-ride for Massachusetts EV drivers. Hosts list an idle home charger and driveway. Drivers park near a destination (a T stop or a venue), plug in, and walk or ride transit the rest of the way. There is no key handoff, the car never moves, and the host never touches the car.

Many Boston-area drivers cannot charge at home, and public charging is scarce. Idle home chargers in outer neighborhoods fill that gap. Each listing shows the walk and transit options so the whole trip is visible before booking.

## Flows (summary; see README §3)

- **Host:** sign up (Cognito) → address, charger level, kW, plug, solar size, spots → mark which adapters they have → ZIP fills the local electricity rate (host can override) → set earnings per hour → listing photo and parking instructions → availability windows → see bookings.
- **Customer:** sign up with EV make, model, year (sets the car's max AC kW) → search by destination, date, and time → compare cards → book (payment faked) → arrival photo → plug in and go → "Pick up" (phone within the pickup radius plus a photo) ends the session.

## Core product rules

- Price is computed per car and is an upper bound on the host's electricity cost. Formulas are in README §5 and requirements 3.x.
- The session ends at the Pickup tap, not at the booked end time. Early pickup gets no refund. Overstay is billed per minute.
- The host provides any adapters. Customers are never asked whether they own one.
- Booking is allowed at any hour. Solar share is shown honestly, including about 0 overnight.
- Energy is always an estimate ("Estimated Miles Added"), never a promised full charge.

## MVP scope (must work live)

Landing page with a car-based pricing preview; Cognito onboarding for both roles; host listing with S3 photo; destination search with walk time and MBTA routes; listing cards (price for your car, estimated miles added, solar share, Green Score); plug and adapter mismatch handling; charger-slower-than-car badge; booking; arrival photo; geofenced Pickup with photo; late fee. Acceptance criteria: requirements.md 1 to 5.

## Mocked / seeded

- Payments (a confirmation screen only).
- Notifications (in-app only).
- About 15 seeded hosts in West Roxbury, Roslindale, Jamaica Plain, and Dorchester.

## Flex goals (separate from the MVP, not required for the demo)

Cheapest or fastest trip sort; AI unknown-car lookup via Bedrock; OpenEI time-of-use rates; refund for unused hours when the host rebooks; host dashboard; verification badges; peak avoidance (4 to 9 pm); grid-aware scheduling (ISO-NE); city impact page. In `tasks.md` these are the optional sections after the MVP checkpoint.

## Out of scope

Lockbox or key handoff, smart-meter readings and overage billing, car telematics, reviews, insurance, formal dispute flow. Cancellation, no-show release, host-cancel, and charger-broken reports appear in README edge cases but have no requirement yet, so do not build them without a decision.

## Demo story (3 minutes)

Book, park, charge, go: problem stat → host → customer → live app (enter car, search, compare, book, arrival photo, Pickup, Green Score) → impact line.

## Values that are provisional (do not treat as final rules)

README marks these `[PLACEHOLDER]`; requirements.md hardcodes some of them anyway:

- Pickup radius (50 m), late-fee multiplier (1.5×), service fee (10%), cancellation window (12 h, not in requirements).
- Host earnings ceiling (2× a suggested local parking rate) and the source of that suggested rate.
- Green Score weights (0.5 / 0.25 / 0.25) and reference values (20 mi, 5 kg).
- Gas CO2 per mile (0.40) and the ISO-NE grid factor (0.33 in requirements; README says "to look up").

Keep each in a single named constant so it can change in one place.

## Unresolved product decisions

Conflicts between documents are reported here, not resolved. Until the owner decides, implement the text of `requirements.md` for MVP behavior and flag the difference.

- **Incompatible plug:** README edge cases say the listing is hidden for that car. Requirement 2.6 says show a mismatch indication and disable booking. The landing page currently says "Listing Hidden".
- **Bedrock lookup:** README lists it as flex. Requirement 1.9 and the design treat it as part of onboarding. Manual kW entry alone satisfies 1.9.
- **Sort options:** README lists best fit or price for the MVP. Requirement 2.7 specifies only "Best Charger Fit".
- **Rate source:** the MVP uses EIA's Massachusetts statewide residential average (an estimate, not ZIP- or utility-specific, a couple of months old, host can override). OpenEI URDB for utility tariffs and time-of-use is a separate flex integration; a note appended to the end of the README still recommends URDB for the MVP.
- **Event destinations and transit miles:** which venues to seed, how search works beyond T stations, and how "transit miles replaced" is measured with no trip planner (README §10).
- **Host notified** (README edge cases) versus notifications "in-app only" (mocked): the host-side trigger is undefined.
- **Booking, cancellation, and double-booking rules** are not in the requirements.
- **Exact pin vs hidden address:** the host's confirmed pin drives public markers and distance search, so it reveals the driveway location before booking. Address text is hidden, the point is not. Needs a decision.
- **Destinations beyond stations:** addresses work as destinations, but transit routes and real walking times do not exist for them yet (no trip planner, no Directions).
- **Landing page claim** "protecting hosts 100%" is stronger than the "upper bound under stated assumptions" the specs support.
