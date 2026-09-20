-- =============================================================================
-- Geomacro source certification execution layer
--
-- Inventory completion and endpoint transport are prerequisites only.
-- This migration creates the evidence-backed source certification state used by
-- production readiness and Risk Gate eligibility. No source is auto-promoted.
-- =============================================================================

begin;

create table if not exists public.live_source_certification_records (
  source_id text primary key
    references public.live_external_sources(source_id)
    on delete cascade,

  certification_state text not null default 'NOT_STARTED'
    check (certification_state in (
      'NOT_STARTED',
      'IN_REVIEW',
      'CERTIFIED',
      'REJECTED'
    )),

  endpoint_status text not null default 'UNTESTED'
    check (endpoint_status in (
      'UNTESTED',
      'PASS',
      'CANONICAL_REQUIRED',
      'AUTH_REQUIRED',
      'WAF',
      'DEPRECATED',
      'WRONG_ENDPOINT',
      'TIMEOUT',
      'DNS_FAILURE',
      'BLOCKED_ENVIRONMENT',
      'FAIL'
    )),
  endpoint_url text,
  canonical_url text,
  endpoint_http_status integer,
  endpoint_final_url text,
  endpoint_content_type text,
  endpoint_latency_ms integer,
  endpoint_error text,
  endpoint_observed_at timestamptz,

  rights_status text not null default 'UNREVIEWED'
    check (rights_status in (
      'UNREVIEWED',
      'COMMERCIAL_OK',
      'DERIVED_ONLY',
      'PERMISSION_REQUIRED',
      'INTERNAL_RESEARCH_ONLY',
      'REVIEW_REQUIRED',
      'NOT_APPLICABLE'
    )),
  rights_evidence_ref text,
  rights_reviewed_at timestamptz,

  dataset_id text,
  dataset_version text,
  schema_status text not null default 'UNTESTED'
    check (schema_status in (
      'UNTESTED',
      'PASS',
      'PARTIAL',
      'FAIL',
      'NOT_APPLICABLE'
    )),
  schema_version text,
  schema_evidence_ref text,

  freshness_status text not null default 'UNTESTED'
    check (freshness_status in (
      'UNTESTED',
      'FRESH',
      'AGING',
      'STALE',
      'VARIABLE',
      'FAIL',
      'NOT_APPLICABLE'
    )),
  freshness_max_seconds integer,
  freshness_last_observed_at timestamptz,
  freshness_last_success_at timestamptz,
  freshness_lag_seconds integer,

  provenance_status text not null default 'UNTESTED'
    check (provenance_status in (
      'UNTESTED',
      'PASS',
      'PARTIAL',
      'FAIL',
      'NOT_APPLICABLE'
    )),
  provenance_evidence_ref text,

  independence_status text not null default 'UNTESTED'
    check (independence_status in (
      'UNTESTED',
      'PASS',
      'PARTIAL',
      'FAIL',
      'NOT_APPLICABLE'
    )),
  independence_group text,
  independent_source_count integer,

  adapter_status text not null default 'UNMAPPED'
    check (adapter_status in (
      'UNMAPPED',
      'MAPPED',
      'TESTED',
      'FAIL',
      'NOT_APPLICABLE'
    )),
  adapter_id text,
  runtime_status text not null default 'UNTESTED'
    check (runtime_status in (
      'UNTESTED',
      'PASS',
      'DEGRADED',
      'FAIL',
      'NOT_APPLICABLE'
    )),

  fallback_source_id text
    references public.live_external_sources(source_id),
  fallback_status text not null default 'UNTESTED'
    check (fallback_status in (
      'UNTESTED',
      'READY',
      'NOT_REQUIRED',
      'FAIL'
    )),

  certification_reason text,
  certification_evidence_ref text,
  certified_at timestamptz,
  certified_by text,
  certification_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint live_source_certification_certified_fields_check
    check (
      certification_state <> 'CERTIFIED'
      or (
        endpoint_status = 'PASS'
        and rights_status in ('COMMERCIAL_OK','DERIVED_ONLY')
        and schema_status in ('PASS','NOT_APPLICABLE')
        and freshness_status in ('FRESH','VARIABLE','NOT_APPLICABLE')
        and provenance_status in ('PASS','NOT_APPLICABLE')
        and independence_status in ('PASS','NOT_APPLICABLE')
        and adapter_status in ('TESTED','NOT_APPLICABLE')
        and runtime_status in ('PASS','NOT_APPLICABLE')
        and fallback_status in ('READY','NOT_REQUIRED')
        and certified_at is not null
        and certification_hash is not null
      )
    )
);

create index if not exists live_source_certification_state_idx
  on public.live_source_certification_records(certification_state);

create index if not exists live_source_certification_endpoint_idx
  on public.live_source_certification_records(endpoint_status);

