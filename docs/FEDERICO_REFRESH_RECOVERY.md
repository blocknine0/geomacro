# Federico evidence refresh recovery

Run `36133123433` completed ingestion and signing, but corroboration returned four
unverified candidates and zero evidence edges. The publisher then persisted an
`UNREADY` object with no evidence; the workflow rejected it only afterwards.

The country corroboration queue previously excluded unverified records after
90 minutes, although strict evidence can remain eligible for six hours. Re-polling
an unchanged RSS entry does not renew its original ingestion time, so another
workflow attempt could not recover those records. The publisher also capped the
global verified-flash query before resolving the requested country.

The recovery path now:

- Reconsiders the bounded six-hour country corpus, including unverified peers,
  in batches of at most 120 candidates, with an explicit continuation cursor.
- Refreshes OIDC credentials per batch and refuses a truncated corpus or an old
  endpoint that does not return traversal metadata.
- Filters the publisher query by country before its row cap and detects truncation.
- Checks strict readiness before signing or persisting. A preview remains unsigned
  and read-only. `DEGRADED` is accepted only for the disclosed uncalibrated interval;
  missing evidence, missing independent sources and high-impact failures still block.
- Saves sanitized corroboration/readiness diagnostics when the pre-publication
  steps fail.

This changes queue coverage and publication ordering, not risk scoring or evidence
acceptance thresholds. The six-hour evidence limit, three-hour high-impact limit,
source restrictions, similarity thresholds, signature verification and partner
admission requirements remain in force. No structured fallback is enabled.

## Running the corrected workflow

1. Merge the fix into `main` and wait for **Deploy country flash intelligence to
   Supabase** to finish successfully. It deploys the updated endpoint and its helper.
2. Start a **new** manual **Federico Continuous Testnet Risk Object Refresh** run
   on `main`. Re-running the historical failed job checks out its historical SHA
   and does not test this fix.
3. If readiness is blocked, inspect `federico-evidence-diagnostics-<run>-<attempt>`.
   Successful RSS transport and successful corroboration execution do not guarantee
   sufficient independent, fresh evidence. A genuine evidence gap must remain
   blocked; do not renew timestamps, lower thresholds or publish a carried-forward
   score to make the workflow green.

Regression coverage lives in `federico-country-window.test.ts` and
`federico-publication-safety.test.ts` and runs in the existing launch-readiness CI.
