# Phase 2 GRI signed-hot source handoff — executable admission

The historical website row in D1 was actually recorded before
2026-10-19T04:45Z. The completed [GRI Pinned Historical Version Recovery
run 39201050197](https://github.com/blocknine0/geomacro/actions/runs/39201050197)
found `PINNED_HISTORICAL_D1_ROW_PRESENT_NO_B2_REPLAY`. It made **zero B2
requests** and did **not** freshly re-read the old immutable B2 version.

**Independent requirements:** A single old website historical row is not
the immutable `geomacro.public-global-risk-history.v1` archive containing
>=2 independently verified scored snapshots required by the canonical GRI
scorer. Even two existing D1 metadata rows cannot prove actual B2 gzip
bytes, exact immutable SHA, reviewed rights or approved signatures.

The protected production `GRI Pinned Historical Version Recovery` workflow
now runs a second parallel **metadata-only Phase2 admission**:
- Exact main and authenticated remote D1, one bounded SELECT for up to 8
  prior website historical row *metadata*, never `payload_json`.
- Exposes only the count of distinct original-dated candidate snapshots and
  whether metadata conflicts exist; does not publish hashes or articles.
- Reports the three repository SHA/approval *hints* through the existing
  signed-ready admission logic; no self-certification and no reviewer key.
- Issues a separate, actionable next phase when 2 original historical
  candidates or real independently signed GRI pointers are absent.
- Never calls B2, uses a wallet, refreshes a source clock or changes any D1
  hot products; it does not replace the existing nightly bounded historical
  file version recovery or publisher.

If a real independently externally approved signed pair is supplied by its
authorized issuer, the existing 15m backstop continues to trigger the
protected canonical GRI publisher. It independently re-verifies source
evidence and rights, canonical scoring, country certificates, immutable
B2 history and exact public D1 readback, then Risk Indices on success.

Neither a D1 snapshot count nor a successful GitHub workflow is a commercial
acceptance. Zero Supabase and zero real payments until founder authorization.
