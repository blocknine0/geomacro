-- Preserve legacy production RLS role scoping when those retired tables exist.
do $$
begin
  if to_regclass('public.positions') is not null then
    execute 'alter policy "service role full access positions" on public.positions to service_role';
    execute 'alter policy "wallet reads own positions" on public.positions to authenticated';
  end if;
  if to_regclass('public.wallet_balance_history') is not null then
    execute 'alter policy "service role full access balance history" on public.wallet_balance_history to service_role';
    execute 'alter policy "wallet reads own balance history" on public.wallet_balance_history to authenticated';
  end if;
end $$;
