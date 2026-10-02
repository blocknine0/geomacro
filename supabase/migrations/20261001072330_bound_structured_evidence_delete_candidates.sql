create or replace function public.geomacro_structured_evidence_delete_candidates(
  p_limit integer default 500
)
returns table(
  event_id uuid,
  fingerprint text,
  source_key text,
  bundle_key text,
  bundle_sha256 text,
  row_sha256 text,
  row_json jsonb
)
language plpgsql
set search_path = public
as $$
begin
  if p_limit < 1 or p_limit > 500 then
    raise exception 'STRUCTURED_EVIDENCE_DELETE_CONFIG_INVALID';
  end if;

  return query
  with first_bundle as (
    select a.bundle_key
    from public.live_structured_event_evidence_archive_index a
    join public.live_structured_event_evidence e
      on e.event_id = a.event_id and e.fingerprint = a.fingerprint
    join public.live_fragment_manifest m on m.id = e.fragment_id
    where a.row_json->'_archive' is null
      and to_jsonb(e) = a.row_json
      and m.source_key = a.source_key
    order by a.archived_at asc, a.bundle_key asc
    limit 1
  )
  select
    a.event_id,
    a.fingerprint,
    a.source_key,
    a.bundle_key,
    a.bundle_sha256,
    a.row_sha256,
    a.row_json
  from public.live_structured_event_evidence_archive_index a
  join public.live_structured_event_evidence e
    on e.event_id = a.event_id and e.fingerprint = a.fingerprint
  join public.live_fragment_manifest m on m.id = e.fragment_id
  where a.bundle_key = (select fb.bundle_key from first_bundle fb)
    and a.row_json->'_archive' is null
    and to_jsonb(e) = a.row_json
    and m.source_key = a.source_key
  order by a.archived_at asc, a.event_id asc, a.fingerprint asc
  limit least(p_limit, 50);
end;
$$;

comment on function public.geomacro_structured_evidence_delete_candidates(integer) is
  'Returns one verified archive bundle at a time; destructive candidate windows are capped at 50 rows to preserve exact delete cardinality under live concurrency.';
