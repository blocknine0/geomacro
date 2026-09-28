create index if not exists commercial_api_credential_lifecycle_previous_credential_idx on public.commercial_api_credential_lifecycle_events(previous_credential_id);
create index if not exists commercial_marketing_drafts_source_payment_idx on public.commercial_marketing_drafts(source_payment_event_id);
create index if not exists commercial_payment_entitlement_grant_idx on public.commercial_payment_events(entitlement_grant_id);
create index if not exists commercial_share_usage_event_idx on public.commercial_share_events(usage_event_id);
create index if not exists commercial_usage_entitlement_grant_idx on public.commercial_usage_events(entitlement_grant_id);
create index if not exists commercial_usage_payment_event_idx on public.commercial_usage_events(payment_event_id);
create index if not exists private_revenue_delivery_usage_event_idx on public.private_commercial_revenue_delivery_ledger(usage_event_id);
create index if not exists risk_gate_idempotency_audit_idx on public.risk_gate_idempotency_keys(audit_id);
create index if not exists testnet_usdc_payment_claim_payment_event_idx on public.testnet_usdc_payment_claims(payment_event_id);

-- Legacy prediction-market tables remain hardened in production when present,
-- but are intentionally not required by the current clean Geomacro schema.
do $$
begin
  if to_regclass('public.positions') is not null then
    execute 'alter policy "wallet reads own positions" on public.positions using (wallet_address = ((select auth.jwt()) ->> ''wallet_address''::text))';
    execute 'alter policy "service role full access positions" on public.positions using ((select auth.role()) = ''service_role''::text)';
  end if;
  if to_regclass('public.wallet_balance_history') is not null then
    execute 'alter policy "wallet reads own balance history" on public.wallet_balance_history using (wallet_address = ((select auth.jwt()) ->> ''wallet_address''::text))';
    execute 'alter policy "service role full access balance history" on public.wallet_balance_history using ((select auth.role()) = ''service_role''::text)';
  end if;
end $$;

drop index if exists public.tx_history_wallet_idx;
drop index if exists public.tx_history_wallet_tx_idx;
