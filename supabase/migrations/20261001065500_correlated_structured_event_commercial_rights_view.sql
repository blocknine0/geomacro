-- Preserve the authoritative commercial-rights semantics while making
-- event_id filters index-backed. The previous global UNION/aggregate CTE could
-- aggregate the entire evidence graph before applying a bounded event filter.

create or replace view public.live_structured_event_commercial_rights_evaluation
with (security_invoker = true)
as
select
  ev.id as event_id,
  case
    when coalesce(a.source_count, 0) = 0 then 'UNVERIFIED'
    when a.has_ineligible then 'INELIGIBLE'
    when a.has_missing_policy then 'UNVERIFIED'
    when a.has_review_required then 'UNVERIFIED'
    when a.has_internal_inherit_only then 'UNVERIFIED'
    when a.has_derived_only then 'DERIVED_ONLY'
    when a.all_commercial_ok then 'VERIFIED'
    else 'UNVERIFIED'
  end::text as evaluated_status,
  case
    when coalesce(a.source_count, 0) = 0 then array['missing_structured_event_source_provenance']::text[]
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
left join lateral (
  select
    count(*)::bigint as source_count,
    array_agg(distinct s.source_key order by s.source_key) as source_keys,
    bool_or(s.commercial_usage_status is null) as has_missing_policy,
    bool_or(s.commercial_usage_status = 'INELIGIBLE') as has_ineligible,
    bool_or(s.commercial_usage_status = 'REVIEW_REQUIRED') as has_review_required,
    bool_or(s.commercial_usage_status = 'INTERNAL_INHERIT_ONLY') as has_internal_inherit_only,
    bool_or(s.commercial_usage_status = 'DERIVED_ONLY') as has_derived_only,
    bool_and(s.commercial_usage_status = 'COMMERCIAL_OK') as all_commercial_ok
  from (
    select i.source_key, r.commercial_usage_status
    from (
      select m.source_key
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m
        on m.id = e.fragment_id
      where e.event_id = ev.id

      union

      select archived.source_key
      from public.live_structured_event_archived_sources archived
      where archived.event_id = ev.id
    ) i
    left join public.live_source_registry r
      on r.source_key = i.source_key
  ) s
) a on true;

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

comment on view public.live_structured_event_commercial_rights_evaluation is
  'Authoritative structured-event commercial-rights evaluation. Correlated by event_id so bounded event filters stay index-backed across live and archived provenance.';
