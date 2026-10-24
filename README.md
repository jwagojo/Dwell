
<p align="center">
  <img src="Dwell-wordmark.png" alt="Dwell Logo" width="180" />
</p>
# Dwell

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

## Technology Stack

- **Development Environment:** Kiro IDE
- **Rate Intelligence:** U.S. Energy Information Administration (EIA) residential electricity datasets
- **Application Architecture:** Modern full-stack prototype handling search, listings, booking state management, location verification, and simulated transactions.

