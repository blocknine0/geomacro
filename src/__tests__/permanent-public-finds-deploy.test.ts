import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("permanent public Finds archive deployment", () => {
  it("deploys cacheable static archive assets independently of the D1 ingestion pipeline", () => {
    const workflow = readFileSync(
      ".github/workflows/deploy-permanent-public-finds-archive.yml",
      "utf8",
    );
    expect(workflow).toContain("branches:\n      - main");
    expect(workflow).toContain(".github/workflows/deploy-permanent-public-finds-archive.yml");
    expect(workflow).toContain("refs/heads/geomacro-permanent-finds-archive");
    expect(workflow).toContain('git archive "$archive_ref" data');
    expect(workflow).toContain('workers/public-finds-archive/assets/index.json');
    expect(workflow).toContain('workers/public-finds-archive/assets/latest.json');
    expect(workflow).toContain("isPermanentArchiveSignal(signal,now,{allowHistorical:true})");
    expect(workflow).toContain("npx --yes wrangler@4.136.3 deploy --config wrangler.jsonc");
    expect(workflow).toContain("public_index_readback_verified:true");
    expect(workflow).toContain("public_latest_readback_verified:true");
    expect(workflow).toContain("d1_reads:0");
    expect(workflow).toContain("d1_writes:0");
    expect(workflow).toContain("PERMANENT_ARCHIVE_CLOUDFLARE_API_TOKEN_MISSING");
    expect(workflow).not.toContain("D1_DATABASE_ID");
    expect(workflow).not.toContain("website-derived-news-immediate");
    expect(workflow).not.toContain("supabase.co");
  });
});
