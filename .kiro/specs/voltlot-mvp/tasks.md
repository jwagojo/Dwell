# Implementation Plan: VoltLot MVP

## How to read this plan

- Source of truth when documents disagree: `requirements.md` > `design.md` > `README.md` > existing `LandingPage.tsx`. Steering (`.kiro/steering/voltlot-rules.md`) applies to every task.
- Each task lists `Depends on` (task ids that must be done first) and `Done when` (a check someone can run or observe).
- Sections 1 to 23 are the MVP. Sections 24 to 31 are **Flex goals**. They are optional (`*`), live in their own section, and must not start until task 23 passes.
- Property-based tests (fast-check, 100+ runs, tagged `// Feature: voltlot-mvp, Property N: ...`) are required, not optional.
- Pure engines come first so the existing landing page, search, booking, and pickup all share one implementation of each formula.
- Pin exact dependency versions. Use only Amplify Gen 2 (`amplify/*/resource.ts`, `amplify_outputs.json`). No Gen 1 CLI commands.

> **Status note (UI refactor):** `src/pages/LandingPage.tsx` was replaced by a UI built to the VoltLot UI design spec v1 (8 routes, sample data, localStorage state, schematic map). The pure engines for pricing, billing, climate, rounding, and plug compatibility now exist with unit tests (partly covering tasks 2.2, 3.1, 3.2, 4.1, 4.2, 6.1 to 6.3). Not done: property tests (5.1, 7.1), the rounding decision (5.2), Amplify, auth, and S3.
>
> **Maps and address search (done in the UI prototype):** the live Mapbox search map and hero preview, host address autocomplete with a draggable, explicitly confirmed pin, and address destinations (partly covering 18.1 and 18.8, and the Mapbox geocoding part of 18.5). The sample-ZIP restriction is gone: city and ZIP come from the selected address, and the rate falls back to $0.30/kWh labeled as an estimate (the EIA rate lookup, tasks 8.1 and 16.2, is now done). The 15 made-up Cambridge sample listings were replaced by `src/data/mockListings.json` (19 real Cambridge/Somerville addresses with Zillow photos and invented charger details). Still open: Mapbox Directions walking times, MBTA and Open-Meteo adapters, and server-side listing storage. Tasks below that mention `LandingPage.tsx` (10.x, 16.3, 22.1) refer to the replaced file and need rewording before they are executed.

## Existing code: `src/pages/LandingPage.tsx` (replaced; kept for history)

It is a working single-file page (hero, role toggle, inline host and customer forms, live pricing preview). It is the visual baseline and stays in place. Gaps this plan closes:

- It computes pricing, solar, and Green Score inline, with no rounding. The engines replace that math (tasks 10.3, 22.1).
- Its CTAs read "Customer Sign Up" and "Host Your Driveway". Req 1.1 requires "Become a Host" and "Find a Charger (Customer)" (10.4).
- It labels miles "Est. Miles Added". Steering requires "Estimated Miles Added" (10.4).
- The charger kW input has `min="1.2"`, below the tested domain of 1.44 to 19.2 (10.4).
- It says "Listing Hidden" for plug mismatch. Req 2.6 says show a mismatch indication and disable booking (10.4).
- It has no "car never moves, host never touches the car" copy (10.4).
- It has no availability windows, validation, Cognito, or S3 wiring. The forms are extracted into real flows in sections 14 and 16, then trimmed from the landing page in 22.1.
- It hardcodes `EV_MODELS`, `MA_ZIP_RATES`, and the earnings cap. These move to shared data and constants (10.2, 2.1).

## Decisions and risks to confirm during implementation

