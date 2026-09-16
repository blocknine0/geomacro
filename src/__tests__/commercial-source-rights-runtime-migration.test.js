import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../../scripts/commercial-source-rights-evidence.mjs";

const migration = readFileSync(
  "supabase/migrations/936_commercial_source_rights_runtime_parity.sql",
  "utf8",
);

describe("commercial source-rights runtime migration", () => {
  it("keeps WGI paid raw-evidence eligibility aligned to the reviewed manifest", () => {
    expect(
      COMMERCIAL_SOURCE_RIGHTS_EVIDENCE.world_bank_wgi_political_stability
        .raw_redistribution_allowed,
    ).toBe(true);
    expect(migration).toContain("where source_id = 'world_bank_wgi_political_stability'");
    expect(migration).toMatch(
      /raw_redistribution_allowed = true,[\s\S]*where source_id = 'world_bank_wgi_political_stability'/,
    );
    expect(migration).toContain("separately identifiable proprietary upstream perception-source material");
  });

  it("keeps USGS MCS raw delivery blocked at the reviewed product boundary", () => {
    expect(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE.usgs_mcs.raw_redistribution_allowed).toBe(false);
    expect(migration).toContain("where source_id = 'usgs_mcs'");
    expect(migration).toMatch(
      /raw_redistribution_allowed = false,[\s\S]*where source_id = 'usgs_mcs'/,
    );
    expect(migration).toContain("third-party material");
  });

  it("refuses silent contract drift before changing either source", () => {
    expect(migration).toContain("runtime contract is missing or unexpectedly changed");
    expect(migration).toContain("commercial_usage_status = 'COMMERCIAL_OK'");
    expect(migration).toContain("attribution_required = true");
    expect(migration).toContain("enabled_for_ingestion = true");
  });
});
