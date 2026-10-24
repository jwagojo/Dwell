# Requirements Document

## Introduction

Dwell is a peer-to-peer charge-and-ride marketplace for Massachusetts electric vehicle (EV) drivers. Hosts list idle residential Level 1 (120V) and Level 2 (240V) EV chargers and driveways; Customers book a time window, park, plug in without key handoff, and walk or ride transit the rest of the way. The two primary Customer segments are commuters parking near MBTA T stations and visitors parking near event venues.

The core design constraint is that Hosts do not have smart meters, so pricing must be deterministic and formula-driven: the hourly price is mathematically guaranteed to cover the maximum possible electricity draw of the specific car booked, both during the reservation and if the Customer overstays. A transparent, formula-backed Green Score communicates the climate benefit of combining residential solar charging with transit miles replaced.

This document specifies the requirements for the Dwell MVP. It is organized into five requirements covering onboarding, search and transit integration, deterministic pricing, the solar/green-score engine, and the geofenced check-in/pickup flow. A dedicated Correctness Properties section captures the two property-based-testing (PBT) invariants that must hold across the stated input domains.

### Technology Constraints

The following stack constraints are strict and inform the acceptance criteria but are not themselves requirements:

- Frontend: React 18 + Vite + TypeScript + Tailwind CSS.
- Backend, Auth, and Hosting: AWS Amplify Gen 2 (`defineAuth` with Amazon Cognito, `defineData` with Amazon DynamoDB, Amplify Hosting).
- Photo Storage: Amazon S3 via Amplify Storage (`defineStorage`) sharing one unified upload flow for Listing, Arrival, and Pickup photos.
- Maps and Walking Time: Mapbox GL JS (restricted public access token) with client-side Haversine distance filtering over DynamoDB listings.
- Location Verification: Browser Geolocation API (`navigator.geolocation`) verifying the phone is within 50 meters of listing coordinates at Pickup.
- EV Specs Dataset: Open EV Data JSON loaded into DynamoDB (EVSpec table) with a seeded fallback table of US models (`max_ac_kw`).
- Electricity Rates: U.S. EIA Open Data API v2 (`electricity/retail-sales`), monthly Massachusetts statewide residential average retail price, reported in cents per kWh and converted to dollars per kWh. The value is a statewide estimate, not ZIP-specific or utility-specific, and EIA reports it with a lag of a couple of months. $0.30/kWh is the fallback estimate. OpenEI URDB, for utility tariffs and Time-of-Use rates, is a separate future (flex) integration.
- Transit Data: MBTA V3 API for subway/commuter rail stations, bus stops, routes, and schedules.
- Solar Forecast: Open-Meteo API for free hourly solar irradiance (W/m^2), no API key required.
- AI Flex: Amazon Bedrock invoked via an Amplify Function (`defineFunction`) for unknown vehicle lookup fallback while keeping pricing strictly formula-driven.

## Glossary

