# Dwell: Project Spec

**v0.5 · Oct 24, 2026 · Hackachusetts, Climate/Energy track**

Items marked [PLACEHOLDER] are temporary values. Items marked [?] still need a team decision.

## 1. Overview

**One-liner:** Dwell is peer-to-peer charge-and-ride for Massachusetts drivers. Park at a neighbor's EV charger near where you're going (a T stop, a concert venue, any destination), charge while you're away, and walk or ride the rest of the way.

**Use cases:** commuting (park near a T station), events and recreation (park at a nearby host and walk to the venue), any trip where the car sits for hours.

**Problem:** Many Boston-area EV drivers can't charge at home (renters, multi-family, street parking). Public charging is limited and slow to build. Meanwhile, home chargers in outer neighborhoods sit idle for long stretches.

**Solution:** Hosts list their charger and driveway. Drivers book a slot, park, plug in, and leave. No key handoff, so no host involvement. Each listing shows the walk to the destination and the nearest T station, T stops, and bus routes, so the full trip is visible before booking.

## 2. Scope tiers

| Tier | Contents |
|---|---|
| MVP (must work live) | Search by destination (T station first); listings with walk time, routes serving nearby stops, price for your car, miles added, solar share, Green Score; car-based pricing; charger-to-car fit flag; booking; host creates a listing with photo upload; arrival photo and Pickup (browser location check plus photo); plug and adapter display with mismatch flag; late fee |
| Faked | Payments, notifications (in-app only), about 15 seeded hosts (West Roxbury, Roslindale, JP, Dorchester) |
| Flex goals | Sort by cheapest or fastest trip; AI feature (candidate: unknown-car lookup or price suggestion via Bedrock); full OpenEI rate structures (time-of-use); refund for unused hours if the host rebooks; host dashboard (earnings, kWh, CO2); verification badges; peak avoidance (4-9pm); grid-aware scheduling (ISO-NE); city impact page |
| Out of scope | Lockbox/key handoff, smart-meter readings and overage billing, car telematics, reviews, insurance, formal dispute flow |

## 3. Core flows

**Host**
1. Sign up (Cognito). Enter address, charger level (L1/L2), charger kW, plug type (J1772/NACS), solar system size (kW), number of spots.
2. Mark which adapters you have (J1772 to NACS, NACS to J1772, both, or none). The host provides adapters, not the customer.
3. Enter your zip code. The app looks up the local average electricity rate and fills it in. You can override it with your own rate.
4. Enter how much you want to earn per hour (your parking value).
5. Upload listing photos (S3) and write parking instructions.
6. Set availability windows (any time of day, including overnight).
7. See bookings. (Dashboard is flex.)

**Customer**
1. Sign up and enter your EV make and model. This sets your car's max charging speed.
2. Search by destination (T station, venue, or address). Filter by plug type and charger level. Pick a date and time range.
3. Listing card shows: walk time to the destination, bus and T routes serving nearby stops, price per hour for your car, estimated miles added, solar share, Green Score. It warns if the charger is slower than your car can take. Sort by best charger fit or price. (Cheapest/fastest trip sort is flex.)
4. Book and pay (faked). The app flags a plug mismatch only if the host lacks the adapter you need.
5. Arrive, find the spot from the listing photos and instructions, take an arrival photo.
6. Set the charge limit in the car's own app, plug in, and go.
7. Return to the car and tap "Pick up." The app checks that your phone is within [PLACEHOLDER: 50 m] of the listing's address and asks for a pickup photo. This tap sets the actual end time of the session.

## 4. Booking rules

- Booking is allowed at any time of day. Daytime sessions have the highest solar share. Overnight sessions are allowed, and their solar share is shown honestly (about 0).
- The session ends when the customer completes Pickup, not at the booked end time.
- Late minutes = max(0, pickup time - booked end time).
- Early pickup: no refund for unused booked hours, because the slot was blocked for the full booking. This matches how Airbnb treats guests who leave early for personal reasons. (Flex: refund unused hours if the host rebooks the slot.)
- The car doesn't move. Availability windows are strict, since the host can't free the spot mid-booking. If needed, the host can stop the charging session at the charger. The host never touches the car.
- L1 and L2 are both allowed. L1 is priced lower and must be a dedicated outdoor-rated outlet, never an extension cord.
- The host provides any adapter. The listing shows plug type and available adapters.
- We promise estimated miles added, never a "full" charge.

