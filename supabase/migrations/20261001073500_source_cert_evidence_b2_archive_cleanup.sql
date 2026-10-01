-- Archive index for old, fully blocked source-certification evidence graphs.
-- Destructive cleanup is intentionally not implemented in a stored function:
-- the application-side B2 recovery worker must perform fresh full readback,
-- exact source/member verification, bounded deletes, post-delete verification,
-- and rollback from the already verified in-memory/archive member set on any
-- uncertain or partial state.

create table if not exists public.live_source_certification_evidence_archives (
  run_id text primary key references public.live_source_certification_evidence_runs(run_id) on delete restrict,
  archive_key text not null,
  archive_sha256 text not null check (archive_sha256 ~ '^[0-9a-f]{64}$'),
  node_count integer not null check (node_count >= 0),
  edge_count integer not null check (edge_count >= 0),
  verified_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.live_source_certification_evidence_archives enable row level security;
revoke all on table public.live_source_certification_evidence_archives from public, anon, authenticated;
grant select, insert, update on table public.live_source_certification_evidence_archives to service_role;
