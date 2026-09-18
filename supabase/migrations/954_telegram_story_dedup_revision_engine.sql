-- =============================================================================
-- Telegram story deduplication/revision engine
-- Story identity is immutable; revisions are append-only. Raw Telegram body/media
-- is never stored in the story ledger.
-- =============================================================================

create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

alter table public.live_flash_story_revisions
  add column if not exists normalized_headline text;

update public.live_flash_story_revisions
set normalized_headline = regexp_replace(
  lower(regexp_replace(coalesce(normalized_headline, ''), '[^a-z0-9]+', ' ', 'g')),
  '\s+',
  ' ',
  'g'
)
where normalized_headline is not null;

alter table public.live_flash_story_revisions
  alter column normalized_headline set default '';

alter table public.live_flash_story_revisions
  alter column normalized_headline set not null;

create or replace function public.prevent_flash_story_revision_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Telegram story/revision records are append-only';
  end if;

  if tg_table_name = 'live_flash_story_revisions' then
    raise exception 'Telegram story revisions are append-only';
  end if;

  if new.story_key <> old.story_key
     or new.canonical_fingerprint <> old.canonical_fingerprint
     or new.first_observed_at <> old.first_observed_at
     or new.created_at <> old.created_at then
    raise exception 'Telegram story identity fields are immutable';
  end if;

  return new;
end;
$$;