## 5. Pricing and fees

**Why:** a car can only pull as much power as its onboard charger accepts. A flat hourly price loses money on cars that pull more (a Tesla) and overcharges cars that pull less (an older Leaf or Prius). So the price is computed per car.

**Inputs:** host's charger kW, customer's car max AC kW, host's electricity rate, host's earnings per hour.

- Effective draw: P_eff (kW) = min(charger kW, car max AC kW)
- Electricity cost per hour = P_eff x local rate ($/kWh)
- Price per hour = electricity cost per hour + host earnings per hour
- Customer total = (price per hour x booked hours + late fee) x (1 + service fee)

Because the price covers the car's maximum possible draw, it is an upper bound on the host's electricity cost. The host cannot lose money on electricity, and no meter is needed.

**Worked example:** 9.6 kW charger, $0.30/kWh, host wants $1.50/hr, 4-hour booking, 10% fee.

| Car | P_eff | Electricity/hr | Price/hr | Customer total | Miles added |
|---|---|---|---|---|---|
| Prius-class (3 kW max) | 3 kW | $0.90 | $2.40 | $10.56 | about 42 mi |
| Tesla-class (11 kW max) | 9.6 kW | $2.88 | $4.38 | $19.27 | about 134 mi |

- **Electricity rate (MVP):** the Massachusetts statewide average residential price from the EIA Open Data API (free key), published monthly in cents/kWh and converted to $/kWh. It is a statewide estimate, not ZIP-specific or utility-specific, and EIA reports it a couple of months late; the app shows the data month. The host can override it with the rate on their bill. If the lookup fails, use $0.30/kWh, labeled as a fallback estimate.
- **Electricity rate (flex):** full rate structures from the OpenEI Utility Rate Database, including time-of-use rates. If used, price against the highest rate in the booking window so the price stays an upper bound.
- **Unknown car:** assume it can draw the charger's full power. This keeps the host safe.
- **Host earnings ceiling:** 2x the app's suggested earnings, based on local parking rates [PLACEHOLDER]
- **Service fee:** 10%, added on top for the customer [PLACEHOLDER]
- **Late fee:** billed per minute after the booked end time at 1.5x the hourly price [PLACEHOLDER: multiplier]. Example: $2/hr price, late rate $3/hr, 30 minutes late = $1.50. No grace period.
- **Why the late fee is safe:** the late rate is at least the hourly price, which already covers the car's maximum electricity cost. The car stops drawing power when full, so the host can't lose money even if they aren't home.
- **Cancellation:** full refund if cancelled 12+ hours before the start, none after [PLACEHOLDER]

## 6. Estimates shown to users

**Miles added** (assumes about 3.5 mi/kWh):
miles added = P_eff x hours x 3.5

**Solar share** (labeled as an estimate; assumes 1 kW house load; sunlight from Open-Meteo):
solar kW (each hour) = system kW x (sunlight / 1000 W/m2) x 0.8
solar share = sum over hours of min( max(solar kW - 1, 0), P_eff ) / sum over hours of P_eff

The 1000 W/m2 is full sun and 0.8 accounts for losses. Overnight, solar share is about 0.

**Transit miles replaced:** distance from the listing to the destination along the walk/T/bus route. This is what the customer did not drive.

**Gas-equivalent CO2 saved (kg):**
miles added x gas-car kg CO2 per mile - grid kWh x grid kg CO2 per kWh
where grid kWh = P_eff x hours x (1 - solar share)

Placeholders: gas car about 0.4 kg/mile (EPA typical passenger vehicle, verify); ISO-NE grid factor (to look up).

**Green Score (0 to 1):**
G = w1 x solar share + w2 x min(transit miles / r2, 1) + w3 x min(gas CO2 saved / r3, 1)

