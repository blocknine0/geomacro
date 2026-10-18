# Material News → GRI v1.2 numerical comparison (verified-only)

The canonical high-impact queue is **selection**, not evidence of numerical severity. Publication requires the existing independent original-source/rights review, signed country/category certificates, a signed current GRI input, and immutable, exact B2 historical readback. A source-free D1 derived news signal **cannot** enter `calculateGri` directly.

## Verified numerical movement — implemented

Once the existing `computeReviewedCurrentGlobalRisk` passes independently pinned signed reviewer inputs, original qualification, B2 historical hash/gzip and canonical GRI v1.2 portable proof, it now computes the new raw index using the **existing** `calculateGri`, compares that numeric score to the previous verified B2 historical snapshot and persists:

- `previous_as_of` — the actual earlier verified original snapshot time;
- `previous_raw_score`, `previous_display_score` — unchanged historical values;
- `change_points` — newly verified v1.2 raw score minus prior verified raw score;
- `change_hash:null`, `change_attribution:null` — because this version of portable proof has no signed previous calculation or event-level attribution. A simple numeric difference is **not** independent causal attribution.

The reviewed private audit includes `VERIFIED_HISTORICAL_RAW_SCORE_DIFFERENCE_ONLY`, exact previous snapshot ID and numerical delta; raw source articles/URLs remain private. The snapshot's `proof_hash` continues to refer only to the canonical current v1.2 computation. This change does not misrepresent a numeric difference as a new proof of the underlying reason for that difference.

## Still required for actual live index change

- A *genuine current* GRI reviewer-signed, multi-source, rights-approved scored input across all three categories, independently certified country/category cells, and the actual B2 historical anchor.
- Protected `GRI v1.2 Supabase-Free Current Promotion` workflow must finish with B2 gzip/SHA verified and D1 public readback; Risk Indices can then be auto-continued from the verified GRI workflow.
- Never turn a single-source material selection queue directly into a risk score, never reuse obsolete signed inputs or extend original timestamps, and never enable payments to conceal a 503.

The automated 72-hour material queue remains private and unscored until the external attestation/scoring requirements are satisfied. Synthetic tests validate arithmetic only, not real signed production updates.
