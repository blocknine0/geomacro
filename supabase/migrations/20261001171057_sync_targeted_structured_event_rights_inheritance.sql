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
  ), live_source_states as (
    select distinct
      e.event_id,
      m.source_key,
      case
        when r.commercial_usage_status = 'INTERNAL_INHERIT_ONLY'
          then coalesce(p.commercial_usage_status, 'REVIEW_REQUIRED')
        else r.commercial_usage_status
      end as commercial_usage_status
    from requested q
    join public.live_structured_event_evidence e
      on e.event_id = q.event_id
    join public.live_fragment_manifest m
      on m.id = e.fragment_id
    left join public.live_source_registry r
      on r.source_key = m.source_key
    left join lateral (
      select policy.commercial_usage_status
      from public.live_source_url_commercial_policy policy
      where lower(coalesce(e.source_domain, '')) = policy.source_domain
        and lower(coalesce(e.source_url, '')) like lower(policy.url_prefix) || '%'
        and (
          policy.required_url_fragment is null
          or position(
            lower(policy.required_url_fragment)
            in lower(coalesce(e.source_url, ''))
          ) > 0
        )
      order by length(policy.url_prefix) desc, policy.policy_id asc
      limit 1
    ) p on true
  ), archived_source_states as (
    select distinct
      a.event_id,
      a.source_key,
      case
        when r.commercial_usage_status = 'INTERNAL_INHERIT_ONLY'
          then 'REVIEW_REQUIRED'
        else r.commercial_usage_status
      end as commercial_usage_status
    from requested q
    join public.live_structured_event_archived_sources a
      on a.event_id = q.event_id
    left join public.live_source_registry r
      on r.source_key = a.source_key
  ), source_states as (
    select * from live_source_states
    union
    select * from archived_source_states
  ), aggregated as (
    select
      s.event_id,
      array_agg(distinct s.source_key order by s.source_key) as source_keys,
      bool_or(s.commercial_usage_status is null) as has_missing_policy,
      bool_or(s.commercial_usage_status = 'INELIGIBLE') as has_ineligible,
      bool_or(s.commercial_usage_status = 'REVIEW_REQUIRED') as has_review_required,
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
      when a.has_derived_only then 'DERIVED_ONLY'
      when a.all_commercial_ok then 'VERIFIED'
      else 'UNVERIFIED'
    end::text as evaluated_status,
    case
      when a.event_id is null then array['missing_structured_event_source_provenance']::text[]
      when a.has_ineligible then array['commercial_source_ineligible']::text[]
      when a.has_missing_policy then array['missing_commercial_source_policy']::text[]
      when a.has_review_required then array['commercial_source_review_required']::text[]
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