[PLACEHOLDER] w1 = 0.5, w2 = 0.25, w3 = 0.25, r2 = 20 mi, r3 = 5 kg. Tune r2 and r3 after seeding data so scores spread across 0 to 1. The score must stay a visible formula, since judges will ask how it's calculated. Grid-aware scheduling would add a fourth term later.

## 7. Edge cases

| Case | Handling |
|---|---|
| Customer returns late | Late fee from the booked end time to the Pickup tap; host notified |
| Customer never taps Pickup | Late fee keeps running; host notified |
| Customer picks up early | No refund; session ends at the Pickup tap |
| Pickup tapped away from the listing | Blocked until within the pickup radius |
| Location permission denied | Fallback: photo only, flagged for host review |
| Host not home and car stays plugged in | No action; the hourly price already covers max electricity |
| No-show | Slot released after a grace period; cancellation policy applies |
| Host cancels or needs the charger | Customer notified and refunded |
| Host lacks the needed adapter | Flagged at booking; listing hidden for that car |
| Charger slower than the car | Shown on the listing card; ranked lower in "best fit" |
| Car model unknown | Assume full charger power for pricing; customer can enter kW manually |
| Charger broken on arrival | Customer reports with photo; refunded |
| Damage dispute | Arrival and pickup photos are the record |
| Condo or shared driveway | Host checks a "right to list" box |
| Can't find the spot | Listing photos and instructions; contact host in-app |
| Car finishes early | Nothing; the car's charge limit stops it (price is per hour booked) |
| Cloudy day or overnight | Solar share drops; price unchanged |

## 8. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind | Team knows React; Vite starts fast; Tailwind avoids CSS conflicts across four people |
| Data, auth, hosting | AWS Amplify Gen 2 (DynamoDB, Cognito, Hosting) | AWS is a sponsor; one TypeScript-defined tool, no servers |
| Photos | S3 (Amplify Storage) | Listing, arrival, and pickup photos share one upload flow |
| Map and walking time | Mapbox GL JS | Needs a free public access token; restrict it by URL |
| Location check | Browser Geolocation API | Checks the phone is near the listing at Pickup; EXIF location is unreliable |
| Car charging speed | Open EV Data (JSON, free) loaded into DynamoDB, plus a seeded fallback table | Has each car's max AC kW; verify US models first |
| Electricity rates | MVP: EIA Open Data API (free key), Massachusetts residential average. Flex: OpenEI URDB (separate integration) | One statewide estimate in $/kWh now; utility tariffs and time-of-use later |
| AI (flex) | Amazon Bedrock via an Amplify function | In-app model call; price stays a formula |
| Coding | Kiro | Development tool only; the deployed app does not call it |
| Transit | MBTA V3 API | Real stations, stops, routes, and schedules (no trip planner) |
| Solar | Open-Meteo | Free hourly sunlight forecast, no key |

DynamoDB can't do "within X miles" queries, so we filter by distance in the frontend, which is fine for about 50 hosts. Production would use a geo-capable database.

**Build order:** (1) frontend shell and map with seeded listings, (2) data: DynamoDB schema, seed hosts, car table, (3) booking flow, (4) host listing with S3 photos, (5) estimates, (6) car-based pricing, (7) Pickup check.

**Before the event:** one person completes the Amplify Gen 2 quickstart, someone creates the Mapbox token and the EIA API key, and we check the rules on allowed pre-event setup.

## 9. Demo video (3 minutes, recorded)

Story: **book, park, charge, go.**

1. Purpose: the problem in one stat.
2. What a host does.
3. What a customer does.
4. The app in action: enter a car, search, compare listings and prices, book, show the arrival photo and Pickup, show Green Score.
5. Conclusion and impact line.

## 10. Open questions

