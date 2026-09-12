import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ingest = readFileSync(
  new URL("../../scripts/ingest-ucdp-candidate-live.mjs", import.meta.url),
  "utf8",
);

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/053_ucdp_candidate_live_ingest.sql",
    import.meta.url,
  ),
  "utf8",
);

const transportAlignment = readFileSync(
  new URL(
    "../../supabase/migrations/054_ucdp_candidate_transport_alignment.sql",
    import.meta.url,
  ),
  "utf8",
);

const sourcePolicy = readFileSync(
  new URL("../../scripts/commercial-source-policy.mjs", import.meta.url),
  "utf8",
);

const workflow = readFileSync(
  new URL("../../.github/workflows/ucdp-candidate-sync.yml", import.meta.url),
  "utf8",
);

describe("UCDP Candidate live evidence boundary", () => {
  it("keeps current Candidate data separate from finalized historical UCDP", () => {
    expect(migration).toContain("'ucdp_candidate'");
    expect(migration).toContain("live_ucdp_candidate_latest");
    expect(ingest).toContain("PROVISIONAL_UNTIL_FINAL_ANNUAL_GED");
    expect(ingest).toContain("EVIDENCE_ONLY_NOT_IN_GRO_V02");
  });

  it("preserves the authenticated API allowance during bulk monthly sync", () => {
    expect(ingest).toContain("OFFICIAL_DOWNLOAD_CSV");
    expect(ingest).toContain("https://ucdp.uu.se/downloads/candidateged/");
    expect(ingest).not.toContain("UCDP_API_TOKEN");
    expect(transportAlignment).toContain("authenticated API daily request allowance");
  });

  it("fails closed on country mapping and registers commercial source policy", () => {
    expect(ingest).toContain('UCDP_MAX_UNMAPPED_ROWS ?? "0"');
    expect(sourcePolicy).toContain("ucdp_candidate");
    expect(sourcePolicy).toContain('allowed_statuses: Object.freeze(["VERIFIED"])');
  });

  it("uses governed UCDP country-id mappings for known legacy/current labels", () => {
    expect(ingest).toContain('"490": "COD"');
    expect(ingest).toContain('"640": "TUR"');
    expect(ingest).toContain('"775": "MMR"');
    expect(ingest).toContain("UCDP_GW_COUNTRY_ID_TO_ISO3");
    expect(ingest).toContain("registry.byIso3.has(mappedFromCountryId)");
  });

  it("retries only UCDP official country labels without a trailing parenthetical", () => {
    expect(ingest).toContain("function ucdpOfficialCountryIso3");
    expect(ingest).toContain('official.replace(/\\s*\\([^)]*\\)\\s*$/, "").trim()');
    expect(ingest).toContain("countryIso3FromName(withoutTrailingParenthetical, registry)");
    expect(ingest).not.toContain('UCDP_MAX_UNMAPPED_ROWS ?? "89"');
    expect(ingest).not.toContain('UCDP_MAX_UNMAPPED_ROWS ?? "1"');
  });

  it("preserves provisional fatality anomalies as non-commercial PARTIAL evidence", () => {
    expect(ingest).toContain("FATALITY_INTERVAL_NOT_ORDERED");
    expect(ingest).toContain("BEST_COMPONENT_SUM_MISMATCH");
    expect(ingest).toContain("fatality_interval_consistent");
    expect(ingest).toContain("best_component_sum_consistent");
    expect(ingest).toContain('qualityStatus === "VERIFIED" ? "VERIFIED" : "UNVERIFIED"');
    expect(ingest).not.toContain('reason: "invalid_fatality_interval"');
  });

  it("still fails closed on malformed or negative fatality values", () => {
    expect(ingest).toContain("function parseDeathField");
    expect(ingest).toContain('reason: "invalid_fatality_value"');
    expect(ingest).toContain('reason: "missing_or_invalid_best_deaths"');
  });

  it("runs the full Candidate release as a no-write PR validation", () => {
    expect(workflow).toContain("Validate full Candidate release without database writes");
    expect(workflow).toContain("if: github.event_name == 'pull_request'");
    expect(workflow).toContain("run: bun scripts/ingest-ucdp-candidate-live.mjs");
    expect(workflow).toContain("run: bun scripts/ingest-ucdp-candidate-live.mjs --write");
  });
});
