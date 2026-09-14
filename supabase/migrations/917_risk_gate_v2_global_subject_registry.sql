-- =============================================================================
-- Risk Gate v2 global subject registry
--
-- Reuses the canonical live_country_registry instead of introducing a second
-- country list. Every enabled registry country becomes a Risk Gate subject.
-- Directional country corridors are created deterministically on demand so the
-- system can support the global country-pair universe without pre-materializing
-- tens of thousands of rows.
--
-- IMPORTANT: registry presence is NOT risk coverage. New subjects remain
-- INSUFFICIENT until validated module states promote their coverage.
-- =============================================================================

insert into public.risk_subjects (
  subject_key,
  subject_type,
  canonical_code,
  display_name,
  coverage_state,
  active,
  metadata
)
select
  'country:' || registry.iso3,
  'country',
  registry.iso3,
  registry.country_name,
  'INSUFFICIENT',
  registry.enabled,
  jsonb_build_object(
    'iso2', registry.iso2,
    'region', registry.region,
    'subregion', registry.subregion,
    'registry_source', 'live_country_registry'
  )
from public.live_country_registry as registry
on conflict (subject_key)
do update set
  canonical_code = excluded.canonical_code,
  display_name = excluded.display_name,
  active = excluded.active,
  metadata = excluded.metadata,
  updated_at = now();


create or replace function public.sync_risk_gate_country_subject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.risk_subjects (
    subject_key,
    subject_type,
    canonical_code,
    display_name,
    coverage_state,
    active,
    metadata
  )
  values (
    'country:' || new.iso3,
    'country',
    new.iso3,
    new.country_name,
    'INSUFFICIENT',
    new.enabled,
    jsonb_build_object(
      'iso2', new.iso2,
      'region', new.region,
      'subregion', new.subregion,
      'registry_source', 'live_country_registry'
    )
  )
  on conflict (subject_key)
  do update set
    canonical_code = excluded.canonical_code,
    display_name = excluded.display_name,
    active = excluded.active,
    metadata = excluded.metadata,
    updated_at = now();

  if new.enabled = false then
    update public.risk_subjects
    set
      active = false,
      updated_at = now()
    where subject_type = 'corridor'
      and (
        subject_key like ('corridor:' || new.iso3 || '>%')
        or subject_key like ('corridor:%>' || new.iso3)
      );
  end if;

  return new;
end;
$$;

create trigger risk_gate_country_registry_sync
  after insert or update of
    iso2,
    iso3,
    country_name,
    region,
    subregion,
    enabled
  on public.live_country_registry
  for each row
  execute function public.sync_risk_gate_country_subject();


create or replace function public.ensure_risk_gate_corridor_subject(
  p_origin_iso3 text,
  p_destination_iso3 text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  origin_iso3 text;
  destination_iso3 text;
  origin_name text;
  destination_name text;
  corridor_key text;
  corridor_name text;
begin
  origin_iso3 := upper(trim(coalesce(p_origin_iso3, '')));
  destination_iso3 := upper(trim(coalesce(p_destination_iso3, '')));

  if origin_iso3 !~ '^[A-Z]{3}$' then
    raise exception 'origin must be an ISO3 country code';
  end if;

  if destination_iso3 !~ '^[A-Z]{3}$' then
    raise exception 'destination must be an ISO3 country code';
  end if;

  if origin_iso3 = destination_iso3 then
    raise exception 'corridor origin and destination must be different';
  end if;

  select country_name
  into origin_name
  from public.live_country_registry
  where iso3 = origin_iso3
    and enabled = true;

  if origin_name is null then
    raise exception 'origin country is not enabled in the canonical country registry';
  end if;

  select country_name
  into destination_name
  from public.live_country_registry
  where iso3 = destination_iso3
    and enabled = true;

  if destination_name is null then
    raise exception 'destination country is not enabled in the canonical country registry';
  end if;

  -- Defensive upsert in case this function is called immediately after a
  -- country-registry change but before a consumer has observed the trigger.
  insert into public.risk_subjects (
    subject_key,
    subject_type,
    canonical_code,
    display_name,
    coverage_state,
    active,
    metadata
  )
  select
    'country:' || registry.iso3,
    'country',
    registry.iso3,
    registry.country_name,
    'INSUFFICIENT',
    true,
    jsonb_build_object(
      'iso2', registry.iso2,
      'region', registry.region,
      'subregion', registry.subregion,
      'registry_source', 'live_country_registry'
    )
  from public.live_country_registry as registry
  where registry.iso3 in (origin_iso3, destination_iso3)
    and registry.enabled = true
  on conflict (subject_key)
  do update set
    canonical_code = excluded.canonical_code,
    display_name = excluded.display_name,
    active = true,
    metadata = excluded.metadata,
    updated_at = now();

  corridor_key := 'corridor:' || origin_iso3 || '>' || destination_iso3;
  corridor_name := origin_name || ' → ' || destination_name;

  insert into public.risk_subjects (
    subject_key,
    subject_type,
    canonical_code,
    display_name,
    coverage_state,
    active,
    metadata
  )
  values (
    corridor_key,
    'corridor',
    origin_iso3 || '>' || destination_iso3,
    corridor_name,
    'INSUFFICIENT',
    true,
    jsonb_build_object(
      'origin_country_iso3', origin_iso3,
      'destination_country_iso3', destination_iso3,
      'registry_source', 'risk_gate_v2_global_subject_registry'
    )
  )
  on conflict (subject_key)
  do update set
    canonical_code = excluded.canonical_code,
    display_name = excluded.display_name,
    active = true,
    metadata = excluded.metadata,
    updated_at = now();

  insert into public.risk_exposure_edges (
    edge_id,
    from_subject_key,
    to_subject_key,
    relationship_type,
    direction,
    methodology_version,
    active,
    metadata
  )
  values
    (
      'edge:' || corridor_key || ':origin:' || origin_iso3,
      corridor_key,
      'country:' || origin_iso3,
      'corridor_origin',
      'directed',
      'risk-subject-registry-v1',
      true,
      '{}'::jsonb
    ),
    (
      'edge:' || corridor_key || ':destination:' || destination_iso3,
      corridor_key,
      'country:' || destination_iso3,
      'corridor_destination',
      'directed',
      'risk-subject-registry-v1',
      true,
      '{}'::jsonb
    )
  on conflict (
    from_subject_key,
    to_subject_key,
    relationship_type,
    methodology_version
  )
  do update set
    active = true,
    updated_at = now();

  return corridor_key;
end;
$$;


-- Keep these mutation helpers server-only. External callers receive subjects
-- through authenticated application APIs, never direct table/function access.
revoke all
on function public.sync_risk_gate_country_subject()
from PUBLIC, anon, authenticated;

grant execute
on function public.sync_risk_gate_country_subject()
to service_role;

revoke all
on function public.ensure_risk_gate_corridor_subject(text, text)
from PUBLIC, anon, authenticated;

grant execute
on function public.ensure_risk_gate_corridor_subject(text, text)
to service_role;

comment on function public.ensure_risk_gate_corridor_subject(text, text) is
  'Creates or refreshes one directional Risk Gate v2 country corridor from the canonical live_country_registry. Subject existence never implies validated risk coverage.';
