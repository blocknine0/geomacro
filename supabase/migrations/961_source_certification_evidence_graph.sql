-- =============================================================================
-- Geomacro source certification evidence graph + automated promotion
--
-- Permanent evidence layer. The collector writes source-specific observed/
-- verified evidence nodes; this migration only promotes when every required
-- dimension is backed by an eligible evidence node for the same run.
-- No registry metadata, URL reachability, or heuristic rights guess can
-- directly make a source CERTIFIED.
-- =============================================================================

begin;

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

create or replace function public.promote_source_certification_from_evidence_graph(
  p_source_id text,
  p_run_id text,
  p_certified_by text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.live_source_certification_records%rowtype;
  n record;
  expected_dims text[] := array[
    'REGISTRY',
    'ENDPOINT',
    'RIGHTS',
    'SCHEMA',
    'FRESHNESS',
    'PROVENANCE',
    'INDEPENDENCE',
    'ADAPTER',
    'RUNTIME',
    'FALLBACK'
  ];
  missing_dims text[];
  weak_dims text[];
  rights_value text;
  schema_value text;
  freshness_value text;
  provenance_value text;
  independence_value text;
  adapter_value text;
  runtime_value text;
  fallback_value text;
  endpoint_url_value text;
  endpoint_final_url_value text;
  endpoint_status_value text;
  endpoint_http_status_value integer;
  certification_hash_value text;
  evidence_ref_value text;
  evaluated_at_value timestamptz;
begin
  if coalesce(length(trim(p_source_id)), 0) < 1 then
    raise exception 'SOURCE_ID_REQUIRED';
  end if;

  if coalesce(length(trim(p_run_id)), 0) < 1 then
    raise exception 'EVIDENCE_RUN_ID_REQUIRED';
  end if;

  if coalesce(length(trim(p_certified_by)), 0) < 1 then
    raise exception 'CERTIFIED_BY_REQUIRED';
  end if;

  select *
    into r
  from public.live_source_certification_records
  where source_id = p_source_id
  for update;

  if not found then
    raise exception 'SOURCE_CERTIFICATION_RECORD_NOT_FOUND';
  end if;

  select coalesce(array_agg(x.dimension order by x.dimension) filter (
    where x.status <> 'PASS' or x.evidence_strength not in ('VERIFIED','OBSERVED')
  ), '{}'::text[])
    into weak_dims
  from (
    select e.dimension, e.status, e.evidence_strength
    from public.live_source_certification_evidence_nodes e
    where e.run_id = p_run_id
      and e.source_id = p_source_id
  ) x;

  select coalesce(array_agg(d order by d), '{}'::text[])
    into missing_dims
  from unnest(expected_dims) d
  where not exists (
    select 1
    from public.live_source_certification_evidence_nodes e
    where e.run_id = p_run_id
      and e.source_id = p_source_id
      and e.dimension = d
      and e.status = 'PASS'
      and e.evidence_strength in ('VERIFIED','OBSERVED')
  );

  if cardinality(missing_dims) > 0 then
    raise exception 'EVIDENCE_GRAPH_INCOMPLETE:%', array_to_string(missing_dims, ',');
  end if;

  if cardinality(weak_dims) > 0 then
    raise exception 'EVIDENCE_GRAPH_WEAK:%', array_to_string(weak_dims, ',');
  end if;

  select details->>'rights_status'
    into rights_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'RIGHTS';

  select details->>'schema_status' into schema_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'SCHEMA';

  select details->>'freshness_status' into freshness_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'FRESHNESS';

  select details->>'provenance_status' into provenance_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'PROVENANCE';

  select details->>'independence_status' into independence_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'INDEPENDENCE';

  select details->>'adapter_status' into adapter_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'ADAPTER';

  select details->>'runtime_status' into runtime_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'RUNTIME';

  select details->>'fallback_status' into fallback_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'FALLBACK';

  select
    details->>'endpoint_url',
    details->>'final_url',
    details->>'endpoint_status',
    nullif(details->>'http_status','')::integer
    into endpoint_url_value, endpoint_final_url_value, endpoint_status_value, endpoint_http_status_value
  from public.live_source_certification_evidence_nodes
  where run_id = p_run_id and source_id = p_source_id and dimension = 'ENDPOINT';

  if rights_value not in ('COMMERCIAL_OK','DERIVED_ONLY') then
    raise exception 'RIGHTS_EVIDENCE_NOT_COMMERCIAL:%', coalesce(rights_value,'NULL');
  end if;

  if schema_value not in ('PASS','NOT_APPLICABLE') then
    raise exception 'SCHEMA_EVIDENCE_NOT_READY:%', coalesce(schema_value,'NULL');
  end if;

  if freshness_value not in ('FRESH','VARIABLE','NOT_APPLICABLE') then
    raise exception 'FRESHNESS_EVIDENCE_NOT_READY:%', coalesce(freshness_value,'NULL');
  end if;

  if provenance_value not in ('PASS','NOT_APPLICABLE') then
    raise exception 'PROVENANCE_EVIDENCE_NOT_READY:%', coalesce(provenance_value,'NULL');
  end if;

  if independence_value not in ('PASS','NOT_APPLICABLE') then
    raise exception 'INDEPENDENCE_EVIDENCE_NOT_READY:%', coalesce(independence_value,'NULL');
  end if;

  if adapter_value not in ('TESTED','NOT_APPLICABLE') then
    raise exception 'ADAPTER_EVIDENCE_NOT_READY:%', coalesce(adapter_value,'NULL');
  end if;

  if runtime_value not in ('PASS','NOT_APPLICABLE') then
    raise exception 'RUNTIME_EVIDENCE_NOT_READY:%', coalesce(runtime_value,'NULL');
  end if;

  if fallback_value not in ('READY','NOT_REQUIRED') then
    raise exception 'FALLBACK_EVIDENCE_NOT_READY:%', coalesce(fallback_value,'NULL');
  end if;

  select evaluated_at into evaluated_at_value
  from public.live_source_certification_evidence_runs
  where run_id = p_run_id;

  if evaluated_at_value is null then
    raise exception 'EVIDENCE_RUN_NOT_FOUND';
  end if;

  select
    encode(
      digest(
        string_agg(
          e.dimension || ':' || e.evidence_hash,
          '|' order by e.dimension
        ),
        'sha256'
      ),
      'hex'
    )
  into certification_hash_value
  from public.live_source_certification_evidence_nodes e
  where e.run_id = p_run_id
    and e.source_id = p_source_id
    and e.dimension = any(expected_dims)
    and e.status = 'PASS'
    and e.evidence_strength in ('VERIFIED','OBSERVED');

  evidence_ref_value := 'evidence-graph:' || p_run_id || ':' || p_source_id;

  update public.live_source_certification_records
  set
    certification_state = 'CERTIFIED',
    endpoint_status = 'PASS',
    endpoint_url = endpoint_url_value,
    canonical_url = endpoint_final_url_value,
    endpoint_http_status = endpoint_http_status_value,
    endpoint_observed_at = evaluated_at_value,
    rights_status = rights_value,
    rights_evidence_ref = (
      select evidence_ref
      from public.live_source_certification_evidence_nodes
      where run_id=p_run_id and source_id=p_source_id and dimension='RIGHTS'
    ),
    rights_reviewed_at = evaluated_at_value,
    schema_status = schema_value,
    schema_evidence_ref = (
      select evidence_ref
      from public.live_source_certification_evidence_nodes
      where run_id=p_run_id and source_id=p_source_id and dimension='SCHEMA'
    ),
    freshness_status = freshness_value,
    freshness_last_observed_at = evaluated_at_value,
    provenance_status = provenance_value,
    provenance_evidence_ref = (
      select evidence_ref
      from public.live_source_certification_evidence_nodes
      where run_id=p_run_id and source_id=p_source_id and dimension='PROVENANCE'
    ),
    independence_status = independence_value,
    independence_group = (
      select details->>'independence_group'
      from public.live_source_certification_evidence_nodes
      where run_id=p_run_id and source_id=p_source_id and dimension='INDEPENDENCE'
    ),
    independent_source_count = nullif((
      select details->>'independent_source_count'
      from public.live_source_certification_evidence_nodes
      where run_id=p_run_id and source_id=p_source_id and dimension='INDEPENDENCE'
    ),'')::integer,
    adapter_status = adapter_value,
    adapter_id = (
      select details->>'adapter_id'
      from public.live_source_certification_evidence_nodes
      where run_id=p_run_id and source_id=p_source_id and dimension='ADAPTER'
    ),
    runtime_status = runtime_value,
    fallback_status = fallback_value,
    certification_reason = 'Automated evidence-graph promotion after all required source-specific dimensions passed.',
    certification_evidence_ref = evidence_ref_value,
    certified_at = evaluated_at_value,
    certified_by = trim(p_certified_by),
    certification_hash = certification_hash_value,
    updated_at = now()
  where source_id = p_source_id;

  return jsonb_build_object(
    'source_id', p_source_id,
    'run_id', p_run_id,
    'certification_state', 'CERTIFIED',
    'rights_status', rights_value,
    'schema_status', schema_value,
    'freshness_status', freshness_value,
    'provenance_status', provenance_value,
    'independence_status', independence_value,
    'adapter_status', adapter_value,
    'runtime_status', runtime_value,
    'fallback_status', fallback_value,
    'certification_hash', certification_hash_value,
    'certification_evidence_ref', evidence_ref_value
  );
end;
$$;

comment on function public.promote_source_certification_from_evidence_graph is
 'Automated source promotion from an exact evidence graph run. Every required dimension must have a PASS node with VERIFIED or OBSERVED strength. Rights never come from URL reachability alone.';

revoke all on function public.promote_source_certification_from_evidence_graph(text,text,text)
from public, anon, authenticated;
grant execute on function public.promote_source_certification_from_evidence_graph(text,text,text)
to service_role;

create or replace view public.live_source_certification_evidence_graph_latest_status
with (security_invoker=true)
as
with latest as (
  select distinct on (source_id)
    source_id,
    run_id,
    observed_at
  from public.live_source_certification_evidence_nodes
  order by source_id, observed_at desc
),
nodes as (
  select
    l.source_id,
    l.run_id,
    count(n.evidence_id)::bigint node_count,
    count(n.evidence_id) filter (
      where n.status='PASS'
        and n.evidence_strength in ('VERIFIED','OBSERVED')
    )::bigint eligible_node_count,
    count(n.evidence_id) filter (
      where n.status <> 'PASS'
        or n.evidence_strength not in ('VERIFIED','OBSERVED')
    )::bigint blocked_node_count
  from latest l
  join public.live_source_certification_evidence_nodes n
    on n.source_id=l.source_id and n.run_id=l.run_id
  group by l.source_id, l.run_id
)
select
  n.*,
  c.certification_state,
  c.rights_status,
  c.endpoint_status,
  c.schema_status,
  c.freshness_status,
  c.provenance_status,
  c.independence_status,
  c.adapter_status,
  c.runtime_status,
  c.fallback_status
from nodes n
left join public.live_source_certification_records c
  on c.source_id=n.source_id;

comment on view public.live_source_certification_evidence_graph_latest_status is
 'Latest per-source evidence graph completeness view. It is diagnostic; source certification remains guarded by the promotion function.';

commit;
