-- Geomacro Risk Gate v2 additive data model.
-- Server-side only. Existing Risk Gate v1 behavior is unchanged.

create table if not exists public.risk_subjects (
  id uuid primary key default gen_random_uuid(),
  subject_key text not null unique,
  subject_type text not null,
  canonical_code text,
  display_name text not null,
  parent_subject_key text references public.risk_subjects(subject_key) on delete restrict,
  coverage_state text not null default 'INSUFFICIENT',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_subjects_type_check check (
    subject_type in (
      'country','corridor','region','subnational','city','port','airport',
      'border_crossing','chokepoint','logistics_route','energy_route',
      'currency_pair','commodity','market','sector','counterparty_exposure',
      'portfolio_exposure','event','custom_basket'
    )
  ),
  constraint risk_subjects_coverage_check check (
    coverage_state in ('FULL','PARTIAL','LIMITED','INSUFFICIENT')
  )
);

create index if not exists risk_subjects_type_active_idx
  on public.risk_subjects (subject_type, active, display_name);

create table if not exists public.risk_exposure_edges (
  id uuid primary key default gen_random_uuid(),
  edge_id text not null unique,
  from_subject_key text not null references public.risk_subjects(subject_key) on delete restrict,
  to_subject_key text not null references public.risk_subjects(subject_key) on delete restrict,
  relationship_type text not null,
  direction text not null default 'directed',
  weight_hint numeric(12,6),
  methodology_version text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint risk_exposure_edges_distinct_check check (from_subject_key <> to_subject_key),
  constraint risk_exposure_edges_direction_check check (direction in ('directed','bidirectional')),
  constraint risk_exposure_edges_weight_check check (
    weight_hint is null or (weight_hint >= 0 and weight_hint <= 1)
  ),
  unique (from_subject_key, to_subject_key, relationship_type, methodology_version)
);

create index if not exists risk_exposure_edges_from_idx
  on public.risk_exposure_edges (from_subject_key, active);
create index if not exists risk_exposure_edges_to_idx
  on public.risk_exposure_edges (to_subject_key, active);

create table if not exists public.risk_module_states (
  id uuid primary key default gen_random_uuid(),
  module_state_id text not null unique,
  subject_key text not null references public.risk_subjects(subject_key) on delete restrict,
  risk_module text not null,
  score numeric(12,6) not null,
  previous_score numeric(12,6),
  score_delta numeric(12,6),
  confidence numeric(12,6) not null,
  coverage_state text not null,
  commercial_eligibility_status text not null,
  generated_at timestamptz not null,
  expires_at timestamptz not null,
  methodology_version text not null,
  input_hash text not null,
  data_hash text not null,
  calculation_hash text not null,
  evidence_summary jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint risk_module_states_module_check check (
    risk_module in (
      'geopolitical_security','geoeconomic_trade','political_governance',
      'sovereign_fiscal','macro_monetary','currency_capital_mobility',
      'banking_financial_system','payments_treasury','supply_chain_logistics',
      'energy_commodities','regulatory_legal','infrastructure_cyber_technology',
      'climate_environment_hazard','societal_labor_health',
      'information_influence','emerging_long_tail'
    )
  ),
  constraint risk_module_states_score_check check (score >= 0 and score <= 100),
  constraint risk_module_states_previous_check check (
    previous_score is null or (previous_score >= 0 and previous_score <= 100)
  ),
  constraint risk_module_states_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint risk_module_states_coverage_check check (
    coverage_state in ('FULL','PARTIAL','LIMITED','INSUFFICIENT')
  ),
  constraint risk_module_states_commercial_check check (
    commercial_eligibility_status in ('VERIFIED','UNVERIFIED','INELIGIBLE')
  ),
  constraint risk_module_states_expiry_check check (expires_at > generated_at),
  constraint risk_module_states_input_hash_check check (input_hash ~ '^[a-f0-9]{64}$'),
  constraint risk_module_states_data_hash_check check (data_hash ~ '^[a-f0-9]{64}$'),
  constraint risk_module_states_calculation_hash_check check (calculation_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists risk_module_states_subject_module_idx
  on public.risk_module_states (subject_key, risk_module, generated_at desc);

create table if not exists public.risk_module_attribution (
  id uuid primary key default gen_random_uuid(),
  module_state_id text not null references public.risk_module_states(module_state_id) on delete restrict,
  driver_code text not null,
  score_contribution numeric(12,6) not null,
  delta_contribution numeric(12,6),
  confidence numeric(12,6) not null,
  signal_count integer not null default 0,
  weight numeric(12,6) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint risk_module_attribution_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint risk_module_attribution_signal_count_check check (signal_count >= 0),
  constraint risk_module_attribution_weight_check check (weight >= 0 and weight <= 1),
  unique (module_state_id, driver_code)
);

create or replace function public.prevent_risk_module_history_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Risk module history is immutable';
end;
$$;

create trigger risk_module_states_immutable
before update or delete on public.risk_module_states
for each row execute function public.prevent_risk_module_history_mutation();

create trigger risk_module_attribution_immutable
before update or delete on public.risk_module_attribution
for each row execute function public.prevent_risk_module_history_mutation();

alter table public.risk_subjects enable row level security;
alter table public.risk_exposure_edges enable row level security;
alter table public.risk_module_states enable row level security;
alter table public.risk_module_attribution enable row level security;

revoke all on table public.risk_subjects from PUBLIC, anon, authenticated;
revoke all on table public.risk_exposure_edges from PUBLIC, anon, authenticated;
revoke all on table public.risk_module_states from PUBLIC, anon, authenticated;
revoke all on table public.risk_module_attribution from PUBLIC, anon, authenticated;

grant all on table public.risk_subjects to service_role;
grant all on table public.risk_exposure_edges to service_role;
grant all on table public.risk_module_states to service_role;
grant all on table public.risk_module_attribution to service_role;

comment on table public.risk_subjects is
  'Canonical global subject registry for Risk Gate v2.';
comment on table public.risk_exposure_edges is
  'Version-aware subject exposure graph for Risk Gate v2.';
comment on table public.risk_module_states is
  'Immutable versioned module-level external risk state; never execution authorization.';
comment on table public.risk_module_attribution is
  'Immutable driver attribution for Risk Gate v2 module states.';
