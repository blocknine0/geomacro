# US BLS free no-key dual monthly reference (source family reuse)

The existing operator source rotation already queried BLS once in group 0 using the anonymous v1 GET API for CPI-U all-items (CUUR0000SA0). It now uses the same single call allowance for two **first-party USA monthly reference series**:

- `CUUR0000SA0`: CPI-U all items, U.S. city average (index, not inflation percent).
- `LNS14000000`: U.S. civilian unemployment rate (seasonally adjusted percentage, not CPI).

The official BLS v1 API supports up to 25 series in a single no-key POST. It allows 25 requests/day for unregistered users. This uses only **one** POST per group-0 source rotation and no second BLS collector. The registrar's `candidate_endpoint` now uses its official REST v1 multi-series path; the earlier single-series `probe_url` is deliberately retained for isolated compatibility tests.

## Safe state and claims

The response must include exactly the two pinned native series IDs, each with valid, finite numeric values and a nonfuture valid monthly observation period no older than 36 months. Missing one series, invalid month, future date, missing value or duplicate IDs means `FORMAT_NOT_VERIFIED`. The private receipt stores only last verified **reference months per series** and a count of two, never BLS raw numbers or source body. It explicitly does not infer release date, same-day macro news, national currency spot FX, risk scores or commercial rights.

This source is one publishing family. CPI and unemployment are not independent corroborating organizations. Existing WDI annual CPI/GDP, ECB daily reference FX, BGS/USGS mineral references and 195-country request routing remain separate and unchanged.

### Acceptance

Test `src/__tests__/operator-free-feed-rotation.test.ts` and source registry. After merge inspect the first protected-main group-0 `operator-free-feed-rotation-scheduled` run (on the existing best-effort 90-minute rotation schedule); one honest provider denial or quota response remains red. This change does not certify 195×3 fresh source coverage, current signed hot snapshots or Predge commercial data delivery.

Official documentation:
- https://www.bls.gov/developers/api_signature.htm
- https://www.bls.gov/developers/api_faqs.htm
