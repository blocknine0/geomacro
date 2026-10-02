begin;
create or replace view public.live_structured_event_commercial_rights_evaluation with (security_invoker=true) as
select ev.id as event_id,
case when coalesce(a.source_count,0)=0 then 'UNVERIFIED' when a.has_ineligible then 'INELIGIBLE' when a.has_missing_policy then 'UNVERIFIED' when a.has_review_required then 'UNVERIFIED' when a.has_derived_only then 'DERIVED_ONLY' when a.all_commercial_ok then 'VERIFIED' else 'UNVERIFIED' end::text as evaluated_status,
case when coalesce(a.source_count,0)=0 then array['missing_structured_event_source_provenance']::text[] when a.has_ineligible then array['commercial_source_ineligible']::text[] when a.has_missing_policy then array['missing_commercial_source_policy']::text[] when a.has_review_required then array['commercial_source_review_required']::text[] when a.has_derived_only then array['commercial_source_derived_only']::text[] when a.all_commercial_ok then array[]::text[] else array['commercial_source_unverified']::text[] end as reason_codes,
coalesce(a.source_keys,array[]::text[]) as source_keys
from public.live_structured_events ev
left join lateral (
 select count(*)::bigint as source_count,array_agg(distinct s.source_key order by s.source_key) as source_keys,bool_or(s.commercial_usage_status is null) as has_missing_policy,bool_or(s.commercial_usage_status='INELIGIBLE') as has_ineligible,bool_or(s.commercial_usage_status='REVIEW_REQUIRED') as has_review_required,bool_or(s.commercial_usage_status='DERIVED_ONLY') as has_derived_only,bool_and(s.commercial_usage_status='COMMERCIAL_OK') as all_commercial_ok
 from (
  select distinct coalesce(e.acquisition_source_key,m.source_key) as source_key,
   case when e.acquisition_source_key is not null then acquisition.commercial_usage_status when transport.commercial_usage_status='INTERNAL_INHERIT_ONLY' then coalesce(policy.commercial_usage_status,'REVIEW_REQUIRED') else transport.commercial_usage_status end as commercial_usage_status
  from public.live_structured_event_evidence e join public.live_fragment_manifest m on m.id=e.fragment_id
  left join public.live_source_registry transport on transport.source_key=m.source_key
  left join public.live_source_registry acquisition on acquisition.source_key=e.acquisition_source_key
  left join lateral (
   select p.commercial_usage_status from public.live_source_url_commercial_policy p
   where lower(coalesce(e.source_domain,''))=p.source_domain and lower(coalesce(e.source_url,'')) like lower(p.url_prefix)||'%' and (p.required_url_fragment is null or position(lower(p.required_url_fragment) in lower(coalesce(e.source_url,'')))>0)
   order by length(p.url_prefix) desc,p.policy_id asc limit 1
  ) policy on true
  where e.event_id=ev.id
  union
  select distinct archived.source_key,r.commercial_usage_status from public.live_structured_event_archived_sources archived left join public.live_source_registry r on r.source_key=archived.source_key where archived.event_id=ev.id
 ) s
) a on true;
revoke all on public.live_structured_event_commercial_rights_evaluation from public,anon,authenticated;
grant select on public.live_structured_event_commercial_rights_evaluation to service_role;
create or replace function public.geomacro_structured_event_rights_snapshot(p_event_ids uuid[]) returns table(event_id uuid,evaluated_status text,reason_codes text[],source_keys text[]) language plpgsql security definer set search_path=public as $$ begin if p_event_ids is null or cardinality(p_event_ids)<1 or cardinality(p_event_ids)>500 then raise exception 'STRUCTURED_EVENT_RIGHTS_SNAPSHOT_CONFIG_INVALID'; end if; return query select r.event_id,r.evaluated_status,r.reason_codes,r.source_keys from public.live_structured_event_commercial_rights_evaluation r where r.event_id=any(p_event_ids) order by r.event_id; end; $$;
revoke all on function public.geomacro_structured_event_rights_snapshot(uuid[]) from public,anon,authenticated;
grant execute on function public.geomacro_structured_event_rights_snapshot(uuid[]) to service_role;
commit;