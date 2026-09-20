import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/067_source_certification_path_promotion.sql",
  "utf8",
);

describe("source certification path promotion", () => {
  it("requires an already certified source and all path-level evidence gates", () => {
    expect(migration).toContain(
      "SOURCE_LEVEL_CERTIFICATION_REQUIRED",
    );
    expect(migration).toContain(
      "PATH_CERTIFICATION_EVIDENCE_INCOMPLETE",
    );
    expect(migration).toContain(
      "p_endpoint_check <> 'PASS'",
    );
    expect(migration).toContain(
      "p_schema_check <> 'PASS'",
    );
    expect(migration).toContain(
      "p_freshness_check <> 'PASS'",
    );
    expect(migration).toContain(
      "p_independence_check <> 'PASS'",
    );
  });

  it("requires auditable evidence, actor and a SHA-256 attestation", () => {
    expect(migration).toContain(
      "CERTIFICATION_EVIDENCE_REF_REQUIRED",
    );
    expect(migration).toContain(
      "CERTIFICATION_HASH_MUST_BE_SHA256_HEX",
    );
    expect(migration).toContain(
      "CERTIFIED_BY_REQUIRED",
    );
    expect(migration).toContain(
      "certified_at",
    );
    expect(migration).toContain(
      "certification_hash",
    );
  });

  it("keeps promotion available only to service_role", () => {
    expect(migration).toContain(
      "revoke all on function public.certify_live_source_queue_path",
    );
    expect(migration).toContain(
      "to service_role",
    );
  });
});
