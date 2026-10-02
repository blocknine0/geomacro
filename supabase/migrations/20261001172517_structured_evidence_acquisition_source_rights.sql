begin;

insert into public.live_source_registry (
  source_key,
  source_name,
  provider,
  source_type,
  base_url,
  enabled,
  cadence_seconds,
  raw_storage_policy,
  redistribution_allowed,
  derivative_intelligence_allowed,
  attribution_required,
  license_url,
  notes,
  commercial_usage_status,
  commercial_terms_reference,
  commercial_reviewed_at,
  realtime_hot_topic_enabled,
  connector_status
)
values (
  'gdelt_doc',
  'GDELT DOC 2.0 API',
  'GDELT',
  'news_discovery',
  'https://api.gdeltproject.org/api/v2/doc/doc',
  true,
  900,
  'internal_only',
  false,
  true,
  true,
  'https://www.gdeltproject.org/about.html',
  'GDELT DOC is discovery metadata only. GDELT datasets are available for unrestricted commercial use with attribution. Geomacro classifies DOC as DERIVED_ONLY because third-party publisher headlines/URLs/content retain their separate copyright boundary; raw publisher content is never a customer product.',
  'DERIVED_ONLY',
  'https://www.gdeltproject.org/about.html',
  '2026-10-01T00:00:00Z'::timestamptz,
  true,
  'registered'
)
on conflict (source_key) do update set
  source_name = excluded.source_name,
  provider = excluded.provider,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  enabled = excluded.enabled,
  cadence_seconds = excluded.cadence_seconds,
  raw_storage_policy = excluded.raw_storage_policy,
  redistribution_allowed = excluded.redistribution_allowed,
  derivative_intelligence_allowed = excluded.derivative_intelligence_allowed,
  attribution_required = excluded.attribution_required,
  license_url = excluded.license_url,
  notes = excluded.notes,
  commercial_usage_status = excluded.commercial_usage_status,
  commercial_terms_reference = excluded.commercial_terms_reference,
  commercial_reviewed_at = excluded.commercial_reviewed_at,
  realtime_hot_topic_enabled = excluded.realtime_hot_topic_enabled,
  connector_status = excluded.connector_status,
  updated_at = now();

alter table public.live_structured_event_evidence
  add column if not exists acquisition_source_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'live_structured_event_evidence_acquisition_source_key_fkey'
  ) then
    alter table public.live_structured_event_evidence
      add constraint live_structured_event_evidence_acquisition_source_key_fkey
      foreign key (acquisition_source_key)
      references public.live_source_registry(source_key)
      on update cascade
      on delete restrict;
  end if;
end;
$$;

create index if not exists live_structured_event_evidence_acquisition_source_event_idx
  on public.live_structured_event_evidence(acquisition_source_key, event_id)
  where acquisition_source_key is not null;

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
    when a.has_derived_only then 'DERIVED_ONLY'
    when a.all_commercial_ok then 'VERIFIED'
    else 'UNVERIFIED'
  end::text as evaluated_status,
  case
    when coalesce(a.source_count, 0) = 0 then array['missing_structured_event_source_provenance']::text[]
    when a.has_ineligible then array['commercial_source_ineligible']::text[]
    when a.has_missing_policy then array['missing_commercial_source_policy']::text[]
    when a.has_review_required then array['commercial_source_review_required']::text[]
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
    bool_or(s.commercial_usage_status = 'DERIVED_ONLY') as has_derived_only,
    bool_and(s.commercial_usage_status = 'COMMERCIAL_OK') as all_commercial_ok
  from (
    select distinct
      coalesce(e.acquisition_source_key, m.source_key) as source_key,
      case
        when e.acquisition_source_key is not null then acquisition.commercial_usage_status
        when transport.commercial_usage_status = 'INTERNAL_INHERIT_ONLY'
          then coalesce(policy.commercial_usage_status, 'REVIEW_REQUIRED')
        else transport.commercial_usage_status
      end as commercial_usage_status
    from public.live_structured_event_evidence e
    join public.live_fragment_manifest m
      on m.id = e.fragment_id
    left join public.live_source_registry transport
      on transport.source_key = m.source_key
    left join public.live_source_registry acquisition
      on acquisition.source_key = e.acquisition_source_key
    left join lateral (
      select p.commercial_usage_status
      from public.live_source_url_commercial_policy p
      where lower(coalesce(e.source_domain, '')) = p.source_domain
        and lower(coalesce(e.source_url, '')) like lower(p.url_prefix) || '%'
        and (
          p.required_url_fragment is null
          or position(lower(p.required_url_fragment) in lower(coalesce(e.source_url, ''))) > 0
        )
      order by length(p.url_prefix) desc, p.policy_id asc
      limit 1
    ) policy on true
    where e.event_id = ev.id

    union

    select distinct
      archived.source_key,
      r.commercial_usage_status
    from public.live_structured_event_archived_sources archived
    left join public.live_source_registry r
      on r.source_key = archived.source_key
    where archived.event_id = ev.id
  ) s
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
  select
    r.event_id,
    r.evaluated_status,
    r.reason_codes,
    r.source_keys
  from public.live_structured_event_commercial_rights_evaluation r
  where r.event_id = any(p_event_ids)
  order by r.event_id;
