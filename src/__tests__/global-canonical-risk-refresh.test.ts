import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("global canonical Risk Object refresh", () => {
  it("uses the enabled country-like registry instead of a hard-coded country list", () => {
    const script = read("scripts/refresh-global-canonical-risk-objects.ts");
    expect(script).toContain('.from("live_country_registry")');
    expect(script).toContain('.eq("enabled", true)');
    expect(script).toContain('const COUNTRY_LIKE_SPECIALS = new Set(["PSE", "TWN"])');
    expect(script).toContain('scope === "SOVEREIGN" || COUNTRY_LIKE_SPECIALS.has(iso3)');
    expect(script).not.toContain('const COUNTRY_IDS = [');
  });

  it("publishes CANONICAL objects and preserves commercial fail-closed policy", () => {
    const script = read("scripts/refresh-global-canonical-risk-objects.ts");
    expect(script).toContain('delivery_profile: "CANONICAL"');
    expect(script).toContain("verifyRiskObjectSignature");
    expect(script).toContain("verifyCommercialRiskObjectArtifact");
    expect(script).toContain('status: paidReady ? "PAID_READY" : "FAIL_CLOSED"');
    expect(script).toContain('"canonical_refresh_failed_closed"');
    expect(script).toContain("ready_floor_met: paidReady.length >= MIN_READY");
    expect(script).toContain("failure_summary");
    expect(script).toContain("reason_counts");
    expect(script).toContain("region_counts");
  });

  it("emits only sanitized derived refresh evidence and never performs payment", () => {
    const script = read("scripts/refresh-global-canonical-risk-objects.ts");
    for (const required of [
      "payment_not_performed_by_refresh: true",
      "raw_source_material_emitted: false",
      "raw_exception_messages_emitted: false",
      "execution_authorized: false",
      "minimum_ready_gate: MIN_READY",
      "GLOBAL_CANONICAL_MIN_COUNTRY_LIKE_DENOMINATOR",
      "all_enabled_country_like_subjects_evaluated",
      'error_code: "canonical_refresh_failed_closed"',
    ]) {
      expect(script).toContain(required);
    }

    expect(script).not.toContain("error: error instanceof Error ? error.message");

    for (const forbidden of [
      "raw_payload",
      "article_body",
      "provider_payload",
      "source_payload",
      "scraped_html",
      "internal_prompt",
      "system_prompt",
      "payment-signature",
    ]) {
      expect(script).not.toContain(forbidden);
    }
  });
});
