-- 195x3 direct research-only state; NO risk-state queue, NO commercial
-- GRO or execution privilege. Canonical news provenance queue remains intact.
-- Research score is provisional, NOT a verified baseline or a paid risk score.
create table if not exists public.country_risk_state (
  country_code varchar(3) primary key
    check (country_code ~ '^[A-Z]{3}$'),
  composite_score numeric(5,2) not null default 50.00
    check (composite_score between 0 and 100),
  geopolitics_score numeric(5,2) not null default 50.00
    check (geopolitics_score between 0 and 100),
  macro_score numeric(5,2) not null default 50.00
    check (macro_score between 0 and 100),
  critical_minerals_score numeric(5,2) not null default 50.00
    check (critical_minerals_score between 0 and 100),
  profile text not null default 'RESEARCH_UNVERIFIED'
    check (profile='RESEARCH_UNVERIFIED'),
  verified_baseline boolean not null default false
    check (verified_baseline=false),
  version bigint not null default 0 check (version>=0),
  recent_evidence_sha256 text[] not null default array[]::text[],
  last_evidence_sha256 text,
  last_event_at timestamptz,
  updated_at timestamptz not null default now(),
  signed_snapshot jsonb,
  signed_snapshot_sha256 text,
  signed_signature_b64 text,
  signed_signing_key_id text,
  signed_version bigint,
  signed_at timestamptz,
  constraint research_signature_atomic check (
    (signed_snapshot is null and signed_snapshot_sha256 is null
      and signed_signature_b64 is null and signed_signing_key_id is null
      and signed_version is null and signed_at is null)
    or
    (signed_snapshot is not null and signed_snapshot_sha256 is not null
      and signed_signature_b64 is not null and signed_signing_key_id is not null
      and signed_version is not null and signed_at is not null)
  ),
  constraint research_signature_version check
    (signed_version is null or signed_version=version)
);
alter table public.country_risk_state enable row level security;
revoke all on table public.country_risk_state from public,anon,authenticated;
grant select,insert,update on table public.country_risk_state to service_role;