1. **Rounding can break Property 1.** Req 3.3 rounds `electricity_cost_per_hr` half-up to 2 dp. That can land up to $0.005/hr below the true cost, so with `host_earnings_hr = 0` and `late_minutes = 0` the payout can fall below `charger_kW * hours * local_rate`. Task 5.2 is a decision gate. Do not silently change Req 3.3 or weaken the property.
2. **Fractional booked hours in solar share.** The formula sums hourly values. For fractional `booked_hours`, sum the first `ceil(booked_hours)` values and clamp the result to [0,1] (design: clamp is the final step).
3. **Late minutes.** Req 3.4 does not say how to handle partial minutes. Assumption: round the overstay up to a whole minute, so the host is never under-collected.
4. **Design data-model gaps.** Add `plug_type` to `EVSpec` and `UserProfile` (Req 2.6 needs the car's plug). Add `parking_instructions` and `right_to_list` to `HostListing` (Req 1.2). Give the host read access to bookings on their listings (README host flow 7, Req 5.7). Store an unresolved `car_max_AC_kW` as `null` and resolve it per listing at pricing time, because the worst-case default is the host's `charger_kW`.
5. **Storage rules vs `bookingId` paths.** Req 5.1 fixes the path `media/bookings/{bookingId}/arrival.jpg`. Amplify per-owner path rules key off the identity id, not a booking id. MVP uses authenticated read/write on `media/listings/*` and `media/bookings/*`. Tighten after the MVP.
6. **`transit_miles` source.** MBTA V3 has no trip planner (README open question). MVP uses Haversine miles from listing to destination, labeled as an estimate.
7. **Bedrock and OpenEI TOU are flex.** README places both in flex. Req 1.9 says "query Bedrock or accept manual kW entry", so manual entry alone satisfies Req 1.9 in the MVP. The Bedrock lookup (task 24) and the OpenEI path (task 25) are flex.
8. **Naming.** Steering names the distance helper `haversineDistanceMeters()`. The design says `haversineMeters`. Use the steering name.
9. **Double-booking prevention** is not in the requirements. Seed data avoids overlaps and the MVP does not enforce it.
10. **Not tasked.** Cancellation and refund policy, no-show release, host-cancel, and charger-broken reports are in README edge cases, not in the reconciled requirements.

---

## MVP

- [x] 1. Project scaffold around the existing landing page
  - [x] 1.1 Scaffold Vite + React 18 + TypeScript + Tailwind at the repo root
    - Keep `src/pages/LandingPage.tsx` byte-for-byte unchanged. Do not overwrite `README.md` or `.kiro/`.
    - Add `src/main.tsx` and `index.html`, with `LandingPage` rendered at `/`.
    - Add Vitest and fast-check as dev dependencies, all pinned.
    - Scripts: `dev`, `build`, `typecheck`, `test` (`vitest --run`).
    - Make sure the Tailwind content globs cover `src/**/*.{ts,tsx}`.
    - Depends on: none
    - Done when: `npm run typecheck`, `npm run build`, and `npm test` pass (one trivial test is fine). `git diff -- src/pages/LandingPage.tsx` is empty. Running `npm run dev` manually shows the page at `/` with styling.
    - _Requirements: Technology Constraints, 1.1 (baseline)_
    - Completion note: typecheck, build, and the dev-server check (styling, role switching, car preview) were verified. `npm test` was deliberately not made to pass: no tests exist and no placeholder test was added, so it exits 1 with "No test files found" until task 2.2 adds the first real test.
  - [x] 1.2 Repo hygiene and environment template
    - Add `.gitignore` (`node_modules`, `dist`, `.env*.local`) and `.env.example` with `VITE_MAPBOX_TOKEN` and `VITE_EIA_API_KEY`.
    - Document that the Mapbox token must be URL-restricted.
    - Confirm with the team whether `amplify_outputs.json` is committed or generated per developer by the sandbox.
    - Depends on: 1.1
    - Done when: a fresh clone plus `.env.example` copied to `.env.local` builds. No secret is tracked (`git ls-files | grep -i env` shows only `.env.example`).
    - _Requirements: Technology Constraints_
    - Completion note: verified by copying all tracked and non-ignored files to a temp directory, then `npm ci`, typecheck, and build with `.env.example` as `.env.local`. Nothing is committed yet. The `amplify_outputs.json` commit-or-generate question is still open and is deferred to task 11.4.

- [ ] 2. Pure foundations (no I/O, no React)
  - [ ] 2.1 Shared constants and result types
    - Create `src/engines/constants.ts` and `src/engines/types.ts` (`EngineResult<T>`, `EngineError`).
    - Constants: `MILES_PER_KWH=3.5`, `LATE_MULTIPLIER=1.5` [PLACEHOLDER], `SERVICE_FEE=0.10` [PLACEHOLDER], `PICKUP_RADIUS_M=50` [PLACEHOLDER], `GAS_KG_PER_MILE=0.40`, `GRID_KG_PER_KWH=0.33`, `HOUSE_LOAD_KW=1.0`, `SOLAR_LOSS_FACTOR=0.8`, `FULL_SUN_W_M2=1000`.
    - More constants: Green Score weights `0.5/0.25/0.25`, `R2_MILES=20`, `R3_KG=5`, `DEFAULT_LOCAL_RATE=0.30`, `EARNINGS_CAP_MULTIPLE=2`, `SUGGESTED_PARKING_RATE_HR=1.5` [PLACEHOLDER], and timeouts (`EIA 5s`, `MAPBOX/MBTA/OPEN_METEO 10s`, `S3/GEO 30s`).
    - Mark every README `[PLACEHOLDER]` value with a comment.
    - Depends on: 1.1
    - Done when: `npm run typecheck` passes. A grep for the literals `3.5`, `0.33`, and `1.5` in `src/engines/` outside `constants.ts` finds none (checked again after tasks 3 to 8).
    - _Requirements: 3.1, 3.4, 4.1, 4.5, 5.5, 1.5, 1.7_
  - [ ] 2.2 `roundHalfUp(value, decimals)`
    - Make it decimal-safe: `Math.round(x * 100) / 100` is wrong for cases like 1.005.
    - Depends on: 2.1
    - Done when: unit tests pass for `roundHalfUp(1.005,2)=1.01`, `roundHalfUp(2.675,2)=2.68`, `roundHalfUp(134.25,1)=134.3`, `roundHalfUp(19.272,2)=19.27`, `roundHalfUp(0,2)=0`.
    - _Requirements: 3.3_
  - [ ] 2.3 `haversineDistanceMeters(a, b)` and a miles helper
    - Put them in `src/lib/geo.ts`. Use this exact name (steering).
    - Depends on: 2.1
    - Done when: unit tests pass for zero distance on equal points, symmetry, non-negativity, and the reference value that 1° of latitude at (42,-71)→(43,-71) is about 111,195 m (±1 m with R=6,371,000 m).
    - _Requirements: 2.1, 5.3; Steering §2_

- [ ] 3. Pricing_Engine
  - [ ] 3.1 Implement `computePrice` in `src/engines/pricing.ts`
    - `P_eff = min(charger_kW, car_max_AC_kW ?? charger_kW)`.
    - `electricity_cost_per_hr = round2(P_eff * local_rate)`.
    - `price_per_hr = round2(electricity_cost_per_hr + host_earnings_hr)`.
    - `estimated_miles_added = round1(P_eff * booked_hours * 3.5)`.
    - Validate: `charger_kW>0`, `local_rate>0`, `host_earnings_hr>=0`, `booked_hours>0`, and `car_max_AC_kW` is a positive number or `null`. Reject NaN, strings, and `undefined`. The error names the field and no price is produced.
    - Depends on: 2.1, 2.2
    - Done when: the unit tests in 3.2 pass.
    - _Requirements: 3.1, 3.2, 3.3, 1.10_
  - [ ] 3.2 Pricing unit tests
    - Use the README worked example (charger 9.6 kW, rate $0.30, earnings $1.50, 4 h).
    - Car 3 kW → P_eff 3, electricity 0.90, price 2.40, miles 42.0.
    - Car 11 kW → P_eff 9.6, electricity 2.88, price 4.38, miles 134.4.
    - `car_max_AC_kW = null` → P_eff 9.6.
    - Invalid input per field (error names the field, no `price_per_hr`).
    - `.005` rounding boundary.
    - Depends on: 3.1
    - Done when: `npm test` is green for `pricing.test.ts`.
    - _Requirements: 3.1, 3.2, 3.3, 1.10_

- [ ] 4. Billing_Engine
  - [ ] 4.1 Implement `settle` in `src/engines/billing.ts`
    - `late_minutes = max(0, ceil((pickup - booked_end) / 60000))` (assumption 3).
    - `late_fee = round2((late_minutes/60) * (price_per_hr * 1.5))`.
    - `customer_total = round2(((price_per_hr * booked_hours) + late_fee) * 1.10)`.
    - Early pickup gives `late_minutes = 0` and no refund (total stays at full booked hours).
    - Validate inputs and return typed errors.
    - Depends on: 2.1, 2.2
    - Done when: the unit tests in 4.2 pass.
    - _Requirements: 3.3, 3.4, 3.5_
  - [ ] 4.2 Billing unit tests
    - `price 2.40 × 4 h` → total 10.56.
    - `price 4.38 × 4 h` → total 19.27.
    - README late example: price $2.00, 30 min late → late fee 1.50.
    - Pickup 1 h early → `late_minutes 0` and total unchanged.
    - Pickup exactly at booked end → no fee (zero grace means any minute after is billed).
    - Invalid-input rejection.
    - Depends on: 4.1
    - Done when: `npm test` is green for `billing.test.ts`.
    - _Requirements: 3.4, 3.5_

- [ ] 5. Property 1: Host Cost Upper-Bound
  - [ ] 5.1 Write the property test in `src/engines/hostCost.property.test.ts`
    - Tag: `// Feature: voltlot-mvp, Property 1: Host Cost Upper-Bound Invariant`.
    - Generators (fast-check): `charger_kW` [1.44,19.2], `car_max_AC_kW` [3.0,22.0] or null, `local_rate` [0.10,0.65], `host_earnings_hr` [0,1000], `booked_hours` [0.5,24], `late_minutes` integer [0,720].
    - Run `computePrice` then `settle` with `pickup = booked_end + late_minutes*60000`.
    - Assert `price_per_hr*booked_hours + late_fee >= charger_kW*(booked_hours + late_minutes/60)*local_rate`. The payout excludes the 10% fee.
    - `numRuns: 100` minimum.
    - Depends on: 3.1, 4.1
    - Done when: the test runs. Result is either green, or a recorded counterexample that goes to 5.2.
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 1.10_
  - [ ] 5.2 Decision gate: rounding vs Property 1
    - If 5.1 fails because of 2 dp rounding (expected near `host_earnings_hr = 0`), stop and present the counterexample to the user with these options:
      - (a) round `electricity_cost_per_hr` up to the next cent (amends Req 3.3);
      - (b) assert the property with a documented tolerance of `0.005 × booked_hours`;
      - (c) another option from the user.
    - Apply the chosen option to the requirements, design, engine, and test together.
    - Depends on: 5.1
    - Done when: the user's choice is recorded in `requirements.md` or `design.md`, and the Property 1 test passes with at least 100 runs under that choice.
    - _Requirements: 3.3, Correctness Property 1_

- [ ] 6. Climate_Engine
  - [ ] 6.1 Implement `computeSolarShare` in `src/engines/climate.ts`
    - `solar_kW(h) = system_kW*(I_h/1000)*0.8`.
    - `usable(h) = min(max(solar_kW-1.0,0), P_eff)`.
    - `solar_share = sum(usable over first ceil(booked_hours) values) / (P_eff*booked_hours)`, clamped to [0,1] (assumption 2).
    - Return a "solar data unavailable" error when the series is shorter than `ceil(booked_hours)`.
    - Reject missing, negative, or non-numeric `system_kW`, `P_eff`, `booked_hours`, naming the field.
    - Depends on: 2.1
    - Done when: the unit tests in 6.3 pass.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ] 6.2 Implement `computeEmissions` and `computeGreenScore`
    - `grid_kWh = P_eff*booked_hours*(1-solar_share)`.
    - `gas_co2_saved_kg = estimated_miles_added*0.40 - grid_kWh*0.33`.
    - `G = 0.50*solar_share + 0.25*min(transit_miles/20,1) + 0.25*min(max(gas_co2_saved_kg,0)/5,1)`, rounded to 3 dp and clamped to [0,1].
    - Export the emissions values too, because the landing page and Listing_Card show kg CO₂ saved.
    - Reject missing or negative `estimated_miles_added` and `transit_miles`.
    - Depends on: 6.1, 2.2
    - Done when: the unit tests in 6.3 pass.
    - _Requirements: 4.3, 4.5_
  - [ ] 6.3 Climate unit tests
    - Hand vector: system 6 kW, irradiance [650]×4, P_eff 9.6, hours 4, transit 6.5 → `solar_share ≈ 0.2208`, miles 134.4, `G = 0.442`.
    - Clamp at the 1 kW baseline: irradiance low enough that solar_kW < 1 gives usable 0.
    - Clamp at P_eff: system 25 kW, I=1300 gives usable = P_eff.
    - Overnight all-zero series gives `|solar_share| < 0.001`, and the value is shown, not replaced.
    - Short series gives the unavailable error and no score.
    - Invalid-input rejection names the field.
    - Depends on: 6.1, 6.2
    - Done when: `npm test` is green for `climate.test.ts`.
    - _Requirements: 4.1 to 4.5_

