-- Risk Gate Part 1: Complex / Full corridor archive proof fields.
-- Existing signed corridor GRO rows remain preserved. Historical rows begin
-- unverified and must be independently B2 GET-attested before Complex is READY.
ALTER TABLE corridor_gro_verified_hot
 ADD COLUMN archive_key TEXT;
ALTER TABLE corridor_gro_verified_hot
 ADD COLUMN archive_sha256 TEXT CHECK(
  archive_sha256 IS NULL OR length(archive_sha256)=64);
ALTER TABLE corridor_gro_verified_hot
 ADD COLUMN archive_readback_verified INTEGER NOT NULL DEFAULT 0 CHECK(
  archive_readback_verified IN (0,1));

CREATE TRIGGER IF NOT EXISTS trg_corridor_gro_archive_readback_require_exact_proof
 BEFORE UPDATE OF archive_readback_verified,archive_key,archive_sha256
 ON corridor_gro_verified_hot
 WHEN NEW.archive_readback_verified=1 AND (
  NEW.archive_write_acknowledged<>1 OR
  NEW.archive_key IS NULL OR
  NEW.archive_sha256 IS NULL OR
  length(NEW.archive_sha256)<>64)
 BEGIN
  SELECT RAISE(ABORT,'CORRIDOR_GRO_B2_READBACK_EXACT_PROOF_REQUIRED');
 END;
CREATE INDEX IF NOT EXISTS idx_corridor_gro_archive_readback
 ON corridor_gro_verified_hot(archive_readback_verified,expires_at);
