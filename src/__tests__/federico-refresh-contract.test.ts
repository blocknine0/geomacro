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

  it("runs on relevant main changes as well as scheduled/workflow-run triggers", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("- main");
    expect(workflow).toContain(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("scripts/invinoveritas-risk-object-preflight.ts");
    expect(workflow).toContain("src/lib/country-risk-engine.ts");
    expect(workflow).toContain("src/lib/country-risk-publisher.server.ts");
  });

  it("refreshes OIDC immediately before the complete governed RSS registry", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("Refresh scoped GitHub OIDC token immediately before governed RSS");
    expect(workflow).toContain("GEOMACRO_FLASH_OIDC_TOKEN=%s");
    expect(workflow).not.toContain("BREAKING_RSS_SOURCE_IDS:");
  });

  it("verifies every RSS source generically from the worker manifest", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("python worker.py 2>&1 | tee /tmp/federico-rss-live.log");
    expect(workflow).toContain("Verify every configured RSS source completed");
    expect(workflow).toContain("event.get('rss') == 'ready'");
    expect(workflow).toContain("event.get('kind') in {'rss_source_complete', 'rss_error'}");
    expect(workflow).toContain('--data \'{"country_iso3":"CHN"}\'');    expect(workflow).toContain(
      "candidate_country_iso3",
    );
    expect(workflow).not.toContain("xinhua_english_china_rss");
    expect(workflow).not.toContain("federal_reserve_press_rss");
    expect(workflow).toContain("last_state");
    expect(workflow).toContain("remained failed after the worker's bounded recovery policy");
  });

  it("derives GDELT drain bounds from the actual fragment response", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("fragment_total=\"$(jq -r '.fragment_total // 0' \"${response_file}\")\"");
    expect(workflow).toContain("batch_size=\"$(jq -r '.batch_size // 0' \"${response_file}\")\"");
    expect(workflow).toContain("status=\"$(jq -r '.status // \"\"' \"${response_file}\")\"");
    expect(workflow).toContain('if [[ "${status}" == "nothing_new" ]]; then');
    expect(workflow).not.toContain("max_batches=32");
    expect(workflow).not.toContain('for attempt in $(seq 1 "${max_batches}"); do');
  });
});
