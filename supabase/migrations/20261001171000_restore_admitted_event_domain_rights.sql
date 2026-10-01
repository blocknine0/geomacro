begin;

-- Preserve the bounded publisher-domain provenance needed by the admitted-events
-- commercial policy after a B2-verified evidence row leaves the hot evidence
-- table. Existing rows intentionally remain NULL: those legacy archives did not
-- preserve domain provenance and therefore must continue to fail closed.
alter table public.live_structured_event_archived_sources
  add column if not exists source_domains text[];

comment on column public.live_structured_event_archived_sources.source_domains is
  'Compact normalized publisher domains preserved only when known during verified evidence archival. NULL means legacy or unknown provenance and remains fail-closed.';

-- Centralize the per-event source-rights state so the public evaluation view and
-- the bounded snapshot function cannot drift semantically again. Every lookup
-- stays correlated to one explicit event_id.
create or replace function public.geomacro_structured_event_source_states(
  p_event_id uuid
)
returns table (
  source_key text,
  commercial_usage_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with live_states as (
    select distinct
      m.source_key,
      case
        when m.source_key = 'admitted_events' then
          case
            when nullif(lower(trim(coalesce(e.source_domain, ''))), '') is null
              or lower(trim(coalesce(e.source_domain, ''))) = 'unknown'
              then 'REVIEW_REQUIRED'
            when lower(trim(e.source_domain)) in ('theguardian.com', 'guardian.com')
              then 'INELIGIBLE'
            when lower(trim(e.source_domain)) = 'gdacs.org'
              or lower(trim(e.source_domain)) like '%.gdacs.org'
              then 'REVIEW_REQUIRED'
            else 'DERIVED_ONLY'
          end
        when r.commercial_usage_status = 'INTERNAL_INHERIT_ONLY' then
          coalesce(p.commercial_usage_status, 'REVIEW_REQUIRED')
        else r.commercial_usage_status
      end::text as commercial_usage_status
    from public.live_structured_event_evidence e
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
    where e.event_id = p_event_id
  ), archived_states as (
    select distinct
      a.source_key,
      case
        when a.source_key = 'admitted_events' then
          case
            when nullif(lower(trim(coalesce(d.source_domain, ''))), '') is null
              or lower(trim(coalesce(d.source_domain, ''))) = 'unknown'
              then 'REVIEW_REQUIRED'
            when lower(trim(d.source_domain)) in ('theguardian.com', 'guardian.com')
              then 'INELIGIBLE'
            when lower(trim(d.source_domain)) = 'gdacs.org'
              or lower(trim(d.source_domain)) like '%.gdacs.org'
              then 'REVIEW_REQUIRED'
            else 'DERIVED_ONLY'
          end
        else r.commercial_usage_status
      end::text as commercial_usage_status
    from public.live_structured_event_archived_sources a
    left join public.live_source_registry r
      on r.source_key = a.source_key
    left join lateral unnest(
      case
        when a.source_key = 'admitted_events'
          and coalesce(cardinality(a.source_domains), 0) > 0
          then a.source_domains
        else array[null::text]
      end
    ) d(source_domain) on true
    where a.event_id = p_event_id
  )
  select l.source_key, l.commercial_usage_status
  from live_states l
  union
  select a.source_key, a.commercial_usage_status
  from archived_states a;
$$;

revoke all on function public.geomacro_structured_event_source_states(uuid)
  from public, anon, authenticated;
grant execute on function public.geomacro_structured_event_source_states(uuid)
  to service_role;

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
  from public.geomacro_structured_event_source_states(ev.id) s
) a on true;

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

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
    select distinct ev.id as requested_event_id
    from unnest(p_event_ids) as input(input_event_id)
    join public.live_structured_events ev
      on ev.id = input.input_event_id
  )
  select
    req.requested_event_id,
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
  from requested req
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
    from public.geomacro_structured_event_source_states(req.requested_event_id) s
  ) a on true
  order by req.requested_event_id;
end;
$$;

revoke all on function public.geomacro_structured_event_rights_snapshot(uuid[])
  from public, anon, authenticated;
grant execute on function public.geomacro_structured_event_rights_snapshot(uuid[])
  to service_role;

-- Reconcile only events that currently retain admitted-events evidence. There
-- are no broad table rewrites here, and legacy archived admitted-events rows
-- remain fail-closed because their source_domains value stays NULL.
do $$
declare
  v_event_id uuid;
begin
  for v_event_id in
    select distinct e.event_id
    from public.live_structured_event_evidence e
    join public.live_fragment_manifest m
      on m.id = e.fragment_id
    where m.source_key = 'admitted_events'
  loop
    perform public.recompute_structured_event_commercial_eligibility(v_event_id);
  end loop;
end;
$$;

comment on view public.live_structured_event_commercial_rights_evaluation is
  'Authoritative event-correlated commercial-rights evaluation. admitted_events uses publisher-domain policy for live evidence and only for archived evidence whose domain provenance was explicitly preserved; legacy unknown archives remain review-gated.';

comment on function public.geomacro_structured_event_source_states(uuid) is
  'Index-correlated source-rights resolver shared by the authoritative view and bounded rights snapshot so admitted-events domain semantics cannot drift between the two paths.';

commit;
