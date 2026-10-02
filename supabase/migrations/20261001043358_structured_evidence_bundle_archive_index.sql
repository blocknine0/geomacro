create table if not exists public.live_structured_event_evidence_archive_index (
  event_id uuid not null,
  fingerprint text not null,
  source_key text not null,
  bundle_key text not null,
  bundle_sha256 text not null,
  row_sha256 text not null,
  row_json jsonb not null,
  archived_at timestamptz not null default now(),
  verified_at timestamptz not null,
  primary key (event_id, fingerprint),
  constraint structured_evidence_archive_bundle_sha_check check (bundle_sha256 ~ '^[0-9a-f]{64}$'),
  constraint structured_evidence_archive_row_sha_check check (row_sha256 ~ '^[0-9a-f]{64}$'),
  constraint structured_evidence_archive_fingerprint_check check (fingerprint ~ '^[0-9a-f]{64}$')
);
alter table public.live_structured_event_evidence_archive_index enable row level security;
revoke all on table public.live_structured_event_evidence_archive_index from public, anon, authenticated;
grant select, insert, update, delete on table public.live_structured_event_evidence_archive_index to service_role;
create index if not exists live_structured_event_evidence_archive_index_verified_idx on public.live_structured_event_evidence_archive_index (verified_at);
create or replace function public.geomacro_structured_evidence_archive_candidates(p_older_days integer,p_limit integer)
returns table(event_id uuid,fingerprint text,source_key text,row_json jsonb)
language plpgsql security invoker set search_path=public as $$
begin
  if p_older_days < 7 or p_older_days > 3650 or p_limit < 1 or p_limit > 1000 then raise exception 'STRUCTURED_EVIDENCE_ARCHIVE_CONFIG_INVALID'; end if;
  return query select e.event_id,e.fingerprint,m.source_key,to_jsonb(e)
  from public.live_structured_event_evidence e
  join public.live_structured_events ev on ev.id=e.event_id
  join public.live_fragment_manifest m on m.id=e.fragment_id
  left join public.live_structured_event_evidence_archive_index a on a.event_id=e.event_id and a.fingerprint=e.fingerprint
  where a.event_id is null
    and e.created_at < now()-make_interval(days=>p_older_days)
    and ev.last_seen_at < now()-make_interval(days=>p_older_days)
    and ev.structured_payload->'_archive'->>'v'='2'
    and nullif(btrim(m.source_key),'') is not null
  order by e.created_at,e.event_id,e.fingerprint limit p_limit;
end; $$;
revoke all on function public.geomacro_structured_evidence_archive_candidates(integer,integer) from public,anon,authenticated;
grant execute on function public.geomacro_structured_evidence_archive_candidates(integer,integer) to service_role;