- [ ] 7. Property 2: Green Score Bounds
  - [ ] 7.1 Write the property test in `src/engines/greenScore.property.test.ts`
    - Tag: `// Feature: voltlot-mvp, Property 2: Green Score Bounds Invariant`.
    - Generators: `system_kW` [0,25]; irradiance arrays of length 1 to 24 with values [0,1300], including all-zero arrays; `transit_miles` [0,100]; `P_eff` [0.0001,22]; `booked_hours` (0.0001, series length]; `estimated_miles_added = P_eff*booked_hours*3.5`.
    - Assert both `solar_share` and `G` are finite and within [0,1].
    - `numRuns: 100` minimum.
    - Depends on: 6.1, 6.2
    - Done when: the property passes over 100+ runs, including the all-zero (overnight) case.
    - _Requirements: 4.1, 4.4, 4.5_

- [x] 8. Rate_Service (pure selection logic)
  - [x] 8.1 Implement `resolveRate(eia)` in `src/engines/rate.ts`
    - A valid EIA record (`{ centsPerKwh, period }`) → `{ local_rate: centsPerKwh / 100, source: "EIA", dataMonth: period, overridable: true }`.
    - `null`, a bad month, or an implausible price → `{ 0.30, "DEFAULT_0_30", dataMonth: null, overridable: true }`.
    - MVP takes no TOU argument. Task 25 adds OpenEI separately (flex).
    - Depends on: 2.1
    - Done when: unit tests pass for the cents-to-dollars conversion, the data month, and the fallback cases.
    - _Requirements: 1.6, 1.7_
    - Completion note: done in `src/engines/rate.ts` with `rate.test.ts`.

