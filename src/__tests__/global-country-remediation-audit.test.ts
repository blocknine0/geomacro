import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const audit = readFileSync("scripts/audit-global-country-remediation.ts", "utf8");

describe("global country remediation audit", () => {
  it("uses the sovereign registry and a bounded hot canonical GRO scan", () => {
    expect(audit).toContain('.from("live_country_registry")');
    expect(audit).toContain('classifyGlobalEntity(row.iso3) === "SOVEREIGN"');
    expect(audit).toContain('.from("geomacro_risk_objects")');
    expect(audit).toContain('.not("payload", "is", null)');
    expect(audit).toContain('"not.cs", profileJson');
    expect(audit).toContain("cold_archive_reads: 0");
    expect(audit).not.toContain("getLatestCompatibleCountryRiskObject(");
  });

  it("fails closed when a country has no hot canonical object instead of reading B2", () => {
    expect(audit).toContain('"missing_hot_canonical_risk_object"');
    expect(audit).toContain("hot_country_objects_loaded");
    expect(audit).toContain("rows_scanned");
    expect(audit).toContain("maxRows = 4000");
  });

  it("traces authoritative rights and provenance without raw source material", () => {
    expect(audit).toContain('live_structured_event_commercial_rights_evaluation');
    expect(audit).toContain('event_id,evaluated_status,reason_codes,source_keys');
    expect(audit).toContain('event_id,source_domain,fragment_id,country_iso3,country_confidence');
    expect(audit).not.toContain('select("event_id,source_url');
    expect(audit).not.toContain('article_body');
    expect(audit).not.toContain('provider_payload');
    expect(audit).toContain('raw_source_urls_emitted: false');
    expect(audit).toContain('raw_source_material_emitted: false');
    expect(audit).toContain('event_titles_emitted: false');
  });

  it("detects possible event-country attribution overreach before changing rights gates", () => {
    expect(audit).toContain('id,primary_country,countries,event_type,severity,confidence');
    expect(audit).toContain('country_attribution_supported: countryAttributionSupported');
    expect(audit).toContain('possible_attribution_overreach: !countryAttributionSupported');
    expect(audit).toContain('REVIEW_EVENT_COUNTRY_ATTRIBUTION');
    expect(audit).toContain('possible_attribution_overreach_country_count');
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


describe("global country remediation audit error boundary", () => {
  it("does not emit stacks or arbitrary serialized failure objects", () => {
    expect(audit).toContain('String(message).slice(0, 240)');
    expect(audit).not.toContain('error.stack');
    expect(audit).not.toContain('JSON.stringify(error)');
  });
});
