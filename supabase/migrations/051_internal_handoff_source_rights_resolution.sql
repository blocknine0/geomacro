begin;

-- Internal transports such as `admitted_events` must never manufacture source
-- rights. When an immutable evidence fragment is produced by an internal
-- handoff, resolve its rights only from an explicit, reviewed URL policy for
-- the exact upstream dataset/API path. Missing policy remains fail closed.

create table if not exists public.live_source_url_commercial_policy (
  policy_id text primary key,
  source_domain text not null,
  url_prefix text not null,
  required_url_fragment text,
  commercial_usage_status text not null
    check (
      commercial_usage_status in (
        'COMMERCIAL_OK',
        'DERIVED_ONLY',
        'REVIEW_REQUIRED',
        'INELIGIBLE'
      )
    ),
  commercial_terms_reference text not null,
  reviewed_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_domain = lower(source_domain)),
  check (url_prefix ~ '^https://')
);

alter table public.live_source_url_commercial_policy
  enable row level security;

revoke all on public.live_source_url_commercial_policy
  from public, anon, authenticated;
grant select on public.live_source_url_commercial_policy
  to service_role;

-- These rows are intentionally narrow. They apply only to the exact reviewed
-- dataset/API families recorded in the source-rights register; they do not
-- grant rights to an entire provider website or to third-party material.
insert into public.live_source_url_commercial_policy (
  policy_id,
  source_domain,
  url_prefix,
  required_url_fragment,
  commercial_usage_status,
  commercial_terms_reference,
  reviewed_at,
  notes
)
values
  (
    'world-bank-wdi-source-2',
    'api.worldbank.org',
    'https://api.worldbank.org/v2/country/',
    'source=2',
    'COMMERCIAL_OK',
    'https://datacatalog.worldbank.org/public-licenses',
    '2026-09-10T00:00:00Z'::timestamptz,
    'Only the World Development Indicators API path pinned to source=2. No other World Bank catalogue or third-party dataset inherits this policy.'
  ),
  (
    'unhcr-refugee-population-v1',
    'api.unhcr.org',
    'https://api.unhcr.org/population/v1/',
    null,
    'COMMERCIAL_OK',
    'https://www.unhcr.org/asia/terms-use-datasets',
    '2026-09-10T00:00:00Z'::timestamptz,
    'Only the Refugee Population Statistics API family. General UNHCR website content does not inherit this policy.'
  ),
  (
    'ucdp-ged-api',
    'ucdpapi.pcr.uu.se',
    'https://ucdpapi.pcr.uu.se/api/gedevents/',
    null,
    'COMMERCIAL_OK',
    'https://ucdp.uu.se/downloads/',
    '2026-09-10T00:00:00Z'::timestamptz,
    'Only the UCDP GED API family under the reviewed current dataset licence/citation contract.'
  )
on conflict (policy_id)
do update set
  source_domain = excluded.source_domain,
  url_prefix = excluded.url_prefix,
  required_url_fragment = excluded.required_url_fragment,
  commercial_usage_status = excluded.commercial_usage_status,
  commercial_terms_reference = excluded.commercial_terms_reference,
  reviewed_at = excluded.reviewed_at,
  notes = excluded.notes,
  updated_at = now();

-- Preserve the public shape introduced in migration 049. For ordinary external
-- fragments, source-registry policy remains authoritative. For an internal
-- inherit-only fragment, a narrow reviewed URL policy may supply the upstream
-- rights state. No URL policy match means REVIEW_REQUIRED -> UNVERIFIED.
create or replace view public.live_structured_event_commercial_rights_evaluation
with (security_invoker = true)
as
with source_states as (
  select distinct
    e.event_id,
    m.source_key,
    case
      when r.commercial_usage_status = 'INTERNAL_INHERIT_ONLY'
        then coalesce(p.commercial_usage_status, 'REVIEW_REQUIRED')
      else r.commercial_usage_status
    end as commercial_usage_status
  from public.live_structured_event_evidence e
  join public.live_fragment_manifest m
    on m.id = e.fragment_id
  left join public.live_source_registry r
    on r.source_key = m.source_key
  left join lateral (
    select
      policy.commercial_usage_status
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
    order by
      length(policy.url_prefix) desc,
      policy.policy_id asc
    limit 1
  ) p on true
), aggregated as (
  select
    event_id,
    array_agg(distinct source_key order by source_key) as source_keys,
    bool_or(commercial_usage_status is null) as has_missing_policy,
    bool_or(commercial_usage_status = 'INELIGIBLE') as has_ineligible,
    bool_or(commercial_usage_status = 'REVIEW_REQUIRED') as has_review_required,
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
from public.live_structured_events ev
left join aggregated a
  on a.event_id = ev.id;

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

create or replace function public.sync_structured_event_rights_from_url_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  -- URL-policy mutations are rare operator actions. Recompute only events that
  -- depend on the internal admitted-events handoff; the authoritative view
  -- still decides the final state.
  for v_event_id in
    select distinct e.event_id
    from public.live_structured_event_evidence e
    join public.live_fragment_manifest m
      on m.id = e.fragment_id
    where m.source_key = 'admitted_events'
  loop
    perform public.recompute_structured_event_commercial_eligibility(v_event_id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_structured_event_rights_from_url_policy()
  from public, anon, authenticated;

drop trigger if exists live_structured_event_rights_url_policy_sync
  on public.live_source_url_commercial_policy;

create trigger live_structured_event_rights_url_policy_sync
after insert or update or delete
on public.live_source_url_commercial_policy
for each row
execute function public.sync_structured_event_rights_from_url_policy();

-- Reconcile the cache immediately after replacing the authoritative view.
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

comment on table public.live_source_url_commercial_policy is
  'Narrow reviewed URL-prefix rights policies used only to resolve upstream source rights when an internal fragment transport is marked INTERNAL_INHERIT_ONLY.';

commit;
