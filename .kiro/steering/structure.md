---
inclusion: always
---

# Dwell Repository Structure

Companion to `tech.md`. The build order is in `.kiro/specs/voltlot-mvp/tasks.md`. Screen layout and tokens follow the Dwell UI design spec v1 (provided as a text file; not stored in this repo yet).

## Current structure (verified)

```
VoltLot/
├── README.md                      Product spec v0.5
├── kiro_writeup                   Project write-up (how Kiro was used)
├── Dwell-wordmark.png             Logo
├── package.json, package-lock.json   Pinned dependencies and scripts
├── amplify.yml                    Amplify Hosting build (frontend only): writes config.json from env, then npm run build
├── .npmrc                         save-exact=true
├── .gitignore, .env.example       Placeholders only; real values go in untracked .env or .env.local
├── index.html, vite.config.ts, tsconfig.json
├── docs/                          mapbox-setup.md, eia-rates.md
├── .hallmark/                     Hallmark theme lint baseline and log
├── .kiro/
│   ├── specs/voltlot-mvp/         requirements.md, design.md, tasks.md, .config.kiro
│   └── steering/                  voltlot-rules.md, product.md, tech.md, structure.md
├── infra/                         AWS CDK v2 app (no Amplify). cdk.json (app, stage and webOrigins context, feature flags),
│   │                              tsconfig.json; cdk.out/ is generated
│   ├── bin/dwell.ts               Entry: builds the stacks, adds cdk-nag AwsSolutionsChecks
│   └── lib/                       app (both stacks for a stage), config (context, names), data-stack (Cognito, tables,
│                                  photo bucket, post-confirmation), api-stack (HTTP API, JWT authorizer, routes, IAM),
│                                  dwell-function (Lambda defaults + per-function role), nag (accepted findings),
│                                  stacks.test.ts (assertions + cdk-nag)
├── functions/                     Lambda handlers, one folder per route, each handler.ts + handler.test.ts:
│   │                              get-me, save-me, list-listings, get-listing, save-my-listing, remove-my-listing,
│   │                              get-electricity-rate, list-cars, create-booking, get-booking-details, create-upload,
│   │                              check-in, complete-pickup, list-host-bookings, get-transit; post-confirmation (Cognito trigger)
├── scripts/                       For a deployed stage, reading infra/cdk-outputs.json (outputs.ts): write-config (public/config.json),
│                                  seed (cars + 104 sample listings, --dry-run), generate-middlesex (one-time) + test, smoke-test (real sign-up and API checks)
│   └── seed-data/                 The 104 sample listings (mockListings.json, middlesexListings.json, listings.ts) + test, and photos/vl-01/ (owned
│                                  photos). Seed source only: the app never imports it
│   └── shared/                    env, clients (SDK clients), http (api wrapper, errors, JWT sub), items (DynamoDB shapes),
│                                  mappers (items <-> src/types), store (reads), cars, photos (keys, presigning),
│                                  parse (body validators), time (America/New_York) + test, sunlight (Open-Meteo at settlement), testing (test fixtures)
└── src/
    ├── copy.test.ts               Copy guard over every page and component
    ├── main.tsx, App.tsx          Entry (seeds the dev demo account), router (10 routes + catch-all), providers
    ├── tokens.css, index.css, base.css   Theme values, Tailwind @theme mapping, base element rules
    ├── pages/                     One file per route: Landing, SignUp, SignIn, SignOut, HostHome (/host),
    │                              HostSignup (wizard at /host/new and /host/edit), Search, ListingPage, Session
    ├── components/                Header, BookingBanner, Skyline, Icons, ui, form, ListingCard, PhotoCapture, Wizard,
    │                              Combobox, AddressAutocomplete, DestinationSearch, NearMeButton, PinPicker, MapView, ConfirmEmail,
    │                              CarPicker (+ My car isn’t listed) + test, HostBookings
    │   └── map/                   LiveMap + useMapLibreMap (MapLibre lifecycle), MapMarker, PricePin, DestinationPin,
    │                              PinPickerMap, MapPreview, ZoomControls, SchematicMap + MapFallbacks (labeled fallback)
    ├── adapters/                  addressSearch (picks the provider), mapboxGeocoding (v6), photonGeocoding (OpenStreetMap),
    │                              geocodingTypes, geolocation (browser position), eiaRates (EIA rate + central cache), cognito (user-pool
    │                              sign-up/in, refresh, revoke), dwellApi (typed API client) + backendClient test, openMeteo (sunlight),
    │                              mapboxWalking (Matrix walking times) + liveData test, geolocation test;
    │                              typed, never throw; tests for mapboxGeocoding and eiaRates
    ├── features/
    │   ├── host/validateListing.ts      Pure host listing validation (wizard rules + storage caps), FIELD_STEP; + test
    │   ├── search/evaluateListing.ts    Combines engines for one listing, car, window and live data; sorting; SEARCH_RADIUS_M
    │   ├── search/filterListings.ts     Radius filter (haversine, 0.1 to 25 mi) + test
    │   └── session/
    │       ├── bookingGuard.ts          One live booking per account, own-listing block, reservation expiry, past start
    │       ├── pickup.ts                Exact-distance 50 m pickup check
    │       ├── settleBooking.ts         Final bill and impact numbers from frozen booking values
    │       └── session.test.ts
    ├── engines/                   Pure functions: constants, types, money, pricing, billing, climate, rate, plug
    │                              plus unit tests and the two *.property.test.ts (Property 1, Property 2)
    ├── lib/                       hostEntry (host entry paths), format, geo (haversineDistanceMeters, estimateWalk,
    │                              offsetMeters, bounds), availability, image, mapbox (token handling, never uses sk.),
    │                              map (style URL), massachusetts (ZIP and area checks, street name), accountRules (password and US phone rules shared with Cognito), backendConfig (/config.json),
    │                              upload (presigned photo upload) + test, eia (pure EIA URL
    │                              and response parser, shared with the Lambda), openMeteo and mbta (pure request and response helpers,
    │                              shared with the Lambdas) + externalData test; lib.test.ts
    ├── state/                     AppState.tsx (localStorage provider), persisted.ts (versioned state + migrations),
    │                              accounts.ts (prototype sign-in), demoAccount.ts (dev-only demo login),
    │                              backend.ts (backend mode: Cognito session + API client), useLiveData (sunlight, walks, transit hooks); tests
    ├── types/                     listing.ts, booking.ts, destination.ts
    └── data/                      Sample data: stations, destinations, transit line colors, heroPreview (4 illustrative
                                   listings for the landing ledger), evFallbackSeed (8 cars), sampleIrradiance
```

