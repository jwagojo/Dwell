
<p align="center">
  <img src="Dwell-wordmark.png" alt="Dwell Logo" width="180" />
</p>

A peer-to-peer EV charging and parking platform designed for Massachusetts drivers who lack reliable home charging. Dwell bridges the gap between suburban driveway owners with unused charging capacity and urban or apartment-dwelling EV drivers needing dependable destination charging.

---

## Overview

Finding convenient, affordable charging without a dedicated home setup is one of the biggest friction points for EV adoption. Dwell enables homeowners to monetize their existing Level 1 or Level 2 setups while giving drivers guaranteed parking and charging near their destinations.

To maximize network density, Dwell eliminates technical onboarding barriers for hosts. Many residential EV owners have basic equipment or cannot easily pull real-time kilowatt-hour telematics from their utility meters. Dwell solves this by integrating regional baseline electricity rates from the U.S. Energy Information Administration (EIA). Hosts can list any functional outlet or charger in minutes without needing proprietary sub-meters or smart hardware.

---

## Core Features & Workflow

- **Zero-Barrier Host Onboarding:** Supports basic outdoor outlets, standard wallboxes, and smart chargers alike. By referencing localized EIA residential electricity data, the platform automatically estimates base operating costs for hosts who do not track sub-metered metrics.
- **Dynamic Fair Pricing Engine:** Calculates booking rates based on charger power output (kW), vehicle onboard AC acceptance limits, local electricity costs, and host profit margins. This ensures drivers only pay for the energy their vehicle can realistically draw while hosts are fairly compensated.
- **Destination-Based Matching:** Drivers search by destination address, filtering specifically for hardware compatibility (e.g., J1772, NACS) and booking availability.
- **Session Verification & Check-in:** Includes arrival and departure photo verification alongside geolocation-based check-in/out workflows to streamline parking compliance and prevent disputes.
- **Energy & Solar Context:** Displays estimated energy delivered per session, charge completion timing, and local solar generation metrics where applicable.
- **Simulated Checkout:** Built-in prototype payment flow to demonstrate end-to-end reservation, billing, and host payouts.

---

## Spec-Driven Development & Planning

We started with a master Markdown file created using spec-driven development, which outlined:
* Product concept and intended features
* User flows
* Technical choices
* Pricing rules

As the specification expanded, we needed individual development tasks to receive relevant context without repeatedly passing the entire master document. Kiro’s spec planning and subagents divided the master file into:
* **Requirements:** Defining what the product needed to do
* **Design:** Specifying how the system would work
* **Tasks:** Outlining the concrete implementation steps

---

## Agentic Development & Steering Documents

We utilized Kiro's built-in code assist for agentic development alongside its structured spec workflow to build features incrementally while referencing shared requirements and design.

Kiro generated a dedicated steering folder derived from the master specification containing:
* **Technology documents**
* **Structure documents**
* **Product documents**
* **Project rules**

These steering documents provided agent prompts with a persistent reference point for Dwell’s purpose, technical approach, and architecture. Every agent prompt validated against these steering documents to ensure feature development remained aligned with original application rules.

---

## Implementation & Map Integration

During the implementation phase, Kiro assisted with:
* **Frontend Coordination:** Bringing together steering files, project modules, and design configuration.
* **Mapbox GL JS Integration:** Powering Dwell's core journey of discovering parking and charging near a destination.
* **Address Indexing:** Supporting address search and location entry for both hosts listing chargers and customers seeking destinations.
* **Dynamic Map Exploration:** Implementing a scrolling map feature that delivers non-bounded scrolling results across explored cities.

---

## Mock Data & Testing

Kiro's planning workflow guided our mock data strategy for charger listings across Boston and Cambridge:
* Structured data schema handling IDs, latitude and longitude coordinates, addresses, and related metadata.
* Planned edge-case test suites to ensure generated mock data rendered reliably across the application interface.

---

## Key Takeaway

Kiro's primary benefit was translating a large product specification into modular, focused documents and an actionable sequence of tasks. Our team developed individual components of Dwell efficiently while maintaining consistency through our requirements, design, tasks, and steering documentation.

- **Development Environment:** Kiro IDE
- **Rate Intelligence:** U.S. Energy Information Administration (EIA) residential electricity datasets
- **Application Architecture:** Modern full-stack prototype handling search, listings, booking state management, location verification, and simulated transactions.

