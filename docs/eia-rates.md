# Electricity rate estimate (EIA)

Dwell pre-fills the host's electricity rate from the U.S. Energy Information Administration (EIA) Open Data API.
This replaces the earlier NREL plan. The result is an **estimate**: it does not guarantee that the rate covers a
host's actual electricity costs, and the host can replace it with the rate on their electricity bill.

## What the number is (and is not)

- **One Massachusetts statewide residential average.** EIA publishes average retail prices by state and sector. It is
  not a ZIP-level number and not a utility tariff. The host's ZIP only confirms that the address is in a supported
  Massachusetts location; it is never used to look up a different rate. Do not describe the number as ZIP-specific or
  utility-specific.
- **Monthly, a couple of months behind.** EIA derives the price from utility revenue and sales, so the newest month is
  typically two or more months old. The form shows the month it describes:
  `Massachusetts residential average · EIA · August 2026`.
- **Cents, not dollars.** EIA reports `cents per kilowatt-hour`. The code divides by 100 (`centsToDollars` in
  `src/engines/rate.ts`), so 30.48 becomes $0.3048/kWh.

## The request

`GET https://api.eia.gov/v2/electricity/retail-sales/data/` with:

| Parameter | Value |
|---|---|
| `frequency` | `monthly` |
| `data[0]` | `price` |
| `facets[stateid][]` | `MA` |
| `facets[sectorid][]` | `RES` |
| `sort[0][column]` / `sort[0][direction]` | `period` / `desc` |
| `length` | `12` (spare rows, in case the newest month has no price yet) |
| `api_key` | your key |

The response is validated before use: a Massachusetts residential row, a `YYYY-MM` period, a numeric price, units of
"cents per kilowatt-hour", and a price that converts to $0.05 to $1.00 per kWh. The latest valid record is used and
its month is kept. A record that fails any check is skipped.

## Behavior in the host form

- The lookup starts once the address has a supported Massachusetts ZIP and uses a 5 second timeout.
- The statewide value is cached (memory and local storage, 24 hours; failures for 60 seconds). Changing ZIPs does not
  fetch again.
- The rate field is filled automatically. **A rate the host typed is never overwritten**, even if the lookup finishes
  afterwards.
- If the lookup times out, fails, returns an error, or returns unusable data, the field uses **$0.30/kWh**, labeled
  `Fallback estimate · $0.30/kWh` with the reason.
- A published listing records where its rate came from (`EIA` with the data month, `FALLBACK`, or `HOST`).

## Configure the key

1. Register for a free key at <https://www.eia.gov/opendata/register.php>.
2. Put it in `.env` or `.env.local` (both are git-ignored; `.env.local` wins if both exist):

   ```
   VITE_EIA_API_KEY=your-key
   ```

3. Restart `npm run dev`. Vite reads these files at startup.

`.env.example` only holds a placeholder. Never commit the real key.

### The key is visible in the browser

There is no backend yet, so the call is made from the browser. Any `VITE_` variable is compiled into the JavaScript
and can be read by anyone who opens the site or its network tab. EIA keys are free and can be replaced, but treat this
one as public. Before production, make the call from a server (for example an Amplify function) so the key stays
server-side; only `src/adapters/eiaRates.ts` needs to change.

## Not included

OpenEI's Utility Rate Database (utility tariffs and time-of-use rates) is a separate future integration for the flex
tier. It is not part of this lookup.