- [ ] 9. Checkpoint: engines
  - Run `npm run typecheck`, `npm run build`, `npm test`. Resolve any failures. Ask the user if questions come up.
  - Depends on: 3 to 8
  - Done when: all three commands exit 0.

- [ ] 10. Existing LandingPage: use the engines, fix requirement gaps
  - [ ] 10.1 Add a copy-guard test (`src/copy.test.ts`)
    - Scan `src/**/*.tsx` for forbidden phrases: "full charge", "wasted", "do you (own|have) an adapter", "bring your (own )?adapter".
    - Assert `LandingPage` contains "Estimated Miles Added", "No key handoff", "car never moves", "host never touches the car", "Become a Host", and "Find a Charger (Customer)".
    - Depends on: 1.1
    - Done when: the test runs. The required-phrase checks fail against the current page, which proves the test works. Forbidden-phrase checks pass.
    - _Requirements: 1.1, 2.3; Steering §1_
  - [ ] 10.2 Extract static data out of the page
    - Move `EV_MODELS` to `src/data/evFallbackSeed.ts`, typed with make, model, year, `max_ac_kW`, and `plug_type`.
    - Keep the "unknown EV" entry. Move `MA_ZIP_RATES` to `src/data/previewRates.ts`, labeled as sample data. The page imports both.
    - Remove the local `SUGGESTED_PARKING_RATE_HR` and import it from constants.
    - Depends on: 2.1
    - Done when: `npm run typecheck` passes and the page renders the same options as before.
    - _Requirements: 1.5, 1.8_
  - [ ] 10.3 Replace inline `pricingMath` with engine calls
    - Call `computePrice`, `computeSolarShare`, `computeEmissions`, and `computeGreenScore`.
    - The preview uses a sample irradiance array (`[650]` per booked hour), labeled as a sample daytime estimate. It needs no network.
    - Show "—" if an engine returns an error.
    - Keep the layout and Tailwind classes.
    - Extract the plug/adapter check into a function with a TODO to share it with task 18.3.
    - Depends on: 3.1, 4.1, 6.1, 6.2, 10.2
    - Done when: with the default state (ZIP 02132 rate $0.31, charger 9.6 kW, Tesla 11.5 kW, earnings $1.50, 4 h), the card shows $4.48/hr, customer total $19.71, and miles 134.4. A grep in `LandingPage.tsx` for `* 3.5`, `* 0.8`, `* 0.33`, and `* 1.5` returns nothing.
    - _Requirements: 1.1, 3.1, 3.3, 4.1, 4.5_
  - [ ] 10.4 Align bounds and copy with requirements and steering
    - CTA labels: "Become a Host" and "Find a Charger (Customer)" (header and role toggle).
    - Rename "Est. Miles Added" to "Estimated Miles Added".
    - Replace "(Listing Hidden)" with copy saying booking is disabled for this car.
    - Add a Zero-Touch line: "No key handoff, car never moves, host never touches the car".
    - Charger kW input: `min=1.44`, `max=19.2`.
    - Add one line on the solar card using "local solar self-consumption" wording.
    - Depends on: 10.1, 10.3
    - Done when: the copy-guard test from 10.1 passes and the page still builds.
    - _Requirements: 1.1, 2.3, 2.6; Steering §1_
  - [ ] 10.5 Manual verification of the landing page
    - Run `npm run dev` manually. Switch cars (Prius Prime vs Model Y) and confirm that price/hr changes.
    - Confirm that the unknown EV uses the charger kW.
    - Confirm that no network call is made.
    - Depends on: 10.4
    - Done when: the price changes with the car and the unknown EV shows `P_eff = charger kW`.
    - _Requirements: 1.1, 1.10_