end;
$$;

revoke all on function public.geomacro_structured_event_rights_snapshot(uuid[])
  from public, anon, authenticated;
grant execute on function public.geomacro_structured_event_rights_snapshot(uuid[])
  to service_role;

create or replace function public.preserve_structured_event_effective_source_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transport_source_key text;
  v_effective_source_key text;
begin
  select m.source_key
    into v_transport_source_key
  from public.live_fragment_manifest m
  where m.id = old.fragment_id;

  v_effective_source_key := coalesce(old.acquisition_source_key, v_transport_source_key);

  if v_effective_source_key is not null then
    insert into public.live_structured_event_archived_sources (
      event_id,
      source_key,
      first_archived_at,
      last_verified_at
    ) values (
      old.event_id,
      v_effective_source_key,
      now(),
      now()
    )
    on conflict (event_id, source_key)
    do update set last_verified_at = excluded.last_verified_at;
  end if;

  return old;
end;
$$;

revoke all on function public.preserve_structured_event_effective_source_on_delete()
  from public, anon, authenticated;

drop trigger if exists preserve_structured_event_effective_source_before_delete
  on public.live_structured_event_evidence;
create trigger preserve_structured_event_effective_source_before_delete
before delete on public.live_structured_event_evidence
for each row
execute function public.preserve_structured_event_effective_source_on_delete();

create or replace function public.sync_structured_event_rights_from_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transport_source_key text;
  v_effective_source_key text;
begin
  if tg_op = 'DELETE' then
    select m.source_key into v_transport_source_key
    from public.live_fragment_manifest m
    where m.id = old.fragment_id;

    v_effective_source_key := coalesce(old.acquisition_source_key, v_transport_source_key);

    if v_effective_source_key is not null
       and exists (
         select 1
         from public.live_structured_event_archived_sources a
         where a.event_id = old.event_id
           and a.source_key = v_effective_source_key
       ) then
      return old;
    end if;

    perform public.recompute_structured_event_commercial_eligibility(old.event_id);
    return old;
  end if;

  perform public.recompute_structured_event_commercial_eligibility(new.event_id);

  if tg_op = 'UPDATE' and old.event_id is distinct from new.event_id then
    perform public.recompute_structured_event_commercial_eligibility(old.event_id);
  end if;

  return new;
end;
$$;

revoke all on function public.sync_structured_event_rights_from_evidence()
  from public, anon, authenticated;

comment on column public.live_structured_event_evidence.acquisition_source_key is
  'Optional governed acquisition/discovery source that supplied this exact fingerprint. It overrides internal transport identity for commercial-rights evaluation only; publisher URL/domain remain separate evidence provenance.';

comment on view public.live_structured_event_commercial_rights_evaluation is
  'Authoritative structured-event commercial-rights evaluation. Exact acquisition-source provenance overrides internal transport identity; INTERNAL_INHERIT_ONLY without an acquisition source resolves only through reviewed narrow URL policy and otherwise fails closed.';

commit;
