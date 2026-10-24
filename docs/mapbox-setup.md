# Mapbox setup

Dwell uses Mapbox for the live map (Mapbox GL JS) and for address search (Geocoding API v6). Both use one
**public** access token that ends up in the browser bundle, so the token must be URL-restricted.

Without a token the app still works: maps show a labeled schematic fallback, destination search offers T stations
only, and hosts enter their address by hand.

## 1. Create a public, URL-restricted token

1. Sign in to <https://account.mapbox.com/access-tokens/> and choose **Create a token**.
2. Name it for one environment, for example `dwell-dev`. Use a separate token for production.
3. Keep only the **default public scopes** (for example `styles:read`, `fonts:read`). Do not add any secret scope.
   Never create or paste an `sk.` token for this app; Dwell refuses to use one.
4. Under **URL restrictions**, add the sites that may use the token:

   | Token | Allowed URLs |
   |---|---|
   | Development | `localhost:5173` (Vite dev server) and `localhost:4173` (`npm run preview`) |
   | Production | your deployed site, for example `https://app.example.com` |

   Rules from Mapbox's token docs that matter here:
   - A restricted token only works for URLs on its list. Requests from `localhost` are blocked unless `localhost`
     is listed, and without a port only ports 80 and 443 match, so list the port.
   - Wildcards and IP addresses are not supported. Use `localhost`, not `127.0.0.1`.
   - Subdomains of a listed domain are allowed automatically.
   - The default public token that Mapbox creates for you cannot be restricted. Create a new token instead.
   - Requests need a `Referer` header. Do not set a `no-referrer` policy on the site.
5. Create the token and copy the value that starts with `pk.`.

## 2. Add it to the project

Create `.env` or `.env.local` in the repository root (both are git-ignored; `.env.local` wins if both exist) and add:

```
VITE_MAPBOX_TOKEN=pk.your-public-token
```

`.env.example` only contains placeholders. Restart `npm run dev` after editing the file: Vite reads it at
startup. For a deployed build, set `VITE_MAPBOX_TOKEN` in the hosting environment before building, using the
production token.

## 3. Permanent geocoding (billing)

Dwell saves geocoded addresses (listing pins, chosen destinations) in browser storage. Mapbox only allows storing
results from its **Permanent** geocoding mode, so address search sends `permanent=true`
(`USE_PERMANENT_GEOCODING` in `src/adapters/mapboxGeocoding.ts`).

- Permanent geocoding needs a valid credit card on file (or an enterprise contract) and costs more per request than
  temporary geocoding. Autocomplete sends a request per search after a short pause, so expect more requests than
  places selected.
- If the account is not set up for it, address search shows a "blocked (403)" message. Fix the account, or turn the
  flag off only while nothing from the results is stored.

## 4. Check that it works

- Open the landing page: the hero shows a real map with price markers and a Mapbox logo and attribution.
- Search page: the map shows price markers and a destination marker; type an address in **To** and pick it.
- Become a host, step 2: type an address, pick it, drag the pin, then **Confirm pin location**.
- A **403** message means the token's URL restrictions do not include the address you are browsing from
  (check the port). A **401** means the token is wrong or deleted.

## Not covered here

- Walking times are still estimates from straight-line distance. Mapbox Directions is not integrated.
- Sign-in, payments and AWS hosting are unchanged by this setup.