- [ ] 11. Amplify Gen 2 backend
  - [ ] 11.1 Scaffold the Gen 2 backend
    - Create `amplify/backend.ts`, `amplify/auth/resource.ts` (email sign-in), `amplify/data/resource.ts`, and `amplify/storage/resource.ts`.
    - Use only Gen 2 TypeScript definitions. Pin `@aws-amplify/backend`, `aws-amplify`, and `@aws-amplify/ui-react`.
    - Depends on: 1.1
    - Done when: `npm run typecheck` passes. No `aws-exports.js` and no Gen 1 CLI usage anywhere (`git grep -n "aws-exports\|amplify add"` is empty).
    - _Requirements: Technology Constraints; Steering §2_
  - [ ] 11.2 Define the data schema
    - Models: `UserProfile`, `HostListing`, `EVSpec`, `Booking`, per `design.md`.
    - Apply design gaps (decision 4): `plug_type` on `EVSpec` and `UserProfile`; `parking_instructions` and `right_to_list` on `HostListing`; nullable `car_max_AC_kW`; host read access on `Booking` (for example an owner-defined `hostOwner` field).
    - `EVSpec` is authenticated-read.
    - Depends on: 11.1
    - Done when: `npm run typecheck` passes and the exported `Schema` type includes every field named in design.md plus the additions.
    - _Requirements: 1.2, 1.8, 2.6, 5.7_
  - [ ] 11.3 Define storage
    - Authenticated read/write on `media/listings/*` and `media/bookings/*` (decision 5).
    - Depends on: 11.1
    - Done when: typecheck passes, and the exact keys `media/bookings/{bookingId}/arrival.jpg`, `.../pickup.jpg`, and `media/listings/{listingId}/listing.jpg` are covered by the rules.
    - _Requirements: 1.4, 5.1, 5.5, 5.7_
  - [ ] 11.4 Deploy to a personal sandbox and smoke test (user runs the deploy)
    - Ask the user to run the Gen 2 sandbox (`npx ampx sandbox`) in their own terminal with their AWS credentials. This deploys to AWS.
    - Add `Amplify.configure(outputs)` in `main.tsx`, importing `amplify_outputs.json`.
    - Depends on: 11.2, 11.3
    - Done when: `amplify_outputs.json` exists, the app builds with it, and a signed-in test user can list `EVSpec` (empty list, no error).
    - _Requirements: Technology Constraints_

- [ ] 12. EVSpec data
  - [ ] 12.1 Seeded fallback table
    - Extend `evFallbackSeed.ts` to cover at least Leaf, Bolt, Model Y, Model 3, Prius Prime, Mach-E, IONIQ 5, and Rivian, with `make`, `model`, `year`, `max_ac_kW`, `plug_type`.
    - Depends on: 10.2
    - Done when: a unit test confirms every row has `max_ac_kW` in [3.0,22.0] and a valid plug.
    - _Requirements: 1.8_
  - [ ] 12.2 Seed script into DynamoDB, with Open EV Data when available
    - `scripts/seed-evspec.ts` writes the fallback table, then merges Open EV Data entries (`ac_charger.max_power_kw`) for US models.
    - Check that Open EV Data covers Leaf, Bolt, Model Y, and Prius Prime (README open question).
    - Depends on: 11.4, 12.1
    - Done when: running the script twice leaves one row per make/model/year (idempotent), and the customer onboarding dropdown (14.2) can read them.
    - _Requirements: 1.8_

- [ ] 13. Auth and routing
  - [ ] 13.1 Add the router and Cognito gating
    - Routes: `/` (public landing page), `/host/onboarding`, `/customer/onboarding`, `/search`, `/bookings/:id`, `/host/bookings`.
    - Use the Amplify `Authenticator` for protected routes. Save the role on `UserProfile` after sign-in. One role per account in the MVP.
    - Wire the two landing CTAs to the onboarding routes.
    - Depends on: 11.4, 10.4
    - Done when: signed out, `/` renders and `/host/onboarding` shows the Cognito sign-in. After sign-in the user lands on the matching onboarding route.
    - _Requirements: 1.1, 1.2, 1.8_

- [ ] 14. Customer onboarding
  - [ ] 14.1 `resolveCarMaxKw` (pure)
    - Input: EVSpec match, manual kW, host `charger_kW`. Output: `{ car_max_AC_kW, source }`, with `source` one of `EVSPEC | MANUAL | WORST_CASE`.
    - Unresolved yields `null` on the profile and `charger_kW` at pricing time.
    - Depends on: 3.1
    - Done when: unit tests pass for each source, plus precedence (EVSpec over manual) and invalid manual values.
    - _Requirements: 1.9, 1.10_
  - [ ] 14.2 Customer onboarding UI
    - Reuse the existing landing-page car select markup.
    - Make → Model → Year from `EVSpec`.
    - If there is no match, offer manual kW entry.
    - The plug type comes from EVSpec or manual selection. Never ask whether the customer owns an adapter.
    - Save to `UserProfile`.
    - Depends on: 12.2, 13.1, 14.1
    - Done when: a test user can pick a seeded car and see it saved. An unlisted car with a manual 7.2 kW saves `7.2`. Leaving it blank saves `null`.
    - _Requirements: 1.8, 1.9, 1.10; Steering §1_

- [ ] 15. Unified photo upload (listing, arrival, pickup)
  - [ ] 15.1 `uploadPhoto(key, file)` in `src/lib/upload.ts`
    - Uses Amplify Storage. 30 s budget. Returns a typed `{ ok: true, key } | { ok: false, reason: "TIMEOUT" | "FAILED" }`.
    - Depends on: 11.3
    - Done when: unit tests with a mocked Storage cover success, failure, and timeout (fake timers at 30 s).
    - _Requirements: 1.4, 5.2, 5.5, 5.7_
  - [ ] 15.2 `PhotoUploader` component
    - Shows progress, a retry button on failure, and never advances the caller's state without `ok: true`.
    - Depends on: 15.1
    - Done when: a manual or component test shows that a failed upload keeps the form values and shows retry.
    - _Requirements: 1.4, 5.2_

