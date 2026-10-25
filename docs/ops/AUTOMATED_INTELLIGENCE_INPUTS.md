# Automatic intelligence input approval and signing

Owner instruction, 21 October 2026: automatically approve incoming intelligence
and create signed inputs, excluding duplicates. No per-item manual approval.

The existing five-minute and hourly ingestion workflows now run
`scripts/ops/publish-automated-intelligence-inputs.ts` after collection. The
publisher reads every retained item in the existing 72-hour, 600-record D1
journal, including all three categories and feed candidates with their actual
candidate status. It does not add a publisher request or another cron.

Each new unique derived item receives its own Ed25519 issuer signature under
the existing protected signer and registry. The signed payload explicitly says
`approval_mode: AUTOMATED_INGESTION` and
`approved_for: derived_intelligence_input`. It preserves the complete original
derived item, its source publication time, precision, category and uncertainty.
Signing does not reset the original time or its 72-hour expiry. There is no
human approval prompt or independent reviewer signature in this profile.

Content identity is SHA-256 of canonical derived content excluding the journal
ID. Identical content under alternate journal IDs is one input. Changed content
is a new revision, rather than silently overwriting an earlier signature.
Matching is exact; unrelated stories are not discarded by fuzzy similarity.
Already signed retained inputs are skipped before signing or writing. A retry
after an ambiguous acknowledgement is deduplicated atomically by D1. Revoked
keys, malformed payloads, altered signatures and expired originals are rejected.

Inputs use the existing D1 `control_state` table, in a dedicated key prefix.
There is no new database or schema migration. Writes are atomic batches of up
to 40 and 250 KB; native-date expiry and the existing 600-record retained
capacity bound storage. Every PUT includes only the SHA-256 IDs from the
current complete journal read, so stale revisions from an older journal window
are pruned before the new batch is inserted. This keeps current retained rows
from being crowded out by orphaned historical input revisions. A no-op run
also performs this reconciliation. A final authenticated readback checks every
expected unique ID in the accepted-input inventory after PUT signature verification.
The inventory is not an independent full-envelope proof. Paginated input reads
verify actual signatures, at most 40 per request. No silent 50-item truncation.
Capacity is the retained journal, not unlimited world news or guaranteed full
72-hour retention under more than 600 developments.

The internal endpoint is `GET/PUT /v1/intelligence-inputs/automated` on the
existing control-plane Worker. It inherits the existing strong control-plane
authorization and is absent from public and partner routes. `GET ?view=ids`
returns accepted retained IDs under recognized keys without repeating up to
600 crypto operations each run; paginated GET verifies and returns up to 40 envelopes
with `next_offset`. No private signing key is sent to the Worker or browser.
Worker validation reuses the existing protected public-key registry.

Existing workflow secrets are reused. Main merge must deploy the updated
control-plane Worker before this endpoint can accept inputs. Existing workflow
deployment-completion continuation and subsequent scheduled runs then invoke
the publisher. Source pushed to a PR alone is not proof of deployment or a
production signature/readback. Missing signer configuration fails visibly.

Automatic issuer approval is precisely labelled. The profile does not assert
independent factual review, article-specific commercial permission, numerical
GRI scoring or x402 settlement. Those fields remain false. Its domain-separated
signature cannot be substituted into the existing independent-reviewer or
machine facts/rights certificate contracts. It supplies authentic automatically
signed derived inputs; it does not by itself certify the three scored hot
products or change default deep health to HTTP 200.

Validation covers real Ed25519 verification, tamper/revocation/expiry rejection,
duplicate and revision identity, authenticated-only access, 600 retained items,
per-category counts above 50 and zero duplicate writes on repeated publication.
