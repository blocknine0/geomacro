-- ============================================================
-- Geomacro Risk Objects (GRO)
-- Persistent machine-readable external-world risk state
-- for agents and commercial Risk Gate consumers.
--
-- IMPORTANT:
-- - GRO is decision context, not execution authorization.
-- - Published objects are immutable.
-- - Commercial eligibility remains explicit in each object.
-- ============================================================

create table if not exists public.geomacro_risk_objects (
  id uuid primary key default gen_random_uuid(),

  object_id text not null unique,
  schema_version text not null,

  subject_type text not null,
  subject_id text not null,
  subject_name text,

  methodology_version text not null,

  risk_score numeric(12,6) not null,
  risk_label text not null,
  previous_score numeric(12,6),
  risk_delta numeric(12,6),
  risk_direction text not null,

  confidence numeric(12,6) not null,

  commercial_eligibility_status text not null,
  commercial_eligibility_reason_codes jsonb not null
    default '[]'::jsonb,

  verification_status text not null,
  verification_reason_codes jsonb not null
    default '[]'::jsonb,
  last_verified_at timestamptz,

  input_hash text not null,
  data_hash text not null,
  calculation_hash text not null,

  generated_at timestamptz not null,
  expires_at timestamptz not null,

  payload jsonb not null,

  created_at timestamptz not null default now(),

  constraint geomacro_risk_objects_subject_type_check
    check (
      subject_type in (
        'country',
        'corridor',
        'event'
      )
    ),

  constraint geomacro_risk_objects_risk_score_check
    check (
      risk_score >= 0
      and risk_score <= 100
    ),

  constraint geomacro_risk_objects_confidence_check
    check (
      confidence >= 0
      and confidence <= 1
    ),

  constraint geomacro_risk_objects_risk_label_check
    check (
      risk_label in (
        'CALM',
        'STABLE',
        'WATCH',
        'ELEVATED',
        'CRITICAL'
      )
    ),

  constraint geomacro_risk_objects_direction_check
    check (
      risk_direction in (
        'escalating',
        'cooling',
        'steady',
        'unknown'
      )
    ),

  constraint geomacro_risk_objects_commercial_status_check
    check (
      commercial_eligibility_status in (
        'VERIFIED',
        'UNVERIFIED',
        'INELIGIBLE'
      )
    ),

  constraint geomacro_risk_objects_verification_status_check
    check (
      verification_status in (
        'VERIFIED',
        'STALE',
        'EXPIRED',
        'INCOMPLETE',
        'UNVERIFIABLE'
      )
    ),

  constraint geomacro_risk_objects_input_hash_check
    check (
      input_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint geomacro_risk_objects_data_hash_check
    check (
      data_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint geomacro_risk_objects_calculation_hash_check
    check (
      calculation_hash ~ '^[a-f0-9]{64}$'
    ),

  constraint geomacro_risk_objects_expiry_check
    check (
      expires_at > generated_at
    )
);

create index if not exists
  geomacro_risk_objects_subject_generated_idx
on public.geomacro_risk_objects (
  subject_type,
  subject_id,
  generated_at desc
);

create index if not exists
  geomacro_risk_objects_method_generated_idx
on public.geomacro_risk_objects (
  methodology_version,
  generated_at desc
);

create index if not exists
  geomacro_risk_objects_verification_idx
on public.geomacro_risk_objects (
  verification_status,
  expires_at desc
);

create index if not exists
  geomacro_risk_objects_commercial_idx
on public.geomacro_risk_objects (
  commercial_eligibility_status,
  generated_at desc
);

-- ------------------------------------------------------------
-- Immutability
-- GROs are historical decision-state records.
-- A generated object must never be silently rewritten.
-- ------------------------------------------------------------

create or replace function
  public.prevent_geomacro_risk_object_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Geomacro Risk Objects are immutable';
end;
$$;

drop trigger if exists
  geomacro_risk_objects_immutable
on public.geomacro_risk_objects;

create trigger
  geomacro_risk_objects_immutable
before update or delete
on public.geomacro_risk_objects
for each row
execute function
  public.prevent_geomacro_risk_object_mutation();

-- ------------------------------------------------------------
-- RLS
--
-- No anonymous/public table access yet.
-- Commercial access must go through server-side Risk Gate/API.
-- Service-role bypasses RLS for trusted server persistence.
-- ------------------------------------------------------------

alter table
  public.geomacro_risk_objects
enable row level security;

revoke all
on table public.geomacro_risk_objects
from anon, authenticated;

comment on table public.geomacro_risk_objects is
  'Immutable Geomacro Risk Objects providing machine-readable external-world risk context for agents and commercial Risk Gate consumers.';

comment on column public.geomacro_risk_objects.payload is
  'Canonical GRO JSON payload. Customer policy determines downstream action; this object is not execution authorization.';
