-- =============================================================================
-- Permanent 933-endpoint disposition ledger.
--
-- The canonical Phase B universe is the exact 933 unique HTTP(S) URLs derived
-- deterministically from supabase/migrations and locked by manifest SHA.
--
-- This ledger records transport/access disposition only. It never promotes
-- source rights, schema, freshness, provenance, independence, adapter,
-- runtime or commercial certification.
-- =============================================================================

begin;

create table if not exists public.live_source_endpoint_disposition_ledger (
  endpoint_url text primary key,
  endpoint_key text not null unique,
  manifest_sha256 text not null,
  endpoint_disposition text not null
    check (endpoint_disposition in (
      'WORKING',
      'CANONICAL_REDIRECT',
      'AUTH_REQUIRED',
      'WAF',
      'DEPRECATED',
      'WRONG_ENDPOINT',
      'TIMEOUT',
      'DNS_FAILURE',
      'BLOCKED_ENVIRONMENT',
      'FAIL',
      'UNCLASSIFIED'
    )),
  endpoint_disposition_reason text not null,
  http_status integer,
  final_url text,
  content_type text,
  latency_ms integer,
  error_text text,
  observed_at timestamptz not null,
  matched_source_id text references public.live_external_sources(source_id),
  updated_at timestamptz not null default now()
);

create index if not exists live_source_endpoint_disposition_ledger_manifest_idx
  on public.live_source_endpoint_disposition_ledger(manifest_sha256);

create index if not exists live_source_endpoint_disposition_ledger_disposition_idx
  on public.live_source_endpoint_disposition_ledger(endpoint_disposition);

create table if not exists public.live_source_endpoint_manifest_lock (
  lock_id text primary key,
  manifest_version text not null,
  endpoint_count integer not null check (endpoint_count > 0),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_definition text not null,
  created_at timestamptz not null default now()
);

insert into public.live_source_endpoint_manifest_lock (
  lock_id,
  manifest_version,
  endpoint_count,
  manifest_sha256,
  source_definition
)
values (
  'phase-b-933-v1',
  'geomacro-source-endpoint-manifest-v1',
  933,
  '11915e0d3eb16ba3448b0d62bf241a4f41243b78181c936583da87af8411df27',
  'unique normalized HTTP(S) URLs extracted from supabase/migrations, sorted by endpoint_url'
)
on conflict (lock_id) do update set
  manifest_version = excluded.manifest_version,
  endpoint_count = excluded.endpoint_count,
  manifest_sha256 = excluded.manifest_sha256,
  source_definition = excluded.source_definition;

create or replace view public.live_source_endpoint_disposition_933_status
with (security_invoker=true)
as
with lock as (
  select *
  from public.live_source_endpoint_manifest_lock
  where lock_id = 'phase-b-933-v1'
  limit 1
),
scoped as (
  select l.*
  from public.live_source_endpoint_disposition_ledger l
  join lock on lock.manifest_sha256 = l.manifest_sha256
)
select
  now() as evaluated_at,
  lock.endpoint_count as expected_endpoint_count,
  lock.manifest_sha256 as expected_manifest_sha256,
  count(distinct scoped.endpoint_url)::bigint as recorded_endpoint_count,
  count(distinct scoped.endpoint_url) filter (
    where scoped.endpoint_disposition <> 'UNCLASSIFIED'
  )::bigint as disposition_count,
  count(distinct scoped.endpoint_url) filter (
    where scoped.endpoint_disposition = 'UNCLASSIFIED'
  )::bigint as unclassified_count,
  count(distinct scoped.endpoint_url) filter (
    where scoped.endpoint_disposition in ('WORKING','CANONICAL_REDIRECT')
  )::bigint as transport_success_count,
  count(distinct scoped.endpoint_url) filter (
    where scoped.endpoint_disposition not in ('WORKING','CANONICAL_REDIRECT','UNCLASSIFIED')
  )::bigint as remediation_count,
  (
    lock.endpoint_count = 933
    and count(distinct scoped.endpoint_url) = 933
    and count(distinct scoped.endpoint_url) filter (
      where scoped.endpoint_disposition <> 'UNCLASSIFIED'
    ) = 933
    and count(distinct scoped.endpoint_url) filter (
      where scoped.endpoint_disposition = 'UNCLASSIFIED'
    ) = 0
  ) as endpoint_disposition_933_complete
from lock
left join scoped on true
group by lock.endpoint_count, lock.manifest_sha256;

comment on view public.live_source_endpoint_disposition_933_status is
  'Permanent Phase B 933-endpoint disposition gate. The 933 universe is the locked unique migration-referenced HTTP(S) URL manifest. Disposition never implies certification or commercial rights.';

alter table public.live_source_endpoint_disposition_ledger enable row level security;
revoke all on public.live_source_endpoint_disposition_ledger from public, anon, authenticated;
grant select on public.live_source_endpoint_disposition_ledger to service_role;

alter table public.live_source_endpoint_manifest_lock enable row level security;
revoke all on public.live_source_endpoint_manifest_lock from public, anon, authenticated;
grant select on public.live_source_endpoint_manifest_lock to service_role;

commit;
