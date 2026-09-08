-- ============================================================
-- Signed Geomacro Risk Objects
-- GRO schema gro-1.1
--
-- Existing gro-1.0 objects remain immutable and valid
-- historical records. Signing columns are nullable for them.
-- ============================================================

alter table public.geomacro_risk_objects
  add column if not exists payload_hash text,
  add column if not exists signature text,
  add column if not exists signature_scheme text,
  add column if not exists signing_key_id text,
  add column if not exists canonicalization text;

alter table public.geomacro_risk_objects
  drop constraint if exists
    geomacro_risk_objects_payload_hash_check;

alter table public.geomacro_risk_objects
  add constraint
    geomacro_risk_objects_payload_hash_check
  check (
    payload_hash is null
    or payload_hash ~ '^[a-f0-9]{64}$'
  );

alter table public.geomacro_risk_objects
  drop constraint if exists
    geomacro_risk_objects_gro11_signing_check;

alter table public.geomacro_risk_objects
  add constraint
    geomacro_risk_objects_gro11_signing_check
  check (
    schema_version <> 'gro-1.1'
    or (
      payload_hash is not null
      and signature is not null
      and length(signature) >= 40
      and signature_scheme = 'Ed25519'
      and signing_key_id is not null
      and length(signing_key_id) > 0
      and canonicalization =
        'geomacro-canonical-json-v1'
    )
  );

comment on column
  public.geomacro_risk_objects.payload_hash
is
  'SHA-256 hash of the canonical gro-1.1 signing payload.';

comment on column
  public.geomacro_risk_objects.signature
is
  'Geomacro issuer signature over the canonical gro-1.1 payload.';

comment on column
  public.geomacro_risk_objects.signing_key_id
is
  'Identifier of the trusted Geomacro issuer verification key.';

comment on column
  public.geomacro_risk_objects.canonicalization
is
  'Canonical JSON contract used to create the signed payload.';
