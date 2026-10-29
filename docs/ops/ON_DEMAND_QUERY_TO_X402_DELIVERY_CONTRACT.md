# Query-time research to x402 delivery: implementation contract

**Status:** implementation plan; commercial delivery remains closed until the gates below pass.  
**Scope:** GeoMacro query-time retrieval and structured delivery only. PREDGE is excluded.

## What is already implemented

The canonical `POST /api/v1/intelligence/query` path accepts an explicit
`fulfillment_mode: "live_on_demand"`. It performs bounded parallel discovery
for one ISO3 country and supported category/topic, verifies publisher-native
publication dates against original pages, checks existing governed source
rights for eligible structural macro evidence, and returns a no-charge
`ON_DEMAND_VERIFICATION_PENDING` response when the result is not yet
commercially admissible. Discovery hits, page dates, annual data, internal
triage scores, and a machine-generated candidate are not by themselves
independent event verification, commercial rights, a signed customer result,
or payment authorization.

Relevant existing implementation:

- `src/lib/mainnet-intelligence-endpoint.server.ts`
- `src/lib/on-demand-global-discovery.server.ts`
- `src/lib/on-demand-private-query-bound-draft.server.ts`
- `scripts/lib/independent-same-event-qualification.mjs`
- `scripts/lib/geomacro-machine-original-binding.mjs`

## Target paid response contract

Each payable response must be a canonical JSON object bound to the exact
request plan and immutable response bytes:

```json
{
  "schema_version": "geomacro.research-answer.v1",
  "request_id": "opaque-id",
  "query_plan_hash": "sha256",
  "answer": {
    "status": "supported | partially_supported | insufficient_evidence",
    "summary": "Concise derived answer",
    "facts": [
      {
        "claim": "One bounded, checkable claim",
        "country_iso3": "ISO3",
        "topic": "canonical-topic",
        "published_at": "RFC3339 timestamp",
        "confidence": "high | medium"
      }
    ],
    "as_of": "RFC3339 timestamp",
    "freshness_seconds": 0,
    "limitations": []
  },
  "evidence": {
    "independent_original_count": 0,
    "commercial_use": "verified",
    "review_profile": "approved-profile",
    "evidence_set_sha256": "sha256"
  },
  "delivery": {
    "response_sha256": "sha256",
    "signature": "detached-signature-or-null",
    "payment": "x402"
  }
}
```

The public response must not include raw article bodies, search-result
payloads, private source IDs, publisher URLs, reviewer receipts, or secrets.
Claims must be clearly separated from inference. If evidence is incomplete,
contradictory, stale, outside the supported query scope, or not cleared for
derived commercial use, return a no-charge machine-readable error instead.

## Remaining implementation work

### 1. Complete exact-query evidence qualification

Use the existing bounded discovery and first-party page readers. For every
candidate, bind the requested country/topic, original publisher identity,
native publication clock, and exact original bytes. Require two or more
distinct independent original issuers for event claims; suppress syndicated
copies, duplicate bytes, stale/retracted items, and unresolved material
counterevidence. A search index, feed timestamp, URL fingerprint, annual
observation, or internal triage score cannot count as an independent original.

### 2. Require item-level commercial rights

For each exact original, resolve an active governed rights record for the
publisher, item/category, derived use, and required attribution. Fail closed
if the rights snapshot is unavailable, expired, mismatched, or requires
attribution that the proposed response cannot satisfy. Do not infer rights
from public accessibility or source certification. Keep rights receipts
private and expose only an aggregate eligibility result.

### 3. Build a narrow structured-answer product

Add a separately named on-demand research answer product; do not silently
reinterpret it as a signed GRI/GRO risk score. Use a versioned deterministic
schema and canonical serialization. Bind every fact to the exact evidence set
and query-plan hash. Do not emit a confidence score unless its calibration
and derivation are defined. Distinguish verified facts from model inference,
and return `insufficient_evidence` when the exact question cannot be answered
from admissible evidence.

### 4. Establish the signing and persistence profile

Choose one of two explicit product profiles before implementation:

- **Ephemeral answer:** prepare and hash the full final JSON in request memory;
  retain no raw source content and do not claim a durable signed GRO. This
  profile must meet the prepared-response and replay contract below.
- **Durable signed intelligence:** use the existing private evidence package,
  reviewer/signing process, governed B2/D1 publication, independent readback,
  expiry, and public projection controls. Do not substitute a request-local
  draft or internal score for these proofs.

The profile is a product decision because it changes what can truthfully be
claimed and what storage/retention is required.

### 5. Bind x402 to prepared bytes

Before returning a 402 payment requirement, confirm the exact query is
deliverable, compute the final sanitized response, canonicalize it, and bind
its SHA-256, query-plan hash, price, network, asset, and pay-to address to the
quote. If any proof fails, return a no-charge error. After verified
settlement, return exactly the prepared bytes; do not fetch, score, or mutate
the answer after charging. Make `client_request_id` replay idempotent and
return only the frozen delivery for a verified prior settlement.

Do not enable a new network, wallet, production credential, checkout flag, or
real-money settlement as part of this code change.

### 6. Keep source outages observable and bounded

Return machine-readable status codes that distinguish: no matching original,
source transport failure, rate limit/cooldown, access restriction, stale
original, rights unavailable, corroboration incomplete, conflict/retraction,
and unsupported query. Keep provider concurrency, timeouts, body caps, and
per-client/global request budgets bounded. Never convert an outage into a
claim that no event occurred.

## Acceptance gates

A future implementation is ready for no-funds production acceptance only
after all of the following are demonstrated on the exact candidate commit:

1. A real current query in each of geopolitics, macro, and critical minerals
   retrieves original pages and validates native clocks.
2. At least one same-event query per category is supported by genuinely
   independent publishers and passes conflict/retraction review.
3. Every item has an active, exact-scope commercial derived-use rights proof.
4. The canonical machine response validates against the versioned schema and
   contains no private/raw source material.
5. The prepared response hash remains identical from quote through verified
   delivery and idempotent replay.
6. Unavailable, stale, unsupported, conflicting, and rights-denied cases
   return no-charge errors.
7. Durable profile only: B2/D1 writes, full readback/restore, expiry, and
   independent consumer verification pass. Ephemeral profile: prove there is
   no durable raw-source write and no false signed-GRO claim.
8. No-funds x402 verification, duplicate-payment/replay handling, reconciliation,
   usage limits, and production observability pass before a separately
   authorized first real-money sale.

These gates do not promise $1,000/month revenue: revenue also requires a
clear priced capability, successful checkout, distribution, and repeat buyers.
