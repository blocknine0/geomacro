-- =============================================================================
-- Harden source certification evidence-graph promotion against malformed
-- endpoint HTTP status metadata. Evidence rows are external/runtime-derived,
-- so certification must never fail on a non-numeric diagnostic value.
-- =============================================================================
begin;

create or replace function public.promote_source_certification_evidence_graph_run(
  p_run_id text,
  p_certified_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_exists boolean;
  promoted_sources bigint := 0;
  promoted_paths bigint := 0;
  blocked_sources bigint := 0;
  now_ts timestamptz := now();
begin
  if coalesce(length(trim(p_run_id)),0) < 1 then
    raise exception 'EVIDENCE_RUN_ID_REQUIRED';
  end if;
  if coalesce(length(trim(p_certified_by)),0) < 1 then
    raise exception 'CERTIFIED_BY_REQUIRED';
  end if;

  select exists(
    select 1 from public.live_source_certification_evidence_runs where run_id=p_run_id
  ) into run_exists;
  if not run_exists then raise exception 'EVIDENCE_RUN_NOT_FOUND'; end if;

  with eligible as (
    select n.source_id
    from public.live_source_certification_evidence_nodes n
    where n.run_id=p_run_id
      and n.status='PASS'
      and n.evidence_strength in ('VERIFIED','OBSERVED')
      and n.dimension in (
        'REGISTRY','ENDPOINT','RIGHTS','SCHEMA','FRESHNESS',
        'PROVENANCE','INDEPENDENCE','ADAPTER','RUNTIME','FALLBACK'
      )
    group by n.source_id
    having count(distinct n.dimension)=10
  ),
  valueset as (
    select
      e.source_id,
      max(n.observed_at) evaluated_at,
      max(n.details->>'rights_status') filter(where n.dimension='RIGHTS') rights_status,
      max(n.details->>'schema_status') filter(where n.dimension='SCHEMA') schema_status,
      max(n.details->>'freshness_status') filter(where n.dimension='FRESHNESS') freshness_status,
      max(n.details->>'provenance_status') filter(where n.dimension='PROVENANCE') provenance_status,
      max(n.details->>'independence_status') filter(where n.dimension='INDEPENDENCE') independence_status,
      max(n.details->>'adapter_status') filter(where n.dimension='ADAPTER') adapter_status,
      max(n.details->>'runtime_status') filter(where n.dimension='RUNTIME') runtime_status,
      max(n.details->>'fallback_status') filter(where n.dimension='FALLBACK') fallback_status,
      max(n.evidence_ref) filter(where n.dimension='ENDPOINT') endpoint_ref,
      max(n.details->>'endpoint_url') filter(where n.dimension='ENDPOINT') endpoint_url,
      max(n.details->>'final_url') filter(where n.dimension='ENDPOINT') final_url,
      max(
        case
          when trim(n.details->>'http_status') ~ '^[0-9]+$'
          then (trim(n.details->>'http_status'))::integer
          else null
        end
      ) filter(where n.dimension='ENDPOINT') endpoint_http_status,
      max(n.evidence_ref) filter(where n.dimension='RIGHTS') rights_ref,
      max(n.evidence_ref) filter(where n.dimension='SCHEMA') schema_ref,
      max(n.evidence_ref) filter(where n.dimension='PROVENANCE') provenance_ref,
      max(n.details->>'independence_group') filter(where n.dimension='INDEPENDENCE') independence_group,
      max(
        case
          when trim(n.details->>'independent_source_count') ~ '^[0-9]+$'
          then (trim(n.details->>'independent_source_count'))::integer
          else null
        end
      ) filter(where n.dimension='INDEPENDENCE') independent_source_count,
      max(n.details->>'adapter_id') filter(where n.dimension='ADAPTER') adapter_id,
      max(n.details->>'fallback_source_id') filter(where n.dimension='FALLBACK') fallback_source_id
    from eligible e
    join public.live_source_certification_evidence_nodes n
      on n.source_id=e.source_id and n.run_id=p_run_id
     and n.status='PASS' and n.evidence_strength in ('VERIFIED','OBSERVED')
    group by e.source_id
  ),
  valid as (
    select v.*
    from valueset v
    where v.rights_status in ('COMMERCIAL_OK','DERIVED_ONLY')
      and v.schema_status in ('PASS','NOT_APPLICABLE')
      and v.freshness_status in ('FRESH','VARIABLE','NOT_APPLICABLE')
      and v.provenance_status in ('PASS','NOT_APPLICABLE')
      and v.independence_status in ('PASS','NOT_APPLICABLE')
      and v.adapter_status in ('TESTED','NOT_APPLICABLE')
      and v.runtime_status in ('PASS','NOT_APPLICABLE')
      and v.fallback_status in ('READY','NOT_REQUIRED')
  ),
  hashed as (
    select v.*,
      encode(digest(
        string_agg(n.dimension || ':' || n.evidence_hash, '|' order by n.dimension),
        'sha256'
      ),'hex') certification_hash
    from valid v
    join public.live_source_certification_evidence_nodes n
      on n.source_id=v.source_id and n.run_id=p_run_id
     and n.status='PASS' and n.evidence_strength in ('VERIFIED','OBSERVED')
    group by
      v.source_id,v.evaluated_at,v.rights_status,v.schema_status,v.freshness_status,
      v.provenance_status,v.independence_status,v.adapter_status,v.runtime_status,
      v.fallback_status,v.endpoint_ref,v.endpoint_url,v.final_url,v.endpoint_http_status,
      v.rights_ref,v.schema_ref,v.provenance_ref,v.independence_group,
      v.independent_source_count,v.adapter_id,v.fallback_source_id
  )
  update public.live_source_certification_records c
  set certification_state='CERTIFIED',
      endpoint_status='PASS',
      endpoint_url=h.endpoint_url,
      canonical_url=h.final_url,
      endpoint_final_url=h.final_url,
      endpoint_http_status=h.endpoint_http_status,
      endpoint_observed_at=h.evaluated_at,
      rights_status=h.rights_status,
      rights_evidence_ref=h.rights_ref,
      rights_reviewed_at=h.evaluated_at,
      schema_status=h.schema_status,
      schema_evidence_ref=h.schema_ref,
      freshness_status=h.freshness_status,
      freshness_last_observed_at=h.evaluated_at,
      provenance_status=h.provenance_status,
      provenance_evidence_ref=h.provenance_ref,
      independence_status=h.independence_status,
      independence_group=h.independence_group,
      independent_source_count=h.independent_source_count,
      adapter_status=h.adapter_status,
      adapter_id=h.adapter_id,
      runtime_status=h.runtime_status,
      fallback_status=h.fallback_status,
      fallback_source_id=nullif(h.fallback_source_id,''),
      certification_reason='Automated evidence-graph promotion after all required source-specific dimensions passed.',
      certification_evidence_ref='evidence-graph:' || p_run_id || ':' || c.source_id,
      certified_at=h.evaluated_at,
      certified_by=trim(p_certified_by),
      certification_hash=h.certification_hash,
      updated_at=now_ts
  from hashed h
  where c.source_id=h.source_id;

  get diagnostics promoted_sources=row_count;

  with eligible_paths as (
    select
      q.queue_key,
      q.source_id,
      c.certification_hash,
      c.rights_status
    from public.live_source_certification_queue q
    join public.live_source_certification_records c on c.source_id=q.source_id
    where c.certification_state='CERTIFIED'
      and q.source_id in (
        select n.source_id
        from public.live_source_certification_evidence_nodes n
        where n.run_id=p_run_id
          and n.status='PASS'
          and n.evidence_strength in ('VERIFIED','OBSERVED')
        group by n.source_id
        having count(distinct n.dimension)=10
      )
  )
  update public.live_source_certification_queue q
  set certification_state='CERTIFIED',
      fail_closed=false,
      endpoint_check='PASS',
      rights_check=p.rights_status,
      schema_check='PASS',
      freshness_check='PASS',
      independence_check='PASS',
      evidence_ref='evidence-graph:' || p_run_id || ':' || p.source_id || ':' || q.queue_key,
      certified_at=now_ts,
      certified_by=trim(p_certified_by),
      certification_hash=encode(digest(
        p.certification_hash || ':' || q.queue_key || ':' || p_run_id,
        'sha256'
      ),'hex'),
      last_attempt_at=now_ts,
      updated_at=now_ts
  from eligible_paths p
  where q.queue_key=p.queue_key;

  get diagnostics promoted_paths=row_count;

  select count(*) into blocked_sources
  from public.live_global_source_universe u
  where u.required=true
    and not exists (
      select 1
      from public.live_source_certification_records c
      where c.source_id=u.source_id
        and c.certification_state='CERTIFIED'
    );

  update public.live_source_certification_evidence_runs
  set source_eligible_count=promoted_sources,
      source_promoted_count=promoted_sources,
      path_promoted_count=promoted_paths,
      blocked_source_count=blocked_sources,
      write_operations_performed=true
  where run_id=p_run_id;

  return jsonb_build_object(
    'run_id',p_run_id,
    'source_promoted_count',promoted_sources,
    'path_promoted_count',promoted_paths,
    'blocked_required_source_count',blocked_sources,
    'write_operations_performed',true
  );
end;
$$;

revoke all on function public.promote_source_certification_evidence_graph_run(text,text)
from public, anon, authenticated;
grant execute on function public.promote_source_certification_evidence_graph_run(text,text)
to service_role;

commit;
