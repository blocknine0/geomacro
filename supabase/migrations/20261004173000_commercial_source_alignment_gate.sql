-- #1414 commercial source alignment gate
--
-- This does NOT certify additional sources. Inventory-only sources remain
-- non-ingesting/non-commercial and are moved from implicit NOT_STARTED /
-- UNREVIEWED into an explicit fail-closed review state. Paid-signal eligibility
-- remains restricted to sources that satisfy the full certification contract.

begin;

update public.live_source_certification_records r
set
  certification_state = 'IN_REVIEW',
  rights_status = case
    when r.rights_status = 'UNREVIEWED' then 'REVIEW_REQUIRED'
    else r.rights_status
  end,
  certification_reason = 'Inventory-aligned fail-closed review. Source remains disabled for ingestion and commercial signals until governed certification evidence is complete.',
  endpoint_disposition = coalesce(r.endpoint_disposition, 'UNCLASSIFIED'),
  endpoint_disposition_reason = coalesce(r.endpoint_disposition_reason, 'Inventory-only source; endpoint certification not yet promoted into the launch-active source set.'),
  updated_at = now()
from public.live_external_sources s
where r.source_id = s.source_id
  and r.certification_state = 'NOT_STARTED'
  and s.enabled_for_ingestion = false
  and s.enabled_for_commercial_signals = false;

create or replace view public.live_commercial_source_alignment_status
with (security_invoker = true)
as
with aligned as (
  select
    s.source_id,
    s.base_url,
    s.access_type,
    s.authentication_type,
    s.country_scope,
    s.freshness_class,
    s.commercial_usage_status,
    s.enabled_for_ingestion,
    s.enabled_for_commercial_signals,
    r.source_id is not null as has_certification_record,
    r.certification_state,
    r.endpoint_status,
    r.rights_status,
    r.schema_status,
    r.freshness_status,
    r.provenance_status,
    r.independence_status,
    r.adapter_status,
    r.runtime_status,
    r.fallback_status
  from public.live_external_sources s
  left join public.live_source_certification_records r using (source_id)
), aggregate as (
  select
    count(*)::bigint as source_count,
    count(*) filter (where has_certification_record)::bigint as certification_record_count,
    count(*) filter (
      where nullif(trim(base_url), '') is null
         or nullif(trim(access_type), '') is null
         or nullif(trim(authentication_type), '') is null
         or nullif(trim(country_scope), '') is null
         or nullif(trim(freshness_class), '') is null
    )::bigint as incomplete_inventory_metadata_rows,
    count(*) filter (
      where not has_certification_record
         or certification_state is null
         or certification_state = 'NOT_STARTED'
    )::bigint as implicit_lifecycle_rows,
    count(*) filter (
      where rights_status is null
         or rights_status = 'UNREVIEWED'
    )::bigint as unreviewed_rights_rows,
    count(*) filter (
      where enabled_for_ingestion
        and (
          endpoint_status is null or endpoint_status = 'UNTESTED'
          or schema_status is null or schema_status = 'UNTESTED'
          or freshness_status is null or freshness_status = 'UNTESTED'
          or provenance_status is null or provenance_status = 'UNTESTED'
          or independence_status is null or independence_status = 'UNTESTED'
          or runtime_status is null or runtime_status = 'UNTESTED'
          or fallback_status is null or fallback_status = 'UNTESTED'
        )
    )::bigint as active_untested_rows,
    count(*) filter (where enabled_for_ingestion)::bigint as ingestion_enabled_rows,
    count(*) filter (where enabled_for_commercial_signals)::bigint as commercial_signal_rows,
    count(*) filter (
      where enabled_for_commercial_signals
        and not (
          commercial_usage_status = 'COMMERCIAL_OK'
          and certification_state = 'CERTIFIED'
          and endpoint_status = 'PASS'
          and rights_status in ('COMMERCIAL_OK', 'DERIVED_ONLY')
          and schema_status in ('PASS', 'NOT_APPLICABLE')
          and freshness_status in ('FRESH', 'VARIABLE', 'NOT_APPLICABLE')
          and provenance_status in ('PASS', 'NOT_APPLICABLE')
          and independence_status in ('PASS', 'NOT_APPLICABLE')
          and adapter_status in ('TESTED', 'NOT_APPLICABLE')
          and runtime_status in ('PASS', 'NOT_APPLICABLE')
          and fallback_status in ('READY', 'NOT_REQUIRED')
        )
    )::bigint as unsafe_commercial_signal_rows,
    count(*) filter (
      where not enabled_for_ingestion
        and not enabled_for_commercial_signals
        and certification_state in ('IN_REVIEW', 'REJECTED')
        and rights_status in ('REVIEW_REQUIRED', 'PERMISSION_REQUIRED', 'INTERNAL_RESEARCH_ONLY', 'DERIVED_ONLY', 'NOT_APPLICABLE')
    )::bigint as explicit_quarantined_inventory_rows
  from aligned
)
select
  now() as evaluated_at,
  source_count,
  certification_record_count,
  incomplete_inventory_metadata_rows,
  implicit_lifecycle_rows,
  unreviewed_rights_rows,
  active_untested_rows,
  ingestion_enabled_rows,
  commercial_signal_rows,
  unsafe_commercial_signal_rows,
  explicit_quarantined_inventory_rows,
  (
    source_count = certification_record_count
    and incomplete_inventory_metadata_rows = 0
    and implicit_lifecycle_rows = 0
    and unreviewed_rights_rows = 0
    and active_untested_rows = 0
    and unsafe_commercial_signal_rows = 0
  ) as commercial_source_alignment_complete
from aggregate;

comment on view public.live_commercial_source_alignment_status is
  'Launch-facing source governance gate. Every inventoried source must have explicit lifecycle/rights state; every active ingestion source must have explicit governed test states; every paid-signal source must satisfy the full certified commercial contract. Non-active inventory sources remain fail-closed and are not implicitly certified.';

commit;