create or replace function public.record_flash_story_revision(
  p_source_id text,
  p_source_message_id text,
  p_source_timestamp timestamptz,
  p_observed_at timestamptz,
  p_normalized_headline text,
  p_content_sha256 text,
  p_compact_snapshot jsonb default '{}'::jsonb,
  p_event_type text default null,
  p_country_iso3 text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_story public.live_flash_stories%rowtype;
  v_previous public.live_flash_story_revisions%rowtype;
  v_story_id uuid;
  v_revision_no integer;
  v_revision_type text;
  v_material_change boolean;
  v_change_fields jsonb := '{}'::jsonb;
  v_change_sha256 text;
  v_story_key text;
  v_canonical_fingerprint text;
  v_similarity real;
  v_candidate uuid;
  v_candidate_score real;
  v_candidate_source_count integer;
  v_candidate_country text;
  v_old_severity integer;
  v_new_severity integer;
  v_old_lat integer;
  v_new_lat integer;
  v_old_lon integer;
  v_new_lon integer;
  v_headline text := regexp_replace(
    lower(regexp_replace(coalesce(p_normalized_headline, ''), '[^a-z0-9]+', ' ', 'g')),
    '\s+',
    ' ',
    'g'
  );
begin
  if p_source_id is null or p_source_id = ''
     or p_source_message_id is null or p_source_message_id = ''
     or p_content_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid story revision identity';
  end if;

  if v_headline = '' then
    raise exception 'normalized headline required';
  end if;

  -- Serialize story assignment so two sources cannot create competing stories
  -- from the same live headline cluster at the same instant.
  perform pg_advisory_xact_lock(hashtextextended('geomacro:telegram-story-dedup:v1', 0));

  select r.*
    into v_previous
  from public.live_flash_story_revisions r
  where r.source_id = p_source_id
    and r.source_message_id = p_source_message_id
    and r.content_sha256 = p_content_sha256
  limit 1;

  if found then
    return jsonb_build_object(
      'action', 'DUPLICATE',
      'story_id', v_previous.story_id,
      'revision_no', v_previous.revision_no,
      'revision_type', v_previous.revision_type,
      'material_change', false
    );
  end if;

  -- Prefer an exact normalized headline match, then a bounded trigram cluster.
  -- Only recent ACTIVE stories are eligible, preventing unrelated old headlines
  -- from being merged forever.
  select c.id, c.score
    into v_candidate, v_candidate_score
  from (
    select
      s.id,
      max(similarity(r.normalized_headline, v_headline)) as score
    from public.live_flash_stories s
    join public.live_flash_story_revisions r on r.story_id = s.id
    where s.status = 'ACTIVE'
      and s.last_updated_at >= coalesce(p_observed_at, now()) - interval '72 hours'
      and (
        p_country_iso3 is null
        or not exists (
          select 1
          from public.live_flash_story_revisions cr
          where cr.story_id = s.id
            and cr.compact_snapshot->>'country_iso3' is not null
            and cr.compact_snapshot->>'country_iso3' <> p_country_iso3
        )
      )
      and (
        r.normalized_fingerprint = md5(v_headline)
        or similarity(r.normalized_headline, v_headline) >= 0.62
      )
    group by s.id
    having count(*) >= 1
    order by score desc, max(r.observed_at) desc
    limit 1
  ) c;

  if v_candidate is not null then
    select s.*
      into v_story
    from public.live_flash_stories s
    where s.id = v_candidate
    for update;

    v_story_id := v_story.id;
  else
    v_canonical_fingerprint := encode(
      digest(
        concat_ws('|', 'telegram-story-v1', v_headline, coalesce(p_event_type, ''), coalesce(p_country_iso3, '')),
        'sha256'
      ),
      'hex'
    );
    v_story_key := encode(
      digest(
        concat_ws('|', 'telegram-story-key-v1', v_canonical_fingerprint),
        'sha256'
      ),
      'hex'
    );

    insert into public.live_flash_stories(
      story_key,
      canonical_fingerprint,
      first_observed_at,
      last_updated_at,
      latest_revision_no
    )
    values (
      v_story_key,
      v_canonical_fingerprint,
      coalesce(p_observed_at, now()),
      coalesce(p_observed_at, now()),
      1
    )
    returning * into v_story;

    v_story_id := v_story.id;
  end if;

  select r.*
    into v_previous
  from public.live_flash_story_revisions r
  where r.story_id = v_story_id
  order by r.revision_no desc
  limit 1;

  v_revision_no := coalesce(v_previous.revision_no, 0) + 1;

  if v_previous.id is null then
    v_revision_type := 'INITIAL';
    v_material_change := true;
    v_change_fields := jsonb_build_object('initial', true);
  elsif v_previous.normalized_fingerprint = md5(v_headline) then
    v_revision_type := 'SOURCE_CONFIRMATION';
    v_material_change := false;
    v_change_fields := jsonb_build_object('headline_changed', false);
  else
    v_revision_type := 'UPDATE';
    v_material_change := true;
    v_change_fields := jsonb_build_object(
      'headline_changed', true,
      'headline_similarity', round(similarity(v_previous.normalized_headline, v_headline)::numeric, 4)
    );

    if lower(v_headline) ~ '\m(correction|corrected|clarification|clarified|erratum)\M' then
      v_revision_type := 'CORRECTION';
      v_change_fields := v_change_fields || jsonb_build_object('correction_marker', true);
    end if;

    if coalesce(v_previous.compact_snapshot->>'country_iso3', '') is distinct from coalesce(p_compact_snapshot->>'country_iso3', '') then
      v_change_fields := v_change_fields || jsonb_build_object('country_changed', true);
    end if;

    if coalesce(v_previous.compact_snapshot->>'event_type', '') is distinct from coalesce(p_compact_snapshot->>'event_type', '') then
      v_change_fields := v_change_fields || jsonb_build_object('event_type_changed', true);
    end if;

    v_old_severity := nullif(v_previous.compact_snapshot->>'severity_bps', '')::integer;
    v_new_severity := nullif(p_compact_snapshot->>'severity_bps', '')::integer;
    if v_old_severity is not null and v_new_severity is not null
       and abs(v_new_severity - v_old_severity) >= 1000 then
      v_change_fields := v_change_fields || jsonb_build_object('severity_changed', true);
    end if;

    v_old_lat := nullif(v_previous.compact_snapshot->>'latitude_e6', '')::integer;
    v_new_lat := nullif(p_compact_snapshot->>'latitude_e6', '')::integer;
    v_old_lon := nullif(v_previous.compact_snapshot->>'longitude_e6', '')::integer;
    v_new_lon := nullif(p_compact_snapshot->>'longitude_e6', '')::integer;
    if v_old_lat is not null and v_new_lat is not null
       and abs(v_new_lat - v_old_lat) >= 100000 then
      v_change_fields := v_change_fields || jsonb_build_object('latitude_changed', true);
    end if;
    if v_old_lon is not null and v_new_lon is not null
       and abs(v_new_lon - v_old_lon) >= 100000 then
      v_change_fields := v_change_fields || jsonb_build_object('longitude_changed', true);
    end if;
  end if;

  v_change_sha256 := encode(
    digest(
      jsonb_build_object(
        'story_id', v_story_id,
        'revision_no', v_revision_no,
        'revision_type', v_revision_type,
        'source_id', p_source_id,
        'source_message_id', p_source_message_id,
        'source_timestamp', p_source_timestamp,
        'observed_at', coalesce(p_observed_at, now()),
        'normalized_fingerprint', md5(v_headline),
        'content_sha256', p_content_sha256,
        'change_fields', v_change_fields
      )::text,
      'sha256'
    ),
    'hex'
  );

  insert into public.live_flash_story_revisions(
    story_id,
    revision_no,
    revision_type,
    source_id,
    source_message_id,
    source_timestamp,
    observed_at,
    normalized_fingerprint,
    content_sha256,
    change_sha256,
    material_change,
    change_fields,
    compact_snapshot,
    normalized_headline
  )
  values (
    v_story_id,
    v_revision_no,
    v_revision_type,
    p_source_id,
    p_source_message_id,
    p_source_timestamp,
    coalesce(p_observed_at, now()),
    md5(v_headline),
    p_content_sha256,
    v_change_sha256,
    v_material_change,
    v_change_fields,
    coalesce(p_compact_snapshot, '{}'::jsonb),
    v_headline
  );

  update public.live_flash_stories
  set last_updated_at = coalesce(p_observed_at, now()),
      latest_revision_no = v_revision_no
  where id = v_story_id;

  return jsonb_build_object(
    'action', case when v_revision_type = 'INITIAL' then 'NEW_STORY' else 'REVISION' end,
    'story_id', v_story_id,
    'revision_no', v_revision_no,
    'revision_type', v_revision_type,
    'material_change', v_material_change,
    'change_fields', v_change_fields
  );
end;
$$;

revoke all on function public.record_flash_story_revision(
  text,text,timestamptz,timestamptz,text,text,jsonb,text,text
) from public, anon, authenticated;

grant execute on function public.record_flash_story_revision(
  text,text,timestamptz,timestamptz,text,text,jsonb,text,text
) to service_role;

comment on table public.live_flash_stories is
  'Immutable story identity with mutable lifecycle summary. Deduplicates cross-source reports into one story.';
comment on table public.live_flash_story_revisions is
  'Append-only source-backed revisions. normalized_headline is a derived bounded fingerprinting input; raw Telegram body/media is prohibited.';
