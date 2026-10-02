import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wrapper = readFileSync(
  "scripts/ops/run-b2-snapshot-maintenance-with-preservation.mjs",
  "utf8",
);
const liveWorkflow = readFileSync(
  ".github/workflows/b2-live-snapshot-maintenance.yml",
  "utf8",
);
const governedWorkflow = readFileSync(
  ".github/workflows/b2-agent-governed-modules-snapshot.yml",
  "utf8",
);

describe("B2 snapshot maintenance quota preservation", () => {
  it("only converts the explicit Supabase egress restriction into a preservation no-op", () => {
    expect(wrapper).toContain("/exceed_egress_quota/i");
    expect(wrapper).toContain("service for this project is restricted");
    expect(wrapper).toContain("if (!quotaRestricted(combined))");
    expect(wrapper).toContain("process.exit(typeof child.status === \"number\" && child.status > 0 ? child.status : 1)");
    expect(wrapper).toContain('reason: "supabase_exceed_egress_quota"');
    expect(wrapper).toContain('maintenance_mode: "verified_preserved_snapshot_noop"');
  });

  it("never writes or advances freshness in preservation mode", () => {
    expect(wrapper).not.toContain("b2.put(");
    expect(wrapper).toContain("wrote_new_snapshot: false");
    expect(wrapper).toContain("freshness_advanced: false");
    expect(wrapper).toContain("snapshot_age_seconds");
  });

  it("re-verifies preserved public snapshots against proof, hash and gzip restore", () => {
    expect(wrapper).toContain('"geomacro.live-snapshot-proof.v1"');
    expect(wrapper).toContain('"geomacro.public-intelligence-live.v1"');
    expect(wrapper).toContain('"geomacro.public-risk-live.v1"');
    expect(wrapper).toContain('"geomacro.source-network-live.v1"');
    expect(wrapper).toContain('"geomacro.commercial-source-rights-live.v1"');
    expect(wrapper).toContain("sha256(packed)");
    expect(wrapper).toContain("gunzipSync(packed)");
    expect(wrapper).toContain('restored?.data?.verificationStatus !== "verified"');
    expect(wrapper).toContain('["geopolitics", "macro", "rare_earth"]');
  });

  it("re-verifies the governed module snapshot and its no-raw-material boundary", () => {
    expect(wrapper).toContain('"geomacro.agent-governed-modules-proof.v1"');
    expect(wrapper).toContain('"geomacro.agent-governed-modules-live.v1"');
    expect(wrapper).toContain('"DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL"');
    expect(wrapper).toContain("record.full_b2_readback_verified !== true");
    expect(wrapper).toContain("record.exact_gzip_restore_verified !== true");
    expect(wrapper).toContain("record.raw_source_material_in_snapshot !== false");
    expect(wrapper).toContain('state.commercial_eligibility_status !== "VERIFIED"');
  });

  it("routes both production maintenance workflows through the preservation wrapper", () => {
    expect(liveWorkflow).toContain(
      "run: bun scripts/ops/run-b2-snapshot-maintenance-with-preservation.mjs live-public",
    );
    expect(governedWorkflow).toContain(
      "run: bun scripts/ops/run-b2-snapshot-maintenance-with-preservation.mjs governed-modules",
    );
    expect(liveWorkflow).toContain('"scripts/ops/run-b2-snapshot-maintenance-with-preservation.mjs"');
    expect(governedWorkflow).toContain('"scripts/ops/run-b2-snapshot-maintenance-with-preservation.mjs"');
  });
});
