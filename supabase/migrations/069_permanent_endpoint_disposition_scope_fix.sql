-- =============================================================================
-- Permanent Phase B scope correction.
--
-- The Phase B 933 target is the canonical REQUIRED source universe.
-- Active operational sources outside that universe are reported separately so
-- they cannot silently escape endpoint disposition coverage.
-- =============================================================================

begin;

create or replace view public.live_source_endpoint_disposition_933_status
with (security_invoker=true)
as
with required_sources as (
  select distinct u.source_id
  from public.live_global_source_universe u
  where u.required = true
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

create or replace view public.live_active_source_endpoint_disposition_status
with (security_invoker=true)
as
with active_sources as (
  select s.source_id
  from public.live_external_sources s
  where s.enabled_for_ingestion = true
     or s.enabled_for_commercial_signals = true
),
counts as (
  select
    count(*)::bigint as active_source_count,
    count(c.source_id)::bigint as certification_record_count,
    count(c.source_id) filter (
      where c.endpoint_disposition is not null
        and c.endpoint_disposition <> 'UNCLASSIFIED'
    )::bigint as disposition_count,
    count(c.source_id) filter (
      where c.endpoint_disposition = 'UNCLASSIFIED'
        or c.endpoint_disposition is null
    )::bigint as unclassified_count,
    count(*) filter (
      where not exists (
        select 1
        from public.live_global_source_universe u
        where u.source_id = active_sources.source_id
          and u.required = true
      )
    )::bigint as active_outside_required_count
  from active_sources
  left join public.live_source_certification_records c
    on c.source_id = active_sources.source_id
)
select
  now() as evaluated_at,
  *,
  (
    certification_record_count = active_source_count
    and disposition_count = active_source_count
    and unclassified_count = 0
  ) as active_source_endpoint_disposition_complete
from counts;

comment on view public.live_source_endpoint_disposition_933_status is
  'Permanent Phase B gate for the canonical required 933-source universe. Active operational additions are reported separately. Endpoint disposition never grants commercial rights or certification.';

comment on view public.live_active_source_endpoint_disposition_status is
  'Permanent operational endpoint-disposition gate for every source currently enabled for ingestion or commercial signals, including sources outside the 933 required universe.';

commit;