- [ ] 16. Host onboarding
  - [ ] 16.1 `validateHostListingInput` (pure)
    - Required: street address; MA 5-digit ZIP; level L1/L2; `charger_kW` [1.44,19.2]; plug J1772/NACS; `solar_kW` [0,25]; spots integer ≥1; adapters (`J1772_TO_NACS`, `NACS_TO_J1772`, `BOTH`, `NONE`); `right_to_list` true; `host_earnings_hr` ≥0; daytime and overnight availability windows; a photo key.
    - Cap `host_earnings_hr` at `2 × SUGGESTED_PARKING_RATE_HR`.
    - Return per-field errors and keep the other values.
    - Depends on: 2.1
    - Done when: unit tests cover each missing field, bad ZIP, kW bounds, and the cap clamping 9.00 to the cap.
    - _Requirements: 1.2, 1.3, 1.5_
  - [x] 16.2 EIA rate adapter
    - `src/adapters/eiaRates.ts` requests `https://api.eia.gov/v2/electricity/retail-sales/data/` with `frequency=monthly`, `data[0]=price`, `facets[stateid][]=MA`, `facets[sectorid][]=RES`, sorted by `period` descending, with a 5 s `AbortController`.
    - Validates the response, keeps the latest valid record and its data month, and feeds `resolveRate` (cents/kWh ÷ 100).
    - The statewide result is cached centrally (24 h; failures 60 s), so ZIP changes never refetch.
    - The key comes from `VITE_EIA_API_KEY`. It is browser-visible; move the call server-side before production.
    - Depends on: 8.1
    - Done when: tests with mocked `fetch` cover success, non-200, timeout, bad data, and caching; the host form shows "Massachusetts residential average · EIA · [data month]", falls back to a labeled $0.30 estimate, and never overwrites a rate the host edited.
    - _Requirements: 1.6, 1.7_
    - Completion note: verified with unit tests, browser scenarios against a scripted endpoint, and one live EIA call (August 2026 data, 30.48¢ → $0.3048/kWh). EIA is state-level only: no ZIP-level or utility-level precision.
  - [ ] 16.3 Extract the host form into `HostOnboardingFlow`
    - Copy the host panel from `LandingPage.tsx`.
    - Add availability-window inputs (daytime and overnight) and the `local_rate` auto-fill with override.
    - Render per-field errors from 16.1.
    - The landing page still works unchanged at this point.
    - Depends on: 16.1, 16.2, 15.2, 13.1
    - Done when: submitting with missing fields blocks, keeps values, and marks each invalid field. ZIP entry fills the rate and the override works.
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7_
  - [ ] 16.4 Wire submission
    - Geocode the address with Mapbox Geocoding for `lat`/`lng`.
    - Upload the listing photo to `media/listings/{listingId}/listing.jpg`.
    - Create `HostListing` with `active = true`.
    - Depends on: 16.3, 11.4
    - Done when: a test host creates a listing that appears in DynamoDB with lat/lng and photo key. A failed or timed-out upload keeps all entered values and offers retry.
    - _Requirements: 1.2, 1.4_

- [ ] 17. Seed hosts
  - [ ] 17.1 Seed about 15 hosts
    - Script `scripts/seed-hosts.ts`. Areas: West Roxbury, Roslindale, Jamaica Plain, Dorchester.
    - Cover L1 and L2, J1772 and NACS, all four adapter settings, solar from 0 to about 10 kW, and varied earnings.
    - Rates from ZIP data.
    - Run every seed row through `validateHostListingInput`.
    - Depends on: 16.1, 11.4
    - Done when: the script is idempotent and creates 15 active listings that all pass validation. The listings are visible to a signed-in user.
    - _Requirements: 1.2, 2.1_

