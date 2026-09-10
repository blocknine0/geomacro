# Geomacro Commercial Operations & Proof Dashboard

Status: internal commercial observability contract.

## Purpose

This is Geomacro's centralized owner-only operational ledger and dashboard for answering, with evidence:

- who or what is consuming Geomacro data;
- which commercial offer/tier/capability is being used;
- which country/corridor/query subject is being requested;
- how many credits are charged and remain;
- whether the request succeeded, failed or replayed idempotently;
- how much structured information was delivered;
- which payment rail/provider/network was used;
- amount, currency/asset, fees, settlement state and reconciliation state;
- whether an activity is Testnet proof or eligible commercial Mainnet/fiat activity;
- whether a payment is actually classified as commercial revenue;
- whether a Risk Object/Risk Gate response was delivered;
- immutable response/proof hashes for verification.

The owner dashboard is available at `/internal/commercial-ops` after deployment. It requires `COMMERCIAL_OPS_ADMIN_TOKEN` and does not store that token in browser localStorage, cookies or the URL.

## Public proof mode

The owner can deliberately publish a redacted immutable aggregate snapshot. A published snapshot receives a random URL under:

`/proof/commercial/<proof-slug>`

The public proof page includes a SHA-256 integrity hash and share actions for X, LinkedIn, Reddit, WhatsApp and Telegram.

Public proof never directly queries or exposes internal ledger rows. It reads only a stored redacted snapshot.

## Permanent privacy boundaries

Neither the internal operations payload nor the public proof payload contains:

- API keys or secrets;
- wallet private keys/seed phrases;
- IP addresses;
- raw request bodies;
- raw third-party payloads;
- upstream news publisher/source names;
- upstream news source IDs;
- upstream news source URLs.

Customer identity is available internally only through Geomacro principal IDs where needed for operations. Public proof snapshots aggregate those records and do not disclose customer identity.

## Testnet vs Mainnet/revenue rule

`environment=testnet` is permanently constrained to:

- `commercial_revenue=false`
- `revenue_classification=testnet_non_revenue`

Therefore Testnet transactions can be shown as technical proof without being presented as revenue.

Mainnet or fiat activity does not automatically become revenue. It is counted as commercial revenue only when `commercial_revenue=true` and the payment event has the appropriate revenue classification after provider/accounting reconciliation.

## Table: `commercial_payment_events`

Every payment lifecycle/settlement record can contain:

| Column | Meaning |
| --- | --- |
| `id` | Internal immutable UUID. |
| `occurred_at` | Business/payment event time. |
| `recorded_at` | Time Geomacro persisted the evidence. |
| `environment` | `testnet`, `mainnet`, `fiat`, `sandbox`, or `internal`. |
| `network_family` | `evm`, `fiat`, `offchain`, or `other`. |
| `network_name` | Human-readable payment/network name. |
| `chain_id` | Chain/network ID when applicable. |
| `provider` | Payment adapter/provider identifier. |
| `provider_environment` | Provider environment such as test/sandbox/live. |
| `payment_method` | x402, card, bank, invoice, stablecoin, etc. |
| `payment_status` | Created through settled/failed/refunded/disputed lifecycle. |
| `revenue_classification` | Explicit accounting/product classification. |
| `provider_order_id` | Provider order reference. |
| `provider_payment_id` | Provider payment reference. |
| `provider_settlement_id` | Provider settlement reference. |
| `invoice_id` | Geomacro/provider invoice reference. |
| `idempotency_key` | Payment idempotency reference, never a secret. |
| `principal_id` | Internal customer/machine principal UUID. |
| `entitlement_grant_id` | Entitlement created/affected by payment. |
| `offer_id` | Canonical Geomacro commercial offer. |
| `tier` | Resolved commercial tier. |
| `asset_symbol` | USDC or other permitted settlement asset. |
| `asset_contract` | Token contract when relevant. |
| `amount_atomic` | Exact onchain atomic-unit amount. |
| `amount_decimal` | Human-readable asset quantity. |
| `invoice_currency` | Customer invoice currency. |
| `invoice_amount` | Invoice amount. |
| `settlement_currency` | Currency received/settled. |
| `settlement_amount` | Settlement amount. |
| `fee_currency` | Currency used for recorded fees. |
| `provider_fee_amount` | Payment-provider fee. |
| `geomacro_fee_amount` | Geomacro product/protocol fee when applicable. |
| `payer_reference_hash` | SHA-256 pseudonymous payer reference, never raw payer identity. |
| `recipient_reference_hash` | SHA-256 pseudonymous recipient reference. |
| `tx_hash` | Onchain transaction hash only when it is actually a transaction hash. |
| `block_number` | Confirmed block number where applicable. |
| `confirmations` | Observed confirmations. |
| `requested_at` | Payment requested time. |
| `authorized_at` | Authorization time. |
| `settled_at` | Settlement time. |
| `failed_at` | Failure time. |
| `refunded_at` | Refund time. |
| `disputed_at` | Dispute time. |
| `failure_code` | Stable machine-readable failure reason. |
| `reconciliation_status` | Pending/matched/mismatch/manual review/not applicable. |
| `reconciliation_reference` | Internal reconciliation batch/reference. |
| `commercial_revenue` | Explicit Boolean. Never true for Testnet. |
| `metadata` | Bounded provider/product metadata with no secrets or upstream news-source identity. |

