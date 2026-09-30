-- Keep fragment archive pointers strict while allowing both the current live/v1
-- namespace and the legacy fragments/v1 namespace. The production constraint
-- was already widened during the verified legacy-fragment canary recovery.

alter table public.live_fragment_archive_locations
  drop constraint if exists live_fragment_archive_locations_archive_object_path_check;

alter table public.live_fragment_archive_locations
  add constraint live_fragment_archive_locations_archive_object_path_check
  check (
    archive_object_path ~ '^geomacro-evidence/v1/(live|fragments)/v1/[A-Za-z0-9_./-]+\.ndjson\.gz$'
  );
