# Implementation Plan: Dwell MVP

## How to read this plan

- Source of truth when documents disagree: `requirements.md` > `design.md` > `README.md` > the current prototype code. Steering (`.kiro/steering/*.md`) applies to every task.
- Each task lists `Depends on` (task ids that must be done first) and `Done when` (a check someone can run or observe).
- Sections 1 to 23 are the MVP. Sections 24 to 31 are **Flex goals**. They are optional (`*`), live in their own section, and must not start until task 23 passes.
- `[x]` means done and verified. "(prototype done)" after a task id means the behavior works in the prototype on sample data or `localStorage`; each such task lists what was done and what remains, and stays unchecked until the remaining part is done. Prototype work outside the original plan is recorded in section P.
- Property-based tests (fast-check, 100+ runs, tagged `// Feature: voltlot-mvp, Property N: ...`) are required, not optional.
- Pure engines come first so the landing page, search, booking, and pickup all share one implementation of each formula.
- Pin exact dependency versions. The backend is plain AWS defined with AWS CDK v2 in TypeScript (`infra/`, handlers in `functions/`). No Amplify in any form (decision 13).
- After each task run `npm run typecheck`, `npm test` and `npm run build`, and update `tech.md` / `structure.md` if what exists changed.

## Where things stand

The UI and the whole driver and host workflow run as a browser prototype (10 routes, sample data, `localStorage` state, prototype sign-in, MapLibre map). See `product.md` "Current workflow" for the flow and `tech.md` "Current status" for the details. In short:

- **Done:** scaffold (1), engines with unit tests (2 to 4, 6, 8), EIA rate adapter (16.2), plug compatibility and sorting (18.3, 18.4), the one-account sign-up and host wizard UI, search with map and cards, booking with guards, arrival photo, 50 m pickup check with flagged fallback, receipt.
- **Backend built and wired, not deployed:** the CDK app with the data and API stacks and all 13 route handlers (11.1 to 11.3), the host-validation module (16.1, wizard not switched over), the seed, config and smoke-test scripts (11.5, 12.2, 17.1), and a backend mode in the app (Cognito sign-in, API data, photo upload; 13.1, 15.1, 16.4, 19.1, 20.1, 21.3) that turns on with `public/config.json`. None of it has run against AWS yet. 287 tests pass.
- **Not done:** property tests (5.1, 7.1) and the rounding decision gate (5.2); the copy-guard test (10.1); hosting (11.4), the first deploy and checks against AWS (11.5), the host bookings view (19.2); EVSpec beyond 8 seeded cars and manual kW entry (12, 14); switching the wizard to the host validation module (16.1); MBTA, Open-Meteo and Mapbox Directions adapters (18.5); radius filter (18.2).
- The original `src/pages/LandingPage.tsx` no longer exists. Section 10 and task 22.1 were rewritten for `src/pages/Landing.tsx`.

## Decisions and risks to confirm during implementation

1. **Rounding can break Property 1.** Req 3.3 rounds `electricity_cost_per_hr` half-up to 2 dp. That can land up to $0.005/hr below the true cost, so with `host_earnings_hr = 0` and `late_minutes = 0` the payout can fall below `charger_kW * hours * local_rate`. Task 5.2 is a decision gate. Do not silently change Req 3.3 or weaken the property.
2. **Fractional booked hours in solar share.** The formula sums hourly values. For fractional `booked_hours`, sum the first `ceil(booked_hours)` values and clamp the result to [0,1] (design: clamp is the final step).
3. **Late minutes.** Req 3.4 does not say how to handle partial minutes. Assumption: round the overstay up to a whole minute, so the host is never under-collected.
4. **Design data-model gaps.** The design schema now carries `plug_type` on `UserProfile`, and `parking_instructions`, `right_to_list`, `photo_keys` and structured `availability` on `HostListing`. Still to add: `plug_type` on `EVSpec` (Req 2.6), and host read access to bookings on their listings (README host flow 7, Req 5.7). Store an unresolved `car_max_AC_kW` as `null` and resolve it per listing at pricing time, because the worst-case default is the host's `charger_kW`. Use the prototype types in `src/types/` as the field reference.
5. **Storage access vs `bookingId` paths (resolved by decision 13).** Req 5.1 fixes the path `media/bookings/{bookingId}/arrival.jpg`. The bucket is private and the `create-upload` Lambda checks booking or listing ownership before it presigns one exact key, so per-booking access holds without path rules.
6. **`transit_miles` source.** MBTA V3 has no trip planner (README open question). MVP uses Haversine miles from listing to destination, labeled as an estimate.
7. **Bedrock and OpenEI TOU are flex.** README places both in flex. Req 1.9 says "query Bedrock or accept manual kW entry", so manual entry alone satisfies Req 1.9 in the MVP. The Bedrock lookup (task 24) and the OpenEI path (task 25) are flex.
8. **Naming.** The distance helper is `haversineDistanceMeters()` (`src/lib/geo.ts`), in steering and design alike.
9. **Double-booking prevention.** Req 6.3 limits each account to one live booking. Overlap between different accounts' bookings on one listing is not in the requirements and is not enforced; with a backend it needs a decision.
10. **Not tasked.** Cancellation and refund policy, no-show release, host-cancel, and charger-broken reports are in README edge cases, not in the reconciled requirements. A reservation never checked in simply expires at its booked end (Req 6.4).
11. **One account, no roles.** The prototype replaced the separate host and customer sign-ups with one account (Req 1.11, 1.12). Tasks 13 and 14 were reworded for that. `UserProfile` has no role.
12. **Search area.** Req 2.1 keeps the 0.1 to 25 mile radius; the prototype filters by the visible map instead (task 18.2). Bookings are today-only, whole hours (task 18.8).
13. **Plain AWS instead of Amplify (decided Oct 26, 2026).** The owner chose AWS CDK with Cognito, an API Gateway HTTP API (JWT authorizer), Lambda, DynamoDB, S3 and CloudFront over Amplify Gen 2. An earlier Amplify sandbox left `.amplify/generated/` with eight function names; its `amplify/` source was never committed and is not reused. The handler names carry over (`design.md` Backend). Still open: own sign-in pages vs Cognito managed login, where the refresh token is stored, and the region (`tech.md`).

---

## MVP

- [x] 1. Project scaffold (historical: written around the original `LandingPage.tsx`, since replaced)
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
    - (Superseded by decision 13.) The backend config is `public/config.json`, generated per developer and git-ignored; the deployed copy is written by the web stack.
    - Depends on: 1.1
    - Done when: a fresh clone plus `.env.example` copied to `.env.local` builds. No secret is tracked (`git ls-files | grep -i env` shows only `.env.example`).
    - _Requirements: Technology Constraints_
    - Completion note: verified by copying all tracked and non-ignored files to a temp directory, then `npm ci`, typecheck, and build with `.env.example` as `.env.local`. Nothing is committed yet. The config-file question is settled by decision 13: `public/config.json`, `cdk.out/` and `cdk-outputs.json` are git-ignored.

