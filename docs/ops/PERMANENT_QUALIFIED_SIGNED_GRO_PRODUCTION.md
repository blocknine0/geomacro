# GeoMacro — Permanent GRO 1.1 qualified production pipeline

This is the permanent **event-driven** private signing/archiving/serving path for an **already qualified, genuinely existing** private issuer package. It is not a fake no-funds test route, no backdated score cache and no automatic override of third-party article rights.

## Source → score → signature → B2 → D1 → live serving

1. An issuer stores one exact **private** JSON payload with schema `geomacro.private-machine-commercial-request.v1` (one real first-party same-event structured event, two to four independent original-page candidates and the **two independently Ed25519-signed** machine Facts and Rights envelopes) under the existing private B2 bucket:
   `geomacro-evidence/v1/private/machine-gro-qualified/<exact-sha256>.json`.
   Its filename must be the lowercase SHA-256 of the exact file bytes. The package must still be fresh at execution time; a previous qualified or historical report is not automatically current.
2. The existing `Permanent Qualified Signed GRO Production` workflow on canonical `main` accepts the issuer's signed immutable B2 key and hash through `repository_dispatch` event `qualified_machine_gro_ready` and payload schema `geomacro.qualified-machine-gro-ready.v1`, or owner-only manual `workflow_dispatch` with the same two values. There is **no scheduled daily scanner**.
3. The workflow resolves the existing canonical Cloudflare D1 UUID for the **shared B2 quota governor**, then invokes `scripts/ops/publish-qualified-machine-gro-production.ts`. The script verifies the private B2 input hash before accepting the exact original/corroboration/rights proof. It calls the existing `acceptMachineCommercialPrivateGRO`, which invokes deterministic scoring via `scoreAndSignQualifiedOnDemandCountry` and native `signRiskObject` Ed25519. Distinct pinned Facts, Rights and GRO signer keys are required; no new signing key is generated and no runtime can self-attest rights.
4. The existing `promoteOwnerPrivateGRO` enforces canonical `gro-1.1`, current unexpired three-hour GRO TTL, pinned signature, actual verified rights and exact canonical object SHA-256. It PUTs the signed object into private Backblaze B2, verifies the complete archived bytes by GET and only **then** upserts `country_gro_verified_hot` and `risk_object_index` into canonical D1. Exact D1 readback is required.
5. The same production operator validates `GET /v1/country-gro-hot/{ISO3}` using the existing authenticated control-plane bearer, pinned public signing registry and commercial delivery policy. A positive source-free receipt includes `live_worker_signed_hot_verified=true`; the script never logs source articles, original source IDs, private qualified input, signing keys or signed full GRO JSON.

GitHub Actions returns only source-free public country ISO3/hash + verification booleans. Private input/output runner scratch is removed even when validation fails. No checkout, USDC, x402 launch flags, PREDGE, historical service, Supabase, or news ingestion is modified.

## Issuer event contract

Only after the real qualified JSON has been stored **in existing private B2** and a secure issuer has independently computed its exact SHA-256, that issuer may send the following metadata through GitHub's authenticated repository dispatch API:

```json
{
  "event_type": "qualified_machine_gro_ready",
  "client_payload": {
    "schema": "geomacro.qualified-machine-gro-ready.v1",
    "machine_b2_key": "geomacro-evidence/v1/private/machine-gro-qualified/<actual-64-char-lowercase-sha256>.json",
    "machine_b2_sha256": "<same-actual-64-char-lowercase-sha256>"
  }
}
```

These placeholders are **not** genuine hashes. Do not dispatch them as a production run. The issuer is responsible for approved source identity, exact article bytes, native clocks, real article-level derivative commercial rights and independently signed facts/rights envelopes; GitHub event fields never constitute a substitute. Signer credentials remain protected GitHub `production` Environment secrets.

## Existing production dependencies

The workflow uses the existing `production` environment's secret names `GEOMACRO_COMMERCE_LEDGER_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `RISK_OBJECT_SIGNING_KEY_ID`, `RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64`, `RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64`, `RISK_OBJECT_VERIFY_KEYS_JSON`, `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM`, `GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256`, `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM`, `GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256`. Do not add or paste secret values into GitHub issues, PRs, workflow inputs or artifacts.

No claim of **production availability** follows merely from merging this code. Require an actual qualified input, a successful protected main Actions run, genuine B2/D1 independent readback, and a positive current signed GRO website no-funds preflight before enabling payment. Previously observed signed-hot 404 remains until a real current verified GRO is published. As of adding this workflow, no issuer event, current valid qualified input, provider receipt or successful public GRO availability has been supplied.

## Relationship to the five-step overview

Canonicalization runs on the *signable* GRO (the `integrity.payload_hash` and `integrity.signature` fields are null before signing, preventing self-reference). The actual GRO 1.1 contract uses `risk.label` and an optional `decision_readiness`; it does **not** contain a generic `decision.state` or `risk.level` field. Ed25519 proves origin and tamper detection, not that a source report was true. No 50 ms API latency or buyer payments are claimed without measurement/receipts.

The 3-hour TTL is a duration limit, not a permission to refresh an expired certificate without new native-clock source and qualification proof.
