# GeoMacro Risk Gate — supplied global/corridor source rules (2026-11-02)

**Source of truth:** operator-provided `geomacro_global_corridor_sources (1).md` plus the explicit CAMEO-to-Risk-Gate mapping in the operator instruction of 2026-11-02. No invented numerical thresholds or replacement sources.

## Permanent registration

`scripts/lib/risk-gate-supplied-source-rules.mjs` reads the **existing 37 direct source IDs / 39 source-link occurrences** from `scripts/lib/direct-global-corridor-sources.mjs`. This includes GDELT, ReliefWeb, World Bank, IMF, WTO, the official regional central banks, UKMTO, ReCAAP, Suez Canal, Panama Canal, logistics indices, USGS, IEA and the remaining provided sources. Every item inherits the existing direct endpoint and integration-state label. No search-prefixed URL or duplicate feeder is introduced.

Maritime/chokepoint: `ukmto_incidents`, `ukmto_advisories`, `recaap_isc`, `suez_navigation`, `panama_canal`, `imb_piracy`.

Critical minerals: `usgs_mcs`, `iea_minerals`, `mining_com`.

## Exact source-event decision rules

| Verified CAMEO root | Risk Gate decision |
| --- | --- |
| 18, 19, 20 | `PAUSE` |
| 17 | `PAUSE` for comprehensive trade ban / asset freeze, otherwise `REQUIRE_APPROVAL` |
| 11, 12, 13 | `REQUIRE_APPROVAL` |
| 10 | `REDUCE_LIMIT` |
| 01, 02, 03, 04, 05 | `CONTINUE` |

Apply the strongest state when multiple independently verified events affect the same decision. The classifier accepts 2–4 digit CAMEO codes and uses their two-digit root. It returns **no decision** for missing or unverified event records. A GDELT `lastupdate.txt` index, a source URL, portal HTTP 200, or an RSS candidate **never alone triggers a Gate**.

The supplied document lists chokepoint and mineral sources but contains **no numeric transit/mineral trigger values**, so none are fabricated. Only CAMEO rules above are executable against verified input.

## Runtime and production boundary

The already scheduled `Direct Global Corridor Intake (Isolated)` workflow is the registration/census entry point and tests the mapping on every run. Intake receipts expose the mapped registry and mark live event activation **zero** until an independently verified structured event stream is connected. This change **does not** yet make all 37 links functional event adapters, write risk objects, activate a paid gate or make a new live-risk-score engine. Existing UKMTO/portal source-index observations, GDELT batch metadata and periodic economic datasets do not contain certified decision events.

PREDGE runtime and credentials, v1 signed GRO evaluation, execution authorization, customer payment, and Website Intelligence are deliberately unchanged. Verified future events can be passed to `mapVerifiedCameoToRiskGate` without replacing this stable source ruleset.