-- Authenticated SERVICE_ROLE only. A validated event is mutated atomically
-- inside one Postgres row, with a bounded identity ring for re-observation.
-- No initial countries are seeded: a default "50" is NOT evidence.
create or replace function public.update_country_realtime_score(
  p_country_code text,
  p_severity numeric,
  p_confidence numeric,
  p_category text,
  p_evidence_sha256 text,
  p_original_published_at timestamptz,
  p_independent_originals integer
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_delta numeric(5,2);
  v_state public.country_risk_state%rowtype;
  v_category text;
begin
  if p_country_code is null or p_country_code !~ '^[A-Z]{3}$'
    or p_severity is null or p_confidence is null
    or p_severity < 0 or p_severity > 100
    or p_confidence < 0 or p_confidence > 100
    or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[a-f0-9]{64}$'
    or p_original_published_at is null
    or p_independent_originals is null or p_independent_originals < 1
    or p_independent_originals > 20
  then
    raise exception 'RESEARCH_RISK_EVENT_INVALID';
  end if;
  v_category:=case p_category
    when 'geopolitics' then 'geopolitics'
    when 'macro' then 'macro'
    when 'rare_earth' then 'critical_minerals'
    when 'critical_minerals' then 'critical_minerals'
    else null end;
  if v_category is null then
    raise exception 'RESEARCH_RISK_CATEGORY_INVALID';
  end if;
  -- No input can re-label an old publisher timestamp as a breaking event.
  if p_original_published_at > now()+interval '1 minute'
     or p_original_published_at < now()-interval '6 hours'
  then
    return jsonb_build_object('status','SKIPPED_NONCURRENT_NATIVE_TIMESTAMP',
      'country_code',p_country_code,'state_changed',false);
  end if;
  -- This preliminary noncommercial heuristic is NOT a verified risk score.
  -- <40: zero table mutation, zero persistence, exactly as requested.
  if p_severity < 40 then
    return jsonb_build_object('status','SKIPPED_LOW_SIGNAL',
      'country_code',p_country_code,'state_changed',false);
  end if;
  v_delta:=round(((p_severity-40)*p_confidence/600)::numeric,2);
  if v_delta<=0 then
    return jsonb_build_object('status','SKIPPED_ZERO_DELTA',
      'country_code',p_country_code,'state_changed',false);
  end if;
  insert into public.country_risk_state(
    country_code,geopolitics_score,macro_score,critical_minerals_score,
    composite_score,version,recent_evidence_sha256,last_evidence_sha256,
    last_event_at,updated_at
  ) values (
    p_country_code,
    case when v_category='geopolitics' then 50+v_delta else 50 end,
    case when v_category='macro' then 50+v_delta else 50 end,
    case when v_category='critical_minerals' then 50+v_delta else 50 end,
    50+v_delta,1,array[p_evidence_sha256],p_evidence_sha256,
    p_original_published_at,now()
  )
  on conflict(country_code) do update
  set geopolitics_score=case when v_category='geopolitics' then
          least(100,public.country_risk_state.geopolitics_score+v_delta)
          else public.country_risk_state.geopolitics_score end,
      macro_score=case when v_category='macro' then
          least(100,public.country_risk_state.macro_score+v_delta)
          else public.country_risk_state.macro_score end,
      critical_minerals_score=case when v_category='critical_minerals' then
          least(100,public.country_risk_state.critical_minerals_score+v_delta)
          else public.country_risk_state.critical_minerals_score end,
      composite_score=greatest(
        case when v_category='geopolitics' then
            least(100,public.country_risk_state.geopolitics_score+v_delta)
            else public.country_risk_state.geopolitics_score end,
        case when v_category='macro' then
            least(100,public.country_risk_state.macro_score+v_delta)
            else public.country_risk_state.macro_score end,
        case when v_category='critical_minerals' then
            least(100,public.country_risk_state.critical_minerals_score+v_delta)
            else public.country_risk_state.critical_minerals_score end
      ),
      version=public.country_risk_state.version+1,
      recent_evidence_sha256=
        array[p_evidence_sha256] ||
        public.country_risk_state.recent_evidence_sha256[1:511],
      last_evidence_sha256=p_evidence_sha256,
      last_event_at=greatest(public.country_risk_state.last_event_at,
        p_original_published_at),
      updated_at=now(),
      -- A changed state invalidates the previous snapshot until a
      -- separately authenticated Ed25519 research signature is attached.
      signed_snapshot=null,signed_snapshot_sha256=null,
      signed_signature_b64=null,signed_signing_key_id=null,
      signed_version=null,signed_at=null
  where not (p_evidence_sha256=any(public.country_risk_state.recent_evidence_sha256))
  returning * into v_state;
  if not found then
    return jsonb_build_object('status','DUPLICATE_EVIDENCE',
      'country_code',p_country_code,'state_changed',false);
  end if;
  return jsonb_build_object(
    'status','RESEARCH_STATE_UPDATED','state_changed',true,
    'country_code',v_state.country_code,'version',v_state.version,
    'composite_score',v_state.composite_score,
    'geopolitics_score',v_state.geopolitics_score,
    'macro_score',v_state.macro_score,
    'critical_minerals_score',v_state.critical_minerals_score,
    'last_event_at',v_state.last_event_at,'updated_at',v_state.updated_at,
    'last_evidence_sha256',v_state.last_evidence_sha256,
    'profile','RESEARCH_UNVERIFIED','signed',false
  );
end
$$;
revoke all on function public.update_country_realtime_score(
  text,numeric,numeric,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.update_country_realtime_score(
  text,numeric,numeric,text,text,timestamptz,integer) to service_role;

-- Compare-and-swap: a signer may not publish an old score after a new
-- incoming article has already advanced the version.
create or replace function public.attach_country_research_signature(
  p_country_code text,
  p_expected_version bigint,
  p_snapshot jsonb,
  p_snapshot_sha256 text,
  p_signature_b64 text,
  p_signing_key_id text
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare v_updated integer;
begin
  if p_country_code is null or p_country_code !~ '^[A-Z]{3}$'
    or p_expected_version is null or p_expected_version<1
    or p_snapshot is null or
    p_snapshot->>'schema' <> 'geomacro.research-country-risk-snapshot.v1'
    or p_snapshot->>'profile' <> 'RESEARCH_UNVERIFIED'
    or p_snapshot->>'country_code' <> p_country_code
    or (p_snapshot->>'version')::bigint <> p_expected_version
    or p_snapshot->>'execution_authorized' <> 'false'
    or p_snapshot_sha256 !~ '^[a-f0-9]{64}$'
    or length(p_signature_b64) < 32 or length(p_signature_b64) > 256
    or p_signing_key_id !~ '^[a-zA-Z0-9._:-]{4,120}$'
  then
    raise exception 'RESEARCH_SIGNATURE_INVALID';
  end if;
  update public.country_risk_state
  set signed_snapshot=p_snapshot,
      signed_snapshot_sha256=p_snapshot_sha256,
      signed_signature_b64=p_signature_b64,
      signed_signing_key_id=p_signing_key_id,
      signed_version=p_expected_version,
      signed_at=now()
  where country_code=p_country_code
    and version=p_expected_version
    and composite_score=(p_snapshot->>'composite_score')::numeric
    and last_evidence_sha256=p_snapshot->>'last_evidence_sha256'
    and profile='RESEARCH_UNVERIFIED';
  get diagnostics v_updated = row_count;
  return v_updated=1;
end
$$;
revoke all on function public.attach_country_research_signature(
  text,bigint,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.attach_country_research_signature(
  text,bigint,jsonb,text,text,text) to service_role;

comment on table public.country_risk_state is
 'Research-only, provisional in-flight country state; a signed snapshot is integrity proof, NOT licensed commercial GRO or event-truth verification.';
