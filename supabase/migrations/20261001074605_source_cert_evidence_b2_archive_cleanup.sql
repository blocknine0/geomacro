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

create or replace function public.geomacro_finalize_archived_source_cert_evidence_run(
  p_run_id text,
  p_archive_key text,
  p_archive_sha256 text,
  p_node_count integer,
  p_edge_count integer,
  p_ack text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.live_source_certification_evidence_runs%rowtype;
  a public.live_source_certification_evidence_archives%rowtype;
  actual_nodes integer;
  actual_edges integer;
  deleted_nodes integer;
  deleted_edges integer;
begin
  if p_ack <> 'I_ACCEPT_VERIFIED_SOURCE_CERT_EVIDENCE_ARCHIVE_DELETE' then
    raise exception 'SOURCE_CERT_EVIDENCE_ARCHIVE_ACK_INVALID';
  end if;
  if p_archive_sha256 !~ '^[0-9a-f]{64}$'
     or p_archive_key !~ '^geomacro-evidence/v1/source-certification-evidence-runs/[A-Za-z0-9_.:/-]+[.]json[.]gz$' then
    raise exception 'SOURCE_CERT_EVIDENCE_ARCHIVE_METADATA_INVALID';
  end if;

  select * into r from public.live_source_certification_evidence_runs where run_id=p_run_id for update;
  if not found then raise exception 'SOURCE_CERT_EVIDENCE_RUN_MISSING'; end if;
  if r.created_at >= now()-interval '7 days'
     or coalesce(r.source_promoted_count,0) <> 0
     or coalesce(r.path_promoted_count,0) <> 0
     or coalesce(r.blocked_source_count,0) <> coalesce(r.source_count,0)
     or coalesce(r.node_count,0) <> p_node_count
     or coalesce(r.edge_count,0) <> p_edge_count then
    raise exception 'SOURCE_CERT_EVIDENCE_RUN_NOT_ARCHIVE_SAFE';
  end if;

  select * into a from public.live_source_certification_evidence_archives where run_id=p_run_id;
  if not found or a.archive_key<>p_archive_key or a.archive_sha256<>p_archive_sha256
     or a.node_count<>p_node_count or a.edge_count<>p_edge_count then
    raise exception 'SOURCE_CERT_EVIDENCE_ARCHIVE_INDEX_MISMATCH';
  end if;

  select count(*) into actual_nodes from public.live_source_certification_evidence_nodes where run_id=p_run_id;
  select count(*) into actual_edges from public.live_source_certification_evidence_edges where run_id=p_run_id;
  if actual_nodes<>p_node_count or actual_edges<>p_edge_count then
    raise exception 'SOURCE_CERT_EVIDENCE_SOURCE_COUNT_CHANGED';
  end if;

  delete from public.live_source_certification_evidence_edges where run_id=p_run_id;
  get diagnostics deleted_edges=row_count;
  delete from public.live_source_certification_evidence_nodes where run_id=p_run_id;
  get diagnostics deleted_nodes=row_count;
  if deleted_nodes<>p_node_count or deleted_edges<>p_edge_count then
    raise exception 'SOURCE_CERT_EVIDENCE_DELETE_COUNT_MISMATCH';
  end if;

  return jsonb_build_object('run_id',p_run_id,'deleted_nodes',deleted_nodes,'deleted_edges',deleted_edges);
end;
$$;
revoke all on function public.geomacro_finalize_archived_source_cert_evidence_run(text,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.geomacro_finalize_archived_source_cert_evidence_run(text,text,text,integer,integer,text) to service_role;
