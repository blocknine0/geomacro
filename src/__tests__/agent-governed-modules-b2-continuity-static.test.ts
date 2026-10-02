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
    const put = publisher.indexOf("await b2.put(SNAPSHOT_KEY, packed)");
    const readback = publisher.indexOf("const readback = await b2.get(SNAPSHOT_KEY)");
    const restore = publisher.indexOf("const restoredRaw = gunzipSync(readback)");
    const proof = publisher.indexOf("await b2.put(PROOF_KEY, proof)");
    expect(put).toBeGreaterThanOrEqual(0);
    expect(readback).toBeGreaterThan(put);
    expect(restore).toBeGreaterThan(readback);
    expect(proof).toBeGreaterThan(restore);
    expect(publisher).toContain("B2_AGENT_MODULE_READBACK_HASH_INVALID");
    expect(publisher).toContain("B2_AGENT_MODULE_RESTORE_BYTES_INVALID");
    expect(publisher).toContain("B2_AGENT_MODULE_PROOF_READBACK_INVALID");
    expect(publisher).not.toContain(".delete(");
  });

  it("keeps the runtime archive private, bounded, recent, v2 and server-only", () => {
    expect(reader).toContain('const B2_KEY = "geomacro-evidence/v1/live/agent-governed-modules/latest.json.gz"');
    expect(reader).toContain("AGENT_GOVERNED_MODULES_B2_MAX_AGE_MS = 24 * 60 * 60 * 1000");
    expect(reader).toContain("process.env.B2_KEY_ID");
    expect(reader).toContain("process.env.B2_APPLICATION_KEY");
    expect(reader).toContain('payload.schema !== "geomacro.agent-governed-modules-live.v2"');
    expect(reader).toContain('payload.source_project !== SOURCE_PROJECT');
    expect(reader).toContain('payload.delivery_boundary !== "DERIVED_STATE_ONLY_NO_RAW_SOURCE_MATERIAL"');
    expect(reader).toContain('critical_minerals: "usgs_mcs"');
    expect(reader).not.toContain("VITE_B2");
  });

  it("uses B2 only after source authorization and only when the primary governed store throws", () => {
    expect(wgi).toContain("checkCommercialSourceEligibility");
    expect(wgi).toContain("catch (primaryError)");
    expect(wgi).toContain("readB2AgentGovernedModule");
    expect(wgi).toContain("primary governed store unavailable; using fresh verified B2 derived state");

    expect(wdi).toContain("checkCommercialSourceEligibility");
    expect(wdi).toContain("catch (primaryError)");
    expect(wdi).toContain("readB2AgentGovernedModule");
    expect(wdi).toContain("primary governed store unavailable; using fresh verified B2 derived state");
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

  it("runs as permanent production maintenance without exposing B2 credentials", () => {
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('cron: "37 4 * * *"');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain("secrets.B2_KEY_ID");
    expect(workflow).toContain("secrets.B2_APPLICATION_KEY");
    expect(workflow).toContain("publish-b2-agent-governed-modules.ts");
    expect(workflow).not.toContain("VITE_B2");
  });
});
