# Risk Indices continuous operation — backend-only acceptance

**Scope:** preserve every published /risk-indices page file byte-for-byte. No user-facing UI, route, SEO, API contract, historical repository, PREDGE, payment, pricing, or /global-risk presentation change.

## Existing topology retained

1. An **independently authorized reviewer** provides genuinely current reviewed GRI source inputs and country/category certificates. The guarded GRI v1.2 publisher validates the original and signs the numerical parent. An internal Ed25519 research triage priority is **not** this certificate.
2. The **existing** GRI → Risk Indices workflow publishes independently verified three-domain numerical indices into canonical D1 + B2 with original native clock. No synthetic scores, old snapshot re-dating or source provenance leakage.
3. The pre-existing Risk Indices Worker serves current readback from D1 first, then validated cache/B2/continuity. The website reads its existing public endpoints and retains its existing 60-minute publication policy.
4. The existing 30-minute backstop checks GRI parent and matching Risk Indices without B2 writes. The new secondary `workflow_run` trigger wakes that **same** backstop after an actual successful signed GRI producer completion. Duplicate and retry bounds stay in place; it dispatches no new score creation.
5. Backstop only treats current indices as a match if **all three** indices are independently available with correct category, GRI lineage, original clock, version, proof hash, 7D/30D history, verified numerical values and exact parent D1/B2 SHA IDs. Invalid/partial/mismatched child requests the **existing guarded** publisher, but only when parent remains valid/current.
6. After the genuine signed parent→indices publisher, `verify-risk-indices-live-continuity.mjs` independently GETs the signed D1 hot product and the public Risk Indices Worker and checks identical payload SHA/parent snapshot, 3 current certified domains, native ≤60-minute clock, proof binding and edge authority. The protected publisher run **fails** if Edge did not actually serve the exact same verified object. No extra B2 GET from the verifier; the public Worker owns its existing quota governor.

## State and limitation

- **READY / RUNNING AUTOMATION** means triggers, guards, dedup, negative path and outside-in proof are deployed, tested and scheduled.
- **CURRENT NUMERICAL RISK INDICES LIVE** means there is a real independently certified current parent and exact Risk Indices D1/Edge readback. It is false if no reviewed input/certificates have been provided.
- Without those genuine externally signed source and country/category artifacts, the system can operate continuously but must display the existing unavailable/loading state rather than fabricate a current GRI. The existing page remains unchanged.
- Do not call `main` merge, PR test success, green scheduled job, or source research scoring independent current index certification.

## No extra recurring resources

The 30-minute cron remains unchanged; secondary wake-up only occurs following a successfully completed governed GRI publisher. No additional D1/B2 per user request, no new cloud service, no Supabase writes and no new PREDGE integration. The downstream extra readback performs two bounded public GETs *only when a genuine signed GRI has already passed all original publication requirements*.

## Required production acceptance

- Backend PR CodeQL, Product CI, offline contract/negative tests, Website Lock all PASS.
- Merged canonical SHA and scheduled no-funds backstop show no unauthorized dispatch when genuine signed parent missing; no false positive from malformed indices.
- Once a real independently certified current GRI parent is available, publication and its post-publish exact D1→Risk Indices Edge acceptance return PASS, with three exact current domain scores and source-native clock.
- Existing public website unchanged, and no hidden private scored material exposed.
- 72h live continuity and source availability are independent launch acceptance goals; passing a no-funds offline test does not assert them.
