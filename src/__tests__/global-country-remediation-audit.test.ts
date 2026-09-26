import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const audit = readFileSync("scripts/audit-global-country-remediation.ts", "utf8");

describe("global country remediation audit", () => {
  it("uses the sovereign registry and latest canonical country Risk Objects", () => {
    expect(audit).toContain('.from("live_country_registry")');
    expect(audit).toContain('classifyGlobalEntity(row.iso3) === "SOVEREIGN"');
    expect(audit).toContain('getLatestCompatibleCountryRiskObject(country.iso3, undefined, "CANONICAL")');
  });

  it("traces authoritative rights and provenance without raw source material", () => {
    expect(audit).toContain('live_structured_event_commercial_rights_evaluation');
    expect(audit).toContain('event_id,evaluated_status,reason_codes,source_keys');
    expect(audit).toContain('event_id,source_domain,fragment_id');
    expect(audit).not.toContain('select("event_id,source_url');
    expect(audit).not.toContain('article_body');
    expect(audit).not.toContain('provider_payload');
    expect(audit).toContain('raw_source_urls_emitted: false');
    expect(audit).toContain('raw_source_material_emitted: false');
  });

  it("classifies remediation actions instead of weakening paid-delivery gates", () => {
    for (const action of [
      "REPLACE_SOURCE_OR_OBTAIN_RIGHTS",
      "REPAIR_PROVENANCE_OR_ADD_POLICY",
      "COMPLETE_RIGHTS_REVIEW_OR_REPLACE_SOURCE",
      "RESOLVE_EVENT_COMMERCIAL_VERIFICATION",
      "ADD_FRESH_ELIGIBLE_COUNTRY_EVIDENCE",
    ]) {
      expect(audit).toContain(action);
    }
    expect(audit).toContain('commercial.deliverable === true');
    expect(audit).toContain('signature.valid === true');
    expect(audit).toContain('payment_performed: false');
    expect(audit).toContain('execution_authorized: false');
  });
});
