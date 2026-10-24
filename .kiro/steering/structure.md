---
inclusion: always
---

# Dwell Repository Structure

Companion to `tech.md`. The build order is in `.kiro/specs/voltlot-mvp/tasks.md`. Screen layout and tokens follow the Dwell UI design spec v1 (provided as a text file; not stored in this repo yet).

## Current structure (verified)

```
VoltLot/
├── README.md                      Product spec v0.5
├── package.json, package-lock.json   Pinned dependencies and scripts
├── .npmrc                         save-exact=true
├── .gitignore, .env.example       Placeholders only; real values go in untracked .env.local
├── index.html, vite.config.ts, tsconfig.json
├── .kiro/
│   ├── specs/voltlot-mvp/         requirements.md, design.md, tasks.md, .config.kiro
│   └── steering/                  voltlot-rules.md, product.md, tech.md, structure.md
└── src/
    ├── main.tsx, App.tsx          Entry, router (8 routes), providers
    ├── index.css                  Tailwind import, font, design tokens (@theme), .auto-grid
    ├── pages/                     One file per route: Landing, SignUpChoice, DriverSignup, HostSignup,
    │                              HostHome, Search, ListingPage, Session
    ├── components/                Header, Icons, ui, form, ListingCard, PhotoCapture, Wizard,
    │                              Combobox, AddressAutocomplete, DestinationSearch, PinPicker, MapView
    │   └── map/                   LiveMap + useMapboxMap (Mapbox lifecycle), MapMarker, PricePin, DestinationPin,
    │                              PinPickerMap, MapPreview, ZoomControls, SchematicMap + MapFallbacks (labeled fallback)
    ├── adapters/                  mapboxGeocoding.ts (Geocoding v6) and eiaRates.ts (EIA rate lookup + central cache), typed, never throw, with tests
    ├── features/
    │   ├── search/evaluateListing.ts    Combines engines for one listing, car and window; sorting
    │   └── session/settleBooking.ts     Final bill and impact numbers from frozen booking values
    ├── engines/                   Pure functions: constants, types, money, pricing, billing, climate, rate, plug
    │                              plus *.test.ts for pricing, billing, climate (26 tests)
    ├── lib/                       format, geo (haversineDistanceMeters, walk estimate, offsetMeters), availability, image,
    │                              mapbox (token handling, never uses sk. tokens), massachusetts (ZIP check, street name)
    ├── state/                     AppState.tsx (localStorage provider), persisted.ts (versioned state + migrations)
    ├── types/                     listing.ts, booking.ts, destination.ts
    └── data/                      Sample data: stations, listings.ts + mockListings.json (+ test), EV fallback table, zip areas,
                                   sample sunlight, transit line colors
```

`docs/mapbox-setup.md` explains the public token. `node_modules/` and `dist/` are generated and git-ignored. There is no `amplify/` or `scripts/` directory yet.

## Still proposed (not created)

```
src/adapters/    More adapters, one file per external API with timeout and fallback (mbta, openMeteo, mapbox directions; bedrock is flex)
amplify/         Gen 2: backend.ts, auth/, data/, storage/ resource.ts
scripts/         Seed scripts for EVSpec and hosts
```

Create these only when a task needs them. Do not add empty placeholders.

## Placement rules

- **engines/** imports nothing from React, Amplify, adapters, or `lib/`. Features and components may import engines. The reverse never happens.
- **adapters/** return typed success or failure and never throw to callers. They contain no pricing or climate math.
- **components/** hold no business formulas. Prices, miles, and scores come from engines through `features/`.
- **pages/** compose features and components.
- Tests sit next to the file under test. Property tests are named `*.property.test.ts`.
- One definition per concept: distance in `lib/geo.ts`, plug compatibility in `engines/plug.ts`, each constant in `engines/constants.ts`.
- Sample data lives in `src/data/` and is labeled as sample. It is replaced, not extended, when the backend arrives.

## Known divergences to resolve

- `tasks.md` still refers to `LandingPage.tsx` (10.x, 16.3, 22.1). That file was replaced by `pages/Landing.tsx` and the other pages from the UI spec, so those tasks need rewording.
- `tasks.md` does not name a directory for adapters; `src/adapters/` now exists with the Mapbox geocoder.
- `src/state/` and `src/features/` hold prototype pieces (localStorage state, composition helpers) that `tasks.md` does not list. Cognito, DynamoDB, and S3 will replace `AppState`'s storage.
- `tasks.md` 10.1 places the copy-guard test at `src/copy.test.ts`, outside the "next to the code" rule. It is not written yet.