- [ ] 18. Search and Listing Card
  - [ ] 18.1 Destination resolution
    - MBTA V3 stations (subway and commuter rail) as the first-class option, fetched with a 10 s budget and cached.
    - A short seeded venue list (Fenway, TD Garden).
    - Mapbox geocoding for free-text addresses.
    - Output `{ name, lat, lng }`.
    - Depends on: 1.2
    - Done when: tests with mocked adapters resolve a station, a venue, and an address. A manual run resolves "Forest Hills".
    - _Requirements: 2.1_
  - [ ] 18.2 Radius and availability filter (pure)
    - `filterListings(listings, center, radiusMiles, window)` using `haversineDistanceMeters`. Active only. Radius 0.1 to 25 mi, default 2. Time window must fall within an availability window.
    - Depends on: 2.3
    - Done when: unit tests cover in/out of radius, radius bounds, inactive listings, and window mismatch. Rendering code never calls Mapbox for listings this filter removes.
    - _Requirements: 2.1, 2.5; Steering §2_
  - [ ] 18.3 Plug and adapter compatibility (pure)
    - `isPlugBookable(hostNative, hostAdapters, carPlug)`. Port the logic from the landing page and switch the landing page to import it.
    - Depends on: 10.3
    - Done when: a table test covers all 2 × 2 × 4 combinations. `LandingPage` imports the shared function (no duplicate).
    - _Requirements: 2.6_
  - [ ] 18.4 Sorting and slow-charger flag (pure)
    - `isChargerSlower` and `sortListings(mode)` with modes `BEST_FIT` and `PRICE`.
    - Best fit puts `charger_kW >= car_max_AC_kW` first. Unknown car kW counts as the charger's full power.
    - Depends on: 3.1
    - Done when: unit tests cover both modes, including the slow-charger ordering and the unknown-car case.
    - _Requirements: 2.7_
  - [ ] 18.5 External adapters with timeouts
    - Mapbox walking time (Directions API, walking profile) and MBTA nearby routes: 10 s each.
    - Open-Meteo hourly irradiance: 10 s, no key, returns an array aligned to the booking window.
    - Each returns a typed result, not a throw.
    - Depends on: 18.1
    - Done when: mocked tests cover success, error, and timeout for each. Walk time is returned as whole minutes.
    - _Requirements: 2.1, 2.2, 2.4, 4.2_
  - [ ] 18.6 Search orchestrator
    - Run 18.2 first, then enrich each listing in parallel (`Promise.allSettled`).
    - A failed enrichment marks only its own field as an error. Climate fields use the engines and show "solar data unavailable" when Open-Meteo fails.
    - Transit miles = Haversine miles from listing to destination, labeled as an estimate (decision 6).
    - Depends on: 18.2, 18.3, 18.4, 18.5, 6.2, 3.1
    - Done when: with mocked adapters, a Mapbox failure still returns every listing with a walk-time error. An empty match returns an empty-results state.
    - _Requirements: 2.1, 2.4, 2.5, 4.2_
  - [ ] 18.7 `ListingCard` component
    - Reuse the landing-page preview card styling.
    - Show: walk time (whole minutes), nearby routes, per-car price/hr, Estimated Miles Added, solar share % (0 to 100), Green Score (0 to 1).
    - Show the slow-charger badge and the plug-mismatch indication with the Book button disabled.
    - Add the Zero-Touch line.
    - Depends on: 18.6, 10.4
    - Done when: the copy-guard test still passes. A component test with a mismatched listing shows the indication and a disabled button. A slow charger shows the exact badge "Charger slower than your car's max acceptance rate".
    - _Requirements: 2.2, 2.3, 2.6, 2.7; Steering §1_
  - [ ] 18.8 Search page with map
    - Mapbox GL JS map. Markers render only for listings that passed 18.2.
    - Destination, date/time range, plug and level filters, and the sort control (Best Charger Fit, Price).
    - Depends on: 18.6, 18.7, 13.1
    - Done when: signed in, searching "Forest Hills" for tomorrow shows seeded listings as cards and markers. Changing the car changes prices. No marker appears outside the radius.
    - _Requirements: 2.1, 2.5, 2.7; Steering §2_

- [ ] 19. Booking
  - [ ] 19.1 Create booking (payment faked)
    - Freeze `car_max_AC_kW_snapshot`, `P_eff_snapshot`, `price_per_hr_snapshot` at creation. Status `RESERVED`.
    - Show the customer total via `settle` with no late time. Payment is a mock confirmation screen. Notifications are in-app only.
    - Block creation if `isPlugBookable` is false.
    - Depends on: 18.7, 11.2
    - Done when: booking a seeded listing creates a `RESERVED` booking whose snapshots match the card's price. A mismatched listing cannot be booked.
    - _Requirements: 2.6, 3.1, 3.3, 3.4_
  - [ ] 19.2 Host bookings view
    - List bookings for the host's listings, with status, arrival and pickup photo links, and a "needs review" marker for `FLAGGED_FOR_HOST_REVIEW`.
    - Show an in-app "customer is N minutes late" banner when past booked end and not completed.
    - Depends on: 19.1
    - Done when: a host sees a customer's booking and flagged status. A customer cannot read another customer's booking.
    - _Requirements: 5.7; README §3 (host flow 7)_

- [ ] 20. Arrival check-in
  - [ ] 20.1 `Check_In_Flow`
    - Require a confirmed Arrival Photo upload to `media/bookings/{bookingId}/arrival.jpg` before status moves `RESERVED` → `ACTIVE`.
    - On failure or timeout, stay `RESERVED`, keep state, and offer retry.
    - Depends on: 15.2, 19.1
    - Done when: a test with a mocked failed upload leaves status `RESERVED`. A successful upload sets `ACTIVE` and saves `arrival_photo_key`.
    - _Requirements: 5.1, 5.2_

- [ ] 21. Pickup and settlement
  - [ ] 21.1 Geolocation wrapper
    - `getPosition()` wraps `navigator.geolocation.getCurrentPosition` with a 30 s timeout. Typed results: `OK`, `TIMEOUT`, `DENIED`, `UNAVAILABLE`.
    - Depends on: 2.1
    - Done when: unit tests with a mocked `navigator.geolocation` cover all four results.
    - _Requirements: 5.3, 5.4, 5.7_
  - [ ] 21.2 `evaluatePickup` (pure decision function)
    - Inputs: geo result, listing coordinates, pickup photo status.
    - Outcomes: `BLOCK_TIMEOUT`, `BLOCK_TOO_FAR { displayMeters }`, `BLOCK_NEEDS_PHOTO`, `ALLOW`, `ALLOW_FLAGGED` (permission denied, photo only).
    - Radius from `PICKUP_RADIUS_M`.
    - Depends on: 2.3, 21.1
    - Done when: unit tests cover exactly 50.0 m (allow), 51 m (blocked, shows "51"), and 50.4 m (blocked, shows "50", rounding per Req 5.6). Denied permission with a photo gives `ALLOW_FLAGGED`. A missing photo never allows.
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ] 21.3 `Pickup_Service` UI and settlement
    - On "Pick up": get position, evaluate, upload the pickup photo to `media/bookings/{bookingId}/pickup.jpg`. Only after a confirmed upload record `actual_end_time = now()`.
    - Run `settle` with the booking snapshots. Save `late_fee`, `customer_total`, status `COMPLETED`.
    - Fallback path sets `geofence_status = FLAGGED_FOR_HOST_REVIEW`.
    - Save `solar_share` and `green_score` when Open-Meteo succeeds. Otherwise leave them unchanged.
    - Depends on: 21.2, 15.2, 4.1, 6.2, 18.5, 20.1
    - Done when: a manual run at the listing completes and shows the final total. A run far away is blocked with the distance. Denied permission completes with the flag set. A failed upload does not end the session.
    - _Requirements: 3.4, 3.5, 4.2, 5.3 to 5.7_
  - [ ] 21.4 Running late-fee display
    - While `ACTIVE` and past booked end, show the running late fee (using `settle` with `now()`) to the customer and in the host view (19.2).
    - Depends on: 21.3, 19.2
    - Done when: with a booking whose end time is 30 minutes ago at price $2.00/hr, the display shows a $1.50 late fee (before the 10% service fee).
    - _Requirements: 3.4_

