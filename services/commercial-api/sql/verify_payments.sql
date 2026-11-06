-- Owner-only checks. All anomaly queries should return zero rows.
SELECT i.request_id FROM geomacro.x402_intents i
LEFT JOIN geomacro.usage_logs u USING(request_id)
LEFT JOIN geomacro.audit_receipts a USING(request_id)
LEFT JOIN geomacro.web3_txs w USING(request_id)
WHERE i.state='confirmed' AND (u.request_id IS NULL OR a.request_id IS NULL OR w.request_id IS NULL
 OR u.rail<>'base_usdc' OR u.credit_units<>0 OR w.amount_atomic<>i.amount_atomic
 OR w.tx_hash<>i.tx_hash OR w.authorization_nonce<>i.nonce);

SELECT i.request_id FROM geomacro.x402_intents i JOIN geomacro.usage_logs u USING(request_id)
WHERE i.state<>'confirmed';

-- Operational queue, not necessarily anomalies. Investigate pending entries;
-- retain authorizations/results until uncertain settlement is reconciled.
SELECT request_id,state,tx_hash,created_at,lease_until FROM geomacro.x402_intents
WHERE state<>'confirmed' ORDER BY created_at;