create index if not exists live_source_certification_rights_idx
  on public.live_source_certification_records(rights_status);

create index if not exists live_source_certification_runtime_idx
  on public.live_source_certification_records(runtime_status);

insert into public.live_source_certification_records (
  source_id,
  endpoint_url
)
select
  s.source_id,
  s.base_url
from public.live_external_sources s
on conflict (source_id) do nothing;

create or replace function public.ensure_live_source_certification_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.live_source_certification_records (
    source_id,
    endpoint_url
  )
  values (
    new.source_id,
    new.base_url
  )
  on conflict (source_id) do update
    set endpoint_url = coalesce(
      public.live_source_certification_records.endpoint_url,
      excluded.endpoint_url
    ),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_ensure_live_source_certification_record
  on public.live_external_sources;

create trigger trg_ensure_live_source_certification_record
after insert on public.live_external_sources
for each row
execute function public.ensure_live_source_certification_record();

create or replace view public.live_source_certification_100_status
with (security_invoker=true)
as
with required_sources as (
  select distinct u.source_id
  from public.live_global_source_universe u
  where u.required = true
  union
  select s.source_id
  from public.live_external_sources s
  where s.enabled_for_ingestion = true
     or s.enabled_for_commercial_signals = true
),
required_paths as (
  select count(*)::bigint n
  from public.live_source_certification_queue q
),
covered_paths as (
  select count(*)::bigint n
  from public.live_source_certification_queue q
  join public.live_source_certification_records c
    on c.source_id = q.source_id
  where q.certification_state = 'CERTIFIED'
    and q.fail_closed = false
    and c.certification_state = 'CERTIFIED'
),
source_counts as (
  select
    count(*)::bigint required_source_count,
    count(c.source_id)::bigint certification_record_count,
    count(c.source_id) filter(
      where c.certification_state = 'CERTIFIED'
    )::bigint certified_source_count,
    count(c.source_id) filter(
      where c.endpoint_status <> 'UNTESTED'
    )::bigint endpoint_disposition_count,
    count(c.source_id) filter(
      where c.rights_status in ('COMMERCIAL_OK','DERIVED_ONLY','PERMISSION_REQUIRED','INTERNAL_RESEARCH_ONLY','NOT_APPLICABLE')
    )::bigint rights_review_count,
    count(c.source_id) filter(
      where c.schema_status in ('PASS','PARTIAL','FAIL','NOT_APPLICABLE')
    )::bigint schema_review_count,
    count(c.source_id) filter(
      where c.freshness_status <> 'UNTESTED'
    )::bigint freshness_review_count,
    count(c.source_id) filter(
      where c.provenance_status <> 'UNTESTED'
    )::bigint provenance_review_count,
    count(c.source_id) filter(
      where c.independence_status <> 'UNTESTED'
    )::bigint independence_review_count,
    count(c.source_id) filter(
      where c.adapter_status <> 'UNMAPPED'
    )::bigint adapter_review_count,
    count(c.source_id) filter(
      where c.runtime_status <> 'UNTESTED'
    )::bigint runtime_review_count
  from required_sources r
  left join public.live_source_certification_records c
    on c.source_id = r.source_id
)
select
  now() evaluated_at,
  sc.*,
  rp.n required_certification_path_count,
  cp.n certified_certification_path_count,
  (
    sc.required_source_count > 0
    and sc.certification_record_count = sc.required_source_count
    and sc.certified_source_count = sc.required_source_count
    and sc.endpoint_disposition_count = sc.required_source_count
    and sc.rights_review_count = sc.required_source_count
    and sc.schema_review_count = sc.required_source_count
    and sc.freshness_review_count = sc.required_source_count
    and sc.provenance_review_count = sc.required_source_count
    and sc.independence_review_count = sc.required_source_count
    and sc.adapter_review_count = sc.required_source_count
    and sc.runtime_review_count = sc.required_source_count
    and cp.n = rp.n
  ) as source_network_100_complete
from source_counts sc
cross join required_paths rp
cross join covered_paths cp;

comment on view public.live_source_certification_100_status is
 'Machine-enforced source certification status. 100% requires complete source-level evidence plus every required source-universe certification path. No endpoint reachability or registration alone can open commercial eligibility.';

create or replace view public.live_source_network_100_status
with (security_invoker=true)
as
select *
from public.live_source_certification_100_status;

comment on view public.live_source_network_100_status is
 'Canonical source-network commercial readiness view. This remains false until endpoint, rights, schema, freshness, provenance, independence, adapter, runtime and required-path certification are complete.';

alter table public.live_source_certification_records enable row level security;
revoke all on public.live_source_certification_records from public, anon, authenticated;
grant select on public.live_source_certification_records to service_role;

commit;