- [x] 2. Pure foundations (no I/O, no React)
  - [x] 2.1 Shared constants and result types
    - Create `src/engines/constants.ts` and `src/engines/types.ts` (`EngineResult<T>`, `EngineError`).
    - Constants: `MILES_PER_KWH=3.5`, `LATE_MULTIPLIER=1.5` [PLACEHOLDER], `SERVICE_FEE=0.10` [PLACEHOLDER], `PICKUP_RADIUS_M=50` [PLACEHOLDER], `GAS_KG_PER_MILE=0.40`, `GRID_KG_PER_KWH=0.33`, `HOUSE_LOAD_KW=1.0`, `SOLAR_LOSS_FACTOR=0.8`, `FULL_SUN_W_M2=1000`.
    - More constants: Green Score weights `0.5/0.25/0.25`, `R2_MILES=20`, `R3_KG=5`, `DEFAULT_LOCAL_RATE=0.30`, `EARNINGS_CAP_MULTIPLE=2`, `SUGGESTED_PARKING_RATE_HR=1.5` [PLACEHOLDER], and timeouts (`EIA 5s`, `MAPBOX/MBTA/OPEN_METEO 10s`, `S3/GEO 30s`).
    - Mark every README `[PLACEHOLDER]` value with a comment.
    - Depends on: 1.1
    - Done when: `npm run typecheck` passes. A grep for the literals `3.5`, `0.33`, and `1.5` in `src/engines/` outside `constants.ts` finds none (checked again after tasks 3 to 8).
    - _Requirements: 3.1, 3.4, 4.1, 4.5, 5.5, 1.5, 1.7_
    - Completion note: `src/engines/constants.ts` and `types.ts` exist and the literal grep is clean. Names differ from this list: `GREEN_REF_TRANSIT_MILES`, `GREEN_REF_CO2_KG`, and `SUGGESTED_EARNINGS_HR = 2.75` (instead of `SUGGESTED_PARKING_RATE_HR = 1.5`). Only the EIA timeout (`RATE_LOOKUP_TIMEOUT_MS`) is a constant so far; add the 10 s and 30 s budgets when their adapters are written (the 30 s geolocation budget currently lives in `adapters/geolocation.ts`, `HostSignup.tsx` and `Session.tsx`).
  - [x] 2.2 `roundHalfUp(value, decimals)`
    - Make it decimal-safe: `Math.round(x * 100) / 100` is wrong for cases like 1.005.
    - Depends on: 2.1
    - Done when: unit tests pass for `roundHalfUp(1.005,2)=1.01`, `roundHalfUp(2.675,2)=2.68`, `roundHalfUp(134.25,1)=134.3`, `roundHalfUp(19.272,2)=19.27`, `roundHalfUp(0,2)=0`.
    - _Requirements: 3.3_
    - Completion note: `src/engines/money.ts`; the five cases are in `pricing.test.ts`.
  - [x] 2.3 `haversineDistanceMeters(a, b)` and a miles helper
    - Put them in `src/lib/geo.ts`. Use this exact name (steering).
    - Depends on: 2.1
    - Done when: unit tests pass for zero distance on equal points, symmetry, non-negativity, and the reference value that 1° of latitude at (42,-71)→(43,-71) is about 111,195 m (±1 m with R=6,371,000 m).
    - _Requirements: 2.1, 5.3; Steering §2_
    - Completion note: `src/lib/geo.ts` exports `haversineDistanceMeters` and `metersToMiles`; tests in `src/lib/lib.test.ts`.

- [x] 3. Pricing_Engine
  - [x] 3.1 Implement `computePrice` in `src/engines/pricing.ts`
    - `P_eff = min(charger_kW, car_max_AC_kW ?? charger_kW)`.
    - `electricity_cost_per_hr = round2(P_eff * local_rate)`.
    - `price_per_hr = round2(electricity_cost_per_hr + host_earnings_hr)`.
    - `estimated_miles_added = round1(P_eff * booked_hours * 3.5)`.
    - Validate: `charger_kW>0`, `local_rate>0`, `host_earnings_hr>=0`, `booked_hours>0`, and `car_max_AC_kW` is a positive number or `null`. Reject NaN, strings, and `undefined`. The error names the field and no price is produced.
    - Depends on: 2.1, 2.2
    - Done when: the unit tests in 3.2 pass.
    - _Requirements: 3.1, 3.2, 3.3, 1.10_
  - [x] 3.2 Pricing unit tests
    - Use the README worked example (charger 9.6 kW, rate $0.30, earnings $1.50, 4 h).
    - Car 3 kW → P_eff 3, electricity 0.90, price 2.40, miles 42.0.
    - Car 11 kW → P_eff 9.6, electricity 2.88, price 4.38, miles 134.4.
    - `car_max_AC_kW = null` → P_eff 9.6.
    - Invalid input per field (error names the field, no `price_per_hr`).
    - `.005` rounding boundary.
    - Depends on: 3.1
    - Done when: `npm test` is green for `pricing.test.ts`.
    - _Requirements: 3.1, 3.2, 3.3, 1.10_
    - Completion note: 6 tests, plus a UI example (Leaf 6.6 kW, $2.75 earnings → $4.73/hr).

- [x] 4. Billing_Engine
  - [x] 4.1 Implement `settle` in `src/engines/billing.ts`
    - `late_minutes = max(0, ceil((pickup - booked_end) / 60000))` (assumption 3).
    - `late_fee = round2((late_minutes/60) * (price_per_hr * 1.5))`.
    - `customer_total = round2(((price_per_hr * booked_hours) + late_fee) * 1.10)`.
    - Early pickup gives `late_minutes = 0` and no refund (total stays at full booked hours).
    - Validate inputs and return typed errors.
    - Depends on: 2.1, 2.2
    - Done when: the unit tests in 4.2 pass.
    - _Requirements: 3.3, 3.4, 3.5_
  - [x] 4.2 Billing unit tests
    - `price 2.40 × 4 h` → total 10.56.
    - `price 4.38 × 4 h` → total 19.27.
    - README late example: price $2.00, 30 min late → late fee 1.50.
    - Pickup 1 h early → `late_minutes 0` and total unchanged.
    - Pickup exactly at booked end → no fee (zero grace means any minute after is billed).
    - Invalid-input rejection.
    - Depends on: 4.1
    - Done when: `npm test` is green for `billing.test.ts`.
    - _Requirements: 3.4, 3.5_
    - Completion note: 8 tests. `settle` also returns `subtotal` and `service_fee` (derived so receipt lines add up), and `lateRatePerMinute` is exported for display.

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

