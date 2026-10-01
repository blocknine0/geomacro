-- During verified B2 Phase-B handoff, live evidence and the compact archived
-- source bridge deliberately overlap for the same event/source identity before
-- the hot evidence row is removed. Since the authoritative rights graph uses
-- the UNION of those identities, adding the duplicate bridge and then removing
-- the duplicated live identity cannot change commercial-rights semantics.
-- Skip only those provably identity-preserving recomputations; all other
-- evidence/bridge mutations continue to recompute fail-closed.

create or replace function public.sync_structured_event_rights_from_evidence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_key text;
begin
  if tg_op = 'DELETE' then
    select m.source_key into v_source_key
    from public.live_fragment_manifest m
    where m.id = old.fragment_id;

    if v_source_key is not null
       and exists (
         select 1
         from public.live_structured_event_archived_sources a
         where a.event_id = old.event_id
           and a.source_key = v_source_key
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

create or replace function public.sync_structured_event_rights_from_archived_sources()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m
        on m.id = e.fragment_id
      where e.event_id = new.event_id
        and m.source_key = new.source_key
    ) then
      return new;
    end if;

    perform public.recompute_structured_event_commercial_eligibility(new.event_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1
      from public.live_structured_event_evidence e
      join public.live_fragment_manifest m
        on m.id = e.fragment_id
      where e.event_id = old.event_id
        and m.source_key = old.source_key
    ) then
      return old;
    end if;

    perform public.recompute_structured_event_commercial_eligibility(old.event_id);
    return old;
  end if;

  perform public.recompute_structured_event_commercial_eligibility(new.event_id);
  if old.event_id is distinct from new.event_id then
    perform public.recompute_structured_event_commercial_eligibility(old.event_id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_structured_event_rights_from_evidence()
  from public, anon, authenticated;
revoke all on function public.sync_structured_event_rights_from_archived_sources()
  from public, anon, authenticated;

comment on function public.sync_structured_event_rights_from_evidence() is
  'Maintains structured-event rights; skips recompute on evidence delete only when the same event/source identity is already preserved by the archived-source bridge.';
comment on function public.sync_structured_event_rights_from_archived_sources() is
  'Maintains structured-event rights; skips recompute only when adding/removing an archived source identity is provably duplicated by matching live evidence.';
