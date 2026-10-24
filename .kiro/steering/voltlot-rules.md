# Dwell Steering Rules (.kiro/steering/voltlot-rules.md)

## 1. Pitch & UI Copy Guardrails (Mandatory)
- **Never promise a "Full Charge":** Always label energy delivery as **"Estimated Miles Added"** using `P_eff * hours * 3.5`[cite: 1].
- **Never call exported solar "Wasted":** Massachusetts has net metering; describe daytime solar charging as increasing **local solar self-consumption** and improving the **Green Score**[cite: 1].
- **Host Provides Adapters:** Never ask the customer if they own an adapter. Hosts specify whether they have `J1772 -> NACS`, `NACS -> J1772`, `Both`, or `None`[cite: 1].
- **Zero-Touch Parking:** Emphasize "No key handoff, car never moves, host never touches the car"[cite: 1].

## 2. AWS Amplify Gen 2 Conventions
- Use ONLY **Amplify Gen 2** TypeScript backend definitions (`amplify/auth/resource.ts`, `amplify/data/resource.ts`, `amplify/storage/resource.ts`).
- NEVER generate legacy Amplify Gen 1 CLI commands (`amplify add api`, `aws-exports.js`). Always import `amplify_outputs.json`.
- DynamoDB does not support native geospatial radius queries; always fetch seeded/active listings and apply our `haversineDistanceMeters()` filter on the client before rendering Mapbox GL JS markers[cite: 1].