-- Read-only resolver for immutable live_fragment_manifest storage locations.
-- Consumers keep the canonical manifest row identity/hashes while preferring a
-- verified B2 sidecar after the original Supabase Storage object is removed.

create or replace view public.resolved_live_fragment_locations
with (security_invoker = true)
as
select
  m.id,
  m.source_key,
  m.stream_key,
  m.schema_version,
  m.compression,
  m.period_start,
  m.period_end,
  m.item_count,
  m.uncompressed_bytes,
  m.compressed_bytes,
  m.payload_sha256,
  m.compressed_sha256,
  m.previous_fragment_sha256,
  m.chain_sha256,
  m.topics,
  m.countries,
  m.source_domains,
  m.sealed_at,
  m.verified_at,
  m.verification_method,
  case
    when a.source_deleted_at is not null then a.archive_bucket
    else m.storage_bucket
  end as resolved_storage_bucket,
  case
    when a.source_deleted_at is not null then a.archive_object_path
    else m.object_path
  end as resolved_object_path,
  a.archive_bucket,
  a.archive_object_path,
  a.verified_at as archive_verified_at,
  a.source_deleted_at,
  a.deletion_proof_key
from public.live_fragment_manifest m
left join public.live_fragment_archive_locations a
  on a.fragment_id = m.id;

revoke all on public.resolved_live_fragment_locations from anon, authenticated;
grant select on public.resolved_live_fragment_locations to service_role;

comment on view public.resolved_live_fragment_locations is
  'Canonical immutable live fragment metadata plus verified active storage location; B2 is used only after source deletion is durably recorded.';
