# GeoMacro internal original verification: private evidence boundary (2026-10-28)

## Scope — do not alter ingestion or PREDGE

- Preserve every existing ingestion feed, producer timing, derived journal, canonical D1 writer, website Finds, customer-facing machine product scope, pricing, PREDGE repository/code/workflows/secrets/endpoints, and historical-data storage. This change is **read/access control only** for separate original/signature reviewer evidence.
- The former anonymous `GET /v1/public/intelligence-publications` exposed issuer proof envelopes, source-review verdict, source-review timestamp, current-qualification flags, original publication clock, journal fingerprint and per-category counts. It must always return a generic HTTP 404; it is **not** an endorsed public intelligence product.
- Canonical proof pages are accessible only to owner-authorized GeoMacro Jobs at `GET /v1/internal/intelligence-publications`. Access requires a **separate double-derived HMAC scope** from the existing GeoMacro-only low-review root. Generic admin token, the low-review bearer itself, public consumers, machine APIs and PREDGE's risk-gate token cannot read it.
- Auth must be verified before any canonical D1 query. Wrong bearer, missing bearer and non-GET requests return generic 404; absent owner config fail-closed 503. No broad CORS; private no-store. No raw HTML, sources, rights or proof state leaked in error.
- The publisher/private low reviewer and independently signed verifier continue using unchanged canonical input, verified clock and existing secrets. No artificial positive source verification, no altered original time, no fake release qualification.
- Existing *standing delegated machine derived-readback job* is explicitly **paused by a hard workflow condition**, because it previously consumed the full reviewer proof and granting it GeoMacro's control-plane/root credential would violate role separation. Owner-only automated issuance/review and original ingestion continue. Machine derived-readback receipt issuance can resume only after a separately reviewed source-neutral owner attestation contract; it must not be silently re-enabled as a bypass.
- Full signed acceptance receipt for standing delegated policy remains available **only** in the restricted runner temporary file with mode 0600 and exclusive creation. Public GitHub Actions stdout now emits only a generic success/failure gate without journal size, source-verdict counts, review reasons, proof hashes or references.
- Historical public GitHub run logs and clients' prior downloaded responses cannot be retroactively erased. A public GitHub repo's code and explicitly public Finds still disclose public product schema. Strict confidentiality of all historical artefacts requires appropriate GitHub/provider retention and access settings outside this code change.

## Fail-closed post-deployment acceptance

1. After Deploy D1 Control Plane, anonymously GET the retired old path: generic HTTP 404, no proof bodies or source counters.
2. Generic admin token, public/machine bearer and PREDGE separate key: generic HTTP 404 to new internal proof endpoint. Confirm the existing delegated machine job remains hard-held.
3. Owner-only scoped bearer: private source+issuer proof pages permitted, signatures independently checked against the canonical D1 journal, with no public logs and unmodified original verification.
4. Website Finds anonymous 72h readback remains HTTP 200, signed paid-product claims remain separate, PREDGE parity tests remain green, ingestion continues with no additional source fetch/DB write from this change.
5. If any production condition fails, retain open P0 master issue 1827, never declare secrecy or current 3-category originals accepted without independent evidence.
