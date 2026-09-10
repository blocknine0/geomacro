begin;

-- Keep the stored structured-event commercial eligibility cache synchronized
-- with the authoritative provenance evaluation view introduced in migration 049.
-- The view remains the source of truth; this cache exists because downstream
-- country-risk publishing already consumes the stored event fields.

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
  from public.live_structured_event_commercial_rights_evaluation rights
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

create or replace function public.sync_structured_event_rights_from_evidence()
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

revoke all on function public.sync_structured_event_rights_from_evidence()
  from public, anon, authenticated;

-- Evidence insert/update/delete is the normal provenance mutation path.
drop trigger if exists live_structured_event_rights_evidence_sync
  on public.live_structured_event_evidence;

create trigger live_structured_event_rights_evidence_sync
after insert or update or delete
on public.live_structured_event_evidence
for each row
execute function public.sync_structured_event_rights_from_evidence();

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
    select distinct e.event_id
    from public.live_structured_event_evidence e
    join public.live_fragment_manifest m
      on m.id = e.fragment_id
    where m.source_key = new.source_key
  loop
    perform public.recompute_structured_event_commercial_eligibility(v_event_id);
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_structured_event_rights_from_source_policy()
  from public, anon, authenticated;

-- A reviewed source-policy change must re-evaluate all events that depend on it.
drop trigger if exists live_structured_event_rights_source_policy_sync
  on public.live_source_registry;

create trigger live_structured_event_rights_source_policy_sync
after update of commercial_usage_status, commercial_terms_reference, commercial_reviewed_at
on public.live_source_registry
for each row
execute function public.sync_structured_event_rights_from_source_policy();

-- One-time deterministic reconciliation for rows created before these triggers.
update public.live_structured_events ev
set
  commercial_eligibility_status = rights.evaluated_status,
  commercial_eligibility_reason_codes = rights.reason_codes
from public.live_structured_event_commercial_rights_evaluation rights
where rights.event_id = ev.id
  and (
    ev.commercial_eligibility_status is distinct from rights.evaluated_status
    or ev.commercial_eligibility_reason_codes is distinct from rights.reason_codes
  );

comment on function public.recompute_structured_event_commercial_eligibility(uuid) is
  'Recomputes the stored structured-event commercial eligibility cache from the service-role-only provenance evaluation view. Does not infer or manufacture source rights.';

commit;
