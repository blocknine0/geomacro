
create or replace function public.geomacro_free_tier_budget_state()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'target_bytes', 367001600,
    'warn_bytes', 419430400,
    'freeze_bytes', 471859200,
    'mode', case
      when pg_database_size(current_database()) >= 471859200 then 'frozen'
      when pg_database_size(current_database()) >= 419430400 then 'warning'
      else 'normal'
    end,
    'bulk_write_allowed', pg_database_size(current_database()) < 471859200
  );
$$;

revoke all on function public.geomacro_free_tier_budget_state() from public;
revoke all on function public.geomacro_free_tier_budget_state() from anon;
revoke all on function public.geomacro_free_tier_budget_state() from authenticated;
grant execute on function public.geomacro_free_tier_budget_state() to service_role;