- [x] 6. Climate_Engine
  - [x] 6.1 Implement `computeSolarShare` in `src/engines/climate.ts`
    - `solar_kW(h) = system_kW*(I_h/1000)*0.8`.
    - `usable(h) = min(max(solar_kW-1.0,0), P_eff)`.
    - `solar_share = sum(usable over first ceil(booked_hours) values) / (P_eff*booked_hours)`, clamped to [0,1] (assumption 2).
    - Return a "solar data unavailable" error when the series is shorter than `ceil(booked_hours)`.
    - Reject missing, negative, or non-numeric `system_kW`, `P_eff`, `booked_hours`, naming the field.
    - Depends on: 2.1
    - Done when: the unit tests in 6.3 pass.
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 6.2 Implement `computeEmissions` and `computeGreenScore`
    - `grid_kWh = P_eff*booked_hours*(1-solar_share)`.
    - `gas_co2_saved_kg = estimated_miles_added*0.40 - grid_kWh*0.33`.
    - `G = 0.50*solar_share + 0.25*min(transit_miles/20,1) + 0.25*min(max(gas_co2_saved_kg,0)/5,1)`, rounded to 3 dp and clamped to [0,1].
    - Export the emissions values too, because the landing page and Listing_Card show kg CO₂ saved.
    - Reject missing or negative `estimated_miles_added` and `transit_miles`.
    - Depends on: 6.1, 2.2
    - Done when: the unit tests in 6.3 pass.
    - _Requirements: 4.3, 4.5_
  - [x] 6.3 Climate unit tests
    - Hand vector: system 6 kW, irradiance [650]×4, P_eff 9.6, hours 4, transit 6.5 → `solar_share ≈ 0.2208`, miles 134.4, `G = 0.442`.
    - Clamp at the 1 kW baseline: irradiance low enough that solar_kW < 1 gives usable 0.
    - Clamp at P_eff: system 25 kW, I=1300 gives usable = P_eff.
    - Overnight all-zero series gives `|solar_share| < 0.001`, and the value is shown, not replaced.
    - Short series gives the unavailable error and no score.
    - Invalid-input rejection names the field.
    - Depends on: 6.1, 6.2
    - Done when: `npm test` is green for `climate.test.ts`.
    - _Requirements: 4.1 to 4.5_
    - Completion note: 12 tests. `greenScoreTerms` is also exported for the listing page's breakdown.

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
  - Status: the three commands pass today (173 tests), but this checkpoint waits for 5 and 7.

- [ ] 10. Landing page (`src/pages/Landing.tsx`): engines and copy
  - [ ] 10.1 Add a copy-guard test (`src/copy.test.ts`)
    - Scan `src/**/*.tsx` for forbidden phrases (case-insensitive): "full charge", "wasted", "do you (own|have) an adapter", "bring your (own )?adapter".
    - Assert `Landing.tsx` contains "Estimated miles added", "No key handoff", "car never moves", "host never touches", and "Become a host" (case-insensitive), and that `ListingPage.tsx` contains "local solar self-consumption".
    - Depends on: 1.1
    - Done when: the test runs and passes against the current pages. A temporary edit that adds "full charge" to any page makes it fail.
    - _Requirements: 1.1, 2.3; Steering §1_
    - Status: not written. A manual grep on the current code finds no forbidden phrase and all required ones.
  - [x] 10.2 Static data out of the page
    - Cars live in `src/data/evFallbackSeed.ts` (8 models: `id`, `name`, `maxAcKw`, `plug`; `DEFAULT_CAR` is the Nissan Leaf). Rates come from EIA (16.2), so no ZIP rate table exists. Earnings constants come from `engines/constants.ts`.
    - _Requirements: 1.5, 1.8_
    - Completion note: done with the UI rebuild. The seed rows have no make/model/year split; 12.1 adds it.
  - [x] 10.3 Landing preview uses the engines
    - The hero ledger runs `evaluateListing` (pricing, billing, sample-irradiance solar share, Green Score) for four sample listings near Central, for `DEFAULT_CAR`, 10 am for 4 hours.
    - Done when: a grep in `Landing.tsx` for `* 3.5`, `* 0.8`, `* 0.33`, and `* 1.5` returns nothing.
    - _Requirements: 1.1, 3.1, 3.3, 4.1, 4.5_
    - Completion note: grep is clean. Formulas exist only in `src/engines/`.
  - [ ] 10.4 Copy and bounds match requirements and steering
    - Landing: destination search with "Find chargers" and "Use my current location", and the "Become a host" CTA (Req 1.1 as revised); "Estimated miles added" in the ledger; the Park step says "No key handoff, the car never moves, and the host never touches it".
    - Plug mismatch: hidden with a count in Search, indication plus disabled booking on the listing page (Req 2.6 as revised). No "Listing Hidden" copy remains.
    - Charger kW bounds in the host wizard: L2 3.0 to 19.2, L1 1.44 to 1.92 (move the 3.0 and 1.92 literals to constants).
    - Listing page uses the "local solar self-consumption" wording.
    - Depends on: 10.1
    - Done when: the copy-guard test from 10.1 passes and the page still builds.
    - _Requirements: 1.1, 2.3, 2.6; Steering §1_
    - Status: the copy is in place; only the 10.1 test and the constants move remain.
  - [ ] 10.5 Manual verification of the landing page
    - Run `npm run dev` manually. Confirm the ledger shows prices for the Nissan Leaf with no API call other than map tiles, the steps and host CTA are present, and a destination continues to Search (through sign-in when signed out).
    - On Search, switch cars (Prius Prime vs Model Y) and confirm that price/hr changes.
    - Depends on: 10.4
    - Done when: all of the above behave as described.
    - _Requirements: 1.1, 1.8_

