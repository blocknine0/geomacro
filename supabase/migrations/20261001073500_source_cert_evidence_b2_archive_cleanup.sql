-- Archive index for old, fully blocked source-certification evidence graphs.
-- This timestamped recovery migration sorts before the legacy 961 source-evidence
-- graph migration during zero-to-current replay, so the run-id foreign key is
-- added later after both tables exist. Destructive cleanup is intentionally not
-- implemented in a stored function.

create table if not exists public.live_source_certification_evidence_archives (
  run_id text primary key,
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
