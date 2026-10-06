import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Federico refresh contract", () => {
  it("keeps the strict source-family map versioned and covers newly observed GDELT identities", () => {
    const profile = read("src/lib/public-demo-risk-profile.ts");
    expect(profile).toContain("federico-source-family-map-v8");
    expect(profile).toContain('"mymixfm.com": "mymixfm.com"');
    expect(profile).toContain('"wtvbam.com": "wtvbam.com"');
    expect(profile).toContain('"wiky.com": "wiky.com"');
    expect(profile).toContain('"kelo.com": "kelo.com"');
    expect(profile).toContain('"mymotherlode.com": "mymotherlode.com"');
    expect(profile).toContain('"oneindia.com": "oneindia.com"');
    expect(profile).toContain('"whtc.com": "whtc.com"');
    expect(profile).toContain('"hani.co.kr": "hani.co.kr"');
    expect(profile).toContain('"koreaherald.com": "koreaherald.com"');
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

  it("uses scoped GitHub OIDC for the governed RSS and corroboration path", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("Acquire scoped GitHub Actions OIDC token");
    expect(workflow).toContain("GEOMACRO_FLASH_OIDC_TOKEN=%s");
    expect(workflow).toContain("ACTIONS_ID_TOKEN_REQUEST_URL");
    expect(workflow).not.toContain("BREAKING_RSS_SOURCE_IDS:");
  });

  it("verifies every RSS source generically from the worker manifest", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("python worker.py 2>&1 | tee /tmp/federico-rss-live.log");
    expect(workflow).toContain("Verify every configured RSS source completed");
    expect(workflow).toContain("event.get('rss') == 'ready'");
    expect(workflow).toContain("event.get('kind') in {'rss_source_complete', 'rss_error'}");
    expect(workflow).toContain('--arg country_iso3 "$TARGET_ISO3"');
    expect(workflow).toContain('{country_iso3:$country_iso3,as_of:$as_of,candidate_offset:$offset}');
    expect(workflow).not.toContain('country_iso3:\"CHN\",as_of:$as_of,candidate_offset:$offset');
    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );
    expect(corroborator).toContain("candidate_country_iso3");
    expect(workflow).not.toContain("xinhua_english_china_rss");
    expect(workflow).not.toContain("federal_reserve_press_rss");
    expect(workflow).toContain("last_state");
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
