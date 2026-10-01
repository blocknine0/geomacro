-- Source-cert evidence cleanup is performed by the B2 recovery worker only after
-- fresh full readback + exact member-set verification. Retire the legacy
-- stored DELETE function so database migrations remain non-destructive and the
-- worker can rollback uncertain/partial cleanup from its verified member set.

drop function if exists public.geomacro_finalize_archived_source_cert_evidence_run(
  text,
  text,
  text,
  integer,
  integer,
  text
);
