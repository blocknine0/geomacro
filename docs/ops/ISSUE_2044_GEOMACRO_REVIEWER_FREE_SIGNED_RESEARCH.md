# #2044 — Geomacro-automated, reviewer-free canonical private signed GRO

## What can now run, without an independent external reviewer

`scripts/ops/accept-private-geomacro-machine-research-gro.ts` is a
secure **manual private** entrypoint that combines:

1. Typed exact country/category/event and original-source organization
   binding, exact content SHA hashes, origin clocks and one event claim
2. Two-to-four independent original first-party HTTPS page rereads and
   actual HTML-byte SHA-256 verification, source-native publication clocks
3. A quota-reserved current B2 commercial-source registry compatibility
   preflight, fail-closed if rights metadata is unavailable or incompatible
4. Existing country risk scorer, distinct
   `geomacro_automated_research_unverified_v1` calculation namespace,
   existing canonical Ed25519 GRO signing and independent signature replay
5. Owner-only output directory (0700) outside the repository, private input
   (0600), symlink protections, atomic new output file (0600)

The script requires the existing `RISK_OBJECT_SIGNING_KEY_ID`,
`RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64`,
`RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64`, verified key registry, B2 read
configuration and real PRIVATE structured event/original inputs.
No reviewer public/private key or reviewer approval is needed.

Example private usage:

```bash
bun scripts/ops/accept-private-geomacro-machine-research-gro.ts \
  --input=/secure/geomacro-private/event-request.json \
  --out=/secure/geomacro-private/signed-research.json
```

Private input schema: `geomacro.private-machine-gro-request.v1`.
It contains `category`, `country_iso3`, `country_name`, one structured
`event` of the existing CountryRiskEventInput contract, and `candidates`
of the existing `geomacro.private-original` matching contract, each with
correct `source_registry_id`. Native material evidence must equal the
original event occurred_at and page HTML content digest must bind to
source_record_ids/content_hashes. The input is never published or logged.

## Critical no-funds/noncommercial boundary

This stage yields `geomacro.private-machine-signed-research-gro.v1` with a
replay-verifiable **Geomacro-authored cryptographic signature**, not an
external independent reviewer attestation. The signature authenticates
the scoring operation and exact canonical bytes; it does **not** prove
the underlying assertions are semantically true.

The input event MUST be `CORROBORATING`, not `CONFIRMED`, because no verified
semantic fact adjudication has been run. The signed GRO retains
`commercial_eligibility.status = UNVERIFIED` and
`verification.status != VERIFIED`. A normal commercial delivery policy
must and does reject the private result. Other explicit fields:

- `semantic_same_event_claim_verified: false`
- `article_commercial_rights_verified: false`
- `licensed_commercial_delivery_allowed: false`
- `x402_payment_authorized: false`
- `public_hot_published: false`
- `persistence_performed: false`

The output contains a private canonical signed GRO and is never sent to
customer, GitHub Actions artifacts or public endpoint. The signing key
never leaves the protected runtime. Do not treat synthetic CI fixtures
as live verified producer evidence.

## Remaining LIVE acceptance (issue stays OPEN)

- Obtain one **real** current two-original same-event pair from the
  global source intake; reread the actual original articles in production
- Independently establish actual claim meaning (who/what/where/when)
  against each original content, plus counterevidence/retraction checks
- Establish source-specific lawful article-level rights and attribution
  compatibility; B2 registry metadata alone does not prove permission
- Bind real semantic/rights attestations to a new *Geomacro automated*
  **commercial** qualification schema; never relabel the private
  `UNVERIFIED` research profile as chargeable
- Verify production deploy and exact live signed GRO readback; run x402
  no-funds acceptance, then require explicit owner approval before any
  0.05 USDC mainnet test

The existing `FEDERICO_STRICT` external reviewer-attested path remains
separate and unchanged. No Supabase write, B2 PUT, D1 mutation, website
publication or paid settlement is performed by this entrypoint.
