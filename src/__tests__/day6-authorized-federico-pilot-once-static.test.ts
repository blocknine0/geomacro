import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/day6-authorized-federico-pilot-once.yml",
  "utf8",
);

describe("one-time Day 6 Federico pilot authorization", () => {
  it("refreshes and proves local readiness before partner allowance", () => {
    const preflight = workflow.indexOf("Prove verified D1 signed GRO hot serving before Federico work");
    const gdelt = workflow.indexOf("Refresh governed GDELT structured evidence before strict corroboration");
    const refresh = workflow.indexOf("Re-poll governed RSS without partner allowance");
    const hydrate = workflow.indexOf("Hydrate trusted publisher times before strict candidate selection");
    const select = workflow.indexOf("Select strongest fresh strict candidate set");
    const corroborate = workflow.indexOf("Corroborate candidates and select first genuinely strict-ready country");
    const local = workflow.indexOf("Dispatch no-allowance current-head local assurance");
    const live = workflow.indexOf("Dispatch exactly one authorized Federico pilot allowance review");
    expect(preflight).toBeGreaterThan(-1);
    expect(gdelt).toBeGreaterThan(preflight);
    expect(refresh).toBeGreaterThan(gdelt);
    expect(hydrate).toBeGreaterThan(refresh);
    expect(workflow).toContain("scripts/ops/verify-country-gro-hot-serving.ts");
    expect(workflow).toContain('"scripts/ops/verify-country-gro-hot-serving.ts"');
    expect(workflow).toContain('"src/lib/d1-country-gro-hot.server.ts"');
    expect(workflow).toContain("geomacro.country-gro-d1-hot-canary.v1");
    expect(select).toBeGreaterThan(hydrate);
    expect(corroborate).toBeGreaterThan(select);
    expect(local).toBeGreaterThan(corroborate);
    expect(live).toBeGreaterThan(local);
    for (const stepName of [
      "Select strongest fresh strict candidate set",
      "Corroborate candidates and select first genuinely strict-ready country",
      "Dispatch no-allowance current-head local assurance",
      "Dispatch exactly one authorized Federico pilot allowance review",
      "Seal orchestration summary",
      "Record Day 6 outcome on migration tracker",
    ]) {
      expect(workflow.split(stepName)).toHaveLength(2);
    }
    expect(workflow).toContain("use_partner_allowance=false");
    expect(workflow).toContain("use_partner_allowance=true");
    expect(workflow).toContain("node scripts/run-rss-live-cycle.mjs");
    expect(workflow).toContain("scripts/run-live-flash-corroborate-local.ts");
    expect(workflow).toContain("scripts/hydrate-federico-source-times.ts");
    expect(workflow).toContain("scripts/run-gdelt-gal-cycle.mjs");
    expect(workflow).toContain("B2_GDELT_PRIMARY: \"1\"");
    expect(workflow).toContain('(.status == "healthy" or .status == "fresh_prior_cycle")');
    expect(workflow).toContain('.failure_class == "B2_DOWNLOAD_CAP_EXCEEDED"');
    expect(workflow).toContain("The new GDELT fragment was not promoted to structured evidence");
    expect(workflow).toContain("FEDERICO_STRICT thresholds remain unchanged");
    expect(workflow).toContain('"scripts/run-gdelt-gal-cycle.mjs"');
    expect(workflow).toContain('"supabase/functions/live-flash-corroborate/index.ts"');
    expect(workflow).toContain('"src/lib/public-demo-risk-profile.ts"');
    expect(workflow).toContain("--experimental-loader=./scripts/lib/direct-postgres-supabase-loader.mjs");
    expect(workflow).toContain('policy == "trusted_publisher_metadata_only"');
    expect(workflow).toContain(".fake_freshness == false");
    expect(workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(workflow).toContain("B2_S3_ENDPOINT: https://s3.us-east-005.backblazeb2.com");
    expect(workflow).toContain("B2_KEY_ID: ${{ secrets.B2_KEY_ID }}");
    expect(workflow).toContain("B2_APPLICATION_KEY: ${{ secrets.B2_APPLICATION_KEY }}");
    expect(workflow).toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(workflow).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(workflow).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(workflow).toContain("B2_ARCHIVE_WRITE_KEY_ID");
    expect(workflow).toContain("B2_ARCHIVE_WRITE_APPLICATION_KEY");
    expect(workflow).toContain("Archive B2 read/write credentials must be supplied as a complete pair.");
    expect(workflow).toContain("dedicated read pair, else archive read/write pair, else existing B2 pair");
    expect(workflow).toContain(".b2_network_read_required == false");
    expect(workflow).toContain(".serving_store == \"cloudflare-d1\"");
    expect(workflow).toContain("for attempt in $(seq 1 12);");
    expect(workflow).toContain("sleep 10");
    expect(workflow).toContain("HOT_READY=false");
    expect(workflow).toContain("No Federico allowance was used.");
    expect(workflow).toContain("independent main-push deploy/publish lane");
    expect(workflow).toContain("SUPABASE_DB_URL B2_KEY_ID B2_APPLICATION_KEY");
    expect(workflow).toContain("Dedicated B2 archive read credentials must be supplied as a complete pair.");
    expect(workflow).toContain("strict_source_map(source_id, source_family)");
    expect(workflow).toContain("m.source_family");
    expect(workflow).toContain("count(distinct source_family) >= 2");
    expect(workflow).not.toContain("count(distinct source_id) >= 2");
    expect(workflow).toContain("e.published_at as evidence_at");
    expect(workflow).toContain("e.published_at is not null");
    expect(workflow).toContain("e.published_at >= now() - interval '6 hours'");
    expect(workflow).toContain("e.published_at <= now()");
    expect(workflow).toContain("c.country_iso3 ~ " + "'^[A-Z]{3}$'");
    expect(workflow).not.toContain("coalesce(e.published_at,e.last_seen_at,e.ingested_at)");
    expect(workflow).not.toContain(".supabase.co/functions/v1/");
    expect(workflow).not.toContain("ACTIONS_ID_TOKEN_REQUEST_URL");
  });

  it("does not authorize user funds or irreversible execution", () => {
    expect(workflow).toContain('"user_funds_authorized":false');
    expect(workflow).toContain('"real_money_payment_authorized":false');
    expect(workflow).toContain('"execution_authorized":false');
    expect(workflow).toContain("github.run_attempt == 1");
  });

  it("pins both child assurance runs to the parent SHA and exact artifact contract", () => {
    expect(workflow).toContain('-f candidate_sha="$MAIN_SHA" -f use_partner_allowance=false');
    expect(workflow).toContain('-f candidate_sha="$MAIN_SHA" -f use_partner_allowance=true');
    expect(workflow).toContain("--json databaseId,createdAt,displayTitle,status");
    expect(workflow).not.toContain("--json databaseId,createdAt,headSha,status");
    expect(workflow).toContain("day6-global-partner-assurance-${RUN_ID}");
    expect(workflow).not.toContain("federico-handoff-${RUN_ID}");
    expect(workflow).toContain('RSS_LIVE_SKIP_CORROBORATION: "true"');
    expect(workflow).toContain('BREAKING_RSS_SOURCE_IDS: "xinhua_english_china_rss,scmp_china_rss,forexlive_rss,aljazeera_rss,bbc_world_rss,federal_reserve_press_rss,ecb_press_rss,ecb_market_information_rss,bis_rss_media_releases,bis_rss_central_banker_speeches,eu_council_press_rss,un_all_documents_rss,un_human_rights_council_rss,un_geneva_press_rss,un_security_council_docs_rss,un_geneva_meeting_summaries_rss,usgs_minerals_news_rss,nrcan_news_atom"');
    expect(workflow).toContain("('ecb_press_rss', 'european_central_bank')");
    expect(workflow).toContain("('ecb_market_information_rss', 'european_central_bank')");
    expect(workflow).toContain("('bis_rss_media_releases', 'bank_for_international_settlements')");
    expect(workflow).toContain("('bis_rss_central_banker_speeches', 'bank_for_international_settlements')");
    expect(workflow).toContain("('un_all_documents_rss', 'united_nations')");
    expect(workflow).toContain("('un_security_council_docs_rss', 'united_nations')");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("Record Day 6 outcome on migration tracker");
    expect(workflow).toContain("gh issue comment 1354");
    expect(workflow).toContain('.corroboration.skipped == true');
    expect(workflow).toContain('explicit_partner_bootstrap_country_corroboration_follows');
  });
});