- **Why not a commercial charger?** Not settled. Draft answer: public chargers near venues and T stops are scarce or full, and Dwell adds capacity exactly where people already need to park. Verify event parking prices for the pitch.
- Confirm Open EV Data covers US models (Leaf, Bolt, Model Y, Prius Prime) and whether its AC kW is 1-phase or 3-phase.
- Trip time and cost per option (T, bus, walk) needs a source, since MBTA V3 has no trip planner.
- Event destinations: which venue to seed, and how destination search works beyond T stations.
- Pickup radius; refund and cancellation details; late fee multiplier; service fee %; price ceiling multiple.
- Green Score weights and reference values; EPA gas-car CO2 figure; ISO-NE grid emissions factor.
- Team roles (assigned; add them here).
- Does the AWS prize require specific services?
- MA electricity-resale rules: footnote for now, unverified.
- Stats still to verify: NREL (solar overlap), Argonne (home charging), ChargeLab (home access); drop or replace worldmetrics.org; look up the MA 2030 EV target and Boston's curbside charging programs.
- Pitch guardrails (carried over): don't call exported solar "wasted" (net metering); don't say "we don't want new chargers."

## 11. Decision log

| Decision | Why |
|---|---|
| Name: Dwell (renamed from VoltLot) | Team's choice |
| Not just commuting: events and recreation too | Same problem (parking near a destination); widens the market |
| Any time of day, including overnight | Hosts earn from idle chargers; solar share is shown honestly |
| Car-based pricing (min of charger and car kW) | Flat prices lose money on high-draw cars; this caps host cost |
| Price is an upper bound, no meter readings | Removes the smart-charger and L1 questions |
| Late fee at 1.5x the hourly price, prorated per minute | Always at least the hourly price, so the host stays covered; pushes on-time pickup |
| Pickup tap sets the session end, checked by browser location plus photo | EXIF location is often stripped and easy to edit |
| No refund for unused hours on early pickup | The slot was blocked; matches Airbnb's default for personal early departures |
| Average $/kWh per zip in MVP; OpenEI full rates are flex | Detailed structures are tiered and time-of-use, which takes real time to parse |
| Open EV Data plus a seeded fallback for car kW | Free source for max AC kW, with a deterministic backup |
| Host provides adapters | Customers shouldn't need to carry them |
| Gas CO2 defined from miles added minus grid emissions | Avoids duplicating the transit-miles input in Green Score |
| Trip-time sort is flex | MBTA V3 has no trip planner |
| No lockbox; customer plugs in and goes | Removes the key trust ask and the hardware question |
| Car never moves | No street-permit or insurance risk |
| Arrival and pickup photos for damage | Cheapest accountability that needs no insurance product |
| Fee on top for the customer | Host keeps their full price |
| S3 for photos; Mapbox for the map | S3 sits inside Amplify; Mapbox needs a token |
| Prize first, portfolio second | Drives scope toward a clean, demoable story |

## Changes from v0.4

- Named the project Dwell (originally VoltLot).
- Added Pickup (browser location check plus photo) as the session end.
- Late fee set to 1.5x the hourly price, prorated per minute, with no grace period.
- No refund for unused hours on early pickup.
- Electricity rates from the EIA Open Data API (MVP, statewide average) and OpenEI (flex, separate); car kW from Open EV Data.
- Moved the cheapest/fastest trip sort to flex.
- Removed the hero-scenario line.

1. Open-EV-Data (GitHub — Free / Open Source): Repo: open-ev-data/open-ev-data-dataset (or chargeprice/open-ev-data) What it has: A massive, community-maintained JSON file of almost every EV make, model, year, trim, usable_battery_size_kwh, and ac_charger.max_power_kw (the exact onboard Level 1/Level 2 kW limit you need). AFDC (Alternative Fuels Data Center) API by US Dept. of Energy (Free): Endpoint: developer.nrel.gov/api/vehicles/v1/light_duty_automobiles.json What it has: Official US government database of every EV sold in the US, including battery capacity and onboard charger acceptance rates.
    
2. ##############################################################################################################################################Data Source / APICost & AccessWhat It Gives YouBest Use CaseOpenEI / NREL Utility Rate Database (URDB) APIFree (US Dept. of Energy)Maps ZIP codes to utilities, residential flat rates, tiered structures, and Time-of-Use (TOU) schedules.MVP / Hackathon / Early Production. Zero cost, authoritative government data.