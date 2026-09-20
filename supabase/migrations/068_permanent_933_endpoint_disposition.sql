-- =============================================================================
-- Permanent source endpoint disposition ledger.
--
-- Endpoint disposition is a transport/access classification only. It never
-- promotes commercial rights, schema, freshness, provenance, independence,
-- adapter, runtime or certification state.
-- =============================================================================

begin;

alter table public.live_source_certification_records
  add column if not exists endpoint_disposition text
    check (endpoint_disposition in (
      'WORKING',
      'CANONICAL_REDIRECT',
      'AUTH_REQUIRED',
      'WAF',
      'DEPRECATED',
      'WRONG_ENDPOINT',
      'MISSING_ENDPOINT',
      'TIMEOUT',
      'DNS_FAILURE',
      'BLOCKED_ENVIRONMENT',
      'FAIL',
      'UNCLASSIFIED'
    )),
  add column if not exists endpoint_disposition_reason text,
  add column if not exists endpoint_disposition_observed_at timestamptz;

create index if not exists live_source_certification_endpoint_disposition_idx
  on public.live_source_certification_records(endpoint_disposition);

comment on column public.live_source_certification_records.endpoint_disposition is
  'Permanent machine-generated endpoint disposition. Transport/access classification only; never a certification or commercial-rights decision.';

comment on column public.live_source_certification_records.endpoint_disposition_reason is
  'Deterministic reason captured with endpoint disposition evidence.';

comment on column public.live_source_certification_records.endpoint_disposition_observed_at is
  'Timestamp of the endpoint disposition observation.';

create or replace view public.live_source_endpoint_disposition_933_status
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
counts as (
  select
    count(*)::bigint as required_source_count,
    count(c.source_id)::bigint as certification_record_count,
    count(c.source_id) filter (
      where c.endpoint_disposition is not null
        and c.endpoint_disposition <> 'UNCLASSIFIED'
    )::bigint as disposition_count,
    count(c.source_id) filter (
      where c.endpoint_disposition = 'WORKING'
    )::bigint as working_count,
    count(c.source_id) filter (
      where c.endpoint_disposition = 'CANONICAL_REDIRECT'
    )::bigint as canonical_redirect_count,
    count(c.source_id) filter (
      where c.endpoint_disposition in (
        'AUTH_REQUIRED',
        'WAF',
        'DEPRECATED',
        'WRONG_ENDPOINT',
        'MISSING_ENDPOINT',
        'TIMEOUT',
        'DNS_FAILURE',
        'BLOCKED_ENVIRONMENT',
        'FAIL'
      )
    )::bigint as remediation_count,
    count(c.source_id) filter (
      where c.endpoint_disposition = 'UNCLASSIFIED'
    )::bigint as unclassified_count
  from required_sources r
  left join public.live_source_certification_records c
    on c.source_id = r.source_id
)
select
  now() as evaluated_at,
  *,
  (
    required_source_count = 933
    and certification_record_count = 933
    and disposition_count = 933
    and unclassified_count = 0
  ) as endpoint_disposition_933_complete
from counts;

comment on view public.live_source_endpoint_disposition_933_status is
  'Permanent 933-source endpoint disposition gate. Every canonical required source must have an explicit machine-generated disposition; this view does not certify commercial eligibility.';

commit;
