begin;

-- Realtime scope fan-out: keep country raw acquisition as the base mesh, then
-- trigger corridor/hot-topic bursts from the first globally observed breaking
-- event. This avoids hundreds of permanent per-scope GDELT queries while still
-- giving every governed scope a dedicated target and escalation path.

insert into public.live_source_registry (
  source_key, source_name, provider, source_type, base_url, enabled,
  cadence_seconds, raw_storage_policy, redistribution_allowed,
  derivative_intelligence_allowed, attribution_required,
  commercial_usage_status, notes
)
values (
  'realtime_scope_mesh',
  'Realtime Corridor and Hot-Topic Fanout Mesh',
  'Geomacro internal orchestration',
  'internal_derived',
  'https://geomacro.live/',
  true,
  60,
  'internal_only',
  false,
  true,
  true,
  'DERIVED_ONLY',
  'Internal fanout transport. It never grants commercial rights to upstream sources.'
)
on conflict (source_key) do update set
  enabled = true,
  cadence_seconds = 60,
  raw_storage_policy = excluded.raw_storage_policy,
  redistribution_allowed = excluded.redistribution_allowed,
  derivative_intelligence_allowed = excluded.derivative_intelligence_allowed,
  commercial_usage_status = excluded.commercial_usage_status,
  notes = excluded.notes,
  updated_at = now();

insert into public.live_external_sources (
  source_id, source_name, provider_name, category, access_type,
  authentication_type, base_url, licence_name, commercial_usage_status,
  raw_redistribution_allowed, attribution_required, enabled_for_ingestion,
  enabled_for_commercial_signals, country_scope, freshness_class, notes
)
values
(
  'ukmto_msi',
  'UKMTO Maritime Security Alerts',
  'United Kingdom Maritime Trade Operations',
  'GEOPOLITICS',
  'HTML',
  'NONE',
  'https://www.ukmto.org/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official maritime security alert surface for the Middle East and Indian Ocean reporting area. Raw internal acquisition only; commercial use remains source-rights gated.'
),
(
  'suez_canal_navigation',
  'Suez Canal Authority Navigation Circulars',
  'Suez Canal Authority',
  'GEOPOLITICS',
  'HTML',
  'NONE',
  'https://www.suezcanal.gov.eg/English/Navigation/NavigationCirculars/Pages/default.aspx',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'SUEZ_RED_SEA',
  'NEAR_REAL_TIME',
  'Official canal navigation circular surface.'
),
(
  'panama_canal_notices_to_shipping',
  'Panama Canal Authority Shipping Advisories',
  'Panama Canal Authority',
  'GEOPOLITICS',
  'HTML',
  'NONE',
  'https://pancanal.com/en/advisories-to-shipping/',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'PANAMA_CANAL',
  'NEAR_REAL_TIME',
  'Official Panama Canal advisory surface.'
),
(
  'un_security_council_docs_rss',
  'UN Security Council RSS and updates',
  'United Nations Security Council',
  'GEOPOLITICS',
  'RSS',
  'NONE',
  'https://main.un.org/securitycouncil/en/rss',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official Security Council update surface.'
),
(
  'who_disease_outbreak_news',
  'WHO Disease Outbreak News',
  'World Health Organization',
  'MACRO',
  'HTML',
  'NONE',
  'https://www.who.int/emergencies/disease-outbreak-news',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Authoritative public-health event surface; not exhaustive of every event WHO is responding to.'
),
(
  'wto_news_rss',
  'WTO News RSS and resources',
  'World Trade Organization',
  'MACRO',
  'HTML',
  'NONE',
  'https://www.wto.org/english/res_e/res_e.htm',
  null,
  'REVIEW_REQUIRED',
  false,
  true,
  true,
  false,
  'GLOBAL',
  'NEAR_REAL_TIME',
  'Official WTO news/RSS discovery surface.'
)
on conflict (source_id) do update set
  source_name=excluded.source_name,
  provider_name=excluded.provider_name,
  category=excluded.category,
  access_type=excluded.access_type,
  authentication_type=excluded.authentication_type,
  base_url=excluded.base_url,
  commercial_usage_status=excluded.commercial_usage_status,
  raw_redistribution_allowed=excluded.raw_redistribution_allowed,
  attribution_required=excluded.attribution_required,
  enabled_for_ingestion=excluded.enabled_for_ingestion,
  enabled_for_commercial_signals=excluded.enabled_for_commercial_signals,
  country_scope=excluded.country_scope,
  freshness_class=excluded.freshness_class,
  notes=excluded.notes,
  updated_at=now();