- [ ] 11. AWS backend (CDK, no Amplify; decision 13). 11.1 to 11.3 done; hosting (11.4) and the first deploy (11.5) remain
  - [x] 11.1 Scaffold the CDK app
    - Create `infra/` with `cdk.json` (`"app": "npx tsx bin/dwell.ts"`), `bin/dwell.ts`, `tsconfig.json`, and empty `DwellData`, `DwellApi` and `DwellWeb` stacks in `infra/lib/`. A `stage` context value prefixes stack names (`-c stage=dev-<name>`); explicit `env` with account and region.
    - Create `functions/` with its own `tsconfig.json` and a `functions/shared/` folder (JWT `sub` helper, typed JSON responses, item types from design.md).
    - Pin the `aws-cdk` CLI as a dev dependency next to `aws-cdk-lib` and `constructs` (already present). Add `cdk:synth`, `cdk:diff` and `cdk:deploy` scripts, and extend `typecheck` to `infra` and `functions`.
    - Add `cdk-nag` (`AwsSolutionsChecks`) and fix or document each finding.
    - Depends on: 1.1
    - Done when: `npm run typecheck` and `npx cdk synth --strict` (from `infra/`) pass with no AWS calls. `git grep -n "amplify" -- src infra functions package.json` is empty.
    - _Requirements: Technology Constraints; Steering §2_
    - Completion note: `infra/` (`cdk.json` with the recommended feature flags for aws-cdk-lib 2.274, `bin/dwell.ts`, `lib/app.ts`, `config.ts`, `data-stack.ts`, `api-stack.ts`, `dwell-function.ts`, `nag.ts`) and `functions/` (one folder per route plus `shared/`). `aws-cdk` 2.1146.1 and `cdk-nag` 3.0.2 pinned. cdk-nag v3 runs as a validation plugin; accepted findings and reasons are in `infra/lib/nag.ts`. The web stack is not created yet (11.4). `env` uses `CDK_DEFAULT_ACCOUNT` and the `region` context value (`us-east-2`, required by the organization's SCP). `npm run typecheck` and `npm run cdk:synth` (`--strict`) pass with no AWS calls.
  - [x] 11.2 Data stack: tables, user pool, photo bucket
    - DynamoDB tables `Profiles`, `Listings`, `Bookings`, `EVSpecs` with the keys and indexes in design.md (on-demand, PITR, deletion protection, `RETAIN`).
    - Cognito user pool: email username, required email verification, `name` and `phone_number` attributes, strong password policy; public app client (no secret) with refresh-token rotation and revocation; `post-confirmation` trigger that writes the `Profiles` item.
    - Photo bucket: block public access, TLS only, encryption, CORS for POST from the site origin and `http://localhost:5173`.
    - Depends on: 11.1
    - Done when: `cdk synth` passes, a CDK assertions test (`infra/lib/*.test.ts`) checks the keys and indexes, the app client has no secret, and the bucket blocks public access.
    - _Requirements: 1.2, 1.4, 1.8, 1.11, 2.6, 5.1, 5.5, 5.7_
    - Completion note: `infra/lib/data-stack.ts`, asserted in `infra/lib/stacks.test.ts`. Indexes: `active` (sparse) on Listings and `byListing` on Bookings; `byHost` and `byCustomer` were dropped because the profile points at the account's listing and latest booking. Required attributes are email, name and phone (E.164); the password policy is Cognito's default, and the sign-up form now enforces the same rule through `src/lib/accountRules.ts`. Cognito sends email itself (small daily quota) until SES is configured.
  - [x] 11.3 API stack: HTTP API, JWT authorizer, handlers
    - HTTP API with a JWT authorizer (issuer = user pool, audience = app client id) on every route, CORS for the two origins, stage throttling, access logs.
    - One `NodejsFunction` per route in design.md's route table, with least-privilege `grant*()` calls (for example `create-booking` reads `Listings` and writes `Bookings` and `Profiles`).
    - `get-electricity-rate` reads the EIA key from SSM Parameter Store (`/dwell/<stage>/eia-api-key`, SecureString, created by hand, never in the template).
    - Handlers reuse `src/engines/` and the pure helpers in `src/features/` and `src/lib/`; no formula is copied.
    - Depends on: 11.2
    - Done when: handler unit tests with mocked AWS SDK clients cover allow and deny for each route (wrong user gets 403 or 404), and `cdk synth` passes.
    - _Requirements: 1.6, 1.7, 3.1 to 3.5, 5.1 to 5.7, 6.1 to 6.4_
    - Completion note: 13 routes in `infra/lib/api-stack.ts`, handlers in `functions/<route>/handler.ts`, each with a test (`aws-sdk-client-mock` 4.1.0) covering the allowed path and the denials (no token 401, someone else's item 404, rule violations 409). IAM uses explicit actions instead of `grant*()` so the only wildcards are S3 photo prefixes. The server reuses `evaluateListing`, `bookingBlock`, `isReservationExpired`, `checkPickupDistance`, `settleBooking` and the new `features/host/validateListing.ts` (16.1). Server time is America/New_York. Solar share at settlement still uses the sample irradiance profile (18.5). Not built: the host bookings route (19.2) and seed scripts (12.2, 17.1).
  - [ ] 11.4 Web stack and browser config (superseded: Amplify Hosting, decided Oct 28, 2026)
    - Status: hosting is Amplify Hosting instead of a `DwellWeb` CDK stack. `amplify.yml` builds the site and writes `config.json` with `npm run backend:config -- --from-env`. `lib/backendConfig.ts` and the local-dev script are done. Remaining: the site's origin in `webOrigins` and a security-headers setup (Amplify custom headers).
    - Private site bucket, CloudFront with origin access control, SPA fallback to `index.html`, a response-headers policy (CSP, HSTS, `frame-ancestors`, `nosniff`), and `config.json` (`apiUrl`, `region`, `userPoolId`, `userPoolClientId`) written from the other stacks' values.
    - `src/lib/backendConfig.ts` loads `/config.json` once at startup with a typed failure; a script writes `public/config.json` for local dev from `cdk deploy --outputs-file`.
    - Depends on: 11.3
    - Done when: `npm run build` passes, and the app still runs on sample data when `config.json` is missing (prototype mode).
    - _Requirements: Technology Constraints_
  - [ ] 11.5 Deploy a personal dev stage and smoke test (user runs the deploy)
    - Status: scripts ready, not run. `npm run cdk:deploy` writes `infra/cdk-outputs.json`; `npm run smoke -- --stage <stage> --email <you>` (`scripts/smoke-test.ts`) signs up a real account, asks for the emailed code, and checks `/me`, `/cars`, `/rate`, `/listings`, `/uploads` and a 401 without a token. Data stack outputs now include the region and table names for the scripts.
    - Ask the user to run `cdk bootstrap` once, create the SSM SecureString `/dwell/dev-<name>/eia-api-key`, then `npm run cdk:diff -- -c stage=dev-<name>` and `npm run cdk:deploy -- -c stage=dev-<name>` in their own terminal with their AWS credentials. This creates billable AWS resources.
    - Depends on: 11.3 (the backend deploys without 11.4; `public/config.json` comes with 11.4)
    - Done when: the stack outputs exist, and a confirmed test user gets `200` from `GET /cars` (the 8 seeded cars) and from `GET /rate`.
    - _Requirements: Technology Constraints_

- [ ] 12. EVSpec data
  - [ ] 12.1 Seeded fallback table
    - `evFallbackSeed.ts` already covers Leaf, Bolt, Model Y, Model 3, Prius Prime, Mach-E, IONIQ 5, and Rivian R1S with `maxAcKw` and `plug`. Add `make`, `model`, `year` so it can seed `EVSpec`.
    - Depends on: 10.2
    - Done when: a unit test confirms every row has `maxAcKw` in [3.0,22.0], a valid plug, and a make, model and year.
    - _Requirements: 1.8_
    - Status: the 8 rows exist and drive the car select; the fields and the test do not.
  - [ ] 12.2 Seed script into DynamoDB, with Open EV Data when available
    - Status: `scripts/seed.ts` written (`npm run seed -- --stage <stage>`, `--dry-run` validates without AWS); writes the 8 cars by fixed id. Open EV Data is not merged yet. Not run against AWS.
    - `scripts/seed-evspec.ts` writes the fallback table, then merges Open EV Data entries (`ac_charger.max_power_kw`) for US models.
    - Check that Open EV Data covers Leaf, Bolt, Model Y, and Prius Prime (README open question).
    - Depends on: 11.5, 12.1
    - Done when: running the script twice leaves one row per make/model/year (idempotent), and the car selector (14.2) can read them.
    - _Requirements: 1.8_

- [ ] 13. Auth and routing
  - [ ] 13.1 (prototype done) Router and Cognito gating
    - Status (backend mode, not run against AWS): with `public/config.json` the app signs up, confirms the emailed code (`components/ConfirmEmail.tsx`), signs in and out through Cognito (`adapters/cognito.ts`, plain fetch, no SDK) and restores the account from `GET /me` (`state/AppState.tsx syncAccount`). Tokens live in memory plus sessionStorage (`state/backend.ts`), refresh with `GetTokensFromRefreshToken`, and are revoked on sign-out. Without the file the prototype runs as before.
    - Routes (done, `src/App.tsx`): `/` public; `/signup` (`?next=host`), `/signin`, `/signout`; `/host`, `/host/new`, `/host/edit`; `/search`, `/listing/:id`, `/session`; anything else redirects to `/`.
    - Remaining: replace the prototype sign-in (`state/accounts.ts`, `state/demoAccount.ts`) with Cognito email sign-in through `@aws-sdk/client-cognito-identity-provider` (`SignUp`, `ConfirmSignUp`, `InitiateAuth`, refresh, `RevokeToken` on sign-out), or Cognito managed login if the open decision in `tech.md` goes that way. Sign-up gains an emailed-code step. Send `phone_number` as `toE164Us(phone)`; the form already enforces the pool's password rule (`lib/accountRules.ts`). Keep the one-account model: no role on `UserProfile` (Req 1.12). Keep the redirects: search, listing and session go to sign-up when signed out; host pages go to `/signup?next=host`.
    - Load the account's profile, car, listing and booking from `GET /me` after sign-in instead of `localStorage`. Every API call sends the access token.
    - Depends on: 11.5
    - Done when: signed out, `/` renders and `/host` sends the visitor to sign-up and then to `/host/new`. After Cognito sign-in the header shows the right host button ("Host an EV charger" or "Switch to Hosting").
    - _Requirements: 1.1, 1.11, 1.12_

- [ ] 14. Car choice (replaces "Customer onboarding": sign-up asks for no car)
  - [ ] 14.1 `resolveCarMaxKw` (pure)
    - Input: EVSpec match, manual kW, host `charger_kW`. Output: `{ car_max_AC_kW, source }`, with `source` one of `EVSPEC | MANUAL | WORST_CASE`.
    - Unresolved yields `null` on the profile and `charger_kW` at pricing time (the engines already accept `null`).
    - Depends on: 3.1
    - Done when: unit tests pass for each source, plus precedence (EVSpec over manual) and invalid manual values.
    - _Requirements: 1.9, 1.10_
  - [ ] 14.2 (prototype done) Car selector on Search and the listing page
    - Status: in backend mode the chosen car is saved with `PUT /me` (and again right before booking). Make/Model/Year and manual entry are still open.
    - Done in the prototype: a select over the 8 seeded cars on Search and the listing page sets `car` in app state, and every price, P_eff and fit note follows it.
    - Remaining: Make → Model → Year from `EVSpec`; a "My car isn't listed" option with manual kW and plug entry; save the choice to `UserProfile`. Never ask whether the driver owns an adapter.
    - Depends on: 12.2, 13.1, 14.1
    - Done when: a test user can pick a seeded car and see it saved after reload. An unlisted car with a manual 7.2 kW saves `7.2`. Leaving it blank saves `null` and prices at the charger's kW.
    - _Requirements: 1.8, 1.9, 1.10; Steering §1_

- [ ] 15. Unified photo upload (listing, arrival, pickup)
  - [ ] 15.1 `uploadPhoto(key, file)` in `src/lib/upload.ts`
    - Status: `src/lib/upload.ts uploadPhoto(api, target, dataUrl)` done with tests (presign via `POST /uploads`, form POST to S3, 30 s budget, typed failures). The signature takes the target instead of a key because the server issues the key.
    - Asks `POST /uploads` for a presigned POST for the key, then posts the file straight to S3. 30 s budget for the whole exchange. Returns a typed `{ ok: true, key } | { ok: false, reason: "TIMEOUT" | "FAILED" }`.
    - Depends on: 11.3
    - Done when: unit tests with a mocked `fetch` cover success, a refused presign (403), a failed S3 post, and timeout (fake timers at 30 s).
    - _Requirements: 1.4, 5.2, 5.5, 5.7_
  - [ ] 15.2 `PhotoUploader` component
    - Shows progress, a retry button on failure, and never advances the caller's state without `ok: true`.
    - Depends on: 15.1
    - Done when: a manual or component test shows that a failed upload keeps the form values and shows retry.
    - _Requirements: 1.4, 5.2_

- [ ] 16. Host onboarding
  - [ ] 16.1 (module done) `validateHostListingInput` (pure)
    - Move the rules now inline in `HostSignup.tsx` `validate(step)` into a pure module (for example `src/features/host/validateListing.ts`) that the wizard and the seed script (17.1) both use.
    - Rules (as built): address picked from suggestions or typed (street ≥ 4 chars, city ≥ 2, MA 5-digit ZIP); a confirmed pin; `right_to_list` true; spots 1 to 4; `charger_kW` L2 3.0 to 19.2, L1 1.44 to 1.92; L1 needs the outdoor-outlet check; `solar_kW` 0 to 50 when solar is on; `local_rate` 0.05 to 1.00; `host_earnings_hr` > 0 and ≤ `2 × SUGGESTED_EARNINGS_HR`; title ≥ 4 chars; 1 to 8 photos; instructions ≥ 20 chars; ≥ 1 availability window, each with ≥ 1 day and start ≠ end; host terms accepted.
    - Move the 3.0 and 1.92 kW literals into `engines/constants.ts`. Decide whether the 50 kW solar bound should match Property 2's 25 kW domain.
    - Return per-field errors keyed by step and keep the other values.
    - Depends on: 2.1
    - Done when: unit tests cover each missing field, bad ZIP, both kW ranges, an unconfirmed pin, and earnings above the cap ($5.50 today). The wizard imports the module and behaves the same.
    - Status: `src/features/host/validateListing.ts` exists with tests and runs in `save-my-listing`. It takes the API body (`ListingInput`), adds storage length caps and a Massachusetts pin check, and maps each field to its wizard step (`FIELD_STEP`). The 3.0, 1.92 and 50 kW literals moved to `engines/constants.ts` and the wizard uses them. Remaining: the wizard's `validate(step)` still checks its own form state instead of calling the module.
    - _Requirements: 1.2, 1.3, 1.5_
  - [x] 16.2 EIA rate adapter
    - `src/adapters/eiaRates.ts` requests `https://api.eia.gov/v2/electricity/retail-sales/data/` with `frequency=monthly`, `data[0]=price`, `facets[stateid][]=MA`, `facets[sectorid][]=RES`, sorted by `period` descending, with a 5 s `AbortController`.
    - Validates the response, keeps the latest valid record and its data month, and feeds `resolveRate` (cents/kWh ÷ 100).
    - The statewide result is cached centrally (24 h; failures 60 s), so ZIP changes never refetch.
    - The key comes from `VITE_EIA_API_KEY`. It is browser-visible; task 11.3 moves the call to the `get-electricity-rate` Lambda (`GET /rate`) and the adapter then calls the API.
    - Depends on: 8.1
    - Done when: tests with mocked `fetch` cover success, non-200, timeout, bad data, and caching; the host form shows "Massachusetts residential average · EIA · [data month]", falls back to a labeled $0.30 estimate, and never overwrites a rate the host edited.
    - _Requirements: 1.6, 1.7_
    - Completion note: verified with unit tests, browser scenarios against a scripted endpoint, and one live EIA call (August 2026 data, 30.48¢ → $0.3048/kWh). EIA is state-level only: no ZIP-level or utility-level precision.
  - [ ] 16.3 (prototype done) Host onboarding wizard
    - Done in the prototype: `src/pages/HostSignup.tsx` at `/host/new`, six steps (Your spot, Charger, Pricing, Photos & instructions, Availability, Review) with per-step validation, retained values, address search or manual entry, a confirmed pin (`PinPicker`), EIA auto-fill with override, the earnings cap and live price table, availability presets and custom windows, and the review with Edit links. Edit mode at `/host/edit` opens on Review and keeps the listing id.
    - Remaining: use the 16.1 module and the 15.2 uploader.
    - Depends on: 16.1, 16.2, 15.2, 13.1
    - Done when: continuing with missing fields blocks, keeps values, and marks each invalid field. ZIP entry fills the rate and the override sticks.
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7_
  - [ ] 16.4 (prototype done) Wire submission
    - Status (backend mode, not run against AWS): publishing uploads new photos, keeps existing ones by key (`Listing.photoKeys`), calls `PUT /me/listing`, and puts server field errors on their wizard step; the rate comes from `GET /rate`. Remove calls `DELETE /me/listing`.
    - Done in the prototype: coordinates come from the confirmed pin (address search through Mapbox or Photon, then drag and confirm); publishing saves the listing on the account and goes to `/host`; one listing per account.
    - Remaining: upload photos to `media/listings/{listingId}/...`, create or update the listing with `active = true` through `PUT /me/listing` (the Lambda validates with 16.1), store `right_to_list`, and make remove set `active = false` (or delete).
    - Depends on: 16.3, 11.5, 15.1
    - Done when: a test host creates a listing that appears in DynamoDB with lat/lng and photo keys. A failed or timed-out upload keeps all entered values and offers retry.
    - _Requirements: 1.2, 1.4, 1.13_

- [ ] 17. Seed hosts
  - [ ] 17.1 (prototype done) Seed sample hosts
    - Status: `scripts/seed.ts` validates and writes all 34 sample listings under the placeholder host `seed-host`, idempotently. The sample data now lives in `scripts/seed-data/` (not bundled with the app); only its owned `photos/vl-01/` are uploaded; hotlinked photos are not copied. The four Boston samples get approximate ZIPs. Not run against AWS.
    - Done in the prototype: 34 sample listings in `src/data/` (30 in `mockListings.json` across Cambridge, Somerville, Allston, Brookline and Dorchester; 4 in Jamaica Plain, Roslindale, West Roxbury and Dorchester in `listings.ts`), covering L1 and L2, J1772 and NACS, all four adapter settings, solar 0 to 8.4 kW, and all-day, weekday, evening, overnight and weekend windows. `mockListings.test.ts` checks the shape.
    - Remaining: `scripts/seed-hosts.ts` writes them to DynamoDB, idempotently, after running every row through 16.1. Replace hotlinked Zillow/Redfin photos and real addresses before any public demo.
    - Depends on: 16.1, 11.5
    - Done when: the script is idempotent and creates the active listings, all passing validation, visible to a signed-in user.
    - _Requirements: 1.2, 2.1_

- [ ] 18. Search and Listing Card
  - [ ] 18.1 (prototype done) Destination resolution
    - Done in the prototype: sample T stations matched locally (`data/stations.ts`), geocoded addresses, streets and areas through `adapters/addressSearch.ts` (Mapbox v6 or Photon), and "Near me" (`adapters/geolocation.ts`, MA area check, about 110 m rounding). Output is a `Destination` (`types/destination.ts`).
    - Remaining: MBTA V3 stations (subway and commuter rail) with a 10 s budget and cache, and a short seeded venue list (Fenway, TD Garden).
    - Depends on: 1.2
    - Done when: tests with mocked adapters resolve a station, a venue, and an address. A manual run resolves "Forest Hills".
    - _Requirements: 2.1_
  - [ ] 18.2 (prototype done) Search-area and availability filter (pure)
    - Done in the prototype: `isOpenFor` (`lib/availability.ts`, booking must fit one window, overnight wrap) and a map-bounds filter (`lib/geo.ts boundsContain`, starting 2.5 km around the destination).
    - Remaining: `filterListings(listings, center, radiusMiles, window)` using `haversineDistanceMeters`, active only, radius 0.1 to 25 mi (default 2), with a radius control on Search; keep the map-bounds browse mode for no destination. Tests for `isOpenFor`.
    - Depends on: 2.3
    - Done when: unit tests cover in/out of radius, radius bounds, inactive listings, and window mismatch (including overnight). No marker renders for listings this filter removes.
    - _Requirements: 2.1, 2.5; Steering §2_
  - [ ] 18.3 (prototype done) Plug and adapter compatibility (pure)
    - Done: `isPlugBookable(hostPlug, hostAdapters, carPlug)` in `src/engines/plug.ts`, used by `evaluateListing` (no duplicate anywhere).
    - Remaining: the table test.
    - Depends on: 2.1
    - Done when: a table test covers all 2 × 2 × 4 combinations.
    - _Requirements: 2.6_
  - [ ] 18.4 (prototype done) Sorting and slow-charger flag (pure)
    - Done: `chargerSlower` in `evaluateListing` (unknown car kW is never slower) and `sortEvaluations(list, 'fit' | 'price')`: Best fit puts slower chargers last, then shorter walk, then lower price; Lowest price sorts by price, then walk.
    - Remaining: unit tests.
    - Depends on: 3.1
    - Done when: unit tests cover both modes, including the slow-charger ordering, ties, and the unknown-car case.
    - _Requirements: 2.7_
  - [ ] 18.5 External adapters with timeouts
    - Mapbox walking time (Directions API, walking profile) and MBTA nearby routes: 10 s each.
    - Open-Meteo hourly irradiance: 10 s, no key, returns an array aligned to the booking window.
    - Each returns a typed result, not a throw, and replaces its sample source (`estimateWalk`, `data/stations.ts` routes, `data/sampleIrradiance.ts`).
    - Depends on: 18.1
    - Done when: mocked tests cover success, error, and timeout for each. Walk time is returned as whole minutes.
    - _Requirements: 2.1, 2.2, 2.4, 4.2_
  - [ ] 18.6 (prototype done) Search orchestrator
    - Done in the prototype: `features/search/evaluateListing.ts` evaluates each listing synchronously from the engines and sample data; Search filters, evaluates, hides plug-mismatched and not-open listings with count notes, sorts, and shows empty states.
    - Remaining: after the 18.2 filter, enrich each listing in parallel (`Promise.allSettled`) with 18.5. A failed enrichment marks only its own field. Climate fields show "solar data unavailable" when Open-Meteo fails. Transit miles stay the Haversine miles from listing to destination, labeled as an estimate (decision 6).
    - Depends on: 18.2, 18.3, 18.4, 18.5, 6.2, 3.1
    - Done when: with mocked adapters, a Directions failure still returns every listing with a walk-time error. An empty match returns an empty-results state.
    - _Requirements: 2.1, 2.4, 2.5, 4.2_
  - [ ] 18.7 (prototype done) `ListingCard` component
    - Done: `components/ListingCard.tsx` shows walk time (whole minutes), routes for station destinations, per-car price/hr and total, estimated miles added, solar share % (or "Solar data unavailable"), Green Score, the adapter line, and the exact badge "Charger slower than your car's max acceptance rate". Mismatched plugs never reach the card (Req 2.6 as revised); the listing page shows the indication and disables booking.
    - Remaining: a component test for the slow-charger badge and the listing page's disabled booking for a mismatch; error states for walk time and routes once 18.6 enriches.
    - Depends on: 18.6, 10.4
    - Done when: the copy-guard test passes and the component tests pass.
    - _Requirements: 2.2, 2.3, 2.6, 2.7; Steering §1_
  - [ ] 18.8 (prototype done) Search page with map
    - Done in the prototype: `pages/Search.tsx` with a MapLibre map (labeled schematic fallback) whose markers are exactly the shown listings, destination (station, address, Near me), today's start hour (past hours disabled) and 1 to 12 hours, car select, level filter, and sort (Best fit, Lowest price).
    - Remaining: the radius control from 18.2, a date picker (bookings are today only), and enrichment errors from 18.6.
    - Depends on: 18.6, 18.7, 13.1
    - Done when: signed in, searching "Forest Hills" shows seeded listings as cards and markers. Changing the car changes prices. No marker appears outside the radius.
    - _Requirements: 2.1, 2.5, 2.7; Steering §2_

- [ ] 19. Booking
  - [ ] 19.1 (prototype done) Create booking (payment simulated)
    - Status (backend mode, not run against AWS): booking saves the car, calls `POST /bookings`, then reloads the account so the session has the exact address.
    - Done in the prototype: `pages/ListingPage.tsx` creates a `RESERVED` booking freezing car name, car kW, `pEff`, `pricePerHr`, `total`, destination, day, start hour and hours, then goes to `/session`. `features/session/bookingGuard.ts` blocks your own listing and a second live booking; past start hours, plug mismatch, and windows outside availability are blocked too (Req 6.3). A reservation never checked in expires at its booked end (Req 6.4). Tests in `features/session/session.test.ts`.
    - Remaining: call `POST /bookings`; the `create-booking` Lambda reruns the guards and pricing on stored data and writes the booking with the design's snapshot fields and `Profiles.liveBookingId` in one transaction. Decide on overlap between different accounts' bookings (decision 9).
    - Depends on: 18.7, 11.5
    - Done when: booking a seeded listing creates a `RESERVED` booking whose snapshots match the card's price. A mismatched listing cannot be booked.
    - _Requirements: 2.6, 3.1, 3.3, 3.4, 6.1 to 6.4_
  - [ ] 19.2 Host bookings view
    - On `/host`: list bookings for the host's listing, with status, arrival and pickup photos, and a "needs review" marker for `FLAGGED_FOR_HOST_REVIEW`.
    - Show an in-app "driver is N minutes late" banner when past booked end and not completed.
    - Depends on: 19.1
    - Done when: a host sees a driver's booking and flagged status. A driver cannot read another driver's booking.
    - _Requirements: 5.7; README §3 (host flow 7)_
    - Status: not built. `/host` says booking notifications aren't part of this demo.

- [ ] 20. Arrival check-in
  - [ ] 20.1 (prototype done) `Check_In_Flow`
    - Status (backend mode, not run against AWS): the arrival photo uploads before it counts, and Start session calls `POST /bookings/{id}/check-in`.
    - Done in the prototype: the Arrived step on `/session` shows the private address, instructions and photos, requires an arrival photo (`components/PhotoCapture.tsx`, saved on the booking), and only then enables "I'm plugged in. Start session" (`RESERVED` → `ACTIVE`).
    - Remaining: upload to `media/bookings/{bookingId}/arrival.jpg` through 15.2, then call `POST /bookings/{id}/check-in` (the Lambda confirms the object exists before setting `ACTIVE`). On failure or timeout, stay `RESERVED`, keep state, and offer retry.
    - Depends on: 15.2, 19.1
    - Done when: a test with a mocked failed upload leaves status `RESERVED`. A successful upload sets `ACTIVE` and saves `arrival_photo_key`.
    - _Requirements: 5.1, 5.2_

- [ ] 21. Pickup and settlement
  - [ ] 21.1 (prototype done) Geolocation wrapper
    - Done: `adapters/geolocation.ts` `locateUser()` with a 30 s timeout and typed failures `UNSUPPORTED`, `DENIED`, `UNAVAILABLE`, `TIMEOUT` (used by Near me).
    - Remaining: unit tests with a mocked `navigator.geolocation`, and route `Session.tsx` and the host wizard's "I'm at the spot" through it instead of calling `navigator.geolocation` directly.
    - Depends on: 2.1
    - Done when: unit tests cover success and all four failures, and no page calls `navigator.geolocation` directly.
    - _Requirements: 5.3, 5.4, 5.7_
  - [ ] 21.2 (prototype done) Pickup decision (pure)
    - Done: `features/session/pickup.ts` `checkPickupDistance(distanceM)` compares the exact distance to `PICKUP_RADIUS_M`; shown meters are floored inside and ceiled outside, so 50.0 m allows, 50.4 m is blocked and shows "51" (Req 5.6 as revised). Tested in `session.test.ts`.
    - Remaining: fold the photo and permission rules (now in `Session.tsx`) into a pure `evaluatePickup` with outcomes `BLOCK_TIMEOUT`, `BLOCK_TOO_FAR { displayMeters }`, `BLOCK_NEEDS_PHOTO`, `ALLOW`, `ALLOW_FLAGGED`, and test it.
    - Depends on: 2.3, 21.1
    - Done when: unit tests cover 50.0 m (allow), 50.4 m and 51 m (blocked), denied permission with a photo (`ALLOW_FLAGGED`), and a missing photo (never allows).
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_
  - [ ] 21.3 (prototype done) `Pickup_Service` UI and settlement
    - Status (backend mode, not run against AWS): the pickup photo uploads first; Confirm Pickup sends the checked position (or null when location is denied) to `POST /bookings/{id}/pickup`, and the receipt is the server's. The demo clock and step controls are hidden in backend mode; the phone-position control still works.
    - Done in the prototype: Charging step ("I'm back at the car. Pick up") → Pickup step (check location, pickup photo, "Confirm Pickup at {time}") → Done step with the receipt (subtotal, late fee, service fee, total) and estimated miles added, solar share, CO₂ vs. gas and Green Score. `features/session/settleBooking.ts` runs `settle` on the frozen values; denied location completes as flagged for host review. The demo-controls panel sets the pickup clock and phone position.
    - Remaining: upload the pickup photo to `media/bookings/{bookingId}/pickup.jpg` and record `actual_end_time` only after a confirmed upload; call `POST /bookings/{id}/pickup`, where the Lambda rechecks the distance, settles with the server clock and saves `late_fee`, `customer_total`, `geofence_status` and status `COMPLETED`; use Open-Meteo for solar share and keep any stored score when it fails.
    - Depends on: 21.2, 15.2, 4.1, 6.2, 18.5, 20.1
    - Done when: a manual run at the listing completes and shows the final total. A run far away is blocked with the distance. Denied permission completes with the flag set. A failed upload does not end the session.
    - _Requirements: 3.4, 3.5, 4.2, 5.3 to 5.7_
  - [ ] 21.4 Running late-fee display
    - While `ACTIVE` and past booked end, show the running late fee (using `settle` with `now()`) to the driver and in the host view (19.2).
    - Depends on: 21.3, 19.2
    - Done when: with a booking whose end time is 30 minutes ago at price $2.00/hr, the display shows a $1.50 late fee (before the 10% service fee).
    - _Requirements: 3.4_
    - Status: the Charging step shows minutes late and the per-minute rate, not the accrued fee.

- [ ] 22. Finish the landing page
  - [x] 22.1 Retire the inline forms from the landing page
    - Completion note: obsolete. `pages/Landing.tsx` replaced `LandingPage.tsx` and never had host or driver forms; sign-up and the host wizard are their own routes.
    - _Requirements: 1.1_
  - [ ] 22.2 Widen the copy guard
    - Make sure the copy-guard test covers all components and pages, including Listing_Card, the listing page and the session screens.
    - Depends on: 10.1
    - Done when: the test scans every `src/**/*.tsx` and passes.
    - _Requirements: 2.3; Steering §1_

- [ ] 23. MVP checkpoint
  - [ ] 23.1 Full verification
    - `npm run typecheck`, `npm run build`, `npm test` (includes Property 1 and Property 2 at 100+ runs).
    - Depends on: 1 to 22
    - Done when: all three exit 0.
  - [ ] 23.2 Demo walkthrough ("book, park, charge, go")
    - Manually: sign up → "Host an EV charger" → list a charger (photo) → sign out → sign up a second account → search a station, pick a car → compare cards → book → arrival photo → start session → pick up (in range, photo) → receipt and Green Score.
    - Depends on: 23.1
    - Done when: the full path works on a deployed dev stage (11.5), and the late, early, out-of-range, permission-denied and expired-reservation paths each behave as in 21.3 and Req 6.4.
    - _Requirements: 1 to 6_
    - Status: the whole path already runs in the prototype on the dev server (`demo@dwell.test` can stand in for the second account).

## P. Prototype work outside the original plan (done)

Built while the UI was rebuilt. Each item is real behavior the backend tasks must keep.

- [x] P.1 One account for driving and hosting
  - `pages/SignUp.tsx`, `SignIn.tsx`, `SignOut.tsx`, `state/accounts.ts` (salted PBKDF2 hash, `localStorage`), `lib/hostEntry.ts`, header host button. No role on `User`; `persisted.ts` v3 drops old roles. Tests: `state/accounts.test.ts`.
  - _Requirements: 1.11, 1.12_
- [x] P.2 Host home with edit and remove
  - `pages/HostHome.tsx`; `/host/edit` reuses the wizard. One listing per account.
  - _Requirements: 1.13_
- [x] P.3 Booking guards and reservation expiry
  - `features/session/bookingGuard.ts`, tested in `session.test.ts`.
  - _Requirements: 6.3, 6.4_
- [x] P.4 Near me search
  - `components/NearMeButton.tsx`, `adapters/geolocation.ts`, `lib/massachusetts.ts isInMassachusettsArea`.
  - _Requirements: 1.1, 2.1_
- [x] P.5 Saved state with versioned migrations
  - `state/persisted.ts` (`STATE_VERSION` 3, legacy `voltlot.prototype.v1` key read once), tested in `persisted.test.ts`. Session photos and the pickup step survive a reload.
- [x] P.6 Dev-only demo account
  - `state/demoAccount.ts` seeds `demo@dwell.test` on the dev server only; the sign-in page shows the hint in dev only.
- [x] P.7 Booking banner on the landing page
  - `components/BookingBanner.tsx`: live booking, last receipt, or an expired reservation.
  - _Requirements: 6.5_
- [x] P.8 Session demo controls
  - Pickup clock (early, on time, late, real) and phone position (at the car, 420 m away, real GPS) on `/session`. Remove or hide before a public launch.

---

## Flex Goals (optional, post-MVP)

Start only after task 23 passes. Every flex task is additive. If one needs to change an engine signature, re-run all unit tests and both property tests (5.1, 7.1).

- [ ] 24. [FLEX] Bedrock unknown-car lookup
  - [ ]* 24.1 `bedrockKwLookup` function
    - `functions/bedrock-kw-lookup/` behind `POST /cars/lookup` in the API stack, with `bedrock:InvokeModel` on one model only, returning a candidate `car_max_AC_kW` only. Its output never enters a pricing formula directly; the customer confirms it.
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
