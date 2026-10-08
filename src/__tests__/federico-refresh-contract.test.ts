import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Federico refresh contract", () => {
  it("keeps the strict source-family map versioned and covers newly observed GDELT identities", () => {
    const profile = read("src/lib/public-demo-risk-profile.ts");
    expect(profile).toContain("federico-source-family-map-v9");
    expect(profile).toContain('"mymixfm.com": "mymixfm.com"');
    expect(profile).toContain('"wtvbam.com": "wtvbam.com"');
    expect(profile).toContain('"wiky.com": "wiky.com"');
    expect(profile).toContain('"kelo.com": "kelo.com"');
    expect(profile).toContain('"mymotherlode.com": "mymotherlode.com"');
    expect(profile).toContain('"oneindia.com": "oneindia.com"');
    expect(profile).toContain('"whtc.com": "whtc.com"');
    expect(profile).toContain('"hani.co.kr": "hani.co.kr"');
    expect(profile).toContain('"koreaherald.com": "koreaherald.com"');
    expect(profile).toContain('ecb_press_rss: "european_central_bank"');
    expect(profile).toContain('ecb_market_information_rss: "european_central_bank"');
    expect(profile).toContain('bis_rss_media_releases: "bank_for_international_settlements"');
    expect(profile).toContain('bis_rss_central_banker_speeches: "bank_for_international_settlements"');
    expect(profile).toContain('un_all_documents_rss: "united_nations"');
    expect(profile).toContain('un_security_council_docs_rss: "united_nations"');
    expect(profile).toContain('eu_council_press_rss: "council_of_the_european_union"');
    expect(profile).toContain('nrcan_news_atom: "natural_resources_canada"');
  });

  it("keeps new governed hostname identities self-describing", () => {
    const profile = read("src/lib/public-demo-risk-profile.ts");
    expect(profile).toContain("federicoStrictSourceFamilyForId");
    expect(profile).toContain("?? normalized");
  });

  it("is manual-only because partner refresh cadence is no longer a live intelligence cron", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("use_partner_allowance:");
    expect(workflow).toContain("default: false");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("scripts/invinoveritas-risk-object-preflight.ts");
    expect(read("src/lib/country-risk-engine.ts")).toContain("risk-object");
    expect(read("src/lib/country-risk-publisher.server.ts")).toContain("publish");
  });

  it("uses canonical direct-Postgres transport for governed RSS and corroboration", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("node scripts/run-rss-live-cycle.mjs");
    expect(workflow).toContain("scripts/run-live-flash-corroborate-local.ts");
    expect(workflow).not.toContain("ACTIONS_ID_TOKEN_REQUEST_URL");
    expect(workflow).not.toContain(".supabase.co/functions/v1/");
    expect(workflow).not.toContain("BREAKING_RSS_SOURCE_IDS:");
  });

  it("verifies every RSS source generically from the worker manifest", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("node scripts/run-rss-live-cycle.mjs 2>&1 | tee /tmp/federico-rss-live.log");
    expect(workflow).toContain(".source_summary.configured_source_count == .source_summary.completed_source_count");
    expect(workflow).toContain(".corroboration.threshold_weakening == false");
    expect(workflow).toContain('--country "$TARGET_ISO3"');
    expect(workflow).toContain('--candidate-offset "$offset"');
    expect(workflow).not.toContain('country_iso3:\"CHN\",as_of:$as_of,candidate_offset:$offset');
    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );
    expect(corroborator).toContain("candidate_country_iso3");
    expect(workflow).not.toContain("xinhua_english_china_rss");
    expect(workflow).not.toContain("federal_reserve_press_rss");
  });

  it("normalizes endpoint IDs to institution-level provider families in the corroborator", () => {
    const corroborator = read("supabase/functions/live-flash-corroborate/index.ts");
    expect(corroborator).toContain("FEDERICO_PROVIDER_FAMILY_BY_SOURCE_ID");
    expect(corroborator).toContain('ecb_press_rss: "european_central_bank"');
    expect(corroborator).toContain('ecb_market_information_rss: "european_central_bank"');
    expect(corroborator).toContain('bis_rss_media_releases: "bank_for_international_settlements"');
    expect(corroborator).toContain('bis_rss_central_banker_speeches: "bank_for_international_settlements"');
    expect(corroborator).toContain('un_geneva_press_rss: "united_nations"');
    expect(corroborator).toContain("FEDERICO_PROVIDER_FAMILY_BY_SOURCE_ID[sourceId] ?? sourceId");
    expect(corroborator).not.toContain("return row.source_id");
  });

  it("treats absent qualifying strict evidence as a successful fail-closed no-publication outcome", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("id: readiness");
    expect(workflow).toContain("FEDERICO_EVIDENCE_READY=false");
    expect(workflow).toContain("strict_evidence_gate_not_met");
    expect(workflow).toContain("publication_attempted:false");
    expect(workflow).toContain("federico-no-publication-${{ github.run_id }}");
    expect(workflow).toContain("sha256sum corroboration.ndjson evidence-readiness.json no-publication.json > SHA256SUMS.txt");
    expect(workflow).toContain("if: ${{ steps.readiness.outputs.ready == 'true' }}");
    expect(workflow).toContain('bun scripts/publish-country-risk-object.ts "$TARGET_ISO3" FEDERICO_STRICT');
    expect(workflow).toContain('bun scripts/check-federico-publication.ts "$TARGET_ISO3"');
    expect(workflow).toContain("inputs.use_partner_allowance == true");
    expect(workflow).toContain('.gates.live_partner_review == "NOT_RUN"');
    expect(workflow).toContain("owner_did_not_authorize_partner_allowance");
  });
});
