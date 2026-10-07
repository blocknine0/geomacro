import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const publisher = read("scripts/ops/publish-b2-agent-governed-modules.ts");
const reader = read("src/lib/b2-agent-governed-modules.server.ts");
const wgi = read("src/lib/agent-query-political-governance.server.ts");
const wdi = read("src/lib/agent-query-world-bank-modules.server.ts");
const usgs = read("src/lib/agent-query-critical-minerals.server.ts");
const rights = read("src/lib/commercial-source-eligibility.server.ts");
const workflow = read(".github/workflows/b2-agent-governed-modules-snapshot.yml");

describe("verified B2 governed agent module continuity", () => {
  it("publishes certified WDI and USGS derived state and keeps WGI outside while uncertified", () => {
    for (const token of [
      "world_bank_indicators",
      "usgs_mcs",
      "world_bank_wgi_political_stability",
      "commercialSourceEligibilityFromRow",
      'delivery_boundary: "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL"',
      "REQUIRED_SOURCES = [WDI_SOURCE, USGS_SOURCE]",
      "live_source_certification_records",
      "buildUsgsEntries",
      'eq("category", "CRITICAL_MINERALS")',
      'schema: "geomacro.agent-governed-modules-live.v2"',
    ]) expect(publisher).toContain(token);
    expect(publisher).toContain('.from("live_world_bank_indicator_latest")');
    expect(publisher).toContain('.from("live_external_observations")');
    expect(publisher).toContain("B2_AGENT_MODULE_USGS_ENTRIES_MISSING");
    expect(publisher).not.toContain("raw_payload");
    expect(publisher).not.toContain("raw_hash");
    expect(publisher).not.toContain("source_url");
  });

  it("requires full B2 readback, compressed hash equality and exact gzip restore before proof", () => {
    const put = publisher.indexOf("await b2.put(stagingKey, packed)");
    const readback = publisher.indexOf("const stagingReadback = await b2.get(stagingKey)");
    const restore = publisher.indexOf("const restoredStagingRaw = gunzipSync(stagingReadback)");
    const proof = publisher.indexOf("await b2.put(PROOF_KEY, proof)");
    expect(put).toBeGreaterThanOrEqual(0);
    expect(readback).toBeGreaterThan(put);
    expect(restore).toBeGreaterThan(readback);
    expect(proof).toBeGreaterThan(restore);
    expect(publisher).toContain("B2_AGENT_MODULE_STAGING_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_AGENT_MODULE_STAGING_RESTORE_BYTES_INVALID");
    expect(publisher).toContain("B2_AGENT_MODULE_LIVE_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_AGENT_MODULE_LIVE_RESTORE_BYTES_INVALID");
    expect(publisher).toContain("B2_AGENT_MODULE_PROOF_READBACK_INVALID");
    expect(publisher).not.toContain(".delete(");
  });

  it("keeps the runtime archive private, bounded, recent, v2 and server-only", () => {
    expect(reader).toContain('const SERVING_PREFIX = "geomacro-evidence/v1/structural/serving/agent-governed-modules"');
    expect(reader).toContain('const B2_KEY = `${SERVING_PREFIX}/latest.json.gz`');
    expect(reader).toContain('const B2_PROOF_KEY = `${SERVING_PREFIX}/latest-proof.json`');
    expect(reader).toContain("AGENT_GOVERNED_MODULES_B2_MAX_AGE_MS = 24 * 60 * 60 * 1000");
    expect(reader).toContain("readPrivateB2Object");
    expect(reader).toContain("b2PrivateArchiveReadConfigured");
    expect(reader).toContain("signedGet(B2_PROOF_KEY)");
    expect(reader).toContain('proof.schema !== "geomacro.agent-governed-modules-proof.v2"');
    expect(reader).toContain("(await sha256(compressed)) !== String(proof.compressed_sha256)");
    expect(reader).toContain('payload.schema !== "geomacro.agent-governed-modules-live.v2"');
    expect(reader).toContain('payload.source_project !== SOURCE_PROJECT');
    expect(reader).toContain('payload.delivery_boundary !== "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL"');
    expect(reader).toContain('critical_minerals: "usgs_mcs"');
    expect(reader).not.toContain("VITE_B2");
  });

  it("authorizes the source first, then prefers verified B2 derived state before Supabase standby", () => {
    expect(wgi).toContain("checkCommercialSourceEligibility");
    expect(wgi).toContain("readB2AgentGovernedModule");

    for (const source of [wdi, usgs]) {
      const authorization = source.indexOf("checkCommercialSourceEligibility");
      const b2Read = source.indexOf("const primary = await b2Fallback");
      const standby = source.indexOf("const db = requireRiskSupabase()");
      expect(authorization).toBeGreaterThanOrEqual(0);
      expect(b2Read).toBeGreaterThan(authorization);
      expect(standby).toBeGreaterThan(b2Read);
    }
    expect(wdi).toContain("Production serving is B2-primary");
    expect(usgs).toContain("B2 is the production serving authority");
    expect(wdi).toContain("using fresh verified B2 governed derived state");
    expect(usgs).toContain("using fresh verified B2 governed derived state");
    expect(rights).toContain("export async function readCommercialSourceRightsRow");
    expect(rights).toContain('certificationState === "CERTIFIED"');
  });

  it("supports USGS critical-minerals continuity only after the same paid-source gate", () => {
    expect(usgs).toContain("readB2AgentGovernedModule");
    expect(usgs).toContain('return unavailable(input.subject, "SOURCE_NOT_ELIGIBLE", sourceContract)');
    expect(publisher).toContain("USGS_SOURCE = \"usgs_mcs\"");
    expect(publisher).toContain("buildUsgsEntries");
    expect(publisher).toContain("CRITICAL_MINERALS_METHOD_VERSION");
  });

  it("never uses a current snapshot to answer a historical request before the source observation", () => {
    for (const source of [wgi, wdi, usgs]) {
      expect(source).toContain("observedMs > asOfMs");
      expect(source).toContain("asOfMs - observedMs > input.max_age_seconds * 1_000");
    }
  });

  it("runs quota-independent permanent production maintenance without exposing B2 credentials", () => {
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('cron: "37 4,16 * * *"');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("secrets.SUPABASE_DB_URL");
    expect(workflow).not.toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("secrets.B2_KEY_ID");
    expect(workflow).toContain("secrets.B2_APPLICATION_KEY");
    expect(workflow).toContain("secrets.B2_ARCHIVE_READ_KEY_ID");
    expect(workflow).toContain("secrets.B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(workflow).toContain("run-b2-governed-direct-postgres.mjs");
    expect(workflow).toContain("scripts/ops/b2-s3-client.mjs");
    expect(workflow).toContain("src/lib/b2-private-archive-read.server.ts");
    expect(workflow).toContain("verify-b2-agent-governed-runtime.ts");
    expect(workflow).not.toContain("run-b2-snapshot-maintenance-with-preservation.mjs governed-modules");
    expect(workflow).not.toContain("VITE_B2");
  });
});
