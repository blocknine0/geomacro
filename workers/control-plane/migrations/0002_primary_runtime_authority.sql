-- Day 7 authority cutover marker.
-- This does not move durable payloads into D1. B2 remains the durable
-- intelligence/evidence/GRO authority and Durable Objects remain commerce
-- replay/idempotency authority. Supabase remains standby/recovery only.

INSERT INTO control_state (key, value_json, version, updated_at)
VALUES (
  'runtime_authority',
  '{"role":"primary","compact_metadata_only":true,"durable_payload_authority":"backblaze-b2","commerce_authority":"cloudflare-durable-objects","supabase_runtime_mode":"standby","supabase_required_for_serving":false}',
  1,
  '2026-10-03T00:00:00.000Z'
)
ON CONFLICT(key) DO UPDATE SET
  value_json = excluded.value_json,
  version = excluded.version,
  updated_at = excluded.updated_at;
