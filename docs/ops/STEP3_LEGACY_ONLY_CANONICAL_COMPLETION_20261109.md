# Step3 2026-11-09: complete ONLY Legacy Shadow after independent Modern canonical live PASS

## Evidence: do not rollback the healthy Modern Worker

[Run #42583282859](https://github.com/blocknine0/geomacro/actions/runs/42583282859) attempted Modern canonical deployment and immediately failed its version readback. Rollback could not be independently verified. The accompanying receipt correctly failed/HOLD.

However, an independent two-read incident audit [run #42584512855](https://github.com/blocknine0/geomacro/actions/runs/42584512855) **physically proved**:

- **Modern** `geomacro-step3-shadow` now serves **100%** canonical version `1a49e55d-7c82-42b6-9f30-250423d9732c`. Its ordinary `workers.dev` hostname returns native JSON 404 `NOT_FOUND`, JSON 401 `UNAUTHORIZED` and authenticated JSON 400 `P0B_STATUS_QUERY_INVALID`.
- **Legacy** `geomacro-step3-shadow-legacy` remains **100%** old version `73437c7b-83b2-44df-bbc5-87be1df25a9b`; ordinary hostname still returns non-JSON HTTP 404.
- The **unpromoted verified Legacy** immutable canonical version is `f72738eb-40ff-4e48-ba67-1d5c004a989d`. Its immutable Version URL already returned JSON 404/401/400 with inherited isolated bearer in [run #42581997285](https://github.com/blocknine0/geomacro/actions/runs/42581997285).
- Both isolated Shadow D1 bindings were verified. No production Worker, D1, payment, Predge or protected canary mutation is part of the incident diagnosis.

**Do not rerun the old two-Worker promotion workflow**: its preflight expects Modern still on the old version. Restoring Modern would be an unnecessary regression.

## Narrow recovery scope and exact manual approval

`step3-legacy-only-canonical-completion.yml` must be manually dispatched on reviewed merged `main` with:

`PROMOTE_ONLY_VERIFIED_LEGACY_SHADOW_AFTER_MODERN_PROOF`

Before any provider POST, it rechecks exact current main, protected canary HOLD, Cloudflare account and separate Shadow D1. Modern must still be 100% on its known canonical version and pass all three live JSON 404/401/400 probes. Legacy must still be 100% on known old version and the **provider-returned immutable URL** for the pinned canonical Legacy target must pass JSON 404/401/400. Candidate source SHA `593a3c8b96f8a59005bee96ac76df57f07484e1e` and Shadow bindings must be intact.

**The only permitted provider write** is one:
`POST /accounts/fddd57d28199bad07a768445e7237693/workers/scripts/geomacro-step3-shadow-legacy/deployments`
with exactly `{strategy:"percentage",versions:[{version_id:"f72738eb-40ff-4e48-ba67-1d5c004a989d",percentage:100}]}`.

No modern Worker POST, rollback to a guessed version, secret update, source upload, D1 SQL, R2/B2 action, queue, payment or canary hold removal.

## Eventual-consistency handling

The earlier deployment provider accepted a POST but an immediate GET could not verify the correct live version, despite a later independent 100% readback and successful JSON HTTP probes. The new workflow uses **bounded GET-only polling** (up to 10 observations separated by 2 seconds) to see Legacy reach the exact canonical version while Modern remains pinned. It then probes the ordinary Legacy hostname for JSON 404/401/400 with bounded edge-propagation retry and ends with final independent modern/legacy deployment GET and real Modern authentication guard.

If the provider returns an unknown version, the POST is denied, or the target is still not observed, the receipt reports HOLD / manual reconciliation. It **does not automatically issue a second POST or rollback based on ambiguous readback**. No unverified state is labeled PASS.

## Further gates remain

A fully verified dual-Shadow HTTP recovery is only the ingress prerequisite. Original B2 byte PUT+two GET/SHA-256, Shadow D1 ACK/HMAC pointer, private encrypted recovery checkpoint, D1 quota/headroom, protected production migrations, signed evidence and production canary still require independent physical proofs. Predge research-feed continuity and crypto payment readiness are separate and untouched.

After reviewed PR merge + required CI PASS:

```bash
gh workflow run step3-legacy-only-canonical-completion.yml \
 -R blocknine0/geomacro --ref main \
 -f approval=PROMOTE_ONLY_VERIFIED_LEGACY_SHADOW_AFTER_MODERN_PROOF

gh run list -R blocknine0/geomacro \
 --workflow=step3-legacy-only-canonical-completion.yml --limit 1
```
