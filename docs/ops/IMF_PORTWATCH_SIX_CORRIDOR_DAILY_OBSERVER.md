# IMF PortWatch: bounded daily named-corridor observations

**Scope:** Existing `imf_portwatch` private research source, not a second source family, a maritime-security incident feed, a commercial data grant, or a licensed AIS stream.

## Verified official source interface

- IMF PortWatch's ArcGIS `Daily_Chokepoints_Data/FeatureServer/0` exposes `date` (UTC day), `portid`, `n_total`, `n_tanker` and `n_container`.
- Read a pinned six-chokepoint subset: Suez, Panama, Bab el-Mandeb, Malacca, Hormuz, Taiwan Strait.
- One HTTPS JSON GET on the existing GDACS daily GitHub schedule (`03:51 UTC`, best effort), with `resultRecordCount=60`, descending native date, no geometry, 128 KiB response cap and 12s timeout.
- No client question or sensitive identifier is sent upstream. No new cron, no stateful service, no customer API exposed.
- No daily source date is promoted to a precise news-release timestamp. The native date is a *data observation period*, not an incident time.

## Shared canonical corridor references

These are the existing IDs in `config/operator-corridor-source-crosswalk.v1.json`:

| PortWatch reference | Geomacro corridor ID |
| --- | --- |
| chokepoint1 | suez_canal |
| chokepoint2 | panama_canal |
| chokepoint4 | bab_el_mandeb |
| chokepoint5 | strait_of_malacca |
| chokepoint6 | strait_of_hormuz |
| chokepoint11 | taiwan_strait |

Observations more than 21 days behind the UTC clock are explicitly stale. A consecutive-day total-transit percentage change is derived only from two genuinely adjacent UTC dates with a nonzero previous count. An observed percentage change is **not** automatically an alert, ship attack, embargo, risk score or current product. Missing provider records or rejected schemas stay degraded.

## Data / rights isolation

Private 3-day GitHub Actions receipt includes only bounded derived date/lag/comparison metadata. No provider response body, upstream ship/port table or raw vessel series is persisted. No B2, D1, Supabase, signer, x402, customer data delivery or payment calls. No automatic rights approval. It does not make physical route geometries, 58 corridors or 195x3 country cells live.

## Acceptance

- `node --test scripts/tests/imf-portwatch-daily-corridors.test.mjs`.
- `node --check scripts/lib/imf-portwatch-daily-corridors.mjs`.
- PR static job runs independently of upstream transport.
- Post-merge protected-main `portwatch-daily` must return a genuine nonempty official dataset, valid native days and canonical per-route reference states. Live result may remain degraded if actual upstream records or access do not match expectations.

Provider metadata: https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0?f=pjson

Provider PortWatch: https://portwatch.imf.org/
