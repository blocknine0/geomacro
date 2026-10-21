# Private scoring recovery

The existing `Restricted Private Current Scoring Staging` workflow uses the
canonical classifier without constructing a Supabase data-plane client when
`--private-scored-stage` is selected. Its existing D1 source-fingerprint claim,
bounded retries and B2 quota gates remain in place.

## Provider startup

Any configured provider in `CLASSIFIER_PROVIDER_ORDER` can satisfy startup:
Groq, Gemini, Mistral or Cerebras. An absent Groq key does not construct the
Groq SDK client or block a configured alternative. No configured provider is a
hard failure before source claims or classifier calls. This change does not
establish that any production provider key is valid or has available quota.

The unchanged canonical prompt is importable from
`scripts/lib/canonical-risk-classification-prompt.mjs` without loading the
ingester, database clients, credentials or network side effects. Its exact
pre-extraction bytes are covered by a fixed hash test; this is not a new
scoring methodology or a reviewed score.

## Clock separation

New private stage rows carry:

| Field | Meaning |
| --- | --- |
| `published_at` | Original publisher publication time |
| `first_observed_at` | Preserved discovery observation, or scoring time if no earlier observation is known |
| `classification_scored_at` | Actual time the classifier result was staged |
| `observed_at` | Deprecated v1 alias of publication time, retained for immutable archive compatibility |

The order is publication ≤ observation ≤ scoring. Companion records bind all
three clocks. Review preparation uses the original publication time for the
90-minute/6-hour source windows and records `verification_checked_at`
separately. Rechecking or repacking a record does not rewrite its source,
observation or scoring clock. Existing v1 archives without the new fields stay
readable without inventing historical observation or scoring times.

## Remaining commercial admission

These changes recover private scoring preparation only. A staged model score
does not establish same-event corroboration, commercial source rights, country
certificates, signed independent review, or a current canonical hot product.
The three existing hot publishers must still admit genuine qualified inputs,
verify the exact B2 gzip readback, and promote the matching D1 snapshot.
Deep health and payment readiness must continue to report failure until those
checks actually pass. LOW source-byte receipts cannot substitute for Facts,
Rights or canonical GRI review signatures.