`node_modules/`, `dist/` and `.vitest/` are generated. `.amplify/` is a git-ignored leftover from an abandoned Amplify sandbox and can be deleted. Backend mode turns on when `public/config.json` exists.

## Still proposed (not created)

```
src/adapters/    Bedrock (flex)
infra/lib/web-stack.ts   DwellWeb: S3 + CloudFront hosting and config.json (tasks.md 11.4)
```

Create these only when a task needs them. Do not add empty placeholders.

## Placement rules

- **engines/** imports nothing from React, the AWS SDK, adapters, or `lib/`. Features and components may import engines. The reverse never happens.
- **adapters/** return typed success or failure and never throw to callers. They contain no pricing or climate math.
- **features/** compose engines, `lib/` and data into the values pages show. Pure decision helpers (booking guards, pickup check) live here.
- **components/** hold no business formulas. Prices, miles, and scores come from engines through `features/`.
- **pages/** compose features and components. Route guards (redirects for signed-out visitors, one listing per account) live in the page.
- **state/** owns persistence. Bump `STATE_VERSION` and add a migration in `persisted.ts` when the saved shape changes.
- **functions/** may import `src/engines/`, the pure parts of `src/features/` and `src/lib/`, `src/types/`, and the seeded car table (`src/data/evFallbackSeed.ts`), never React, `src/state/`, `src/adapters/` or anything that touches the DOM. `src/` never imports from `functions/` or `infra/`.
- **infra/** holds only CDK constructs and stacks. It points at handler entry files in `functions/` and contains no business logic.
- Tests sit next to the file under test. Property tests are named `*.property.test.ts`.
- One definition per concept: distance in `lib/geo.ts`, plug compatibility in `engines/plug.ts`, each constant in `engines/constants.ts`, host entry paths in `lib/hostEntry.ts`.
- Sample data lives in `src/data/` and is labeled as sample. It is replaced, not extended, when the backend arrives.

## Known divergences to resolve

- `src/state/` and `src/features/` hold prototype pieces (localStorage state, composition helpers, booking guards) that `tasks.md` lists only in its "Prototype" section. Cognito and the Dwell API (DynamoDB, S3 behind Lambdas) will replace `AppState`'s storage.
- `tasks.md` 10.1 places the copy-guard test at `src/copy.test.ts`, outside the "next to the code" rule. It is not written yet.
