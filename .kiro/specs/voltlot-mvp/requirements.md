# Requirements Document

## Introduction

Dwell is a peer-to-peer charge-and-ride marketplace for Massachusetts electric vehicle (EV) drivers. Hosts list idle residential Level 1 (120V) and Level 2 (240V) EV chargers and driveways; Customers book a time window, park, plug in without key handoff, and walk or ride transit the rest of the way. The two primary Customer segments are commuters parking near MBTA T stations and visitors parking near event venues.

The core design constraint is that Hosts do not have smart meters, so pricing must be deterministic and formula-driven: the hourly price is mathematically guaranteed to cover the maximum possible electricity draw of the specific car booked, both during the reservation and if the Customer overstays. A transparent, formula-backed Green Score communicates the climate benefit of combining residential solar charging with transit miles replaced.

This document specifies the requirements for the Dwell MVP. It is organized into six requirements covering the landing page and one-account onboarding, search and transit integration, deterministic pricing, the solar/green-score engine, the geofenced check-in/pickup flow, and booking. A dedicated Correctness Properties section captures the two property-based-testing (PBT) invariants that must hold across the stated input domains.

### Prototype Status

The workflow in Requirements 1, 2, 5 and 6 is built as a browser prototype on sample data with `localStorage` in place of Cognito, DynamoDB and S3. Criteria the prototype meets only with a stand-in carry a "Prototype:" note. The note describes current behavior; the criterion stays the MVP target until the owner changes it. `tasks.md` tracks the remaining work.

### Technology Constraints

The following stack constraints are strict and inform the acceptance criteria but are not themselves requirements:

- Frontend: React 18 + Vite + TypeScript + Tailwind CSS.
- Backend, Auth, and Hosting: plain AWS defined with AWS CDK v2 (TypeScript), without Amplify: Amazon Cognito user pool for accounts, Amazon API Gateway HTTP API with a Cognito JWT authorizer in front of AWS Lambda (Node.js), Amazon DynamoDB for data, and Amazon S3 + Amazon CloudFront for hosting.
- Photo Storage: Amazon S3 (private bucket) sharing one unified upload flow for Listing, Arrival, and Pickup photos, through short-lived presigned URLs issued by the API.
- Maps: MapLibre GL JS with OpenFreeMap tiles (no key), with client-side filtering over DynamoDB listings and Haversine distances.
- Address Search: Mapbox Geocoding API v6 (restricted public `pk.` token) when configured, otherwise Photon (OpenStreetMap).
- Walking Time: Mapbox Directions (walking profile).
- Location Verification: Browser Geolocation API (`navigator.geolocation`) verifying the phone is within 50 meters of listing coordinates at Pickup.
- EV Specs Dataset: Open EV Data JSON loaded into DynamoDB (EVSpec table) with a seeded fallback table of US models (`max_ac_kw`).
- Electricity Rates: U.S. EIA Open Data API v2 (`electricity/retail-sales`), monthly Massachusetts statewide residential average retail price, reported in cents per kWh and converted to dollars per kWh. The value is a statewide estimate, not ZIP-specific or utility-specific, and EIA reports it with a lag of a couple of months. $0.30/kWh is the fallback estimate. OpenEI URDB, for utility tariffs and Time-of-Use rates, is a separate future (flex) integration.
- Transit Data: MBTA V3 API for subway/commuter rail stations, bus stops, routes, and schedules.
- Solar Forecast: Open-Meteo API for free hourly solar irradiance (W/m^2), no API key required.
- AI Flex: Amazon Bedrock invoked from a Lambda function behind the API for unknown vehicle lookup fallback while keeping pricing strictly formula-driven.

## Glossary

