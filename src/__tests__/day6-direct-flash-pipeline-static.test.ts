import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Day 6 direct flash pipeline", () => {
  it("keeps the ingest bridge loopback-only, authenticated and payload-minimal", () => {
    const server = read("scripts/ops/local-flash-ingest-server.mjs");
    expect(server).toContain('const HOST = "127.0.0.1"');
    expect(server).toContain("timingSafeEqual");
    expect(server).toContain('raw_payload: null');
    expect(server).toContain('body: null');
    expect(server).toContain('transport: "direct_postgres"');
    expect(server).toContain('enabled_for_ingestion');
    expect(server).toContain('verification_status: "UNCHANGED"');
    expect(server).not.toContain("SUPABASE_URL");
    expect(server).not.toContain("supabase.co/functions");
  });

  it("keeps local corroboration at or stricter than Federico thresholds", () => {
    const corroborator = read("scripts/ops/local-flash-corroborate.mjs");
    expect(corroborator).toContain("MAX_EVIDENCE_AGE_HOURS = 6");
    expect(corroborator).toContain("MIN_INDEPENDENT_SOURCE_FAMILIES = 2");
    expect(corroborator).toContain("MIN_SIMILARITY = 0.45");
    expect(corroborator).toContain("VERIFICATION_SCORE_THRESHOLD = 65");
    expect(corroborator).toContain("PEER_MAX_DELTA_SECONDS = 3600");
    expect(corroborator).toContain("threshold_weakening: false");
    expect(corroborator).toContain("structured_event_shortcut_used: false");
  });

  it("requires filtered deletes in the direct Postgres shim", () => {
    const client = read("scripts/lib/gri-db-client.mjs");
    expect(client).toContain("delete() {");
    expect(client).toContain("DIRECT_POSTGRES_DELETE_REQUIRES_FILTER");
    expect(client).toContain('this.operation === "delete"');
  });

  it("removes Supabase Edge/Data API from both Day 6 refresh paths", () => {
    for (const path of [
      ".github/workflows/federico-seven-day-risk-refresh.yml",
      ".github/workflows/day6-authorized-federico-pilot-once.yml",
    ]) {
      const workflow = read(path);
      expect(workflow).toContain("local-flash-ingest-server.mjs");
      expect(workflow).toContain("local-flash-corroborate.mjs");
      expect(workflow).toContain("SUPABASE_DB_URL");
      expect(workflow).not.toContain("/functions/v1/live-flash-ingest");
      expect(workflow).not.toContain("/functions/v1/live-flash-corroborate");
    }
  });
});
