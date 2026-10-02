begin;

-- Preserve the minimum source identity needed to evaluate commercial rights
-- after full structured-event evidence rows have been verified in B2 and
-- removed from the hot evidence table. This table intentionally stores only
-- event/source identity, not raw evidence payloads.
create table if not exists public.live_structured_event_archived_sources (
  event_id uuid not null references public.live_structured_events(id) on delete cascade,
  source_key text not null,
  first_archived_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  primary key (event_id, source_key),
  check (length(trim(source_key)) > 0)
);

alter table public.live_structured_event_archived_sources enable row level security;
revoke all on public.live_structured_event_archived_sources from public, anon, authenticated;
grant select, insert, update, delete on public.live_structured_event_archived_sources to service_role;

create index if not exists live_structured_event_archived_sources_source_key_idx
  on public.live_structured_event_archived_sources(source_key, event_id);

-- Keep rights evaluation semantically identical while allowing source identity
-- to come from either live evidence or the compact archived-source bridge.
create or replace view public.live_structured_event_commercial_rights_evaluation
with (security_invoker = true)
as
with source_identities as (
  select distinct
    e.event_id,
    m.source_key
  from public.live_structured_event_evidence e
  join public.live_fragment_manifest m
    on m.id = e.fragment_id

  union

  select
    a.event_id,
    a.source_key
  from public.live_structured_event_archived_sources a
), source_states as (
  select
    i.event_id,
    i.source_key,
    r.commercial_usage_status
  from source_identities i
  left join public.live_source_registry r
    on r.source_key = i.source_key
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

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

-- Archived source identities are part of the same authoritative rights graph.
create or replace function public.sync_structured_event_rights_from_archived_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
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

revoke all on function public.sync_structured_event_rights_from_archived_sources()
  from public, anon, authenticated;

drop trigger if exists live_structured_event_rights_archived_source_sync
  on public.live_structured_event_archived_sources;
create trigger live_structured_event_rights_archived_source_sync
after insert or update or delete
on public.live_structured_event_archived_sources
for each row
execute function public.sync_structured_event_rights_from_archived_sources();

-- Source-policy changes must still reach events after detailed evidence leaves
-- the hot table. Union both provenance bridges before recomputation.
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
    select distinct event_id
    from (
      select e.event_id
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m
        on m.id = e.fragment_id
      where m.source_key = new.source_key

      union

      select a.event_id
      from public.live_structured_event_archived_sources a
      where a.source_key = new.source_key
    ) affected
  loop
    perform public.recompute_structured_event_commercial_eligibility(v_event_id);
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_structured_event_rights_from_source_policy()
  from public, anon, authenticated;

comment on table public.live_structured_event_archived_sources is
  'Compact source-identity bridge retained after B2-verified structured-event evidence archival so commercial-rights evaluation and future source-policy changes remain fail-closed and auditable.';

commit;
