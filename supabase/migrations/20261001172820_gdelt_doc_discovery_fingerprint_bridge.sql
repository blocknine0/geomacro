begin;

create table if not exists public.live_source_discovery_fingerprints (
  fingerprint text not null,
  source_key text not null references public.live_source_registry(source_key) on update cascade on delete restrict,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  source_domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (fingerprint, source_key),
  check (fingerprint ~ '^[a-f0-9]{64}$'),
  check (expires_at > observed_at)
);

alter table public.live_source_discovery_fingerprints enable row level security;
revoke all on public.live_source_discovery_fingerprints from public, anon, authenticated;
grant select, insert, update, delete on public.live_source_discovery_fingerprints to service_role;

create index if not exists live_source_discovery_fingerprints_expiry_idx
  on public.live_source_discovery_fingerprints(expires_at, source_key);

create or replace function public.attach_structured_evidence_discovery_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_key text;
begin
  if new.acquisition_source_key is not null then
    return new;
  end if;

  select f.source_key
    into v_source_key
  from public.live_source_discovery_fingerprints f
  where f.fingerprint = new.fingerprint
    and f.source_key = 'gdelt_doc'
    and f.expires_at >= now()
  order by f.observed_at desc
  limit 1;

  if v_source_key is not null then
    new.acquisition_source_key := v_source_key;
  end if;

  return new;
end;
$$;

revoke all on function public.attach_structured_evidence_discovery_source()
  from public, anon, authenticated;

drop trigger if exists attach_structured_evidence_discovery_source_before_write
  on public.live_structured_event_evidence;
create trigger attach_structured_evidence_discovery_source_before_write
before insert or update of fingerprint, acquisition_source_key
on public.live_structured_event_evidence
for each row
execute function public.attach_structured_evidence_discovery_source();

create or replace function public.backfill_structured_evidence_from_discovery_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_key = 'gdelt_doc' and new.expires_at >= now() then
    update public.live_structured_event_evidence e
    set acquisition_source_key = new.source_key
    where e.fingerprint = new.fingerprint
      and e.acquisition_source_key is null;
  end if;

  return new;
end;
$$;

revoke all on function public.backfill_structured_evidence_from_discovery_fingerprint()
  from public, anon, authenticated;

drop trigger if exists backfill_structured_evidence_from_discovery_fingerprint_after_write
  on public.live_source_discovery_fingerprints;
create trigger backfill_structured_evidence_from_discovery_fingerprint_after_write
after insert or update of observed_at, expires_at
on public.live_source_discovery_fingerprints
for each row
execute function public.backfill_structured_evidence_from_discovery_fingerprint();

create or replace function public.preserve_structured_event_effective_source_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transport_source_key text;
  v_effective_source_key text;
  v_other_transport_identity_exists boolean;
begin
  select m.source_key
    into v_transport_source_key
  from public.live_fragment_manifest m
  where m.id = old.fragment_id;

  v_effective_source_key := coalesce(old.acquisition_source_key, v_transport_source_key);

  if old.acquisition_source_key is not null
     and v_transport_source_key is not null
     and old.acquisition_source_key is distinct from v_transport_source_key then
    select exists (
      select 1
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m
        on m.id = e.fragment_id
      where e.event_id = old.event_id
        and e.fingerprint <> old.fingerprint
        and coalesce(e.acquisition_source_key, m.source_key) = v_transport_source_key
    ) into v_other_transport_identity_exists;

    if not v_other_transport_identity_exists then
      delete from public.live_structured_event_archived_sources a
      where a.event_id = old.event_id
        and a.source_key = v_transport_source_key;
    end if;
  end if;

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

      select e.event_id
      from public.live_structured_event_evidence e
      where e.acquisition_source_key = new.source_key

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

comment on table public.live_source_discovery_fingerprints is
  'Short-lived exact fingerprint ledger for governed discovery sources. It stores no publisher payload and may attach an acquisition source to structured evidence only on exact fingerprint equality.';

commit;
