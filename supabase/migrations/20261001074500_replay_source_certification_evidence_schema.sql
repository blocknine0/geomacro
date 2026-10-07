begin;

-- Replay compatibility for the legacy short-version 961 evidence-graph schema.
-- Timestamped cleanup migrations execute before short-version migrations in
-- some Supabase replay paths. Create only the prerequisite tables/indexes here;
-- the canonical 961 migration remains responsible for promotion functions/views.
create extension if not exists pgcrypto;

create table if not exists public.live_source_certification_evidence_runs (
  run_id text primary key,
  code_revision text not null,
  evaluated_at timestamptz not null default now(),
  source_count integer not null default 0,
  node_count integer not null default 0,
  edge_count integer not null default 0,
  source_eligible_count integer not null default 0,
  source_promoted_count integer not null default 0,
  path_promoted_count integer not null default 0,
  blocked_source_count integer not null default 0,
  write_operations_performed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.live_source_certification_evidence_nodes (
  evidence_id text primary key,
  run_id text not null
    references public.live_source_certification_evidence_runs(run_id)
    on delete cascade,
  source_id text not null
    references public.live_external_sources(source_id)
    on delete cascade,
  dimension text not null,
  status text not null
    check (status in ('PASS','FAIL','UNKNOWN')),
  evidence_strength text not null
    check (evidence_strength in ('VERIFIED','OBSERVED','ASSERTED','INFERRED','MISSING')),
  claim text not null,
  evidence_ref text,
  evidence_hash text not null,
  observed_at timestamptz not null,
  method text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, source_id, dimension),
  constraint evidence_hash_sha256_check
    check (evidence_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists live_source_certification_evidence_nodes_source_idx
  on public.live_source_certification_evidence_nodes(source_id, dimension, observed_at desc);

create index if not exists live_source_certification_evidence_nodes_run_idx
  on public.live_source_certification_evidence_nodes(run_id, source_id);

create table if not exists public.live_source_certification_evidence_edges (
  edge_id text primary key,
  run_id text not null
    references public.live_source_certification_evidence_runs(run_id)
    on delete cascade,
  from_evidence_id text not null
    references public.live_source_certification_evidence_nodes(evidence_id)
    on delete cascade,
  to_evidence_id text not null
    references public.live_source_certification_evidence_nodes(evidence_id)
    on delete cascade,
  relation text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (run_id, from_evidence_id, to_evidence_id, relation)
);

create index if not exists live_source_certification_evidence_edges_run_idx
  on public.live_source_certification_evidence_edges(run_id);

alter table public.live_source_certification_evidence_runs enable row level security;
alter table public.live_source_certification_evidence_nodes enable row level security;
alter table public.live_source_certification_evidence_edges enable row level security;

revoke all on public.live_source_certification_evidence_runs from public, anon, authenticated;
revoke all on public.live_source_certification_evidence_nodes from public, anon, authenticated;
revoke all on public.live_source_certification_evidence_edges from public, anon, authenticated;

grant select, insert, update on public.live_source_certification_evidence_runs to service_role;
grant select, insert, update on public.live_source_certification_evidence_nodes to service_role;
grant select, insert, update on public.live_source_certification_evidence_edges to service_role;

commit;
