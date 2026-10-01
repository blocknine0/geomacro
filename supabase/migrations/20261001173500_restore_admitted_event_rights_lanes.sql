-- Restore the reviewed admitted-events discovery-lane rights semantics after
-- later archive/targeted-rights migrations replaced the original 052 view.
--
-- No raw publisher material is promoted here. The helper maps only the internal
-- admitted_events transport identity to one of three reviewed commercial lanes
-- using the already-persisted publisher domain. Unknown provenance remains the
-- original INTERNAL_INHERIT_ONLY source and therefore fails closed.

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
  notes,
  commercial_usage_status,
  commercial_terms_reference,
  commercial_reviewed_at
)
values
  (
    'admitted_events_derived_discovery',
    'Admitted Events Reviewed Derived Discovery Lane',
    'Geomacro',
    'news_discovery',
    'urn:geomacro:rights-lane:admitted-events-derived',
    false,
    86400,
    'prohibited',
    false,
    true,
    true,
    'Internal rights identity only. Represents the reviewed GDELT/ReliefWeb derived-intelligence lane. It never grants raw publisher redistribution rights.',
    'DERIVED_ONLY',
    'internal-policy:commercial-discovery-provider-policy',
    '2026-09-10T00:00:00Z'::timestamptz
  ),
  (
    'admitted_events_guardian_ineligible',
    'Admitted Events Guardian Ineligible Lane',
    'Geomacro',
    'news_discovery',
    'urn:geomacro:rights-lane:admitted-events-guardian-ineligible',
    false,
    86400,
    'prohibited',
    false,
    false,
    true,
    'Internal rights identity only. Direct Guardian Open Platform evidence remains excluded from the current automated commercial intelligence path.',
    'INELIGIBLE',
    'internal-policy:guardian-open-platform-terms-reviewed-2026-09-10',
    '2026-09-10T00:00:00Z'::timestamptz
  ),
  (
    'admitted_events_gdacs_review',
    'Admitted Events GDACS Review Lane',
    'Geomacro',
    'news_discovery',
    'urn:geomacro:rights-lane:admitted-events-gdacs-review',
    false,
    86400,
    'prohibited',
    false,
    true,
    true,
    'Internal rights identity only. GDACS evidence remains review-gated for paid machine delivery until an explicit commercial reuse review is closed.',
    'REVIEW_REQUIRED',
    'internal-policy:gdacs-terms-reviewed-2026-09-10',
    '2026-09-10T00:00:00Z'::timestamptz
  )
on conflict (source_key) do update
set
  source_name = excluded.source_name,
  provider = excluded.provider,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  enabled = false,
  cadence_seconds = excluded.cadence_seconds,
  raw_storage_policy = excluded.raw_storage_policy,
  redistribution_allowed = excluded.redistribution_allowed,
  derivative_intelligence_allowed = excluded.derivative_intelligence_allowed,
  attribution_required = excluded.attribution_required,
  notes = excluded.notes,
  commercial_usage_status = excluded.commercial_usage_status,
  commercial_terms_reference = excluded.commercial_terms_reference,
  commercial_reviewed_at = excluded.commercial_reviewed_at,
  updated_at = now();

create or replace function public.geomacro_effective_structured_evidence_source_key(
  p_manifest_source_key text,
  p_source_domain text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_manifest_source_key, '')), '') is null then null
    when p_manifest_source_key <> 'admitted_events' then p_manifest_source_key
    when nullif(lower(btrim(coalesce(p_source_domain, ''))), '') is null
      or lower(btrim(coalesce(p_source_domain, ''))) = 'unknown'
      then 'admitted_events'
    when lower(btrim(p_source_domain)) in ('theguardian.com', 'guardian.com')
      then 'admitted_events_guardian_ineligible'
    when lower(btrim(p_source_domain)) = 'gdacs.org'
      or lower(btrim(p_source_domain)) like '%.gdacs.org'
      then 'admitted_events_gdacs_review'
    else 'admitted_events_derived_discovery'
  end;
$$;

revoke all on function public.geomacro_effective_structured_evidence_source_key(text, text)
  from public, anon, authenticated;
grant execute on function public.geomacro_effective_structured_evidence_source_key(text, text)
  to service_role;

comment on function public.geomacro_effective_structured_evidence_source_key(text, text) is
  'Maps the admitted_events transport source to the reviewed discovery-lane rights identity. Other source keys are unchanged; missing admitted-event provenance remains fail-closed.';

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
      select public.geomacro_effective_structured_evidence_source_key(
        m.source_key,
        e.source_domain
      ) as source_key
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
    where nullif(btrim(coalesce(i.source_key, '')), '') is not null
  ) s
) a on true;

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

