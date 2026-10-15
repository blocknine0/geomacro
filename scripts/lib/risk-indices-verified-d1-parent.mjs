import { createHash } from "node:crypto";

export const VERIFIED_GRI_D1_SOURCE =
  "geomacro.public-global-risk-live-proof.v1";
export const VERIFIED_GRI_D1_KEY =
  "geomacro-evidence/v1/live/global-risk/latest.json.gz";
const HASH = /^[a-f0-9]{64}$/u;
const MAX_AGE_MS = 90 * 60_000;
const MAX_FUTURE_MS = 5 * 60_000;

export function assertVerifiedCurrentGlobalRiskD1Parent(snapshot, now = Date.now()) {
  const fail = (code) => { throw new Error("INDICES_D1_PARENT_" + code); };
  if (!Number.isFinite(now) || !snapshot || typeof snapshot !== "object" ||
      Array.isArray(snapshot) || snapshot.ok !== true ||
      snapshot.product !== "global-risk" ||
      snapshot.schema !== "geomacro.public-global-risk-live.v1" ||
      snapshot.proof_schema !== VERIFIED_GRI_D1_SOURCE ||
      snapshot.verification_mode !== "direct-b2-readback" ||
      snapshot.b2_object_key !== VERIFIED_GRI_D1_KEY ||
      snapshot.full_b2_readback_verified !== true ||
      snapshot.exact_gzip_restore_verified !== true ||
      !HASH.test(String(snapshot.b2_sha256 ?? "")) ||
      !HASH.test(String(snapshot.payload_sha256 ?? "")))
    fail("DIRECT_B2_PROOF_REQUIRED");

  const sourceMs = Date.parse(String(snapshot.source_as_of ?? ""));
  const generatedMs = Date.parse(String(snapshot.generated_at ?? ""));
  const expiresMs = Date.parse(String(snapshot.expires_at ?? ""));
  if (![sourceMs, generatedMs, expiresMs].every(Number.isFinite) ||
      sourceMs > now + MAX_FUTURE_MS || sourceMs > generatedMs + MAX_FUTURE_MS ||
      generatedMs > now + MAX_FUTURE_MS ||
      now - sourceMs > MAX_AGE_MS ||
      expiresMs <= now || expiresMs <= sourceMs ||
      expiresMs > sourceMs + MAX_AGE_MS)
    fail("SOURCE_CLOCK_OR_EXPIRY_INVALID");

  const raw = snapshot.payload_json;
  if (typeof raw !== "string" || raw.length < 50 || Buffer.byteLength(raw, "utf8") > 768 * 1024 ||
      createHash("sha256").update(raw).digest("hex") !== snapshot.payload_sha256)
    fail("EXACT_PAYLOAD_HASH_INVALID");

  let value;
  try { value = JSON.parse(raw); } catch { fail("PAYLOAD_JSON_INVALID"); }
  const risk = value?.data;
  if (value?.schema !== snapshot.schema ||
      value?.generated_at !== snapshot.generated_at ||
      value?.source_project !== "ldpwajisioljyjtojvfx" ||
      value?.verification_mode !== undefined ||
      value?.current_b2_snapshot_promoted === false ||
      risk?.methodologyVersion !== "gri-v1.2.0" ||
      risk?.verificationStatus !== "verified" ||
      risk?.auditPersisted !== true ||
      Date.parse(String(risk?.snapshotAsOf ?? "")) !== sourceMs ||
      !HASH.test(String(risk?.proofHash ?? "")) ||
      !HASH.test(String(risk?.evidenceHash ?? "")) ||
      !HASH.test(String(risk?.calculationHash ?? "")) ||
      !risk.domainIndices || typeof risk.domainIndices !== "object")
    fail("VERIFIED_GRI_LINEAGE_INVALID");

  for (const category of ["geopolitics", "macro", "rare_earth"]) {
    const reading = risk.domainIndices[category];
    const readingMs = Date.parse(String(reading?.readingAsOf ?? ""));
    if (reading?.readingStatus !== "current" ||
        !Number.isFinite(readingMs) ||
        readingMs > now + MAX_FUTURE_MS ||
        now - readingMs > MAX_AGE_MS ||
        reading?.series?.["7D"]?.buckets?.length < 2 ||
        reading?.series?.["30D"]?.buckets?.length < 2)
      fail("DOMAIN_" + category.toUpperCase() + "_NOT_CURRENT");
  }

  return Object.freeze({
    originalSnapshot: snapshot,
    risk, sourceAsOf: new Date(sourceMs).toISOString(),
    parentB2Sha256: snapshot.b2_sha256,
    parentPayloadSha256: snapshot.payload_sha256,
    parentGeneratedAt: snapshot.generated_at,
  });
}