- **Account**: One Dwell sign-up, identified by email. The same account can book chargers (as a Customer) and list one charger (as a Host). There is no role field.
- **Host**: An account holder who lists an idle residential Level 1 or Level 2 EV charger and driveway on Dwell and receives earnings when a Customer books it.
- **Customer (Driver)**: An account holder who books a Host listing for a time window, parks, charges, and uses transit or walking to reach a destination.
- **car_max_AC_kW**: The maximum alternating-current charge acceptance rate of the Customer's specific EV, in kilowatts, sourced from the EVSpec table or a fallback lookup.
- **charger_kW**: The rated power output of the Host's charger, in kilowatts.
- **P_eff**: The effective charging power for a booking, defined as `min(charger_kW, car_max_AC_kW)`, in kilowatts. P_eff is the power at which electricity can actually flow for the booked car.
- **local_rate**: The electricity rate used for the electricity part of the price, in dollars per kilowatt-hour. By default it is an estimate: the Massachusetts statewide residential average from the EIA Open Data API (not specific to the Host's ZIP or utility), or the $0.30/kWh fallback estimate when that lookup fails. The Host may replace it with the rate on their electricity bill.
- **host_earnings_hr**: The Host's desired earnings per hour, in dollars, capped at 2x the suggested hourly earnings (`SUGGESTED_EARNINGS_HR`, a placeholder; README ties it to a local parking rate whose source is open).
- **solar_share**: The fraction of charging energy over a booking window supplied by usable residential solar generation, defined as `sum(usable_solar_kW(h)) / (P_eff * booked_hours)`, a value in [0, 1].
- **Green Score G**: A transparent climate score in [0, 1] combining solar_share, transit miles replaced, and net CO2 avoided.
- **geofence**: A 50-meter radius around the Host listing coordinates used to verify that the Customer has physically returned before the billing clock can stop.
- **Haversine**: The great-circle distance formula used both for client-side listing distance filtering and for computing the distance between the Customer's phone and the Host listing coordinates at Pickup.
- **MBTA**: The Massachusetts Bay Transportation Authority, whose V3 API provides real subway/commuter rail stations, bus stops, routes, and schedules.
- **EIA**: The U.S. Energy Information Administration, whose Open Data API v2 publishes monthly average retail electricity prices by state and sector in cents per kilowatt-hour. EIA derives them from utility revenue and sales, so they are averages, not tariffs, and they are published with a lag of a couple of months.
- **Open-Meteo**: A free weather API providing hourly solar irradiance (W/m^2) with no API key required.
- **Bedrock fallback**: An Amazon Bedrock model invoked from a Lambda function to look up car_max_AC_kW for a vehicle absent from the EVSpec table, while pricing remains strictly formula-driven.

## Requirements

### Requirement 1: Landing Page, One-Account Sign-Up, and Host Onboarding

**User Story:** As a visitor arriving on Dwell, I want a landing page that explains the charge-and-ride value proposition and lets me search for a charger or start hosting, with one account that works for both, so that I can book a charger or list my own without choosing a role up front.

#### Acceptance Criteria

1. WHEN any visitor opens the root URL (/), THE Landing_Page SHALL display the Dwell value proposition; a destination search (T station or address) with a "use my current location" option; a car-based pricing preview that shows the price per hour, estimated miles added and Green Score of sample listings for a named car, computed by the Pricing_Engine and Climate_Engine; the four steps "Book, park, charge, go" including the line that there is no key handoff, the car never moves, and the host never touches it; and a host call to action labeled "Become a host". Submitting a destination SHALL save it and continue to Search, through sign-in when the visitor is signed out.
   - Prototype: the preview is fixed to a Nissan Leaf near Central; per-car recalculation happens on Search and the listing page.
2. WHEN a signed-in user starts hosting (the header button "Host an EV charger" or "Become a host"), THE Host_Onboarding_Flow SHALL collect, in six steps (Your spot, Charger, Pricing, Photos & instructions, Availability, Review): a Massachusetts street address with city and 5-digit MA ZIP, chosen from address suggestions or typed by hand; a map pin the Host has explicitly confirmed; spot type and Number of Spots (1 to 4); a "Right to List" confirmation; Charger Level (L1 or L2); Charger Output (charger_kW, L2 3.0 to 19.2 kW, L1 1.44 to 1.92 kW); Plug Type (J1772 or NACS); whether the Host leaves an adapter from their plug to the other plug at the charger (stored as J1772_TO_NACS, NACS_TO_J1772, or NONE; BOTH is accepted from seeded data); for L1, confirmation of a dedicated outdoor-rated outlet; Solar System Size (solar_kW, 0 when no solar); local_rate; Desired Host Earnings per Hour (host_earnings_hr, greater than 0); a listing title; 1 to 8 photos uploaded to Amazon S3; parking instructions of at least 20 characters; one or more availability windows, each with at least one weekday and different whole-hour start and end times (an end at or before the start runs overnight); and acceptance of the host terms.
   - Prototype: photos are resized and kept in the browser instead of S3. The Right to List confirmation is required but not stored on the listing.
3. IF any required Host onboarding input is missing or fails its format validation, THEN THE Host_Onboarding_Flow SHALL block the step from continuing, retain the already-entered values, and display an error indication for each invalid field. THE Host_Onboarding_Flow SHALL NOT publish a listing without a confirmed pin, and SHALL discard the pin whenever the address changes.
4. IF the driveway photo upload to Amazon S3 fails or does not complete within 30 seconds, THEN THE Host_Onboarding_Flow SHALL reject the upload, retain the already-entered onboarding values, and display an error indication offering a retry.
   - Prototype: no upload exists yet, so this path is not built.
5. WHERE the Desired Host Earnings per Hour is entered, THE Host_Onboarding_Flow SHALL cap host_earnings_hr at 2x the suggested hourly earnings (currently a $2.75 placeholder, so the cap is $5.50), and SHALL show a live table of what sample cars would pay per hour using the Pricing_Engine.
6. WHEN a Host's address has a supported Massachusetts ZIP during onboarding, THE Rate_Service SHALL obtain the latest valid monthly Massachusetts residential average retail price from the EIA Open Data API (frequency monthly, state MA, sector RES, newest period first) within 5 seconds, convert it from cents per kilowatt-hour to dollars per kilowatt-hour by dividing by 100, auto-populate local_rate with it, and display its source and data month as "Massachusetts residential average · EIA · [data month]". THE ZIP SHALL identify the supported location only; the EIA value is a statewide average and SHALL NOT be presented as ZIP-specific or utility-specific. THE Rate_Service SHALL reuse one cached statewide result instead of fetching again for each ZIP, and SHALL NOT overwrite a local_rate the Host has edited. THE Host SHALL be able to override local_rate with the rate from their electricity bill.
7. IF the EIA Open Data API is unavailable, does not respond within 5 seconds, returns an error, or returns no valid Massachusetts residential price in cents per kilowatt-hour, THEN THE Rate_Service SHALL default local_rate to $0.30 per kilowatt-hour, label it a fallback estimate, and allow the Host to override it.
8. WHEN a Customer searches or views a listing, THE System SHALL let them choose their EV from the EVSpec table seeded from Open EV Data, which sets car_max_AC_kW and the car's plug type for every price shown, and SHALL remember the choice on the account. Sign-up SHALL NOT ask for a car.
   - Prototype: the choice is a list of 8 seeded models (`evFallbackSeed.ts`), not Make, Model, and Year from DynamoDB.
9. IF a Customer's EV is not found in the EVSpec table, THEN THE System SHALL query the Bedrock fallback function or accept a manual kW entry.
   - Prototype: not built. There is no "car not listed" option yet.
10. IF a Customer's car_max_AC_kW cannot be determined from the EVSpec table, the Bedrock fallback function, or manual entry, THEN THE System SHALL default car_max_AC_kW to the Host's charger_kW so that the Host does not lose money.
11. WHEN a visitor signs up, THE Sign_Up_Flow SHALL collect full name, a 10-digit phone number, email, a password of at least 8 characters, and acceptance of the terms (pickup ends the session, late minutes are billed, no refund for unused hours), authenticate via Amazon Cognito, and then continue to hosting when the sign-up started from a host entry point, or to Search otherwise. An email that already has an account SHALL be refused with a prompt to sign in.
    - Prototype: accounts are stored in this browser only, with a salted PBKDF2 password hash; sign-out keeps the account's car, listing and booking and sign-in restores them.
12. THE System SHALL use one account for driving and hosting: the header SHALL offer "Host an EV charger" to an account without a listing, "Switch to Hosting" to an account with one, and "Switch to Driving" on host pages. Each account SHALL have at most one listing.
13. WHEN a Host with a listing opens the host home (/host), THE System SHALL show the listing as drivers see it (nearest station and walk, rate source, availability, sample per-car prices) and the private address, and SHALL let the Host edit the listing (the onboarding steps, opened on Review, keeping the listing id) or remove it after a confirmation.

### Requirement 2: Destination Search, MBTA Transit Integration, and Adapter Matching

**User Story:** As a Customer, I want to search by destination (MBTA T station, address, or my current location) and time window, so that I can compare compatible driveway chargers alongside walk times and transit routes.

#### Acceptance Criteria

1. WHEN a signed-in Customer searches for a destination and time window with a search radius between 0.1 and 25 miles (defaulting to 2 miles), THE Search_Service SHALL filter active DynamoDB Host listings within the radius by client-side Haversine distance, query Mapbox Directions for walking time and distance, and query the MBTA V3 API for T stations, bus stops, and routes within the radius. THE Search_Service SHALL also filter by charger level and SHALL show listings on a map and as cards.
   - Prototype: the time window is today, a whole-hour start (past hours disabled) and 1 to 12 hours. Results are the listings inside the visible map, starting with a 2.5 km box around the destination; there is no radius control. Walk time is a straight-line estimate and routes are sample data for T stations only. With no destination, Search browses the map without walk times or Green Scores.
2. WHEN rendering each Listing Card, THE Listing_Card SHALL display the walk time to the destination in whole minutes, nearby MBTA bus and T routes, the car-specific price per hour and booking total, the estimated miles added, the solar share percentage in the range 0 to 100, and the Green Score in the range 0 to 1.
3. WHEN rendering the estimated miles added on a Listing Card, THE Listing_Card SHALL present the value as estimated miles added rather than as a promise of a full charge.
4. IF the Mapbox Directions or MBTA V3 API query fails or does not respond within 10 seconds, THEN THE Search_Service SHALL display an error indication for the affected data and SHALL still render the remaining available listing results.
5. IF no active Host listings match the destination, time window, and search area, THEN THE Search_Service SHALL display an empty-results indication.
6. IF a Host's native plug (J1772 or NACS) does not match the Customer's EV plug AND the Host's adapters do not cover the required conversion, THEN THE Search_Service SHALL leave that listing out of the results and show how many listings were hidden for the plug, AND THE Listing_Page SHALL display a visible plug-mismatch indication and SHALL disable the booking action for that car. Listings not open for the whole time window SHALL be left out the same way, with their own count.
7. IF charger_kW is less than car_max_AC_kW for a listing, THEN THE Listing_Card SHALL display a "Charger slower than your car's max acceptance rate" badge and SHALL order that listing after listings where charger_kW is greater than or equal to car_max_AC_kW when results are sorted by "Best fit" (ties by shorter walk, then lower price). THE Search_Service SHALL also offer a "Lowest price" sort.

### Requirement 3: Deterministic Car-Based Pricing and Late-Fee Engine

**User Story:** As a Host without a smart meter, I want the hourly price to be mathematically guaranteed to cover the maximum possible electricity draw of the specific car booked, both during the reservation and if the Customer overstays, so that I never lose money on electricity.

#### Acceptance Criteria

1. WHEN computing the price for a Host listing with inputs charger_kW, local_rate, and host_earnings_hr and a Customer vehicle with car_max_AC_kW and booked_hours, THE Pricing_Engine SHALL calculate `P_eff = min(charger_kW, car_max_AC_kW)`, `electricity_cost_per_hr = P_eff * local_rate`, `price_per_hr = electricity_cost_per_hr + host_earnings_hr`, and `estimated_miles_added = P_eff * booked_hours * 3.5`.
2. IF any required pricing input (charger_kW, local_rate, host_earnings_hr, car_max_AC_kW, or booked_hours) is missing, non-numeric, or outside its defined bounds, THEN THE Pricing_Engine SHALL reject the pricing computation, return an error indicating which input is invalid, and SHALL NOT produce a price_per_hr value.
3. WHEN computing monetary outputs, THE Pricing_Engine SHALL round electricity_cost_per_hr and late_fee UP to the next cent, round price_per_hr and customer_total to 2 decimal places using round-half-up, and round estimated_miles_added to 1 decimal place. (Amended Oct 28, 2026, tasks.md 5.2: round-half-up on the electricity cost and the late fee could under-collect by up to half a cent per hour, and a one-minute overstay on a slow charger rounded its late fee to $0, which broke Correctness Property 1.)
4. WHEN a session concludes at the Pickup tap, THE Billing_Engine SHALL compute `late_minutes = max(0, pickup_timestamp - booked_end_timestamp)` in minutes, rounding a partial minute up, `late_fee = (late_minutes / 60) * (price_per_hr * 1.5)` prorated per minute with a zero grace period, and `customer_total = ((price_per_hr * booked_hours) + late_fee) * 1.10` including a 10% platform service fee.
5. WHEN a Customer picks up a car earlier than booked_end_timestamp, THE Billing_Engine SHALL end the session at the Pickup tap and SHALL issue no refund for unused booked hours.

### Requirement 4: Solar Share and Green Score Formula Engine

**User Story:** As a climate-conscious driver, I want to see a transparent, formula-backed Green Score combining residential solar charging, transit miles replaced, and net CO2 avoided, so that I can understand and trust the environmental benefit of a booking.

#### Acceptance Criteria

1. WHEN calculating solar generation for each hour h of a booking window, THE Climate_Engine SHALL fetch hourly solar irradiance I_h in W/m^2 from Open-Meteo and compute `solar_kW(h) = system_kW * (I_h / 1000) * 0.8`, `usable_solar_kW(h) = min(max(solar_kW(h) - 1.0, 0), P_eff)` applying a 1 kW baseline house load, and `solar_share = sum(usable_solar_kW(h)) / (P_eff * booked_hours)`.
2. IF the Open-Meteo irradiance fetch fails, times out after 10 seconds, or returns fewer hourly values than booked_hours, THEN THE Climate_Engine SHALL abort the calculation, retain any previously stored score unchanged, and return an error indication that solar data is unavailable.
   - Prototype: Open-Meteo is not called. Every listing uses one sample clear-day irradiance profile, labeled as a sample. The Green Score is shown only when a destination exists, because it needs transit_miles (the straight-line miles from listing to destination).
3. IF any required numeric input (system_kW, P_eff, booked_hours, estimated_miles_added, or transit_miles) is missing, negative, or non-numeric, THEN THE Climate_Engine SHALL reject the calculation and return an error indication identifying the invalid input without producing a Green Score.
4. WHILE a booking window occurs overnight so that every usable_solar_kW(h) value is 0, THE Climate_Engine SHALL compute solar_share such that its absolute value is less than 0.001 and SHALL display the computed solar_share value without substituting any larger value.
5. WHEN calculating emissions and the Green Score G in the range [0, 1], THE Climate_Engine SHALL compute `grid_kWh = P_eff * booked_hours * (1 - solar_share)`, `gas_co2_saved_kg = (estimated_miles_added * 0.40) - (grid_kWh * 0.33)`, and `G = 0.50 * solar_share + 0.25 * min(transit_miles / 20, 1) + 0.25 * min(max(gas_co2_saved_kg, 0) / 5, 1)`, and SHALL round the returned value of G to 3 decimal places.

### Requirement 5: S3 Arrival Check-In and 50m Geofenced Pickup Flow

**User Story:** As a Host who may not be home when a booking ends, I want the session clock to run until the Customer physically returns within 50 meters of my driveway and uploads a Pickup photo, so that I am compensated for the full time my charger is occupied.

The session moves through four steps: Arrived, Charging, Pickup, Done.

#### Acceptance Criteria

1. WHEN a Customer with a RESERVED booking opens the session, THE Check_In_Flow SHALL show the full private address, the parking instructions and the listing photos, and SHALL require a confirmed upload of an Arrival Photo to Amazon S3 at `media/bookings/{bookingId}/arrival.jpg` before the Customer can tap "I'm plugged in. Start session", which marks the session ACTIVE.
   - Prototype: the photo is saved on the booking in the browser, not uploaded.
2. IF the Arrival Photo upload to Amazon S3 fails or does not complete within 30 seconds, THEN THE Check_In_Flow SHALL not mark the session ACTIVE, retain the check-in state, and display an error indication offering a retry.
3. WHILE a session is ACTIVE, THE Session view SHALL show the time left (or the minutes late after booked_end), the per-minute late rate, and the estimated miles added so far. WHEN the Customer taps "I'm back at the car. Pick up" and then checks their location, THE Pickup_Service SHALL invoke `navigator.geolocation.getCurrentPosition` with a 30-second acquisition timeout and compute the Haversine distance between the phone and the Host listing coordinates.
4. IF geolocation acquisition fails or does not complete within 30 seconds, THEN THE Pickup_Service SHALL block session termination and display an error indication offering a retry.
5. IF the phone's exact Haversine distance is less than or equal to 50 meters AND the Customer's Pickup Photo upload to Amazon S3 at `media/bookings/{bookingId}/pickup.jpg` is confirmed, THEN THE Pickup_Service SHALL let the Customer confirm pickup, record `actual_end_time = now()`, stop the billing clock, compute the final settlement, mark the booking COMPLETED, and show a receipt (booked subtotal, late fee when late, service fee, total) with estimated miles added, solar share, CO2 versus gas, and Green Score.
6. IF the phone's exact Haversine distance is greater than 50 meters, THEN THE Pickup_Service SHALL block session termination and display the current distance in whole meters, rounded up so the shown value never reads as inside the radius (inside the radius it is rounded down).
7. IF Browser Geolocation permission is denied or geolocation is not supported, THEN THE Pickup_Service SHALL allow a photo-only fallback pickup that still requires a confirmed Pickup Photo upload to Amazon S3 at `media/bookings/{bookingId}/pickup.jpg` and SHALL set the booking record field geofence_status to "FLAGGED_FOR_HOST_REVIEW", shown on the receipt as flagged for host review.
   - Prototype: a demo-controls panel can set the pickup clock (early, on time, late, real) and the phone position (at the car, 420 m away, real GPS).

### Requirement 6: Booking

**User Story:** As a Customer, I want to book a charger for my window from its listing page, with the price frozen for my car, so that what I pay matches what I saw and the host's spot is never double-used by me.

#### Acceptance Criteria

1. WHEN a Customer opens a listing, THE Listing_Page SHALL show the street name and neighborhood (never the exact address before booking), the charger, plug, adapter, solar and spots, the trip to the destination, how the charger fits the chosen car, the Green Score terms, the parking instructions, and a booking panel with start hour, hours (1 to 12), the price breakdown (electricity at P_eff × local_rate, host earnings, subtotal, 10% service fee, total), estimated miles added, and the per-minute late rate.
2. WHEN the Customer books, THE Booking_Service SHALL create a RESERVED booking that freezes the car name, car_max_AC_kW, P_eff, price_per_hr and total, plus the destination and window, and SHALL take the Customer to the session. Settlement at Pickup SHALL use only these frozen values.
   - Prototype: payment is simulated; there is no confirmation screen. The booking is kept on the account in the browser.
3. THE Booking_Service SHALL disable booking and say why WHEN the listing is the Customer's own listing, WHEN the account already has a live booking (RESERVED or ACTIVE), WHEN the start hour has already passed today, WHEN the plug does not fit (Requirement 2.6), or WHEN the window does not fit inside one availability window.
4. IF a RESERVED booking reaches its booked end without a check-in, THEN THE System SHALL end it with no charge, stop treating it as live, and tell the Customer that the reservation ended without a session. An ACTIVE session past its booked end SHALL stay live and keep accruing late minutes until Pickup.
5. WHILE an account has a live or recently completed booking, THE Landing_Page SHALL show a banner linking to the session or the receipt, which the Customer can dismiss once the booking is no longer live.

## Correctness Properties

These properties are property-based-testing (PBT) invariants that must hold across the stated input domains. They derive from the pricing and climate formulas in Requirements 3 and 4.

### Property 1: Host Cost Upper-Bound Invariant

The Host Payout must always cover the maximum possible physical electricity cost, so that a Host without a smart meter never loses money on electricity regardless of the car booked or any overstay.

**Invariant:** The Host Payout `(price_per_hr * booked_hours) + late_fee` SHALL be greater than or equal to the maximum possible physical electricity cost `charger_kW * (booked_hours + late_minutes / 60) * local_rate` evaluated for the worst case where `car_max_AC_kW >= charger_kW` (so that `P_eff = charger_kW`).

**Input Domain:**
- charger_kW in [1.44, 19.2]
- car_max_AC_kW in [3.0, 22.0] union {null}
- local_rate in [0.10, 0.65]
- host_earnings_hr >= 0
- booked_hours in [0.5, 24]
- late_minutes in [0, 720]

### Property 2: Green Score Bounds Invariant

The solar_share and Green Score G must always be finite numbers within [0.0, 1.0], so that climate figures are never undefined, infinite, or out of range.

**Invariant:** For all inputs in the stated domain with booked_hours greater than 0, both solar_share and Green Score G SHALL evaluate to finite numbers within the closed interval [0.0, 1.0].

**Input Domain:**
- system_kW in [0, 25]
- irradiance in [0, 1300]
- transit_miles in [0, 100]
- booked_hours > 0
