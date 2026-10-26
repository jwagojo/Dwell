---
inclusion: always
---

# Dwell Tech Context

Specs: `README.md` §8, `.kiro/specs/voltlot-mvp/requirements.md` (Technology Constraints), `design.md` (Architecture, Components, External Integrations). Amplify Gen 2 and copy rules are in `voltlot-rules.md`. The build plan is `tasks.md`.

## Current status (update this when it changes)

- **Implemented (tasks 1.1 and 1.2):** the project scaffold. Pinned dependencies with a lockfile: React 18.3.1, Vite 8.3.5, `@vitejs/plugin-react` 6.1.2, TypeScript 7.0.2, Tailwind CSS 4.3.3 (`@tailwindcss/vite`), Vitest 5.0.5, fast-check 4.10.2. Node `^22.12 || ^24 || >=26` is required (Vite 8 and Vitest 5). `.npmrc` sets `save-exact=true`.
- **Implemented (UI prototype):** the full UI from the Dwell UI design spec v1 (not stored in this repo yet). Eight routes in `src/App.tsx`: `/`, `/signup`, `/signup/driver`, `/signup/host`, `/host`, `/search`, `/listing/:id`, `/session`. Dependencies added: `react-router-dom` 7.18.4, `@fontsource/vollkorn` 5.3.0 and `@fontsource-variable/hanken-grotesk` 5.3.0 (self-hosted fonts, so no third-party requests).
- **Visual theme:** Hallmark "Garden" redesign (dark green on warm oat paper, Vollkorn 600 heads over Hanken Grotesk, 4px wells, pill controls). Theme values live in `src/tokens.css`; `src/index.css` maps the project's token names (`brand`, `ink`, `muted`, `line`, `surface`, ...) onto them, and `src/base.css` holds the base element rules. The first lines of `src/index.css` are the Hallmark stamp; `.hallmark/` holds the lint baseline and log.
- **Prototype data and state:** stations, routes, rates, and sunlight are made-up sample data (`src/data/`). Listings are `src/data/mockListings.json` (30 homes in Cambridge, Somerville, Allston, Brookline and Dorchester: real street addresses, geocoded coordinates and Zillow-hosted photos supplied by the project owner, with invented chargers, hosts and prices; see its `_meta` block) plus four Boston-neighborhood samples in `listings.ts`. `mockListings.test.ts` checks the file's shape and that each Cambridge station has demoable results. Accounts, the driver's car, the host's listing, the destination, and the booking live in `localStorage` (`src/state/AppState.tsx`, versioned and migrated in `src/state/persisted.ts`). Passwords are collected by the forms but never stored or sent. Photos stay in the browser. There is no backend and no sign-in page.
- **Implemented map and address search:** `maplibre-gl` 6.16.0 (lazy-loaded chunk) renders the search map, the landing hero preview, and the host pin picker (`src/components/map/`, `MapView.tsx`, lifecycle in `useMapLibreMap.ts`). Tiles come from the free OpenFreeMap "positron" style, with no key; `VITE_MAP_STYLE_URL` overrides it (`src/lib/map.ts`). Vite needs `setWorkerUrl` for MapLibre 6, done in the loader. Address search still uses Mapbox: `src/adapters/mapboxGeocoding.ts` is a typed Geocoding v6 adapter, and the token is a public `pk.` token from `VITE_MAPBOX_TOKEN` in `.env.local`; secret `sk.` tokens are refused (`src/lib/mapbox.ts`). Setup: `docs/mapbox-setup.md`. Verified in headless Chrome against the real OpenFreeMap style (canvas, markers and attribution render); Mapbox Geocoding was not exercised against the live API.
- **Fallbacks:** with a failed map load (WebGL, network, style), every map shows a labeled schematic (`SchematicMap`). With no Mapbox token, destination search offers T stations only and hosts enter their address by hand. Listings stay usable.
- **Electricity rate:** `src/adapters/eiaRates.ts` (typed, never throws, 5 s timeout, central cache) reads EIA's monthly Massachusetts residential average in cents/kWh; `src/engines/rate.ts` converts it to dollars/kWh and chooses the fallback. It is a statewide estimate, not ZIP-specific or utility-specific, reported a couple of months late. The host form shows the data month and never overwrites a rate the host typed. See `docs/eia-rates.md`.
- **Still estimates:** walking times come from straight-line distance (`lib/geo.ts estimateWalk`). Mapbox Directions is not integrated. Transit routes exist only for T stations, never for addresses.
- **Implemented engines (pure):** `src/engines/` has pricing, billing, climate (solar share, emissions, Green Score terms), plug compatibility, rounding, and constants. They have 26 unit tests from the README and UI worked examples. The two property-based tests (Property 1 and 2) are **not written**, and the rounding decision gate (`tasks.md` 5.2) is still open.
- **Scripts that exist** (`package.json`): `npm run dev`, `npm run build` (typecheck, then Vite build), `npm run typecheck`, `npm run preview`, `npm test` (`vitest --run`, passes).
- **TypeScript:** `strict` is on. `noUnusedLocals` is still off from the scaffold; it can be turned on now that `LandingPage.tsx` is gone.
- **Environment:** `.env.example` lists `VITE_MAPBOX_TOKEN` and `VITE_EIA_API_KEY` with placeholder values. Real values go in an untracked `.env` or `.env.local`.
- **Not present yet:** `amplify/`, the MBTA, Open-Meteo and Bedrock adapters, Mapbox Directions, Cognito, S3 upload, the pure host-validation module, and property-based tests. `amplify_outputs.json` is not in `.gitignore`; whether it is committed is an open team decision (`tasks.md` 1.2, 11.4).
- Every integration below is **planned**, not implemented.