comment on view public.live_structured_event_commercial_rights_evaluation is
  'Authoritative structured-event commercial-rights evaluation. admitted_events is resolved through the reviewed discovery-lane helper before policy evaluation; archived effective source identities preserve rights parity.';

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
    select
      req.event_id,
      public.geomacro_effective_structured_evidence_source_key(
        m.source_key,
        e.source_domain
      ) as source_key
    from requested req
    join public.live_structured_event_evidence e
      on e.event_id = req.event_id
    join public.live_fragment_manifest m
      on m.id = e.fragment_id

    union

    select req.event_id, archived.source_key
    from requested req
    join public.live_structured_event_archived_sources archived
      on archived.event_id = req.event_id
  ), source_states as (
    select
      i.event_id,
      i.source_key,
      r.commercial_usage_status
    from source_identities i
    left join public.live_source_registry r
      on r.source_key = i.source_key
    where nullif(btrim(coalesce(i.source_key, '')), '') is not null
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

create or replace function public.sync_structured_event_rights_from_source_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if new.commercial_usage_status is not distinct from old.commercial_usage_status
     and new.commercial_terms_reference is not distinct from old.commercial_terms_reference
     and new.commercial_reviewed_at is not distinct from old.commercial_reviewed_at then
    return new;
  end if;

  for v_event_id in
    select distinct affected.event_id
    from (
      select e.event_id
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m
        on m.id = e.fragment_id
      where public.geomacro_effective_structured_evidence_source_key(
        m.source_key,
        e.source_domain
      ) = new.source_key

      union

      select archived.event_id
      from public.live_structured_event_archived_sources archived
      where archived.source_key = new.source_key
    ) affected
  loop
    perform public.recompute_structured_event_commercial_eligibility(v_event_id);
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_structured_event_rights_from_source_policy()
  from public, anon, authenticated;

create or replace function public.geomacro_structured_evidence_archive_candidates(
  p_older_days integer,
  p_limit integer
)
returns table (
  event_id uuid,
  fingerprint text,
  source_key text,
  row_json jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_older_days < 7 or p_older_days > 3650 or p_limit < 1 or p_limit > 1000 then
    raise exception 'STRUCTURED_EVIDENCE_ARCHIVE_CONFIG_INVALID';
  end if;

  return query
  select
    e.event_id,
    e.fingerprint,
    public.geomacro_effective_structured_evidence_source_key(m.source_key, e.source_domain),
    to_jsonb(e) as row_json
  from public.live_structured_event_evidence e
  join public.live_structured_events ev on ev.id = e.event_id
  join public.live_fragment_manifest m on m.id = e.fragment_id
  left join public.live_structured_event_evidence_archive_index a
    on a.event_id = e.event_id and a.fingerprint = e.fingerprint
  where a.event_id is null
    and e.created_at < now() - make_interval(days => p_older_days)
    and ev.last_seen_at < now() - make_interval(days => p_older_days)
    and ev.structured_payload->'_archive'->>'v' = '2'
    and nullif(btrim(public.geomacro_effective_structured_evidence_source_key(m.source_key, e.source_domain)), '') is not null
  order by e.created_at asc, e.event_id asc, e.fingerprint asc
  limit p_limit;
end;
$$;

revoke all on function public.geomacro_structured_evidence_archive_candidates(integer, integer)
  from public, anon, authenticated;
grant execute on function public.geomacro_structured_evidence_archive_candidates(integer, integer)
  to service_role;

create or replace function public.geomacro_structured_evidence_delete_candidates(
  p_limit integer default 500
)
returns table(
  event_id uuid,
  fingerprint text,
  source_key text,
  bundle_key text,
  bundle_sha256 text,
  row_sha256 text,
  row_json jsonb
)
language plpgsql
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'STRUCTURED_EVIDENCE_DELETE_CONFIG_INVALID';
  end if;

  return query
  with first_bundle as (
    select a.bundle_key
    from public.live_structured_event_evidence_archive_index a
    join public.live_structured_event_evidence e
      on e.event_id = a.event_id and e.fingerprint = a.fingerprint
    join public.live_fragment_manifest m on m.id = e.fragment_id
    where a.row_json->'_archive' is null
      and to_jsonb(e) = a.row_json
      and public.geomacro_effective_structured_evidence_source_key(m.source_key, e.source_domain) = a.source_key
    order by a.archived_at asc, a.bundle_key asc
    limit 1
  )
  select
    a.event_id,
    a.fingerprint,
    a.source_key,
    a.bundle_key,
    a.bundle_sha256,
    a.row_sha256,
    a.row_json
  from public.live_structured_event_evidence_archive_index a
  join public.live_structured_event_evidence e
    on e.event_id = a.event_id and e.fingerprint = a.fingerprint
  join public.live_fragment_manifest m on m.id = e.fragment_id
  where a.bundle_key = (select fb.bundle_key from first_bundle fb)
    and a.row_json->'_archive' is null
    and to_jsonb(e) = a.row_json
    and public.geomacro_effective_structured_evidence_source_key(m.source_key, e.source_domain) = a.source_key
  order by a.archived_at asc, a.event_id asc, a.fingerprint asc
  limit least(p_limit, 50);
end;
$$;

comment on function public.geomacro_structured_evidence_delete_candidates(integer) is
  'Returns one verified archive bundle at a time using the effective reviewed source-rights identity; destructive candidate windows remain capped at 50 rows.';

-- Refresh only recent admitted-event cache rows. Historical rows remain
-- query-correct through the authoritative view and can be reconciled lazily.
update public.live_structured_events ev
set
  commercial_eligibility_status = rights.evaluated_status,
  commercial_eligibility_reason_codes = rights.reason_codes
from public.live_structured_event_commercial_rights_evaluation rights
where rights.event_id = ev.id
  and ev.last_observed_at >= now() - interval '7 days'
  and exists (
    select 1
    from public.live_structured_event_evidence e
    join public.live_fragment_manifest m on m.id = e.fragment_id
    where e.event_id = ev.id
      and m.source_key = 'admitted_events'
  )
  and (
    ev.commercial_eligibility_status is distinct from rights.evaluated_status
    or ev.commercial_eligibility_reason_codes is distinct from rights.reason_codes
  );

commit;
