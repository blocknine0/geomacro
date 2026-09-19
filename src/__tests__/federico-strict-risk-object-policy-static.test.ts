import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Federico strict Risk Object acceptance policy", () => {
  it("pins freshness, independence and high-impact policy constants", () => {
    const policy = read("src/lib/public-demo-risk-profile.ts");

    expect(policy).toContain(
      'FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS = 6',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS = 3',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_HIGH_IMPACT_SEVERITY = 70',
    );
    expect(policy).toContain(
      'controlled_live_flash_source_family_v2',
    );
    expect(policy).toContain(
      'country_bridge_attribution_v1',
    );
  });

  it("uses material evidence time instead of a renewed observation TTL", () => {
    const publisher = read(
      "src/lib/country-risk-publisher.server.ts",
    );

    expect(publisher).toContain(
      "family.last_material_update_at",
    );
    expect(publisher).toContain(
      "latest.last_material_update_at",
    );
    expect(publisher).toContain(
      "last_material_update_at",
    );
    expect(publisher).toContain(
      'verification_status", "VERIFIED"',
    );
    expect(publisher).toContain(
      "last_material_update_at",
    );
    expect(publisher).toContain(
      "source_record_id",
    );
    expect(publisher).toContain(
      "content_hash",
    );
  });

  it("binds independently verifiable trust metadata and reproducibility", () => {
    const signer = read(
      "src/lib/risk-object-signing.server.ts",
    );
    const preflight = read(
      "scripts/invinoveritas-risk-object-preflight.ts",
    );

    expect(signer).toContain(
      "https://geomacro.live/api/risk-object-keys",
    );
    expect(signer).toContain(
      "public_key_spki_b64",
    );
    expect(preflight).toContain(
      "Reproducibility manifest input_hash mismatch",
    );
    expect(preflight).toContain(
      "partner_proof_verification",
    );
    expect(preflight).toContain(
      "independentNode",
    );
  });

  it("requires substantive partner admission, not just proof presence", () => {
    const preflight = read(
      "scripts/invinoveritas-risk-object-preflight.ts",
    );
    const workflow = read(
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    );
    const schemaGuard = read(
      "supabase/migrations/954_federico_risk_object_schema_guard.sql",
    );

    expect(preflight).toContain(
      '["approve", "approve_with_concerns"].includes(verdict)',
    );
    expect(preflight).toContain(
      "blockerCount === 0",
    );
    expect(preflight).toContain(
      "highCount === 0",
    );
    expect(workflow).toContain(
      '.gates.partner_admission == "PASS"',
    );
    expect(workflow).toContain(
      '.gates.partner_proof_verification == "PASS"',
    );
    expect(workflow).toContain(
      "FEDERICO_STRICT",
    );
    expect(schemaGuard).toContain(
      "live_flash_event_families",
    );
    expect(schemaGuard).toContain(
      "live_flash_event_family_versions",
    );
  });
});