## Stack

| Layer | Choice | Status |
|---|---|---|
| UI | React 18 + TypeScript + Vite + Tailwind CSS 4, React Router 7 | Implemented as a prototype on sample data |
| Auth | Amazon Cognito via `defineAuth` | Planned |
| Data | DynamoDB via `defineData` (owner-based auth) | Planned |
| Photos | S3 via `defineStorage`, one upload flow for listing, arrival, and pickup photos | Planned |
| Hosting | Amplify Hosting | Planned |
| Map | MapLibre GL JS with OpenFreeMap tiles (no key; `VITE_MAP_STYLE_URL` can override) | Implemented (labeled fallback if the map cannot load) |
| Address search | Mapbox Geocoding API v6 with `permanent=true` | Implemented (needs a token) |
| Walking time | Mapbox Directions | Planned; walk times are estimates today |
| Transit | MBTA V3 API | Planned |
| Electricity rate | EIA Open Data API v2: Massachusetts statewide residential average (MVP), $0.30/kWh fallback estimate | Implemented (needs `VITE_EIA_API_KEY`; browser-visible; labeled fallback without it) |
| Sunlight | Open-Meteo hourly irradiance, no key | Planned |
| Location check | Browser Geolocation API | Planned |
| Car kW | Open EV Data loaded into DynamoDB, plus a seeded fallback table | Planned |
| Unknown-car lookup | Bedrock via `defineFunction` | Planned, flex |
| Time-of-use rates | OpenEI URDB | Planned, flex |

## Conventions

**Pure engines.** Pricing, billing, climate (solar share, Green Score), and rate selection are pure, deterministic TypeScript. They import no React, Amplify, `fetch`, `Date.now()`, or randomness. Inputs go in as plain values, including timestamps. Invalid input returns a typed error that names the field. It does not throw. The formulas live only in the engines. UI code must not re-implement them (the landing page currently does; `tasks.md` 10.3 removes that).

**Rounding and constants.** Use one round-half-up helper for every monetary and mile output (2 dp money, 1 dp miles, 3 dp Green Score). Keep every rate, multiplier, weight, radius, and timeout in one constants module, with placeholders marked. No magic numbers in components.

