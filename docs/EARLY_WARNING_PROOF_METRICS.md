# Geomacro Early Warning Proof Metrics

Status: PRELAUNCH RESEARCH / EVIDENCE CONTRACT

This layer defines how Geomacro may later measure and publish Early Warning performance. It exists to prevent attractive but statistically invalid claims from being generated from an alerts-only ledger.

## Two evidence scopes

### Resolved alert ledger

The live Early Warning ledger can measure only what happened to alerts that were actually issued and later resolved.

From that dataset Geomacro may compute, once sufficient evidence exists:

- resolved alert count;
- confirmed material-event count;
- no-material-event count;
- confirmation share;
- false-alert share;
- confirmed-event lead-time distribution.

It must not claim recall from this dataset because missed material events are not represented.

The implementation labels this scope:

`RESOLVED_ALERTS_ONLY_NOT_RECALL`

### Labeled replay universe

Precision and recall require a broader evaluation universe containing both periods/events where an alert was issued and periods/events where no alert was issued.

Every labeled replay sample records:

- sample identity;
- country;
- event family;
- whether WARNING/CRITICAL was issued;
- detection time when an alert exists;
- independently labeled material-event / no-material-event / invalidated outcome;
- material-event observation time when applicable.

This allows an explicit confusion matrix:

- true positive: alert + material event;
- false positive: alert + no material event;
- false negative: no alert + material event;
- true negative: no alert + no material event.

Only this scope can support recall or false-positive-rate claims.

## Lead time

For a true positive, lead time is:

`material event observed time - Geomacro detection time`

The proof core reports median, p25, p75, minimum and maximum lead time for confirmed alerts.

A material-event timestamp earlier than the Geomacro detection timestamp is rejected as an invalid proof sample rather than converted into a negative lead time.

## Invalidated samples

`INVALIDATED` means the replay label, evidence set or sample construction is not trustworthy enough to use in performance denominators. Invalidated samples are counted separately and excluded from TP/FP/FN/TN metrics.

Invalidation must not be used to remove an inconvenient valid false positive or missed event.

## Public proof gate

A metric calculation is not automatically a public marketing claim.

The default publication-readiness contract requires all of the following:

- methodology is explicitly marked calibrated;
- at least 100 resolved replay samples;
- at least 30 material events;
- at least 5 countries;
- the evaluation universe demonstrates at least one missed-event path, rather than containing alerts only;
- the evaluation universe contains control/no-alert periods.

These are conservative initial engineering minimums, not a claim that 100 samples are sufficient for every use case. Final production thresholds should be adjusted based on event-family heterogeneity, country coverage and statistical review.

Current `cews-v0.1.0-provisional` is not calibrated, so current Early Warning proof metrics are not eligible for public predictive-performance claims.

## What may be shown before calibration

Before the calibrated proof gate passes, Geomacro may show factual operational evidence such as:

- source/feed retrieval timestamps;
- number of observations processed;
- alert ledger timestamps;
- source-to-detection latency for a specific alert;
- individual historical case studies that are clearly labeled as examples rather than aggregate performance evidence.

It should not publish aggregate statements such as:

- "82% accurate";
- "80% recall";
- "predicts crashes before markets";
- "median 4-hour warning";

unless the relevant labeled evaluation set and publication gate support the exact statement.

## Relationship to trader and institutional products

This proof layer is shared across trader, API, business and agent products. It does not make trading recommendations and does not calculate asset-price returns.

Its job is narrower: prove whether Geomacro structural warnings were issued, whether independently defined material events later occurred, how many material events were missed, how many warnings did not lead to a material event, and how much lead time existed in confirmed cases.

That evidence is what can later support credible product marketing and customer diligence.
