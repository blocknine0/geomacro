-- Keep commercial-rights verification bounded to explicit event IDs. The
-- result is semantically identical to the authoritative evaluation view while
-- avoiding a global aggregation when cleanup validates one B2 bundle.

create or replace function public.geomacro_structured_event_rights_snapshot(
  p_event_ids uuid[]
)
returns table (
  event_id uuid,
  evaluated_status text,
  reason_codes text[],
  source_keys text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_event_ids is null
     or cardinality(p_event_ids) < 1
     or cardinality(p_event_ids) > 500 then
    raise exception 'STRUCTURED_EVENT_RIGHTS_SNAPSHOT_CONFIG_INVALID';
  end if;

  return query
  with requested as (
    select distinct ev.id as event_id
    from unnest(p_event_ids) as input(event_id)
    join public.live_structured_events ev
      on ev.id = input.event_id
  ), source_identities as (
    select r.event_id, m.source_key
    from requested r
    join public.live_structured_event_evidence e
      on e.event_id = r.event_id
    join public.live_fragment_manifest m
      on m.id = e.fragment_id

    union

    select r.event_id, a.source_key
    from requested r
    join public.live_structured_event_archived_sources a
      on a.event_id = r.event_id
  ), source_states as (
    select i.event_id, i.source_key, r.commercial_usage_status
    from source_identities i
    left join public.live_source_registry r
      on r.source_key = i.source_key
  ), aggregated as (
    select
      s.event_id,
      array_agg(distinct s.source_key order by s.source_key) as source_keys,
      bool_or(s.commercial_usage_status is null) as has_missing_policy,
      bool_or(s.commercial_usage_status = 'INELIGIBLE') as has_ineligible,
      bool_or(s.commercial_usage_status = 'REVIEW_REQUIRED') as has_review_required,
      bool_or(s.commercial_usage_status = 'INTERNAL_INHERIT_ONLY') as has_internal_inherit_only,
      bool_or(s.commercial_usage_status = 'DERIVED_ONLY') as has_derived_only,
      bool_and(s.commercial_usage_status = 'COMMERCIAL_OK') as all_commercial_ok
    from source_states s
    group by s.event_id
  )
  select
    req.event_id,
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
  from requested req
  left join aggregated a
    on a.event_id = req.event_id
  order by req.event_id;
end;
$$;

revoke all on function public.geomacro_structured_event_rights_snapshot(uuid[])
  from public, anon, authenticated;
grant execute on function public.geomacro_structured_event_rights_snapshot(uuid[])
  to service_role;

create or replace function public.recompute_structured_event_commercial_eligibility(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.live_structured_events ev
  set
    commercial_eligibility_status = rights.evaluated_status,
    commercial_eligibility_reason_codes = rights.reason_codes
  from public.geomacro_structured_event_rights_snapshot(array[p_event_id]) rights
  where ev.id = p_event_id
    and rights.event_id = ev.id
    and (
      ev.commercial_eligibility_status is distinct from rights.evaluated_status
      or ev.commercial_eligibility_reason_codes is distinct from rights.reason_codes
    );
end;
$$;

revoke all on function public.recompute_structured_event_commercial_eligibility(uuid)
  from public, anon, authenticated;
grant execute on function public.recompute_structured_event_commercial_eligibility(uuid)
  to service_role;

comment on function public.geomacro_structured_event_rights_snapshot(uuid[]) is
  'Bounded targeted equivalent of structured-event commercial-rights evaluation for explicitly requested event IDs.';
