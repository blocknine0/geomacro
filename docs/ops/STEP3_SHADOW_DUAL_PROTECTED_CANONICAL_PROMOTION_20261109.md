# Step3 protected dual isolated Shadow Worker canonical promotion and rollback (2026-11-09)

## Prior physical proof

- [Run #42581997285](https://github.com/blocknine0/geomacro/actions/runs/42581997285) physically proved the two *unpromoted* canonical Shadow versions serve Worker-native JSON 404/401/400 using an isolated Shadow bearer.
- Canonical source SHA: `593a3c8b96f8a59005bee96ac76df57f07484e1e`.
- Modern verified candidate: `1a49e55d-7c82-42b6-9f30-250423d9732c`. Old deployed: `48680b70-c41c-4af9-9e70-497213471dbb`.
- Legacy verified candidate: `f72738eb-40ff-4e48-ba67-1d5c004a989d`. Old deployed: `73437c7b-83b2-44df-bbc5-87be1df25a9b`.
- Both candidates have Shadow-only D1 binding `c4add153-229d-412a-b1bd-489526b7e02f` and inherited secret/R2 parity. Production D1 is distinct: `db057ca9-9f6e-4957-ac28-144f3b798f9b`.
- Existing live Worker hostnames still returned `404 text/plain` because their old `shadow-entry.js` versions are deployed at 100%. Candidate acceptance did **not** promote traffic.

## Narrow, explicitly authorized mutation

The protected `step3-shadow-canonical-protected-promote.yml` workflow runs only under an **explicit manual input** `PROMOTE_TWO_PINNED_CANONICAL_SHADOW_VERSIONS_ONLY` on the exact current merged `main` commit. Required flags and safety holds remain in place.

The only permitted provider mutation is:
`POST /accounts/fddd57d28199bad07a768445e7237693/workers/scripts/{geomacro-step3-shadow|geomacro-step3-shadow-legacy}/deployments`
with `strategy: percentage`, an **exact pinned version UUID**, and percentage 100. This is supported by [Cloudflare's deployments API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/).

1. Verify exact account and distinct Shadow/production D1 names/UUIDs. Check both original versions are *still* 100% deployed, both target immutable versions retain their pinned source SHA, Shadow D1, bearer secret binding and modern private R2 bucket. Check exact Cloudflare Version URL (never guess a hostname) and real immutable candidate JSON 404/401/400 again **before the first POST**.
2. Immediately before each deployment, verify exact `main` has not moved and the old deployed version remains the pinned previous version.
3. Promote only modern Shadow canonical version to 100%, provider readback, then run up to **five bounded no-D1 probe attempts** (2-second gaps for edge propagation) to verify **ordinary** `geomacro-step3-shadow.daspallab202391.workers.dev` JSON 404 (retired public), JSON 401 (invalid bearer), JSON 400 (intentionally invalid query with Shadow-only valid bearer); no D1 reads needed.
4. Promote legacy Shadow version with equivalent provider and ordinary-host acceptance.
5. Before claiming overall PASS, independently read back both Shadow deployments again at the exact canonical version IDs and verify the GitHub `main` SHA is still pinned. On any failure after a deployment attempt (including uncertain HTTP acknowledgment), query the current provider deployment; rollback only scripts whose active version is the **exact pinned new version**. Restore the original pinned version at 100% and read it back. If Cloudflare reports any unexpected/unknown active version, never clobber concurrent changes; explicitly HOLD with `manual_review_required`. Successful automatic rollback **still results in HOLD**, not fabricated PASS.
6. Write redacted `artifacts/release/step3-shadow-dual-promotion-live-acceptance.json`. The receipt records exact worker names and IDs, JSON error categories, D1 write/R2 write zero, canary HOLD intact, and explicit recovery results. Never stores the bearer or API token.

Neither production Worker nor production D1 is targeted. No D1 SQL, B2/R2 writes, secret editing, payment, Predge contract change, signed Risk Index certification, or canary hold removal is part of this step.

**Crucial release boundary:** Even if both Shadow Worker hostnames pass, Stage1 physical B2 original SHA256 readback, Shadow D1 archive ACK/HMAC pointer, encrypted R2 recovery checkpoint, actual D1 monthly quota headroom, reviewed migrations and independent signing acceptance remain distinct requirements before any *production* migration or protected production canary.

## WSL after reviewed merge and CI

```bash
gh workflow run step3-shadow-canonical-protected-promote.yml \
 -R blocknine0/geomacro --ref main \
 -f approval=PROMOTE_TWO_PINNED_CANONICAL_SHADOW_VERSIONS_ONLY
gh run list -R blocknine0/geomacro \
 --workflow=step3-shadow-canonical-protected-promote.yml --limit 1
```

This promotes only the two explicitly approved isolated Shadow scripts; read the resulting physical receipt before proceeding with the existing genuine B2 archive ACK and migration workflows.
