# Paid publication authority wiring recovery

The protected credentialed-source configuration preflight previously omitted
both the approved machine profile and its four pinned public settings. It
therefore defaulted to the legacy independent-reviewer profile and reported
missing external-reviewer keys even though the separate protected machine
preflight had already verified distinct facts/rights authorities. It now
explicitly invokes the approved machine verifier. This configuration-only job
still does not sign evidence, authorize payment or publish a current product.

The private source-rights/status/structural B2 reader previously required a
separate pre-derived control-plane secret. Security and protected publishers
already derive the same token from GEOMACRO_COMMERCE_LEDGER_TOKEN using HMAC
SHA-256 with domain geomacro-control-plane-v1. The private quota reader now
uses that same derivation when no explicit token is configured. The root is
never sent as a bearer, and no browser receives it. Explicit credentials retain
precedence; invalid credentials, denied receipts and redirects never cause an
authority switch or retry. The atomic D1 reservation, B2 key allowlist, quota
caps, read-only credentials, native clocks and rights freshness remain intact.

Tests exercise root-only configuration, exact derived authentication,
explicit-token precedence, bad/denied/redirected receipts and single-attempt
behavior. Existing dual-authority, source-rights and canonical scoring tests
continue to require actual cryptographic facts/rights packages.

These corrections remove configuration defects, not the evidence requirement.
Current Intelligence needs qualified fresh originals and signed event packages;
GRI additionally needs canonical current event/story scoring and exact verified
historical continuity; Risk Indices needs its own verified current inputs.
The old aggregate publishers remain independent-reviewer-specific. Machine
country GRO preparation alone does not automatically authorize those aggregate
schemas or their historical/country certificates. Do not reinterpret the
machine signatures as an external reviewer signature, relabel a private
artifact, reuse old original times as current, or manufacture rights records.

The full recovery tracker must remain open while any of the actual current
products or customer readbacks remain unverified. A valid free Finds signature
or a passing configuration preflight cannot close it.

Actual historical baseline recovery on 2026-10-17: protected run 38955212276,
job 117332288990, succeeded after the UTC quota-day reset. Exact D1 bytes and
independent public historical HTTP 200 were verified for the pinned original
snapshot 2026-10-08T06:38:59.944+00:00, originally generated at
2026-10-08T06:39:43.490Z. One D1 historical insert was attempted; no B2 writes,
Supabase requests, payment or current hot-product promotion occurred. This
restores a missing historical baseline without claiming any current GRI.