- **Host**: A property owner who lists an idle residential Level 1 or Level 2 EV charger and driveway on Dwell and receives earnings when a Customer books it.
- **Customer (Driver)**: An EV driver who books a Host listing for a time window, parks, charges, and uses transit or walking to reach a destination.
- **car_max_AC_kW**: The maximum alternating-current charge acceptance rate of the Customer's specific EV, in kilowatts, sourced from the EVSpec table or a fallback lookup.
- **charger_kW**: The rated power output of the Host's charger, in kilowatts.
- **P_eff**: The effective charging power for a booking, defined as `min(charger_kW, car_max_AC_kW)`, in kilowatts. P_eff is the power at which electricity can actually flow for the booked car.
- **local_rate**: The electricity rate used for the electricity part of the price, in dollars per kilowatt-hour. By default it is an estimate: the Massachusetts statewide residential average from the EIA Open Data API (not specific to the Host's ZIP or utility), or the $0.30/kWh fallback estimate when that lookup fails. The Host may replace it with the rate on their electricity bill.
- **host_earnings_hr**: The Host's desired earnings per hour, in dollars, capped at 2x the suggested local parking rate.
- **solar_share**: The fraction of charging energy over a booking window supplied by usable residential solar generation, defined as `sum(usable_solar_kW(h)) / (P_eff * booked_hours)`, a value in [0, 1].
- **Green Score G**: A transparent climate score in [0, 1] combining solar_share, transit miles replaced, and net CO2 avoided.
- **geofence**: A 50-meter radius around the Host listing coordinates used to verify that the Customer has physically returned before the billing clock can stop.
- **Haversine**: The great-circle distance formula used both for client-side listing distance filtering and for computing the distance between the Customer's phone and the Host listing coordinates at Pickup.
- **MBTA**: The Massachusetts Bay Transportation Authority, whose V3 API provides real subway/commuter rail stations, bus stops, routes, and schedules.
- **EIA**: The U.S. Energy Information Administration, whose Open Data API v2 publishes monthly average retail electricity prices by state and sector in cents per kilowatt-hour. EIA derives them from utility revenue and sales, so they are averages, not tariffs, and they are published with a lag of a couple of months.
- **Open-Meteo**: A free weather API providing hourly solar irradiance (W/m^2) with no API key required.
- **Bedrock fallback**: An Amazon Bedrock model invoked via an Amplify Function to look up car_max_AC_kW for a vehicle absent from the EVSpec table, while pricing remains strictly formula-driven.

## Requirements

### Requirement 1: Dual-Role Landing Page and Cognito Onboarding

**User Story:** As a visitor arriving on Dwell, I want a landing page that clearly explains the charge-and-ride value proposition and lets me sign up or onboard distinctly as either a Host or a Customer (Driver), so that I can start using the platform in the role that matches my needs.

#### Acceptance Criteria

1. WHEN an unauthenticated user visits the root URL (/), THE Landing_Page SHALL display the Dwell value proposition, an interactive car-based pricing preview that recalculates and displays an estimated price per hour when the selected car changes, and two primary role selection calls to action labeled "Become a Host" and "Find a Charger (Customer)".
2. WHEN a user selects "Become a Host" and authenticates via Amazon Cognito, THE Host_Onboarding_Flow SHALL require the following inputs: street address and MA ZIP; Charger Level (L1 or L2); Charger Output (charger_kW); Plug Type (J1772 or NACS); Solar System Size (solar_kW); Number of Spots; Available Host Adapters (J1772_TO_NACS, NACS_TO_J1772, BOTH, or NONE); a "Right to List" confirmation checkbox; Desired Host Earnings per Hour (host_earnings_hr); a driveway photo uploaded to Amazon S3 with parking instructions; and availability time windows for daytime and overnight slots.
3. IF any required Host onboarding input is missing or fails its format validation, THEN THE Host_Onboarding_Flow SHALL reject submission, retain the already-entered values, and display an error indication for each invalid field.
4. IF the driveway photo upload to Amazon S3 fails or does not complete within 30 seconds, THEN THE Host_Onboarding_Flow SHALL reject the upload, retain the already-entered onboarding values, and display an error indication offering a retry.
5. WHERE the Desired Host Earnings per Hour is entered, THE Host_Onboarding_Flow SHALL cap host_earnings_hr at 2x the suggested local parking rate.
6. WHEN a Host's address has a supported Massachusetts ZIP during onboarding, THE Rate_Service SHALL obtain the latest valid monthly Massachusetts residential average retail price from the EIA Open Data API (frequency monthly, state MA, sector RES, newest period first) within 5 seconds, convert it from cents per kilowatt-hour to dollars per kilowatt-hour by dividing by 100, auto-populate local_rate with it, and display its source and data month as "Massachusetts residential average · EIA · [data month]". THE ZIP SHALL identify the supported location only; the EIA value is a statewide average and SHALL NOT be presented as ZIP-specific or utility-specific. THE Rate_Service SHALL reuse one cached statewide result instead of fetching again for each ZIP, and SHALL NOT overwrite a local_rate the Host has edited. THE Host SHALL be able to override local_rate with the rate from their electricity bill.
7. IF the EIA Open Data API is unavailable, does not respond within 5 seconds, returns an error, or returns no valid Massachusetts residential price in cents per kilowatt-hour, THEN THE Rate_Service SHALL default local_rate to $0.30 per kilowatt-hour, label it a fallback estimate, and allow the Host to override it.
8. WHEN a user selects "Find a Charger (Customer)" and authenticates via Amazon Cognito, THE Customer_Onboarding_Flow SHALL prompt for EV Make, Model, and Year from the DynamoDB EVSpec table seeded from Open EV Data to lock in car_max_AC_kW.
9. IF a Customer's EV Make, Model, and Year combination is not found in the EVSpec table, THEN THE System SHALL query the Bedrock fallback function or accept a manual kW entry.
10. IF a Customer's car_max_AC_kW cannot be determined from the EVSpec table, the Bedrock fallback function, or manual entry, THEN THE System SHALL default car_max_AC_kW to the Host's charger_kW so that the Host does not lose money.

### Requirement 2: Destination Search, MBTA Transit Integration, and Adapter Matching

**User Story:** As a Customer, I want to search by destination (MBTA T station, concert venue, or address) and date/time window, so that I can compare compatible driveway chargers alongside walk times and transit routes.

#### Acceptance Criteria

1. WHEN a Customer searches for a destination and time window with a search radius between 0.1 and 25 miles (defaulting to 2 miles), THE Search_Service SHALL filter active DynamoDB Host listings within the radius by client-side Haversine distance, query Mapbox GL JS for walking time and distance, and query the MBTA V3 API for T stations, bus stops, and routes within the radius.
2. WHEN rendering each Listing Card, THE Listing_Card SHALL display the walk time to the destination in whole minutes, nearby MBTA bus and T routes, the car-specific price per hour, the estimated miles added, the solar share percentage in the range 0 to 100, and the Green Score in the range 0 to 1.
3. WHEN rendering the estimated miles added on a Listing Card, THE Listing_Card SHALL present the value as estimated miles added rather than as a promise of a full charge.
4. IF the Mapbox GL JS or MBTA V3 API query fails or does not respond within 10 seconds, THEN THE Search_Service SHALL display an error indication for the affected data and SHALL still render the remaining available listing results.
5. IF no active Host listings match the destination, time window, and search radius, THEN THE Search_Service SHALL display an empty-results indication.
6. IF a Host's native plug (J1772 or NACS) does not match the Customer's EV plug AND the Host's Available Host Adapters do not cover the required conversion, THEN THE Search_Service SHALL display a visible plug-mismatch indication on the Listing Card and SHALL disable the booking action for that car.
7. IF charger_kW is less than car_max_AC_kW for a listing, THEN THE Listing_Card SHALL display a "Charger slower than your car's max acceptance rate" badge and SHALL order that listing after listings where charger_kW is greater than or equal to car_max_AC_kW when results are sorted by "Best Charger Fit".

### Requirement 3: Deterministic Car-Based Pricing and Late-Fee Engine

**User Story:** As a Host without a smart meter, I want the hourly price to be mathematically guaranteed to cover the maximum possible electricity draw of the specific car booked, both during the reservation and if the Customer overstays, so that I never lose money on electricity.

#### Acceptance Criteria

1. WHEN computing the price for a Host listing with inputs charger_kW, local_rate, and host_earnings_hr and a Customer vehicle with car_max_AC_kW and booked_hours, THE Pricing_Engine SHALL calculate `P_eff = min(charger_kW, car_max_AC_kW)`, `electricity_cost_per_hr = P_eff * local_rate`, `price_per_hr = electricity_cost_per_hr + host_earnings_hr`, and `estimated_miles_added = P_eff * booked_hours * 3.5`.
2. IF any required pricing input (charger_kW, local_rate, host_earnings_hr, car_max_AC_kW, or booked_hours) is missing, non-numeric, or outside its defined bounds, THEN THE Pricing_Engine SHALL reject the pricing computation, return an error indicating which input is invalid, and SHALL NOT produce a price_per_hr value.
3. WHEN computing monetary outputs, THE Pricing_Engine SHALL round price_per_hr, electricity_cost_per_hr, late_fee, and customer_total to 2 decimal places using round-half-up, and SHALL round estimated_miles_added to 1 decimal place.
4. WHEN a session concludes at the Pickup tap, THE Billing_Engine SHALL compute `late_minutes = max(0, pickup_timestamp - booked_end_timestamp)`, `late_fee = (late_minutes / 60) * (price_per_hr * 1.5)` prorated per minute with a zero grace period, and `customer_total = ((price_per_hr * booked_hours) + late_fee) * 1.10` including a 10% platform service fee.
5. WHEN a Customer picks up a car earlier than booked_end_timestamp, THE Billing_Engine SHALL end the session at the Pickup tap and SHALL issue no refund for unused booked hours.

### Requirement 4: Solar Share and Green Score Formula Engine

**User Story:** As a climate-conscious driver, I want to see a transparent, formula-backed Green Score combining residential solar charging, transit miles replaced, and net CO2 avoided, so that I can understand and trust the environmental benefit of a booking.

#### Acceptance Criteria

1. WHEN calculating solar generation for each hour h of a booking window, THE Climate_Engine SHALL fetch hourly solar irradiance I_h in W/m^2 from Open-Meteo and compute `solar_kW(h) = system_kW * (I_h / 1000) * 0.8`, `usable_solar_kW(h) = min(max(solar_kW(h) - 1.0, 0), P_eff)` applying a 1 kW baseline house load, and `solar_share = sum(usable_solar_kW(h)) / (P_eff * booked_hours)`.
2. IF the Open-Meteo irradiance fetch fails, times out after 10 seconds, or returns fewer hourly values than booked_hours, THEN THE Climate_Engine SHALL abort the calculation, retain any previously stored score unchanged, and return an error indication that solar data is unavailable.
3. IF any required numeric input (system_kW, P_eff, booked_hours, estimated_miles_added, or transit_miles) is missing, negative, or non-numeric, THEN THE Climate_Engine SHALL reject the calculation and return an error indication identifying the invalid input without producing a Green Score.
4. WHILE a booking window occurs overnight so that every usable_solar_kW(h) value is 0, THE Climate_Engine SHALL compute solar_share such that its absolute value is less than 0.001 and SHALL display the computed solar_share value without substituting any larger value.
5. WHEN calculating emissions and the Green Score G in the range [0, 1], THE Climate_Engine SHALL compute `grid_kWh = P_eff * booked_hours * (1 - solar_share)`, `gas_co2_saved_kg = (estimated_miles_added * 0.40) - (grid_kWh * 0.33)`, and `G = 0.50 * solar_share + 0.25 * min(transit_miles / 20, 1) + 0.25 * min(max(gas_co2_saved_kg, 0) / 5, 1)`, and SHALL round the returned value of G to 3 decimal places.

### Requirement 5: S3 Arrival Check-In and 50m Geofenced Pickup Flow

**User Story:** As a Host who may not be home when a booking ends, I want the session clock to run until the Customer physically returns within 50 meters of my driveway and uploads a Pickup photo, so that I am compensated for the full time my charger is occupied.

#### Acceptance Criteria

1. WHEN a Customer arrives at the Host driveway, THE Check_In_Flow SHALL require a confirmed upload of an Arrival Photo to Amazon S3 at `media/bookings/{bookingId}/arrival.jpg` before marking the session ACTIVE.
2. IF the Arrival Photo upload to Amazon S3 fails or does not complete within 30 seconds, THEN THE Check_In_Flow SHALL not mark the session ACTIVE, retain the check-in state, and display an error indication offering a retry.
3. WHEN a Customer taps "Pick up", THE Pickup_Service SHALL invoke `navigator.geolocation.getCurrentPosition` with a 30-second acquisition timeout and compute the Haversine distance between the phone and the Host listing coordinates.
4. IF geolocation acquisition does not complete within 30 seconds, THEN THE Pickup_Service SHALL block session termination and display an error indication offering a retry.
5. IF the phone's geolocation Haversine distance is less than or equal to 50 meters AND the Customer's Pickup Photo upload to Amazon S3 at `media/bookings/{bookingId}/pickup.jpg` is confirmed, THEN THE Pickup_Service SHALL record `actual_end_time = now()`, stop the billing clock, and compute the final settlement.
6. IF the phone's geolocation Haversine distance is greater than 50 meters, THEN THE Pickup_Service SHALL block session termination and display the current distance rounded to the nearest whole meter.
7. IF Browser Geolocation permission is denied, THEN THE Pickup_Service SHALL allow a photo-only fallback pickup that still requires a confirmed Pickup Photo upload to Amazon S3 at `media/bookings/{bookingId}/pickup.jpg` and SHALL set the booking record field geofence_status to "FLAGGED_FOR_HOST_REVIEW".

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
