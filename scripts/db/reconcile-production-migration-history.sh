#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

command -v psql >/dev/null 2>&1 || {
  echo "::error::psql is required for authoritative migration-history reconciliation."
  exit 1
}

command -v supabase >/dev/null 2>&1 || {
  echo "::error::Supabase CLI is required for migration-history reconciliation."
  exit 1
}

echo "Checking authoritative production schema sentinels before any history repair."

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -X <<'SQL'
create or replace function pg_temp.assert_table(p_name text) returns void
language plpgsql as $$
begin
  if to_regclass(p_name) is null then
    raise exception 'required production table is missing: %', p_name;
  end if;
end;
$$;

create or replace function pg_temp.assert_column(p_table text, p_column text) returns void
language plpgsql as $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  ) then
    raise exception 'required production column is missing: %.%', p_table, p_column;
  end if;
end;
$$;

create or replace function pg_temp.assert_constraint(p_table text, p_constraint text) returns void
language plpgsql as $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = p_table
      and c.conname = p_constraint
  ) then
    raise exception 'required production constraint is missing: %.%', p_table, p_constraint;
  end if;
end;
$$;

create or replace function pg_temp.assert_function(p_signature text) returns void
language plpgsql as $$
begin
  if to_regprocedure(p_signature) is null then
    raise exception 'required production function is missing: %', p_signature;
  end if;
end;
$$;

do $$
begin
  perform pg_temp.assert_table('public.early_warning_alerts');
  perform pg_temp.assert_column('early_warning_alerts', 'market_impact');
  perform pg_temp.assert_column('early_warning_alerts', 'market_impact_methodology_version');
  perform pg_temp.assert_column('early_warning_alerts', 'market_impact_calibrated');
  perform pg_temp.assert_column('early_warning_alerts', 'market_impact_hash');
  perform pg_temp.assert_constraint('early_warning_alerts', 'early_warning_market_impact_object_check');
  perform pg_temp.assert_constraint('early_warning_alerts', 'early_warning_market_impact_binding_check');
  
  perform pg_temp.assert_table('public.early_warning_distribution_receipts');
  perform pg_temp.assert_column('early_warning_distribution_receipts', 'lease_token');
  perform pg_temp.assert_column('early_warning_distribution_receipts', 'lease_expires_at');
  perform pg_temp.assert_column('early_warning_distribution_receipts', 'payload_hash');
  perform pg_temp.assert_column('early_warning_distribution_receipts', 'ambiguous_outcome');
  perform pg_temp.assert_column('early_warning_distribution_receipts', 'last_response_code');
  perform pg_temp.assert_function('public.claim_early_warning_distribution(text,text,text,integer)');
  perform pg_temp.assert_function('public.finalize_early_warning_distribution(uuid,uuid,text,text,text,integer)');
  
  if position('stale unfinalized delivery claim expired' in pg_get_functiondef(
    to_regprocedure('public.claim_early_warning_distribution(text,text,text,integer)')
  )) = 0 then
    raise exception '942 claim implementation sentinel is missing';
  end if;
  
  if position('retry_blocked' in pg_get_functiondef(
    to_regprocedure('public.claim_early_warning_distribution(text,text,text,integer)')
  )) = 0 then
    raise exception '942 retry-blocked sentinel is missing';
  end if;
  
  perform pg_temp.assert_constraint(
    'early_warning_distribution_receipts',
    'early_warning_distribution_attempt_cap_check'
  );
  
  perform pg_temp.assert_table('public.central_security_request_buckets_v2');
  perform pg_temp.assert_function('public.consume_central_security_budget_v2(text,text,integer,integer,integer)');
  perform pg_temp.assert_function('public.consume_central_security_budget(text,text,integer,integer,integer)');
  if position('consume_central_security_budget_v2' in pg_get_functiondef(
    to_regprocedure('public.consume_central_security_budget(text,text,integer,integer,integer)')
  )) = 0 then
    raise exception '944 central-security facade sentinel is missing';
  end if;
  perform pg_temp.assert_function('public.central_security_database_readiness()');
  
  perform pg_temp.assert_table('public.live_telegram_channel_registry');
  perform pg_temp.assert_column('live_telegram_channel_registry', 'manual_review_status');
  perform pg_temp.assert_column('live_telegram_channel_registry', 'reviewed_at');
  perform pg_temp.assert_column('live_telegram_channel_registry', 'reviewed_by');
  perform pg_temp.assert_column('live_telegram_channel_registry', 'review_reference');
  perform pg_temp.assert_constraint(
    'live_telegram_channel_registry',
    'live_telegram_channel_registry_manual_review_status_check'
  );
  
  perform pg_temp.assert_table('public.coinbase_x402_deliveries');
  perform pg_temp.assert_column('coinbase_x402_deliveries', 'response_sha256');
  perform pg_temp.assert_function('public.prepare_coinbase_x402_delivery(text,uuid,jsonb,text)');
  
  perform pg_temp.assert_table('public.private_commercial_revenue_delivery_ledger');
  perform pg_temp.assert_function('public.capture_private_commercial_revenue_delivery_proof()');
  perform pg_temp.assert_function('public.verify_private_commercial_revenue_delivery_ledger()');
  perform pg_temp.assert_function('public.private_commercial_revenue_delivery_ledger_readiness()');
  
  perform pg_temp.assert_table('public.testnet_developer_api_funnel_events');
  
  perform pg_temp.assert_table('public.live_flash_event_families');
  perform pg_temp.assert_table('public.live_flash_event_family_members');
  perform pg_temp.assert_table('public.live_flash_event_family_versions');
  perform pg_temp.assert_table('public.live_flash_event_versions');
  perform pg_temp.assert_column('live_flash_events', 'signal_category');
  perform pg_temp.assert_column('live_flash_events', 'source_version');
  perform pg_temp.assert_column('live_flash_events', 'material_update');
  perform pg_temp.assert_column('live_flash_events', 'event_family_id');
  
  
  raise notice 'PASS: all verified migration-history structural sentinels are present in authoritative production';
end;
$$;
SQL

echo "Reading remote migration history."
supabase migration list --db-url "$SUPABASE_DB_URL"

missing_versions="$(psql "$SUPABASE_DB_URL" -AtXqc "select v from unnest(array['939','940','941','942','943','944','945','946','947','948','949','954','955','956','957']) as u(v) where not exists (select 1 from supabase_migrations.schema_migrations m where m.version = u.v) order by v")"

if [ -z "$missing_versions" ]; then
  echo "PASS: no verified migration-history drift remains."
else
  echo "Verified production schema is present; repairing only missing history rows."
  printf '%s\n' "$missing_versions" | while IFS= read -r version; do
    [ -n "$version" ] || continue
    echo "Repairing migration history only: $version => applied"
    supabase migration repair --db-url "$SUPABASE_DB_URL" "$version" --status applied
  done
fi

echo "Final remote migration history."
supabase migration list --db-url "$SUPABASE_DB_URL"

remaining="$(psql "$SUPABASE_DB_URL" -AtXqc "select version from supabase_migrations.schema_migrations where version in ('939','940','941','942','943','944','945','946','947','948','949','954','955','956','957') order by version")"

expected='939
940
941
942
943
944
945
946
947
948
949
954
955
956
957'

if [ "$remaining" != "$expected" ]; then
  echo "::error::Migration history reconciliation did not produce the expected applied-version set."
  printf '%s\n' "$remaining"
  exit 1
fi

echo "PASS: verified production migration history is reconciled for all targeted versions."
