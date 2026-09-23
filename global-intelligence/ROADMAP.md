# Build Order

## Phase 0 — Isolation
- branch created from main
- no production integration

## Phase 1 — Country mesh
- lock canonical 195-country registry
- generate 585 cells
- deterministic completeness audit

## Phase 2 — Source mesh
- authoritative sources
- global fallback sources
- specialist sources
- Telegram source registry

## Phase 3 — Ingestion
- source health
- freshness
- retry/recovery
- message/event normalization

## Phase 4 — Verification
- source identity
- cross-source corroboration
- conflict handling
- confidence

## Phase 5 — Intelligence
- event families
- material-update detection
- category engines

## Phase 6 — Router + delivery
- question classification
- multi-category routing
- structured answer
- machine-readable output

## Phase 7 — Certification
- 585-cell runtime audit
- failure injection
- regression tests
- production-readiness report

## Phase 8 — Integration
- only after certification
- isolated merge PR into main
