-- =============================================================================
-- Geomacro source runtime evidence snapshot
-- Stable aggregate view used by the source evidence graph collector.
-- =============================================================================

begin;

create or replace view public.live_source_runtime_evidence_snapshot
with (security_invoker=true)
as
select
  source_id,
  count(*)::bigint as observation_count,
  count(*) filter (where quality_status = 'VERIFIED')::bigint as verified_observation_count,
  count(*) filter (where commercial_eligibility_status in ('VERIFIED','DERIVED_ONLY'))::bigint as commercially_eligible_observation_count,
  max(observed_at) as latest_observed_at,
  max(published_at) as latest_published_at,
  max(ingested_at) as latest_ingested_at,
  count(*) filter (where source_url is not null and btrim(source_url) <> '')::bigint as observations_with_source_url,
  count(*) filter (where provenance <> '{}'::jsonb)::bigint as observations_with_provenance
from public.live_external_observations
group by source_id;

comment on view public.live_source_runtime_evidence_snapshot is
 'Internal aggregate runtime evidence. It exposes observation freshness/provenance facts to certification automation without exposing raw observation payloads.';

alter table public.live_external_observations enable row level security;

commit;
