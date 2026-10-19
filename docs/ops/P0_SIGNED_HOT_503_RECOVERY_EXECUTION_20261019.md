# P0 hot 503 — first production execution and no-waste B2 admission

**19 October 2026.** #2046 / #2124. The actual production D1 metadata
for Intelligence, Global Risk and Risk Indices was already rejected for
SOURCE_TOO_OLD and EXPIRED. It would be a quota-consuming mistake to
immediately GET six mutable live B2 objects to re-prove the old timestamps.

The one-shot *Issue 2124 B2 D1 current hot read-only audit* on its workflow
file's next main merge now performs these stages in strict order:

1. Offline contract test; resolve shared quota-governed Cloudflare D1.
2. One D1 **metadata-only** SELECT for all three hot products with their
   unchanged source_as_of/expires_at. No hash content or payload_json output.
   Existing classifier must prove all three are metadata-eligible before any
   current-hot B2 GET; otherwise the workflow fails P0_NO_CURRENT_HOT_INPUT.
3. Only then check conservative 8-GET account-wide headroom. Every later B2
   attempt still makes its own atomic shared D1 quota reservation.
4. If eligible and admitted, audit exact gzip/proof and D1 payload hash for
   each product; sanitized receipt only. No data promotion.
5. Independently run the existing *Read-only B2 Account D1 Quota Receipt*
   production action on its workflow change to obtain real reservation-ledger
   headroom/hold reasons without consuming B2 Class B operations.

**What this does not do:** revive existing expired October 8 sources, create
a new signed review, alter current vs historical clock meaning, bypass source
rights, spend USDC, trigger settlement, enable Supabase or replace immutable
historical GRI recovery with a mutable live archive. The GRI D1 historical
anchor currently reports prior-baseline ancestry rather than confirmed present
immutable B2 bytes. Actual immutable B2 history requires independently pinned
versioned objects and an authorized quota-governed readback; do not query an
unproven mutable key and claim historical recovery.

Upon live preflight completion, operator reads sanitized receipts and then
gets NEW independently rights-cleared and approved B2-reviewed packages.
Protected signed Intelligence and GRI workflows publish verified source-clock
current data; successful GRI wakes Risk Indices. Deep-health HTTP 200 and
actual x402 buyer eligibility remain separate post-publication acceptances.

**Key rule:** read-only probe health is not signed-product health.