create table if not exists public.live_realtime_scope_targets (
  target_id text primary key,
  scope_type text not null
    check (scope_type in ('CORRIDOR','HOT_TOPIC')),
  scope_code text not null,
  category text not null
    check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  transport text not null
    check (transport in ('GDELT_BURST','WEB_DIRECT')),
  source_id text not null
    references public.live_external_sources(source_id),
  target_url text,
  query_hint text,
  enabled boolean not null default true,
  activation_mode text not null default 'ON_BREAK'
    check (activation_mode in ('ON_BREAK','CONTINUOUS')),
  cadence_seconds integer not null default 900
    check (cadence_seconds between 60 and 86400),
  last_triggered_at timestamptz,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  consecutive_failures integer not null default 0,
  discovery_state text not null default 'DISCOVERED'
    check (discovery_state in ('DISCOVERED','REACHABLE','UNREACHABLE','STALE','BLOCKED')),
  last_error text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists live_realtime_scope_targets_scope_idx
  on public.live_realtime_scope_targets(scope_type, scope_code, category);

create index if not exists live_realtime_scope_targets_due_idx
  on public.live_realtime_scope_targets(enabled, activation_mode, last_triggered_at);

-- Every strategic corridor gets a dedicated burst target in all three product
-- categories. The target is dormant until a first-break event is mapped to it.
insert into public.live_realtime_scope_targets (
  target_id, scope_type, scope_code, category, transport, source_id,
  activation_mode, cadence_seconds, query_hint, notes
)
select
  'CORRIDOR:GDELT_BURST:' || c.corridor_id || ':' || cat.category,
  'CORRIDOR',
  c.corridor_id,
  cat.category,
  'GDELT_BURST',
  'gdelt_v2_events',
  'ON_BREAK',
  900,
  c.display_name || ' ' || array_to_string(c.chokepoints, ' '),
  'Break-triggered corridor corroboration/enrichment target; not a standing per-corridor poller.'
from public.live_strategic_corridor_catalog c
cross join (
  values
    ('GEOPOLITICS'::text),
    ('MACRO'::text),
    ('CRITICAL_MINERALS'::text)
) as cat(category)
on conflict (target_id) do update set
  source_id=excluded.source_id,
  query_hint=excluded.query_hint,
  updated_at=now();

-- Every required global hot-topic/shock family gets the same three-category
-- break target. This is the bridge between the global GDELT stream and the
-- exact risk family that needs accelerated corroboration.
insert into public.live_realtime_scope_targets (
  target_id, scope_type, scope_code, category, transport, source_id,
  activation_mode, cadence_seconds, query_hint, notes
)
select
  'HOT_TOPIC:GDELT_BURST:' || s.shock_id || ':' || cat.category,
  'HOT_TOPIC',
  s.shock_id,
  cat.category,
  'GDELT_BURST',
  'gdelt_v2_events',
  'ON_BREAK',
  900,
  s.display_name || ' ' || replace(s.shock_id, '_', ' '),
  'Break-triggered hot-topic corroboration/enrichment target.'
from public.live_global_shock_taxonomy s
cross join (
  values
    ('GEOPOLITICS'::text),
    ('MACRO'::text),
    ('CRITICAL_MINERALS'::text)
) as cat(category)
where s.required
on conflict (target_id) do update set
  source_id=excluded.source_id,
  query_hint=excluded.query_hint,
  updated_at=now();

-- Direct route/authority surfaces add a small continuously polled layer for
-- places where an official operational notice can appear before broad media.
insert into public.live_realtime_scope_targets (
  target_id, scope_type, scope_code, category, transport, source_id,
  target_url, activation_mode, cadence_seconds, query_hint, notes
)
values
(
  'CORRIDOR:WEB:UKMTO:MARITIME:GEOPOLITICS',
  'CORRIDOR', 'ALL_MARITIME_CORRIDORS', 'GEOPOLITICS', 'WEB_DIRECT',
  'ukmto_msi', 'https://www.ukmto.org/',
  'CONTINUOUS', 300, 'maritime security alert incident warning',
  'Operational maritime-security notice surface. Scope fanout attaches matching evidence to affected corridors.'
),
(
  'CORRIDOR:WEB:SUEZ:GEOPOLITICS',
  'CORRIDOR', 'SUEZ_RED_SEA', 'GEOPOLITICS', 'WEB_DIRECT',
  'suez_canal_navigation', 'https://www.suezcanal.gov.eg/English/Navigation/NavigationCirculars/Pages/default.aspx',
  'CONTINUOUS', 300, 'Suez Canal navigation circular',
  'Official route authority surface.'
),
(
  'CORRIDOR:WEB:PANAMA:GEOPOLITICS',
  'CORRIDOR', 'PANAMA_CANAL', 'GEOPOLITICS', 'WEB_DIRECT',
  'panama_canal_notices_to_shipping', 'https://pancanal.com/en/advisories-to-shipping/',
  'CONTINUOUS', 300, 'Panama Canal shipping advisory',
  'Official route authority surface.'
),
(
  'HOT_TOPIC:WEB:UNSC:GEOPOLITICS',
  'HOT_TOPIC', 'armed_conflict_escalation', 'GEOPOLITICS', 'WEB_DIRECT',
  'un_security_council_docs_rss', 'https://main.un.org/securitycouncil/en/rss',
  'CONTINUOUS', 300, 'security council conflict sanctions ceasefire',
  'Official UN Security Council updates.'
),
(
  'HOT_TOPIC:WEB:WHO:MACRO',
  'HOT_TOPIC', 'public_health_emergency', 'MACRO', 'WEB_DIRECT',
  'who_disease_outbreak_news', 'https://www.who.int/emergencies/disease-outbreak-news',
  'CONTINUOUS', 600, 'disease outbreak emergency',
  'Official WHO public-health event surface.'
),
(
  'HOT_TOPIC:WEB:WTO:MACRO',
  'HOT_TOPIC', 'tariffs_trade_restrictions', 'MACRO', 'WEB_DIRECT',
  'wto_news_rss', 'https://www.wto.org/english/res_e/res_e.htm',
  'CONTINUOUS', 600, 'tariff trade restriction export control',
  'Official WTO news/RSS discovery surface.'
)
on conflict (target_id) do update set
  target_url=excluded.target_url,
  source_id=excluded.source_id,
  query_hint=excluded.query_hint,
  activation_mode=excluded.activation_mode,
  cadence_seconds=excluded.cadence_seconds,
  updated_at=now();


-- Keep the target universe future-proof: newly added corridors or shock families
-- automatically receive all three category burst targets.
create or replace function public.sync_live_realtime_corridor_targets()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  insert into public.live_realtime_scope_targets (
    target_id, scope_type, scope_code, category, transport, source_id,
    activation_mode, cadence_seconds, query_hint, notes
  )
  select
    'CORRIDOR:GDELT_BURST:' || new.corridor_id || ':' || cat.category,
    'CORRIDOR',
    new.corridor_id,
    cat.category,
    'GDELT_BURST',
    'gdelt_v2_events',
    'ON_BREAK',
    900,
    new.display_name || ' ' || array_to_string(new.chokepoints, ' '),
    'Break-triggered corridor corroboration/enrichment target.'
  from (
    values ('GEOPOLITICS'::text),('MACRO'::text),('CRITICAL_MINERALS'::text)
  ) as cat(category)
  where new.corridor_id is not null
  on conflict (target_id) do update
    set query_hint = excluded.query_hint,
        updated_at = now();
  return new;
end;
$;

drop trigger if exists trg_sync_live_realtime_corridor_targets
  on public.live_strategic_corridor_catalog;

create trigger trg_sync_live_realtime_corridor_targets
after insert or update of display_name, chokepoints
on public.live_strategic_corridor_catalog
for each row
execute function public.sync_live_realtime_corridor_targets();

create or replace function public.sync_live_realtime_hot_topic_targets()
returns trigger
language plpgsql
security definer
set search_path = public
as $
begin
  if new.required then
    insert into public.live_realtime_scope_targets (
      target_id, scope_type, scope_code, category, transport, source_id,
      activation_mode, cadence_seconds, query_hint, notes
    )
    select
      'HOT_TOPIC:GDELT_BURST:' || new.shock_id || ':' || cat.category,
      'HOT_TOPIC',
      new.shock_id,
      cat.category,
      'GDELT_BURST',
      'gdelt_v2_events',
      'ON_BREAK',
      900,
      new.display_name || ' ' || replace(new.shock_id, '_', ' '),
      'Break-triggered hot-topic corroboration/enrichment target.'
    from (
      values ('GEOPOLITICS'::text),('MACRO'::text),('CRITICAL_MINERALS'::text)
    ) as cat(category)
    on conflict (target_id) do update
      set query_hint = excluded.query_hint,
          updated_at = now();
  end if;
  return new;
end;
$;

drop trigger if exists trg_sync_live_realtime_hot_topic_targets
  on public.live_global_shock_taxonomy;

create trigger trg_sync_live_realtime_hot_topic_targets
after insert or update of required, display_name
on public.live_global_shock_taxonomy
for each row
execute function public.sync_live_realtime_hot_topic_targets();

-- Official minerals news surface adds a dedicated near-realtime global
-- critical-minerals direct target. It is supplemental to country minerals mesh.
insert into public.live_realtime_scope_targets (
  target_id, scope_type, scope_code, category, transport, source_id,
  target_url, activation_mode, cadence_seconds, query_hint, notes
)
values (
  'HOT_TOPIC:WEB:USGS_MINERALS:CRITICAL_MINERALS',
  'HOT_TOPIC',
  'critical_minerals_rare_earth_disruption',
  'CRITICAL_MINERALS',
  'WEB_DIRECT',
  'usgs_minerals_news_rss',
  'https://www.usgs.gov/programs/mineral-resources-program/news',
  'CONTINUOUS',
  600,
  'critical minerals rare earth lithium cobalt nickel graphite mining',
  'Official USGS Mineral Resources Program news surface; source reuse remains rights-gated.'
),
(
  'CORRIDOR:WEB:IMO:MARITIME:GEOPOLITICS',
  'CORRIDOR',
  'ALL_MARITIME_CORRIDORS',
  'GEOPOLITICS',
  'WEB_DIRECT',
  'imo_maritime_safety_information',
  'https://www.imo.org/en/OurWork/Safety/Pages/Maritime-Safety-Information.aspx',
  'CONTINUOUS',
  600,
  'maritime safety information navigational warnings maritime security',
  'Official IMO Maritime Safety Information surface; route-specific reuse remains rights-gated.'
)
on conflict (target_id) do update set
  source_id = excluded.source_id,
  target_url = excluded.target_url,
  query_hint = excluded.query_hint,
  activation_mode = excluded.activation_mode,
  cadence_seconds = excluded.cadence_seconds,
  updated_at = now();

create table if not exists public.live_realtime_escalation_queue (
  queue_id uuid primary key default gen_random_uuid(),
  scope_type text not null
    check (scope_type in ('CORRIDOR','HOT_TOPIC')),
  scope_code text not null,
  category text not null
    check (category in ('GEOPOLITICS','MACRO','CRITICAL_MINERALS')),
  trigger_event_id uuid
    references public.live_structured_events(id)
    on delete set null,
  trigger_story_key text,
  trigger_headline text,
  first_break_at timestamptz not null,
  queued_at timestamptz not null default now(),
  last_observed_at timestamptz,
  burst_count integer not null default 0,
  last_burst_at timestamptz,
  status text not null default 'QUEUED'
    check (status in ('QUEUED','BURSTED','STALE','FAILED')),
  last_error text,
  unique (scope_type, scope_code, category, trigger_story_key)
);

create index if not exists live_realtime_escalation_queue_due_idx
  on public.live_realtime_escalation_queue(status, last_burst_at, queued_at);

create table if not exists public.live_realtime_burst_runs (
  id uuid primary key default gen_random_uuid(),
  target_id text not null
    references public.live_realtime_scope_targets(target_id)
    on delete cascade,
  queue_id uuid
    references public.live_realtime_escalation_queue(queue_id)
    on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','succeeded','empty','failed')),
  query_hash text not null
    check (query_hash ~ '^[0-9a-f]{64}$'),
  query_text text,
  records_seen integer not null default 0,
  records_accepted integer not null default 0,
  latest_source_time timestamptz,
  error_detail text
);

create index if not exists live_realtime_burst_runs_target_time_idx
  on public.live_realtime_burst_runs(target_id, started_at desc);

-- Observable 100% scope-contract status. It measures existence of all governed
-- realtime fanout targets, not a claim that all real-world events are observed.
create or replace view public.live_realtime_scope_100_status
with (security_invoker=true)
as
with corridors as (
  select count(*)::bigint n from public.live_strategic_corridor_catalog
),
corridor_targets as (
  select count(*)::bigint n
  from public.live_realtime_scope_targets
  where scope_type='CORRIDOR'
    and transport='GDELT_BURST'
),
corridor_complete as (
  select count(*)::bigint n
  from (
    select scope_code
    from public.live_realtime_scope_targets
    where scope_type='CORRIDOR'
      and transport='GDELT_BURST'
    group by scope_code
    having count(*) filter (where category='GEOPOLITICS') > 0
       and count(*) filter (where category='MACRO') > 0
       and count(*) filter (where category='CRITICAL_MINERALS') > 0
  ) x
),
hot_topics as (
  select count(*)::bigint n
  from public.live_global_shock_taxonomy
  where required
),
hot_targets as (
  select count(*)::bigint n
  from public.live_realtime_scope_targets
  where scope_type='HOT_TOPIC'
    and transport='GDELT_BURST'
),
hot_complete as (
  select count(*)::bigint n
  from (
    select scope_code
    from public.live_realtime_scope_targets t
    join public.live_global_shock_taxonomy s on s.shock_id=t.scope_code
    where t.scope_type='HOT_TOPIC'
      and t.transport='GDELT_BURST'
      and s.required
    group by t.scope_code
    having count(*) filter (where t.category='GEOPOLITICS') > 0
       and count(*) filter (where t.category='MACRO') > 0
       and count(*) filter (where t.category='CRITICAL_MINERALS') > 0
  ) x
)
select
  now() evaluated_at,
  (select n from corridors) corridor_count,
  (select n from corridor_targets) corridor_burst_target_count,
  (select n from corridor_complete) corridors_with_three_categories,
  (select n from hot_topics) required_hot_topic_count,
  (select n from hot_targets) hot_topic_burst_target_count,
  (select n from hot_complete) hot_topics_with_three_categories,
  (
    (select n from corridors) = (select n from corridor_complete)
    and (select n from hot_topics) = (select n from hot_complete)
  ) as realtime_scope_contract_100_complete;

comment on view public.live_realtime_scope_100_status is
  'Scope contract gate for realtime corridor and hot-topic fanout. Full contract coverage is distinct from guaranteed observation of every real-world event.';

commit;
