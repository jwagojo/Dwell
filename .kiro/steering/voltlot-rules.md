# Dwell Steering Rules (.kiro/steering/voltlot-rules.md)

## 1. Pitch & UI Copy Guardrails (Mandatory)
- **Never promise a "Full Charge":** Always label energy delivery as **"Estimated Miles Added"** using `P_eff * hours * 3.5`[cite: 1].
- **Never call exported solar "Wasted":** Massachusetts has net metering; describe daytime solar charging as increasing **local solar self-consumption** and improving the **Green Score**[cite: 1].
- **Host Provides Adapters:** Never ask the customer if they own an adapter. Hosts specify whether they have `J1772 -> NACS`, `NACS -> J1772`, `Both`, or `None`[cite: 1].
- **Zero-Touch Parking:** Emphasize "No key handoff, car never moves, host never touches the car"[cite: 1].

## 2. AWS Backend Conventions (plain AWS backend, Amplify Hosting for the frontend only)
- Infrastructure is **AWS CDK v2 in TypeScript** under `infra/`; Lambda handlers live in `functions/`. Do NOT use the Amplify backend or libraries: no `amplify/`, `ampx`, `aws-amplify`, `@aws-amplify/*`, `amplify_outputs.json`, or `aws-exports.js`.
- The static frontend is hosted on **Amplify Hosting** (decided Oct 28, 2026), built by `amplify.yml`. Its only link to the backend is `/config.json`, written at build time from the app's environment variables (`npm run backend:config -- --from-env`).
- The browser talks only to Cognito (sign-up, sign-in) and to our HTTP API with the Cognito JWT. It never holds AWS credentials (no identity pool) and never calls DynamoDB or S3 directly; photos go through short-lived presigned URLs issued by the API.
- The server is authoritative for money and status: Lambdas recompute price, settlement and booking guards with `src/engines/` and `src/features/`. The user id always comes from the JWT `sub`, never from the request body.
- Secrets (EIA key, anything else) live in SSM Parameter Store or Secrets Manager and are read by Lambdas, never put in `VITE_` variables or CloudFormation templates.
- DynamoDB does not support native geospatial radius queries; always fetch seeded/active listings and filter them on the client before rendering MapLibre GL JS markers (today: the visible map bounds). Every distance (radius, walk, transit miles, pickup) uses our `haversineDistanceMeters()`[cite: 1].