**Adapters.** Each external API sits behind an adapter that owns its timeout, parsing, and fallback, and returns a typed success or failure. Budgets: EIA 5 s; Mapbox, MBTA, and Open-Meteo 10 s; S3 upload and geolocation 30 s. A failed adapter degrades only its own field. Listings still render.

**Distance.** DynamoDB has no radius query. Fetch active listings, then filter on the client with `haversineDistanceMeters()` before rendering Mapbox markers.

**Amplify.** Gen 2 TypeScript definitions only. Import `amplify_outputs.json`. Gen 1 files and commands are never used.

**Solar share and Green Score** are shown as estimates, only when sunlight data is available. When Open-Meteo fails, keep any stored score and report "solar data unavailable".

**Security.** Protected routes require Cognito sign-in. Never commit tokens or keys. The Mapbox token must be URL-restricted. Any key used from the browser (EIA, Mapbox) is visible in the bundle, so it must be a free-tier or URL-restricted key; move the EIA call server-side before production. Bedrock is called only from a function, never from the browser. Flag any new endpoint that lacks authentication.

**Testing.** The design requires fast-check for the two property tests (Host Cost Upper-Bound, Green Score Bounds), at least 100 runs each, tagged with `// Feature: voltlot-mvp, Property N`. Adapters are mocked in tests.

## Provisional values and open technical decisions

Do not harden these into rules. Report them and ask.

- **Rounding vs Property 1:** round-half-up to 2 dp can leave the host payout fractionally below the true electricity cost (for example `host_earnings_hr = 0`, no overstay). Requirement 3.3 and Correctness Property 1 conflict at the cent level. `tasks.md` 5.2 is the decision gate.
- **Missing car kW:** requirement 3.2 says reject a missing `car_max_AC_kW`. Requirement 1.10 and the design resolve it to the host's `charger_kW`. The design implements this as `null` → `charger_kW`.
- **Test runner:** the specs name fast-check but no runner. Vitest is installed per `tasks.md`; no tests are written yet.
- **Tailwind version, router, and UI library** (such as Amplify UI): Tailwind 4 and React Router 7 were chosen because the specs do not name them. A component library is still unspecified. Design tokens live in `src/tokens.css` (theme values) and `src/index.css` (`@theme` names used by components).
- **TypeScript 7.0.2** is the current `latest` at scaffold time. The specs do not pin a version. Typecheck and build pass with it. If a later tool needs the TypeScript 5 or 6 API, revisit this.
- **Helper name:** the design says `haversineMeters`. Steering says `haversineDistanceMeters`. Use the steering name.
- **Partial hours and minutes:** fractional `booked_hours` in solar share, and partial late minutes, are not specified.
- **Data-model gaps in design.md:** no plug type on `EVSpec` or `UserProfile`; no parking instructions or right-to-list field on `HostListing`; owner-only `Booking` blocks host access.
- **Storage paths:** fixed `media/bookings/{bookingId}/...` paths do not map to Amplify's per-owner path rules.
- **Availability windows:** the format is undefined (the design stores a serialized string).
- **Data sources:** Open EV Data US-model coverage and AC phase are unverified (README §10). A note at the end of the README also mentions the AFDC vehicles API.
- **Permanent geocoding cost:** saved addresses require `permanent=true`, which needs a card on file and bills per request, including each autocomplete request. Alternative if cost matters: temporary results for suggestions, then one permanent lookup on selection. Not implemented; untested against the real API.
- **Zillow photos are hotlinked:** the mock listings point at `photos.zillowstatic.com` images of real homes. They can change or vanish (the UI falls back to a labeled placeholder), and may not be reusable outside a private demo. The addresses are real homes with invented chargers. Replace with owned photos and fictional addresses before any public demo.
- **Exact pin is public:** markers and search use the host's confirmed pin, so the exact driveway point is visible on the public map even though the address text is hidden. Decide whether to show an approximate point until a booking exists.
- **Real Mapbox not exercised here:** behavior was verified in a browser with a fake `pk.` token and intercepted responses shaped like the documented APIs, not against live Mapbox.
