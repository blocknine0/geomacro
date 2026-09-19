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
      'FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65',
    );
    expect(policy).toContain(
      'controlled_live_flash_source_family_v2',
    );
    expect(policy).toContain(
      'country_bridge_attribution_v1',
    );
  });

  it("pins the two-independent-source Federico verification contract", () => {
    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );

    expect(corroborator).toContain(
      "FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2",
    );
    expect(corroborator).toContain(
      "FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45",
    );
    expect(corroborator).toContain(
      "FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65",
    );
    expect(corroborator).toContain(
      "distinctSourceCount >= FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES",
    );
    expect(corroborator).toContain(
      "countryAgreement",
    );
    expect(corroborator).toContain(
      "maxSimilarity >= FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY",
    );
    expect(corroborator).not.toContain(
      "distinctSourceCount >= 3 && maxSimilarity >= 0.40",
    );
  });

  it("preserves country attribution on idempotent live-flash duplicates", () => {
    const ingest = read(
      "supabase/functions/live-flash-ingest/index.ts",
    );

    expect(ingest).toContain(
      'const existingCountryResult = await db',
    );
    expect(ingest).toContain(
      '.from("live_flash_event_countries")',
    );
    expect(ingest).toContain(
      "countries: (existingCountryResult.data ?? []).map",
    );
    expect(ingest).toContain(
      'verification_status: "UNCHANGED"',
    );
  });

  it("pins the authoritative production lifecycle migrations", () => {
    const lifecycle = read(
      "supabase/migrations/955_realtime_event_family_lifecycle.sql",
    );
    const versions = read(
      "supabase/migrations/956_event_family_version_ledger.sql",
    );

    expect(lifecycle).toContain(
      "create table if not exists public.live_flash_event_families",
    );
    expect(lifecycle).toContain(
      "alter table public.live_flash_events",
    );
    expect(lifecycle).toContain(
      "last_material_update_at timestamptz",
    );
    expect(versions).toContain(
      "live_flash_event_family_versions",
    );
    expect(versions).toContain(
      "unique (family_id, version)",
    );
  });

  it("keeps isolated Telegram migrations outside the production track", () => {
    const productionWorkflow = read(
      ".github/workflows/deploy-country-flash-supabase.yml",
    );
    const isolatedWorkflow = read(
      ".github/workflows/deploy-telegram-signal-supabase.yml",
    );

    expect(productionWorkflow).not.toContain(
      "supabase/isolated-signal",
    );
    expect(productionWorkflow).toContain(
      "supabase/migrations/**",
    );
    expect(isolatedWorkflow).toContain(
      "SUPABASE_WORKDIR=supabase/isolated-signal",
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
    expect(publisher).not.toContain(
      "legacy_schema_compat",
    );
    expect(publisher).not.toContain(
      "PGRST205",
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
      "supabase/migrations/957_repair_federico_event_family_schema.sql",
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
