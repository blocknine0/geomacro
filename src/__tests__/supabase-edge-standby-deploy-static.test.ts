import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/deploy-country-flash-supabase.yml", "utf8");

describe("Supabase Edge standby deployment contract", () => {
  it("classifies external egress restriction without claiming Edge health", () => {
    expect(workflow).toContain("exceed_egress_quota");
    expect(workflow).toContain("FLASH_EDGE_RUNTIME_AVAILABLE=false");
    expect(workflow).toContain("FLASH_EDGE_RUNTIME_DEFERRED_REASON=supabase_egress_quota");
    expect(workflow).toContain("Supabase Edge standby");
  });

  it("requires a read-only authoritative direct-Postgres health proof when Edge is unavailable", () => {
    expect(workflow).toContain("Verify read-only direct-Postgres flash path while Supabase Edge is standby");
    expect(workflow).toContain("begin read only;");
    expect(workflow).toContain("rollback;");
    expect(workflow).toContain("public.live_flash_events");
    expect(workflow).toContain("public.live_flash_event_countries");
    expect(workflow).toContain('execution_mode == "direct_postgres_read_only_health"');
    expect(workflow).toContain('.candidate_query == "PASS"');
    expect(workflow).toContain(".writes_performed == false");
    const start = workflow.indexOf("Verify read-only direct-Postgres flash path while Supabase Edge is standby");
    const end = workflow.indexOf("Verify authoritative country registry", start);
    const proof = workflow.slice(start, end);
    expect(proof).not.toMatch(/\b(insert|update|delete|upsert)\b/i);
  });

  it("still fails unexpected Edge responses closed", () => {
    expect(workflow).toContain("Expected authenticated validation response from live-flash-ingest.");
    expect(workflow).toContain("live-flash-corroborate did not return a successful response.");
    expect(workflow).not.toContain("payment_performed=true");
  });
});
