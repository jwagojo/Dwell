# VoltLot
# [Name TBD]: Project Spec

**v0.3 · Oct 24, 2026 · Hackachusetts, Climate/Energy track**

Items marked [?] are open and need a team decision.

## 1. Overview

**One-liner:** Peer-to-peer charge-and-ride for Massachusetts commuters. Park at a neighbor's solar-powered EV charger near a T stop, plug in, and take transit to work.

**Problem:** Many Boston EV drivers can't charge at home (renters, multi-family, street parking). Public charging is limited and slow to build. Meanwhile, home chargers in outer neighborhoods sit idle during the day.

**Solution:** Hosts list their charger and driveway. Commuters book a daytime slot, park, plug in, and leave. No key handoff, so no host involvement. Each listing shows the nearest T station, T stops, and bus routes, so the full commute is visible before booking.

## 2. Scope tiers

| Tier | Contents |
|---|---|
| MVP (must work live) | Search by T station (MBTA API); listings with walk time, transit options, miles added, solar share, Green Score; booking; host creates a listing with photo upload; arrival/departure photo upload; L1/L2 and plug-type display with mismatch flag; late fee shown on pickup deadline |
| Faked | Payments, notifications (in-app only), about 15 seeded hosts (West Roxbury, Roslindale, JP, Dorchester) |
| Flex goals | Host dashboard (earnings, kWh, CO₂); verification badges; peak avoidance (4–9pm); grid-aware scheduling (ISO-NE); city impact page; one AI feature (decide after MVP works) |
| Out of scope | Lockbox/key handoff, car telematics, real meters, reviews, insurance, formal dispute flow |

Proposed split of the features kept from v0.2: mismatch flag, L1, and late fee in MVP (small, mostly display logic); dashboard in flex. Team's call.

## 3. Core flows

**Host**
1. Sign up (Cognito); enter address, charger level (L1/L2), plug type (J1772/NACS), solar system size (kW), number of spots.
2. Upload listing photos (S3) and write parking instructions.
3. Set availability windows and an hourly price within the allowed range.
4. See bookings. (Dashboard is flex.)

**Commuter**
1. Search by T station; filter by plug type, charger level, date/time.
2. Listing card: walk time to station, transit options (T, bus), charger level, price/hr, estimated miles added, solar share, Green Score.
3. Book and pay (faked). The app flags plug mismatches here.
4. Arrive, find the spot from the listing photos and instructions, take an arrival photo.
5. Set the charge limit in the car's own app, plug in, take transit.
6. Return before the pickup deadline, take a departure photo.

## 4. Booking rules

- Primary use is daytime, when solar produces.
- The host sets the pickup deadline per booking. A late fee applies after it.
- The car doesn't move. Availability windows are strict, since the host can't free the spot mid-booking.
- L1 and L2 are both allowed. L1 is priced lower and must be a dedicated outdoor-rated outlet, never an extension cord.
- Plug type (J1772 or NACS) is shown on every listing. The customer brings an adapter if needed.
- We promise estimated miles added, never a "full" charge.

## 5. Pricing and fees

- The host sets an hourly price within a range. The host keeps this amount.
- **Floor:** covers the host's electricity at about $0.30/kWh (verify against the host's utility). L2: 7.7 kW × $0.30 ≈ $2.31/hr. L1: 1.4 kW × $0.30 ≈ $0.42/hr.
- **Ceiling:** a multiple of the suggested price [?]
- **Service fee:** a small percentage, added on top for the customer [?: exact %]
- Customer pays: price × hours × (1 + fee)

## 6. Estimates shown to users

**Miles added** (assumes about 3.5 mi/kWh; the car's onboard charger limit is unknown):

miles ≈ charger kW × hours × 3.5

L1 ≈ 5 mi/hr (a 9-hour day ≈ 44 mi). L2 ≈ 27 mi/hr.

**Solar share** (labeled as an estimate; assumes 1 kW house load; sunlight from Open-Meteo):

solar kW (each hour) = system kW × (sunlight ÷ 1000 W/m²) × 0.8

solar share = Σ min( max(solar kW − 1, 0), charger kW ) ÷ Σ charger kW

The 1000 W/m² is full sun and 0.8 accounts for losses. Example: 3.5 kW of panels minus a 1 kW house load leaves 2.5 kW, so a 7.7 kW L2 is about 32% solar that hour and a 1.4 kW L1 is 100%.

**Transit miles replaced:** driving miles avoided because the last leg is on the T or bus. [?: needs a destination input]

**Gas-equivalent CO₂ avoided:** transit miles × gas-car g CO₂/mile. The EPA figure still needs a primary-source lookup.

**Solar CO₂ avoided:** solar kWh × ISO-NE emissions factor (to look up).

**Green Score (MVP):** a weighted mix of three inputs, each normalized to 0–1:

G = w1 × solar share + w2 × min(transit miles ÷ r2, 1) + w3 × min(gas CO₂ avoided ÷ r3, 1)

[?: weights w1–w3 and reference values r2, r3 undecided] The score must stay a visible formula, since judges will ask how it's calculated. Grid-aware scheduling would add a fourth term later.

## 7. Edge cases

| Case | Handling |
|---|---|
| Customer returns late | Late fee; host notified; car stays |
| No-show | Slot released after a grace period [?: cancellation policy] |
| Host cancels or needs the charger | Customer notified and refunded |
| Plug mismatch | Flagged at booking; adapter reminder |
| Charger broken on arrival | Customer reports with photo; refunded |
| Damage dispute | Arrival and departure photos are the record |
| Condo or shared driveway | Host checks a "right to list" box |
| Can't find the spot | Listing photos and instructions; contact host in-app |
| Car finishes early | Nothing; the car's charge limit stops it |
| Cloudy day | Solar share drops; price unchanged |

## 8. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind | Team knows React; Vite starts fast; Tailwind avoids CSS conflicts across four people |
| Data, auth, hosting | AWS Amplify Gen 2 (DynamoDB, Cognito, Hosting) | AWS is a sponsor; one TypeScript-defined tool, no servers |
| Photos | S3 (Amplify Storage) | Host listing photos and arrival/departure photos share one upload flow |
| Map | Mapbox GL JS | Needs a free public access token; restrict it by URL |
| Coding | Kiro | Spec-driven, so this spec can feed it; sponsor credits |
| Transit | MBTA V3 API | Real stations, stops, and bus routes |
| Solar | Open-Meteo | Free hourly sunlight forecast, no key |

DynamoDB can't do "within X miles" queries, so we filter by distance in the frontend, which is fine for about 50 hosts. Production would use a geo-capable database.

**Before the event:** one person completes the Amplify Gen 2 quickstart, someone creates the Mapbox token, and we check the rules on allowed pre-event setup.

## 9. Demo video (3 minutes, recorded)

Story: **book, park, charge, go.**

1. Purpose: the problem in one stat.
2. What a host does.
3. What a