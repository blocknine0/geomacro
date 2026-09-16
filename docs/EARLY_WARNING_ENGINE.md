# Geomacro Early Warning Engine

Status: PRELAUNCH FOUNDATION

The Early Warning Engine turns verified geopolitical and macro developments into timestamped, explainable structural-risk signals for people, software and agents. It is not a stock-price prediction engine and does not issue buy/sell instructions.

## Commercial objective

The first commercial objective is to deliver useful, low-cost structured intelligence without requiring paid market-data feeds. A user should be able to learn:

- what changed;
- which country is affected;
- when Geomacro first saw and structured the signal;
- the affected country's local time plus canonical UTC;
- why the signal matters;
- how severe and fast-moving it is;
- which structural transmission channels may carry the shock;
- which broad asset classes may be relevant;
- how confident the evidence is;
- which methodology version produced the score.

## CEWS v0.1

`cews-v0.1.0-provisional` is a deterministic, auditable starting methodology. It is explicitly **not calibrated yet**. Thresholds and weights must be validated by historical replay before any measured predictive-performance claim is made.

Inputs are normalized from 0 to 100:

| Component | Weight |
| --- | ---: |
| Novelty | 10% |
| Severity | 20% |
| Escalation velocity | 15% |
| Structural vulnerability | 15% |
| Transmission potential | 15% |
| Evidence confidence | 10% |
| Source reliability | 10% |
| Recency | 5% |

Provisional states:

| Score | State |
| --- | --- |
| 0 to <30 | NORMAL |
| 30 to <50 | WATCH |
| 50 to <65 | ELEVATED |
| 65 to <80 | WARNING |
| 80 to 100 | CRITICAL |

Every result includes the per-component weighted contribution so the final score can be reproduced exactly.

## Timestamp contract

Every alert stores:

- `first_source_seen_at_utc` when available;
- `detected_at_utc` as the canonical machine timestamp;
- `country_timezone` using an IANA timezone identifier;
- `detected_at_local` as the affected-country local timestamp;
- `published_at_utc` when the alert is externally published.

Countries with multiple timezones require event-location or policy-location resolution upstream. A national central-bank/government event should use the relevant institution location timezone rather than an invented single national timezone.

## Audit contract

The canonical alert stores:

- schema and methodology versions;
- CEWS inputs;
- weighted contributions;
- CEWS score and state;
- evidence count and official-source presence;
- bounded evidence references;
- transmission channels;
- broad market-relevance labels;
- evidence hash;
- calculation hash;
- optional source Risk Object and source event IDs.

After publication, the signal core is protected from mutation. Later outcomes are attached separately so a past warning cannot be rewritten to look successful after the fact.

## Outcome verification

A later validator may append:

- `MATERIAL_EVENT_CONFIRMED`;
- `NO_MATERIAL_EVENT`;
- `INVALIDATED`;
- observation timestamp;
- outcome evidence;
- lead time in seconds.

This is the basis for future public proof metrics such as median warning lead time, precision, recall and false-alert rate. No such performance number should be published until historical replay and live evidence support it.

## Public distribution gate

A signal is public-distribution eligible only when the versioned policy allows it. The current v1 policy requires:

- public visibility;
- WARNING or CRITICAL state;
- confidence >= 0.70;
- official confirmation or at least two independent evidence items.

Eligibility does not mean live publishing is enabled. `config/auto-distribution.json` remains fail-closed with `live_publish_enabled=false` during prelaunch.

## Storage

Migration `937_early_warning_alert_ledger.sql` adds:

- `early_warning_alerts` for canonical signals and later outcome evidence;
- `early_warning_distribution_receipts` for per-channel durable idempotency and delivery status.

Both tables are service-role only. Public and paid APIs should expose bounded response contracts instead of direct table access.

## Next implementation stages

1. source-rights-approved near-live official source watchers;
2. event-family normalization;
3. structural-vulnerability inputs from existing country data;
4. transmission mapping;
5. historical replay from 2020 onward;
6. calibration of CEWS weights and thresholds;
7. durable distributor integration with delivery receipts;
8. public proof dashboard;
9. low-price trader/API products;
10. later paid market-data impact modelling only after the structural engine proves useful.
