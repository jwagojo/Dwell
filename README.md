
<p align="center">
  <img src="Dwell-wordmark.png" alt="Dwell Logo" width="180" />
</p>

A peer-to-peer EV charging and parking platform designed for Massachusetts drivers who lack reliable home charging. Dwell bridges the gap between suburban driveway owners with unused charging capacity and urban or apartment-dwelling EV drivers needing dependable destination charging.

**Live site:** [main.dk0h27v36hot1.amplifyapp.com](https://main.dk0h27v36hot1.amplifyapp.com/)

---

## Overview

Finding convenient, affordable charging without a dedicated home setup is one of the biggest friction points for EV adoption. Dwell enables homeowners to monetize their existing Level 1 or Level 2 setups while giving drivers guaranteed parking and charging near their destinations.

To maximize network density, Dwell eliminates technical onboarding barriers for hosts. Many residential EV owners have basic equipment or cannot easily pull real-time kilowatt-hour telematics from their utility meters. Dwell solves this by integrating regional baseline electricity rates from the U.S. Energy Information Administration (EIA). Hosts can list any functional outlet or charger in minutes without needing proprietary sub-meters or smart hardware.

---

## Core Features & Workflow

- **Zero-Barrier Host Onboarding:** Supports basic outdoor outlets, standard wallboxes, and smart chargers alike. By referencing localized EIA residential electricity data, the platform automatically estimates base operating costs for hosts who do not track sub-metered metrics.
- **Dynamic Fair Pricing Engine:** Calculates booking rates based on charger power output (kW), vehicle onboard AC acceptance limits, local electricity costs, and host profit margins. Drivers only pay for the energy their vehicle can realistically draw, and hosts are fairly compensated.
- **Map-First Search:** The map fills the page and the chargers list floats over its right side (fold it away to see the whole map). Drivers search by T station or address, or tap **Near me**, and choose a **Within** radius from 0.25 to 25 miles. With no destination, the list shows whatever the map currently shows, so panning searches a new area.
- **Compatibility & Filters:** Pick your car from the EV database (or add one that isn't listed). Listings are filtered by plug fit (J1772, NACS, adapters), charging level, availability window, and optional total-price and walking-time limits.
- **Live Context:** Walking times (Mapbox when a token is set, labeled estimates otherwise), nearby MBTA routes, and Open-Meteo sunlight feed each listing's cost, solar share and Green Score.
- **Session Verification & Check-in:** Arrival and departure photo verification with geolocation-based check-in/out to streamline parking compliance and prevent disputes. Late sessions accrue a late fee, and a reservation that is never checked in expires at its booked end with no charge.
- **Host Dashboard:** Hosts create, edit or remove a listing and see the bookings made on it.
- **Simulated Checkout:** Built-in prototype payment flow demonstrating end-to-end reservation, billing, and host payouts.
- **AI search (coming soon):** Natural-language search is not live yet. The map shows an "AI search coming soon" label, and the budget and walking limits it will use are already in the Filters tray.

---

## Tech Stack & Architecture

- **Frontend:** React 18, TypeScript (strict), Vite 8, Tailwind CSS v4, React Router. Hosted on AWS Amplify Hosting (static site; see `amplify.yml`).
- **Mapping & Geolocation:** MapLibre GL with the free OpenFreeMap tiles (no key). Address search uses Photon (OpenStreetMap) by default, or Mapbox Geocoding when `VITE_MAPBOX_TOKEN` is set. If the map cannot load, a labeled schematic map takes over.
- **Rate Intelligence:** U.S. EIA residential electricity price for Massachusetts (`VITE_EIA_API_KEY`), with a labeled $0.30/kWh fallback. See `docs/eia-rates.md`.
- **Live Data:** Open-Meteo (sunlight), MBTA routes via `GET /transit`, Mapbox Matrix for walking times.
- **Backend:** Plain AWS built with CDK v2 in TypeScript (`infra/`): Cognito (sign-up, email code, sign-in), an HTTP API with a JWT authorizer, one Node.js Lambda per route (`functions/`), DynamoDB tables for profiles, listings, bookings and EV specs, and a private S3 bucket for check-in photos. cdk-nag runs on every synth. Without `/config.json` the app runs as a local prototype with accounts stored in the browser.
- **Pure engines:** Pricing, billing, climate/Green Score, rate and plug logic live in `src/engines/`, shared by the browser and the Lambdas, with property-based tests.

### Run it locally

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest (361 tests)
npm run typecheck    # app, functions, infra, scripts
npm run build
```

All API keys are optional. Copy `.env.example` to `.env` to add the Mapbox token or EIA key. Backend commands: `npm run cdk:synth`, `npm run cdk:deploy`, `npm run backend:config` (writes `public/config.json`), `npm run seed` (cars and sample listings) and `npm run smoke`.

---

## How We Used Kiro

### Spec-Driven Development & Planning

We started with a master Markdown file created using spec-driven development, which outlined:
- Product concept and intended features
- User flows
- Technical choices
- Pricing rules

As the specification expanded, we needed individual development tasks to receive relevant context without repeatedly passing the entire master document. Kiro's spec planning and subagents divided the master file into:
- **Requirements:** Defining what the product needed to do
- **Design:** Specifying how the system would work
- **Tasks:** Outlining the concrete implementation steps

These now live in `.cursor/specs/voltlot-mvp/`.

### Agentic Development & Steering Documents

We used Kiro's built-in code assist for agentic development alongside its structured spec workflow to build features incrementally while referencing shared requirements and design.

Kiro generated a dedicated steering folder derived from the master specification (now `.cursor/steering/`) containing:
- **Technology documents**
- **Structure documents**
- **Product documents**
- **Project rules**

These steering documents gave agent prompts a persistent reference point for Dwell's purpose, technical approach, and architecture, so feature development stayed aligned with the original application rules.

### Implementation & Map Integration

During the implementation phase, Kiro assisted with:
- **Frontend Coordination:** Bringing together steering files, project modules, and design configuration.
- **Map Integration:** Powering Dwell's core journey of discovering parking and charging near a destination.
- **Address Indexing:** Supporting address search and location entry for both hosts listing chargers and customers seeking destinations.
- **Dynamic Map Exploration:** A pannable map that lists the chargers in view across explored cities.

### Mock Data & Testing

Kiro's planning workflow guided our mock data strategy for charger listings across Boston, Cambridge and Middlesex County:
- Structured data schema handling IDs, latitude and longitude coordinates, addresses, and related metadata.
- Edge-case test suites to ensure generated mock data renders reliably across the application interface.

### Kiro CLI

We used the Kiro CLI to run Hallmark, a skill that refined our UI and kept it clean.

### Key Takeaway

Kiro's primary benefit was translating a large product specification into modular, focused documents and an actionable sequence of tasks. Our team developed individual components of Dwell efficiently while maintaining consistency through our requirements, design, tasks, and steering documentation.
