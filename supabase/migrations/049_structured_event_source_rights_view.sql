begin;

-- Source-level commercial rights are explicit and fail closed. Existing source
-- registry booleans describe storage/derivative handling but are not, by
-- themselves, a commercial-rights approval.
alter table public.live_source_registry
  add column if not exists commercial_usage_status text not null default 'REVIEW_REQUIRED'
    check (
      commercial_usage_status in (
        'COMMERCIAL_OK',
        'DERIVED_ONLY',
        'REVIEW_REQUIRED',
        'INELIGIBLE',
        'INTERNAL_INHERIT_ONLY'
      )
    ),
  add column if not exists commercial_terms_reference text,
  add column if not exists commercial_reviewed_at timestamptz;

-- GDELT's official Terms of Use state that datasets released by the GDELT
-- Project are available for unlimited and unrestricted academic, commercial
-- and governmental use and may be redistributed with GDELT attribution.
--
-- Geomacro nevertheless keeps GAL as DERIVED_ONLY because GAL points to and
-- may carry metadata originating from third-party publishers. This status
-- permits derived Geomacro intelligence but does not grant a right to
-- republish publisher article bodies, images, excerpts or other source
-- content.
update public.live_source_registry
set
  commercial_usage_status = 'DERIVED_ONLY',
  commercial_terms_reference = 'https://www.gdeltproject.org/about.html',
  commercial_reviewed_at = '2026-09-10T00:00:00Z'::timestamptz,
  notes = concat_ws(
    ' ',
    nullif(trim(coalesce(notes, '')), ''),
    'Commercial review 2026-09-10: GDELT dataset terms permit commercial use and redistribution with attribution. Geomacro classifies GAL as DERIVED_ONLY to preserve the separate copyright boundary around third-party publisher content; raw publisher content is not a customer product.'
  ),
  updated_at = now()
where source_key = 'gdelt_gal';

-- The admitted-events source is an internal transport identity only. It must
-- never manufacture rights that were not present on the underlying evidence.
update public.live_source_registry
set
  commercial_usage_status = 'INTERNAL_INHERIT_ONLY',
  commercial_terms_reference = null,
  commercial_reviewed_at = '2026-09-10T00:00:00Z'::timestamptz,
  updated_at = now()
where source_key = 'admitted_events';

-- Deterministic, auditable evaluation of every structured event from the
-- immutable evidence bridge -> fragment manifest -> governed source registry.
-- This view does not mutate live_structured_events and therefore cannot promote
-- an event merely because an application forgot to supply eligibility fields.
create or replace view public.live_structured_event_commercial_rights_evaluation
with (security_invoker = true)
as
with source_states as (
  select distinct
    e.event_id,
    m.source_key,
    r.commercial_usage_status
  from public.live_structured_event_evidence e
  join public.live_fragment_manifest m
    on m.id = e.fragment_id
  left join public.live_source_registry r
    on r.source_key = m.source_key
), aggregated as (
  select
    event_id,
    array_agg(distinct source_key order by source_key) as source_keys,
    bool_or(commercial_usage_status is null) as has_missing_policy,
    bool_or(commercial_usage_status = 'INELIGIBLE') as has_ineligible,
    bool_or(commercial_usage_status = 'REVIEW_REQUIRED') as has_review_required,
    bool_or(commercial_usage_status = 'INTERNAL_INHERIT_ONLY') as has_internal_inherit_only,
    bool_or(commercial_usage_status = 'DERIVED_ONLY') as has_derived_only,
    bool_and(commercial_usage_status = 'COMMERCIAL_OK') as all_commercial_ok
  from source_states
  group by event_id
)
select
  ev.id as event_id,
  case
    when a.event_id is null then 'UNVERIFIED'
    when a.has_ineligible then 'INELIGIBLE'
    when a.has_missing_policy then 'UNVERIFIED'
    when a.has_review_required then 'UNVERIFIED'
    when a.has_internal_inherit_only then 'UNVERIFIED'
    when a.has_derived_only then 'DERIVED_ONLY'
    when a.all_commercial_ok then 'VERIFIED'
    else 'UNVERIFIED'
  end::text as evaluated_status,
  case
    when a.event_id is null then array['missing_structured_event_source_provenance']::text[]
    when a.has_ineligible then array['commercial_source_ineligible']::text[]
    when a.has_missing_policy then array['missing_commercial_source_policy']::text[]
    when a.has_review_required then array['commercial_source_review_required']::text[]
    when a.has_internal_inherit_only then array['internal_handoff_does_not_grant_source_rights']::text[]
    when a.has_derived_only then array['commercial_source_derived_only']::text[]
    when a.all_commercial_ok then array[]::text[]
    else array['commercial_source_unverified']::text[]
  end as reason_codes,
  coalesce(a.source_keys, array[]::text[]) as source_keys
from public.live_structured_events ev
left join aggregated a
  on a.event_id = ev.id;

comment on view public.live_structured_event_commercial_rights_evaluation is
  'Fail-closed source-rights evaluation for structured events. Derived from immutable evidence fragment source identities and the governed live_source_registry; does not itself promote stored event eligibility.';

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

commit;
