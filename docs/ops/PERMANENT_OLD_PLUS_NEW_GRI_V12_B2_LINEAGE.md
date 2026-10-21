# Permanent GRI v1.2: verified old history + new qualified evidence

Status: implementation guard. **Not a claim that production has received a newly approved GRI event or published a new score.**

## Continuous behaviour without the old Supabase

1. Preserve genuine earlier verified GRI snapshots in immutable private B2 historical archives, each with the original `snapshot_as_of`, numerical score, methodology, hashes, and proof metadata. Never change original dates or scores.
2. When a current approved, independently Ed25519-signed reviewed package arrives, the existing `gri_reviewed_current_ready` protected dispatcher/publisher verifies source-native original evidence, commercial derived-use rights, reviewer and country/category certificates, the pinned previous B2 historical archive and the unchanged GRI v1.2 portable proof.
3. The current GRI score is **recomputed** from independently qualified current events and still-eligible retained original events within the 72-hour canonical window. The 24-hour half-life and source/story caps prevent a repeated story from accumulating unlimited weight. There must be at least one genuinely new original after the verified previous snapshot. Neither an old score nor an old published event is blindly added numerically to the new score.
4. The **new immutable snapshot** is appended to the exact readback-verified previous historical snapshot list. The 1,000 newest rows remain in the current public history projection; on reaching 1,000 rows, older rows are **not erased**: they remain in the prior immutable B2 version whose exact key and SHA256 are recorded in the next archive's `lineage` field. Thus the chain contains every prior independently verified history version. The cumulative verified snapshot count is monotonic, and old rows/source-native timestamps cannot be replaced.
5. Only after the complete B2 put, exact independent B2 gzip/SHA readback, D1 promotion and customer-facing readback do the canonical Risk Indices continuation and downstream `gri_read` serve this new snapshot. Missing approvals, stale evidence, B2 quota exhaustion or invalid lineage mean **no new numerical index or artificial timestamp refresh**.

## Invariants

- No old Supabase connection or write in GRI publisher; no prices, x402 policy, wallet, GRO signer, methodology or review authority changes.
- The immutable B2 history is the historical authority, not an expired D1 hot cache or old Supabase GRI database row. The old project cannot be deleted until all **other** required data and Storage bytes are independently preserved, and runtime dependencies are reconciled.
- The public history contains **only derived numerical/proof metadata**, not raw articles, original source URLs or private reviewer payloads.
- A `history.lineage` contract from an already appended prior version must pass its monotonic counters, snapshot identity, archive key/SHA checks. An untrusted/fabricated previous chain fails closed.
- A valid historical archive is not automatically a fresh score; if there are no genuinely qualified new events, keep the last verified score with its truthful original timestamp and stale/last-verified status.

## Verification

Run `bunx vitest run src/__tests__/supabase-free-gri-v12-current-publication.test.ts` (or the normal Product CI). Tests cover old verified predecessor chain, more than 1,000 verified snapshots, SHA linkage, tampering/replay rejection, retained event calculation and no raw public data. A future production publication must supply a genuine approved signed input and pass the existing protected workflow; unit-test success alone is not production acceptance.
