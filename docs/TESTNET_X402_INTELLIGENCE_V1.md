# Geomacro x402 Testnet Intelligence v1

Status: implementation contract for testnet acceptance.

## Product boundary

Geomacro never delivers raw source data through the paid public interface. Raw provider payloads, scraped article bodies, unpublished source documents, private source URLs, provider credentials, internal prompts, and internal ingestion records remain server-side only.

The public product is structured, derived, machine-readable intelligence.

## Supported domains

Testnet v1 exposes three commercial intelligence domains:

1. geopolitics
2. macroeconomics
3. critical minerals / rare earths

The canonical paid route is `POST /api/x402/intelligence`. The request planner maps questions and explicit topics to governed internal modules, including `conflict_geopolitics`, `sanctions_restrictions`, `macro_risk`, `fx_external_risk`, and `critical_minerals`.

## Testnet payment contract

The paid route must preserve x402 v2 semantics:

- an otherwise deliverable unpaid request returns HTTP `402`;
- the response includes `PAYMENT-REQUIRED`;
- payment is accepted only after no-charge deliverability checks pass;
- the paid retry must be bound to the exact planned query;
- replay/conflict/idempotency controls remain active;
- the returned object always preserves `execution_authorized=false`.

Testnet pricing is technical acceptance pricing and is not production pricing.

## External response contract

Paid responses may include only structured/derived fields such as normalized subjects, domain/topic classification, risk scores, confidence, derived summaries, drivers, impacts, freshness metadata, evidence/provenance summaries, integrity/signature metadata, payment receipts, and explicit limitations.

## Raw-data non-delivery invariant

Public paid responses must not contain raw-content fields or equivalent payloads, including `raw_payload`, `raw_data`, `raw_body`, `article_body`, `article_text`, `full_text`, `provider_payload`, `source_payload`, `scraped_html`, `html_body`, `internal_prompt`, `system_prompt`, provider credentials, private keys, or seed phrases.

Source identity or provenance metadata may be exposed only where allowed by the source-rights contract; the underlying raw content is never part of the paid resource.

## No-charge fail-closed rule

If required intelligence cannot be proven fresh enough, verified enough, and commercially deliverable, Geomacro must not request payment. The endpoint must return a structured non-chargeable failure state instead.

## Testnet v1 acceptance

Testnet v1 is accepted only when automated evidence proves: valid unpaid request -> `402` + `PAYMENT-REQUIRED`; valid paid retry -> `200`; invalid/mismatched/replayed payment blocked; exact completed delivery safely idempotent; malformed/unavailable/stale/ineligible requests are not charged; rate limiting is intentional; no forbidden raw-data keys are present; `execution_authorized=false`; and resilience runs have no unexpected `5xx`, timeout, or network failures.

Mainnet readiness is a separate backend workstream and does not relax this testnet contract.
