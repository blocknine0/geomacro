-- Geomacro Live Intelligence
-- Auditable exclusions from customer-facing structured intelligence.
--
-- Canonical compressed evidence is never deleted by this table.
-- This table only records why an evidence item was intentionally
-- excluded from structured commercial intelligence.

create table if not exists public.live_structuring_exclusions (
  fingerprint text primary key
    check (fingerprint ~ '^[0-9a-f]{64}$'),

  fragment_id uuid not null
    references public.live_fragment_manifest(id),

  fragment_ordinal integer not null
    check (fragment_ordinal >= 0),

  reason_code text not null,

  structure_version text not null,
  relevance_version text not null,

  created_at timestamptz not null default now()
);

create index if not exists live_structuring_exclusions_fragment_idx
  on public.live_structuring_exclusions(fragment_id);

create index if not exists live_structuring_exclusions_reason_idx
  on public.live_structuring_exclusions(reason_code, created_at desc);

alter table public.live_structuring_exclusions
  enable row level security;

comment on table public.live_structuring_exclusions is
  'Audit ledger for canonical evidence excluded from customer-facing structured intelligence. Canonical evidence remains permanently stored in immutable compressed fragments.';
