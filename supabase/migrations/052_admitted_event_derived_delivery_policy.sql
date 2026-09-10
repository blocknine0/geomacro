begin;

-- Commercial readiness report 2026-09-10 showed every recent structured event
-- still UNVERIFIED after migrations 048-051. The reason is architectural:
-- `admitted_events` intentionally preserves the original publisher URL/domain,
-- while the ingestion layer uses one of four bounded discovery providers.
-- URL policies for the discovery APIs therefore cannot match publisher URLs.
--
-- Current ingestion contract (guarded by a static regression test):
--   guardian  -> direct Guardian Open Platform content
--   gdelt     -> original publisher URL discovered through GDELT
--   reliefweb -> original information-partner URL discovered through ReliefWeb
--   gdacs     -> GDACS alert URL
--
-- Rights policy for the existing admitted-events handoff:
--   * Guardian: INELIGIBLE for this automated commercial/AI path under the
--     current Open Platform developer terms. It must not enter paid delivery.
--   * GDACS: REVIEW_REQUIRED. The public disclaimer does not establish a
--     sufficiently explicit commercial reuse licence for this product path.
--   * Other non-empty publisher domains: DERIVED_ONLY. Under the current code
--     invariant they can only have arrived through GDELT or ReliefWeb. Both
--     lanes are restricted to derived intelligence; original publisher payload
--     is not commercially redistributed by this policy.
--   * Missing/unknown domain: REVIEW_REQUIRED.
--
-- IMPORTANT: this inference is valid only while the exact discovery-provider
-- allowlist remains unchanged. CI fails if a new discoveryProvider literal is
-- introduced without deliberately updating this commercial policy.

create or replace view public.live_structured_event_commercial_rights_evaluation
with (security_invoker = true)
as
with source_states as (
  select distinct
    e.event_id,
    m.source_key,
    case
      when m.source_key = 'admitted_events' then
        case
          when nullif(lower(trim(coalesce(e.source_domain, ''))), '') is null
            or lower(trim(coalesce(e.source_domain, ''))) = 'unknown'
            then 'REVIEW_REQUIRED'
          when lower(trim(e.source_domain)) in (
            'theguardian.com',
            'guardian.com'
          )
            then 'INELIGIBLE'
          when lower(trim(e.source_domain)) = 'gdacs.org'
            or lower(trim(e.source_domain)) like '%.gdacs.org'
            then 'REVIEW_REQUIRED'
          else 'DERIVED_ONLY'
        end
      when r.commercial_usage_status = 'INTERNAL_INHERIT_ONLY'
        then coalesce(p.commercial_usage_status, 'REVIEW_REQUIRED')
      else r.commercial_usage_status
    end as commercial_usage_status
  from public.live_structured_event_evidence e
  join public.live_fragment_manifest m
    on m.id = e.fragment_id
  left join public.live_source_registry r
    on r.source_key = m.source_key
  left join lateral (
    select
      policy.commercial_usage_status
    from public.live_source_url_commercial_policy policy
    where lower(coalesce(e.source_domain, '')) = policy.source_domain
      and lower(coalesce(e.source_url, '')) like lower(policy.url_prefix) || '%'
      and (
        policy.required_url_fragment is null
        or position(
          lower(policy.required_url_fragment)
          in lower(coalesce(e.source_url, ''))
        ) > 0
      )
    order by
      length(policy.url_prefix) desc,
      policy.policy_id asc
    limit 1
  ) p on true
), aggregated as (
  select
    event_id,
    array_agg(distinct source_key order by source_key) as source_keys,
    bool_or(commercial_usage_status is null) as has_missing_policy,
    bool_or(commercial_usage_status = 'INELIGIBLE') as has_ineligible,
    bool_or(commercial_usage_status = 'REVIEW_REQUIRED') as has_review_required,
    bool_or(commercial_usage_status = 'DERIVED_ONLY') as has_derived_only,
    bool_and(commercial_usage_status = 'COMMERCIAL_OK') as all_commercial_ok
  from source_states
  group by event_id
)
select
  ev.id as event_id,
  case
    when a.event_id is null then 'UNVERIFIED'
    when a.has_ineligible then 'INELIGIBLE'
    when a.has_missing_policy then 'UNVERIFIED'
    when a.has_review_required then 'UNVERIFIED'
    when a.has_derived_only then 'DERIVED_ONLY'
    when a.all_commercial_ok then 'VERIFIED'
    else 'UNVERIFIED'
  end::text as evaluated_status,
  case
    when a.event_id is null then array['missing_structured_event_source_provenance']::text[]
    when a.has_ineligible then array['commercial_source_ineligible']::text[]
    when a.has_missing_policy then array['missing_commercial_source_policy']::text[]
    when a.has_review_required then array['commercial_source_review_required']::text[]
    when a.has_derived_only then array['commercial_source_derived_only']::text[]
    when a.all_commercial_ok then array[]::text[]
    else array['commercial_source_unverified']::text[]
  end as reason_codes,
  coalesce(a.source_keys, array[]::text[]) as source_keys
from public.live_structured_events ev
left join aggregated a
  on a.event_id = ev.id;

revoke all on public.live_structured_event_commercial_rights_evaluation
  from public, anon, authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation
  to service_role;

-- Reconcile the stored cache from the authoritative view immediately.
update public.live_structured_events ev
set
  commercial_eligibility_status = rights.evaluated_status,
  commercial_eligibility_reason_codes = rights.reason_codes
from public.live_structured_event_commercial_rights_evaluation rights
where rights.event_id = ev.id
  and (
    ev.commercial_eligibility_status is distinct from rights.evaluated_status
    or ev.commercial_eligibility_reason_codes is distinct from rights.reason_codes
  );

comment on view public.live_structured_event_commercial_rights_evaluation is
  'Authoritative structured-event commercial-rights evaluation. admitted_events uses a code-bounded discovery-provider invariant: Guardian is ineligible, GDACS remains review-gated, GDELT/ReliefWeb publisher-domain evidence is derived-only, and missing provenance fails closed.';

commit;
