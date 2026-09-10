-- =============================================================================
-- Geomacro Testnet Tester private avatar storage
-- Service-role only. Browser clients never receive direct storage write access.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'testnet-tester-avatars',
  'testnet-tester-avatars',
  false,
  2097152,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.testnet_tester_profiles.avatar_path is
  'Private service-role storage path in the testnet-tester-avatars bucket. Never a remote user-controlled URL.';
