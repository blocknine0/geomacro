alter policy "service role full access positions" on public.positions to service_role;
alter policy "wallet reads own positions" on public.positions to authenticated;
alter policy "service role full access balance history" on public.wallet_balance_history to service_role;
alter policy "wallet reads own balance history" on public.wallet_balance_history to authenticated;