- [ ] 22. Finish the landing page
  - [ ] 22.1 Retire the inline forms from `LandingPage.tsx`
    - Replace the left-column role forms with a compact car selector and duration (design: "representative listing defaults"). Keep the hero, the CTAs (now routing), and the right-hand live preview.
    - Depends on: 16.4, 14.2, 13.1
    - Done when: signed out, `/` shows hero, the two CTAs, and a preview that recalculates price/hr when the car changes (Req 1.1). The file has no host or customer form state left, and the copy-guard test passes.
    - _Requirements: 1.1_
  - [ ] 22.2 Widen the copy guard
    - Make sure the copy-guard test covers all components and pages, including Listing_Card and booking screens.
    - Depends on: 10.1, 18.7, 19.1, 21.3
    - Done when: the test scans every `src/**/*.tsx` and passes.
    - _Requirements: 2.3; Steering §1_

- [ ] 23. MVP checkpoint
  - [ ] 23.1 Full verification
    - `npm run typecheck`, `npm run build`, `npm test` (includes Property 1 and Property 2 at 100+ runs).
    - Depends on: 1 to 22
    - Done when: all three exit 0.
  - [ ] 23.2 Demo walkthrough ("book, park, charge, go")
    - Manually: sign up as host → list (photo) → sign up as customer, pick a car → search a station → compare cards → book → arrival photo → pickup (in range) → final total and Green Score.
    - Depends on: 23.1
    - Done when: the full path works on a deployed sandbox, and the late, early, out-of-range, and permission-denied paths each behave as in 21.3.
    - _Requirements: 1 to 5_

---

## Flex Goals (optional, post-MVP)

Start only after task 23 passes. Every flex task is additive. If one needs to change an engine signature, re-run all unit tests and both property tests (5.1, 7.1).

- [ ] 24. [FLEX] Bedrock unknown-car lookup
  - [ ]* 24.1 `bedrockKwLookup` function
    - `amplify/functions/bedrockKwLookup/resource.ts` using `defineFunction`, returning a candidate `car_max_AC_kW` only. Its output never enters a pricing formula directly; the customer confirms it.
    - Depends on: 23.1
    - Done when: calling it with an unlisted make/model returns a number or a clean error.
    - _Requirements: 1.9_
  - [ ]* 24.2 Insert into the onboarding chain
    - Order: EVSpec → Bedrock → manual → worst case.
    - Depends on: 24.1, 14.2
    - Done when: a Bedrock failure falls through to manual entry with no error screen.
    - _Requirements: 1.9, 1.10_

- [ ] 25. [FLEX] OpenEI time-of-use rates
  - [ ]* 25.1 Extend `resolveRate(eia, touRate?)` and add a separate OpenEI tariff adapter
    - Price against the highest rate in the booking window so the price stays an upper bound.
    - Depends on: 23.1, 8.1
    - Done when: unit tests cover TOU present, absent, and a TOU window containing the max rate. Property 1 is re-run with `local_rate` set to the TOU maximum.
    - _Requirements: 1.6; README §5_

- [ ] 26. [FLEX] Sort by cheapest or fastest trip
  - [ ]* 26.1 Add trip-time source and sort modes
    - Needs a decision on the trip-time source (README open question).
    - Depends on: 23.1, 18.4
    - Done when: the sort modes exist and `sortListings` tests cover them.
    - _Requirements: README §2 (flex)_

- [ ] 27. [FLEX] Refund unused hours if the host rebooks
  - [ ]* 27.1 Rebooking-aware refund in `Billing_Engine`
    - Depends on: 23.1, 4.1
    - Done when: the early-pickup test in 4.2 still passes by default, and the refund applies only when the slot is rebooked.
    - _Requirements: README §4 (flex); amends 3.5_

- [ ] 28. [FLEX] Host dashboard
  - [ ]* 28.1 Earnings, kWh delivered, and CO₂ summary on the host bookings view
    - Depends on: 23.1, 19.2
    - Done when: totals match the sum of completed bookings.
    - _Requirements: README §2 (flex)_

- [ ] 29. [FLEX] Verification badges
  - [ ]* 29.1 Badge model and display on listings
    - Depends on: 23.1, 18.7
    - Done when: a badge shows on the card for a verified host.
    - _Requirements: README §2 (flex)_

- [ ] 30. [FLEX] Peak avoidance and grid-aware scheduling
  - [ ]* 30.1 Peak-hour (4 to 9 pm) handling and an ISO-NE grid-aware fourth Green Score term
    - Changes the Green Score formula (Property 2 must be updated and re-run).
    - Depends on: 23.1, 6.2, 7.1
    - Done when: Property 2 is updated for the new term and passes with 100+ runs.
    - _Requirements: README §2 and §6 (flex)_

- [ ] 31. [FLEX] City impact page
  - [ ]* 31.1 Aggregate impact page (miles replaced, CO₂ saved)
    - Depends on: 23.1, 21.3
    - Done when: totals match stored completed bookings.
    - _Requirements: README §2 (flex)_
