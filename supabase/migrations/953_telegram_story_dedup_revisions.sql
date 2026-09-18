-- Telegram story deduplication and revision tracking
create table if not exists public.live_flash_stories (
  id uuid primary key default gen_random_uuid(),
  story_key text not null unique,
  canonical_fingerprint text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RESOLVED','MERGED','QUARANTINED')),
  first_observed_at timestamptz not null,
  last_updated_at timestamptz not null,
  latest_revision_no integer not null default 1 check (latest_revision_no > 0),
  created_at timestamptz not null default now()
);
create index if not exists live_flash_stories_fingerprint_idx on public.live_flash_stories(canonical_fingerprint);
create index if not exists live_flash_stories_updated_idx on public.live_flash_stories(last_updated_at desc);

create table if not exists public.live_flash_story_revisions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.live_flash_stories(id) on delete restrict,
  revision_no integer not null check (revision_no > 0),
  revision_type text not null check (revision_type in ('INITIAL','UPDATE','CORRECTION','SOURCE_CONFIRMATION')),
  source_id text not null,
  source_message_id text,
  source_timestamp timestamptz,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  normalized_fingerprint text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  change_sha256 text not null check (change_sha256 ~ '^[0-9a-f]{64}$'),
  material_change boolean not null default false,
  change_fields jsonb not null default '{}'::jsonb,
  compact_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(story_id, revision_no),
  unique(source_id, source_message_id)
);
create index if not exists live_flash_story_revisions_story_idx on public.live_flash_story_revisions(story_id, revision_no desc);
create index if not exists live_flash_story_revisions_fingerprint_idx on public.live_flash_story_revisions(normalized_fingerprint);
alter table public.live_flash_stories enable row level security;
alter table public.live_flash_story_revisions enable row level security;
create or replace function public.prevent_flash_story_revision_mutation() returns trigger language plpgsql as $$
begin raise exception 'Telegram story/revision records are append-only'; end; $$;
drop trigger if exists live_flash_stories_immutable on public.live_flash_stories;
create trigger live_flash_stories_immutable before update or delete on public.live_flash_stories for each row execute function public.prevent_flash_story_revision_mutation();
drop trigger if exists live_flash_story_revisions_immutable on public.live_flash_story_revisions;
create trigger live_flash_story_revisions_immutable before update or delete on public.live_flash_story_revisions for each row execute function public.prevent_flash_story_revision_mutation();
comment on table public.live_flash_stories is 'Story-level deduplication identity. One story may have many source-backed revisions.';
comment on table public.live_flash_story_revisions is 'Append-only material updates/corrections with source and observation timestamps. Raw Telegram body is prohibited.';
