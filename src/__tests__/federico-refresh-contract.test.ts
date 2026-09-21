import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Federico refresh contract", () => {
  it("refreshes OIDC immediately before strict RSS corroboration", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    expect(workflow).toContain("Refresh scoped GitHub OIDC token immediately before governed RSS");
    expect(workflow).toContain("GEOMACRO_FLASH_OIDC_TOKEN=%s");
    expect(workflow).toContain("BREAKING_RSS_SOURCE_IDS:");
  });

  it("limits the strict Federico RSS run to its asserted corroboration cohort", () => {
    const workflow = read(".github/workflows/federico-seven-day-risk-refresh.yml");
    const ids = "aljazeera_rss,bbc_world_rss,xinhua_english_china_rss,scmp_china_rss,federal_reserve_press_rss,forexlive_rss,usgs_minerals_news_rss";
    expect(workflow).toContain(ids);
    expect(workflow).toContain("for source_id in aljazeera_rss bbc_world_rss xinhua_english_china_rss scmp_china_rss federal_reserve_press_rss forexlive_rss usgs_minerals_news_rss; do");
  });
});