## Table: `commercial_usage_events`

Every tracked structured-data/product request can contain:

| Column | Meaning |
| --- | --- |
| `id` | Internal immutable UUID. |
| `occurred_at` | Request/delivery time. |
| `recorded_at` | Persistence time. |
| `environment` | Testnet/Mainnet/fiat/sandbox/internal operational context. |
| `access_surface` | Public web, free API, paid dashboard, commercial API, agent payment, institutional integration or technical proof. |
| `principal_id` | Internal customer/machine principal. |
| `principal_type` | API client, agent, organization, wallet, etc. |
| `entitlement_grant_id` | Exact grant used. |
| `payment_event_id` | Payment event linked to this delivery where applicable. |
| `offer_id` | Canonical offer. |
| `tier` | Resolved tier. |
| `registry_version` | Structured Data Entitlement Registry version. |
| `contract_version` | Commercial credit/access contract version. |
| `request_id` | Caller/Geomacro idempotent request reference. |
| `delivery_id` | Delivery instance ID. |
| `capability` | Exact Geomacro product capability consumed. |
| `subject_type` | Country, corridor, global, query, etc. |
| `subject_key` | Normalized subject such as `IND` or `USA>CHN`. |
| `credits_charged` | Credits debited for this request. |
| `credits_remaining` | Remaining account credits after fulfillment. |
| `idempotent_replay` | Whether this was an exact non-double-charge replay. |
| `http_status` | API response status. |
| `latency_ms` | End-to-end application latency where measured. |
| `success` | Fulfillment success/failure. |
| `failure_code` | Stable failure reason. |
| `response_sha256` | Hash of delivered structured response/data. |
| `response_bytes` | Response size where measured. |
| `structural_observation_count` | Number of structural observations delivered. |
| `evidence_reference_count` | Number of evidence references delivered, without publisher/source identity. |
| `independent_evidence_count` | Independent evidence count. |
| `history_item_count` | Historical items delivered. |
| `risk_object_id` | Risk Object ID where applicable. |
| `risk_object_version` | Risk Object schema/version. |
| `risk_object_signed` | Whether output included a valid signed Risk Object. |
| `risk_gate_included` | Whether Risk Gate output was included. |
| `risk_gate_decision` | Risk Gate recommendation/decision code. |
| `execution_authorized` | Permanently false. Database constraint enforces it. |
| `shareable` | Internal eligibility flag for aggregate proof inclusion. |
| `metadata` | Bounded operational metadata, no secrets/raw requests/upstream source identity. |

## Table: `commercial_proof_snapshots`

| Column | Meaning |
| --- | --- |
| `id` | Internal proof UUID. |
| `slug` | Random public proof URL slug. |
| `title` | Public proof title. |
| `description` | Public explanation. |
| `period_started_at` | Evidence window start. |
| `period_ends_at` | Evidence window end. |
| `environment_scope` | Environments intentionally included. |
| `created_at` | Creation time. |
| `published_at` | Publication time. |
| `expires_at` | Optional public expiration. |
| `revoked_at` | Revocation time. |
| `status` | Draft/published/expired/revoked. |
| `proof_version` | Proof schema version. |
| `redaction_version` | Public redaction policy version. |
| `payload` | Frozen aggregate proof payload. |
| `payload_sha256` | Deterministic integrity hash of payload. |
| `created_by` | Internal creation authority identifier. |

## Owner dashboard sections

The first dashboard version contains:

1. headline activity metrics;
2. recent data usage table with every selected operational column;
3. recent payment/settlement table with every selected payment column;
4. daily usage rollup;
5. daily payment rollup;
6. controlled `Publish proof snapshot` action.

The raw internal database remains service-role-only. The browser dashboard accesses it only through a server endpoint protected by `COMMERCIAL_OPS_ADMIN_TOKEN`.

## Shareable proof caveat

A public proof page demonstrates activity recorded by Geomacro and verifies that the published snapshot has not changed since hashing. It is not a third-party financial audit, accounting attestation or certification. Onchain tx hashes may independently strengthen a Mainnet/Testnet proof when they exist, but provider settlement references must not be mislabeled as transaction hashes.
