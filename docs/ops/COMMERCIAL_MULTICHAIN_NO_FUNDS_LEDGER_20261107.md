# GeoMacro: Base + Polygon multichain proof ledger — NO FUNDS

## Production baseline, 2026-11-07 (read-only verified)

Live Supabase project `geomacro-risk-corridor-7d` has commercial private
`geomacro` schema. Independent read-only SQL queries established:

- `geomacro.x402_intents`: **0** rows.
- `geomacro.web3_txs`: **0** rows.
- `geomacro.usage_logs`: **0** rows.
- `geomacro.web3_txs.chain_id` is constrained to **8453**.
- Current `x402_prepare` and `x402_confirm` remain Base-only and are not
  allowed to handle Polygon receipts.

This zero-row readback **does not** prove all historical operational data
absence, and none of the financial functions has been invoked.

## Additive sidecar schema

`services/commercial-api/sql/multichain-no-funds.sql` creates the **private**
`geomacro.x402_chain_no_funds_proofs` relation without changing existing
Base ledger, quotas, funding, receipt history, or active payment routes.

Each record is permanently tied to:
- a globally unique `request_id`;
- exact network+native-USDC token+facilitator tuple:
  - Base `eip155:8453`, native USDC, `xpay`;
  - Polygon `eip155:137`, native USDC, `dexter`;
- pinned owner-approved recipient, payer and per-chain EIP3009 nonce;
- unchanged GeoMacro $0.10/$0.15/$0.25 tariff;
- source-evidence receipt, quote and canonical delivery **SHA256 references**;
- quote expiry between issue time and maximum three hours;
- permanent `NO_FUNDS_ONLY` state.

It stores no signature, untrusted payment payload, raw third-party material,
wallet secret, transaction, or settlement proof. These hashes are integrity
references, **not third-party truth/copyright/licensing or full GRO proof**.

The relation has RLS enabled, **no grants to `anon`, `authenticated`,
`service_role` or `geomacro_billing`**, and an immutable trigger forbids
UPDATE/DELETE. **There is no function to charge, settle, confirm, refund,
or post a successful usage record.** Do not wire it to a payable endpoint.

## Acceptance before DB migration

On a disposable PostgreSQL 17 CI container, apply the migration after the
existing `schema.sql`, `functions.sql`, `payments.sql` and before tests.
The `test/multichain.test.mjs` suite verifies:

- Unique chain-scoped nonce; same nonce across independent chains is not
  confused, same-chain replay rejected.
- One unique global request ID; immutable row, irreversible no-funds state.
- Incorrect chain, asset, facilitator, tariff, recipient and expired quote
  rejected by DB constraints.
- RLS and exact private-grant enforcement; never an exposed settlement RPC.
- Existing PostgreSQL billing concurrency and Base-only tests unaffected.

Migration can be applied as a single transaction with existing owner role
**only after** clean CI, review, and a current pre-migration schema/row census.
Do not drop/alter the legacy `chain_id=8453` constraint; do not replay
historical rows into this sidecar.

After migration verify:
```sql
SELECT count(*) AS proof_rows FROM geomacro.x402_chain_no_funds_proofs;
SELECT relrowsecurity FROM pg_class
 WHERE oid='geomacro.x402_chain_no_funds_proofs'::regclass;
SELECT
 has_table_privilege('anon','geomacro.x402_chain_no_funds_proofs','SELECT') AS anon_read,
 has_table_privilege('service_role','geomacro.x402_chain_no_funds_proofs','SELECT') AS service_read,
 has_table_privilege('geomacro_billing','geomacro.x402_chain_no_funds_proofs','INSERT') AS billing_write;
```

## Remaining before any payment activation (explicitly NOT complete)

- End-to-end chain/provider-pinned *payable* idempotency across historical
  Base x402 and credits, with a reviewed additive migration and safe rollback.
- Polygon Dexter **settlement** method, provider response validation,
  2+ confirmations and verified on-chain native-USDC transfer.
- Production paid transaction and exact-byte signed qualified GRO output;
  qualified-risk resolver currently reports `QUALIFIED_EVIDENCE_UNAVAILABLE`.
- Real-world merchant receipt/refund/reconciliation proofs, fee guarantees,
  owner commercial/real-funds acknowledgements.

**Neither this schema nor these tests authorize or enable payments.**
