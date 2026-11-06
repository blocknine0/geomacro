-- Run as owner. Both queries must return zero rows.
SELECT u.id, u.balance_units, coalesce(sum(l.delta_units),0) AS ledger_units
FROM geomacro.users u LEFT JOIN geomacro.credit_ledger l ON l.user_id=u.id
GROUP BY u.id HAVING u.balance_units<>coalesce(sum(l.delta_units),0);

SELECT v.request_id FROM geomacro.usage_logs v
LEFT JOIN geomacro.audit_receipts a USING(request_id)
LEFT JOIN geomacro.credit_ledger l ON l.request_id=v.request_id AND l.kind='usage'
WHERE v.rail='credits' AND v.state IN ('succeeded','refunded')
AND (a.request_id IS NULL OR l.id IS NULL OR l.delta_units<>-v.credit_units);

-- All should show true for RLS and false for direct runtime table mutation.
SELECT t.tablename,t.rowsecurity,
 has_table_privilege('geomacro_billing',format('geomacro.%I',t.tablename),'INSERT,UPDATE,DELETE') AS runtime_can_write
FROM pg_tables t WHERE t.schemaname='geomacro';
