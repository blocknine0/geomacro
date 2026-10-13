# Three category API — free official live-observation view

The production URLs are the existing fixed category endpoints:

| Domain | Read-only official observations | Governed signed/x402 product |
|---|---|---|
| Geopolitics | `GET /api/v1/intelligence/geopolitics?view=latest` | `POST /api/v1/intelligence/geopolitics` |
| Macro/FX | `GET /api/v1/intelligence/macro-fx?view=latest` | `POST /api/v1/intelligence/macro-fx` |
| Critical Minerals | `GET /api/v1/intelligence/critical-minerals?view=latest` | `POST /api/v1/intelligence/critical-minerals` |

`GET` without `view=latest` continues to serve the existing x402 discovery
metadata. The canonical paid POST is **unchanged**, scoped to a country
subject, and must fail closed before funds when signed intelligence is
unavailable.

## Read-only original-release behavior

- Reuses the deployed first-party website stateless reader rather than
  introducing a second source fetcher. No Supabase/B2/D1 writes, no new
  account/API credentials or user-provided upstream search strings.
- Server-side bounded fixed source list; up to 3 qualifying derived signals
  per category, each with its *original* publication clock. Maximum original
  age 24 hours and minimum 15-minute release delay. This is **near-current**,
  not instant event verification or 195-country coverage.
- Reports `NO_QUALIFYING_ORIGINAL_RELEASE_IN_24H` rather than backdating an
  old story, or `OFFICIAL_SOURCES_UNAVAILABLE` if all official transport
  lanes fail. It does not fabricate news to keep three counters nonzero.
- `signed_gro_generated: false`, `x402_payment_required: false`,
  `paid_delivery_authorized_by_observations: false`,
  `risk_score: null`, `same_event_corroborated: false`.
- No upstream article text or links are delivered. Exact mandatory source
  credits are retained if publication licence requires credit, even if
  the rest of the private provenance graph stays hidden.
- Per-category ephemeral in-process coalescing cache for one minute; **no
  persistent storage** or source payload log. Read-only GET uses public
  security class with standard client fingerprint and burst limit, while
  POST remains in the strict fail-closed `payment` class.
- The 67-family free-source line-up and its nine transport canaries are a
  **separate** commercial-source inventory and monitoring system; transport
  success does not elevate those families to source-native news, signed
  GRO, payment eligibility, or a published live adapter.

## Acceptance and release

Product CI, CodeQL, Website Lock, central-security regressions and the
three route unit tests must pass. Only after that should this be merged,
synced to Lovable, actually published, and probed at the **exact deployed
SHA**. Real original-released findings are data-dependent, not guaranteed
for all three domains on every run. Paid API production acceptance and
mainnet x402 customer payments require independent later proof.
