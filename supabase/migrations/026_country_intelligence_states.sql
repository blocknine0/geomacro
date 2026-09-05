-- =============================================================================
-- Geomacro Country Intelligence State
--
-- Deterministic intermediate state between external observations and GRO.
--
-- External observations
--   -> Country Intelligence State
--   -> GRO
--   -> Risk Gate
-- =============================================================================

create table if not exists
  public.country_intelligence_states (
    id bigint generated always as identity primary key,

    state_id text not null unique,

    country_iso3 text not null,

    schema_version text not null,

    methodology_version text not null,

    as_of timestamptz not null,

    generated_at timestamptz not null,

    observation_count integer not null
      check (
        observation_count >= 0
      ),

    feature_count integer not null
      check (
        feature_count >= 0
      ),

    source_count integer not null
      check (
        source_count >= 0
      ),

    category_count integer not null
      check (
        category_count >= 0
        and
        category_count <= 3
      ),

    input_hash text not null
      check (
        input_hash ~
        '^[a-f0-9]{64}$'
      ),

    data_hash text not null
      check (
        data_hash ~
        '^[a-f0-9]{64}$'
      ),

    calculation_hash text not null
      check (
        calculation_hash ~
        '^[a-f0-9]{64}$'
      ),

    payload jsonb not null,

    created_at timestamptz not null
      default now()
  );


create index if not exists
  country_intelligence_states_country_asof_idx
on public.country_intelligence_states (
  country_iso3,
  as_of desc
);


create index if not exists
  country_intelligence_states_method_idx
on public.country_intelligence_states (
  methodology_version,
  as_of desc
);


create or replace function
  public.reject_country_intelligence_state_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Country Intelligence States are immutable';
end;
$$;


drop trigger if exists
  country_intelligence_states_immutable
on public.country_intelligence_states;


create trigger
  country_intelligence_states_immutable
before update or delete
on public.country_intelligence_states
for each row
execute function
  public.reject_country_intelligence_state_mutation();


alter table
  public.country_intelligence_states
enable row level security;


comment on table
  public.country_intelligence_states
is
  'Immutable deterministic country intelligence feature states generated from commercially eligible live observations before GRO calculation.';
