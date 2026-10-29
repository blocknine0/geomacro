# GeoMacro: one original release -> five-part user/machine newsroom JSON

## Deployment invariant
The existing canonical D1 72-hour source-neutral derived journal is the only free public news event input. A newly admitted, genuine issuer-native-dated release is projected on the next public read at
`GET https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-structured-output`.
There is **no second publisher fetch, LLM call, D1 write, new paid SKU, synthetic article, PREDGE change or raw source redistribution**.

For every native-dated source item, `news_desk` contains:

1. `what_happened.text` = source-bound derived original change.
2. `why_it_matters_analysis.text` = the item's own source-derived potential implication. No independently verified causal claim is inferred.
3. `market_relevance` = topic-labelled **potential research channels** only; confirmed instruments, price effect and direction remain empty/null until separately verified. Not an investment recommendation or live instrument quote.
4. `what_to_watch` = topic and **new original publisher release or independent corroboration** follow-up trigger; no fabricated deadline, schedule or future event.
5. `evidence_confidence` = original exact/day publication precision, publication-page admission, explicit uncorroborated event, non-commercial rights, unscored risk and unverified market impact.

The `geomacro.query-bound-news-desk.v1` answer projector serves the same five dimensions in the already-existing research-only nested `answer.news_desk.stories[]` for supported country, intent and topic questions. It chooses a different direct answer for what/why/trader/follow-up questions, suppresses duplicated source-derived facts and preserves original-date precision. Do not use one observation to fabricate verified 195-country events or a paid GRO.

## Permanent measurable acceptance (not an uptime guarantee)

- Offline unit tests: D1-to-five-part JSON with all three categories, no-news, reference-only, malformed/copy-pasted news, privacy, false payment, fake market direction, fake next event, date-only clocks and query intent.
- The existing no-funds deep live audit checks cached and uncached JSON and canonical continuity. New strict mode `GEOMACRO_REQUIRE_NEWS_DESK=true` checks **every actual native-dated item** for all five segments, source-copy equality, rights, clocks and no-price/no-score boundary.
- GitHub Actions `three-domain-machine-deep-live-audit.yml` runs at four UTC times daily and by manual dispatch, with strict mode. Pull-request audits intentionally inspect older deployed main without strict mode to prevent false deployment-before-merge failures; exact post-deploy strict gate is authoritative.
- The protected D1 deploy workflow builds, runs no-funds tests, deploys from canonical main and **rejects actual HTTP 200** if any present native-dated item has an invalid five-part projection. It cannot turn source 503 or stale data into success.
- After a quiet release window, zero native news is an accurate observation and the API must preserve the empty category/dated historical references. A green 0-news readback is **not** a demonstrated live 1-event news product. Require a positive native release when claiming a live story was processed.
- Article commercial rights, independent same-event review, signed risk objects, mainnet settlement, payer receipt, delivery replay and revenue remain separate mandatory commercial gates. Do not treat free newsroom JSON as authorization for payment.

## Operator checks
Open the workflow's latest scheduled/manual run receipt:
`https://github.com/blocknine0/geomacro/actions/workflows/three-domain-machine-deep-live-audit.yml`.
Also verify the post-merge, main-branch `Deploy D1 Control Plane` run (not just PR offline tests).
If the deploy job is blocked by existing Cloudflare credentials, D1 quota, environment approval or scheduler timing, report the exact blocker, leave the previous deployment in place and never weaken a source/rights gate. GitHub free schedules are best effort, not a contracted 24/7 SLA.
