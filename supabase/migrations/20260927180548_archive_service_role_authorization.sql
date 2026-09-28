-- Authorize archive reads using the role assigned by PostgREST to the caller's API key.
-- Unlike comparing Deno's built-in legacy JWT key, this accepts rotated secret API keys.
create or replace function public.internal_gro_archive_reader_authorized()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select current_user = 'service_role';
$$;

revoke all on function public.internal_gro_archive_reader_authorized() from public, anon, authenticated;
grant execute on function public.internal_gro_archive_reader_authorized() to service_role;
