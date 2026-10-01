import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-archive-structured-evidence-bundle.mjs", "utf8");
const workflow = readFileSync(".github/workflows/structured-evidence-b2-bundle-archive.yml", "utf8");
const migration = readFileSync("supabase/migrations/20261001043000_structured_evidence_bundle_cleanup.sql", "utf8");

describe("structured evidence B2 bundle archive", () => {
  it("is manual-only, production-scoped and request-budgeted", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "8"');
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain('default: "100"');
  });

  it("preflights B2 read capability before writing a bundle", () => {
    const preflight = script.indexOf("const preflight = await b2.getOptional(preflightKey)");
    const put = script.indexOf("await b2.put(bundleKey, compressed)");
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(put).toBeGreaterThan(preflight);
    expect(script).toContain("STRUCTURED_EVIDENCE_ARCHIVE_READ_PREFLIGHT_COLLISION");
  });

  it("verifies the full bundle before and after indexing", () => {
    const put = script.indexOf("await b2.put(bundleKey, compressed)");
    const firstGet = script.indexOf("const firstReadback = await b2.get(bundleKey)");
    const upsert = script.indexOf('.from("live_structured_event_evidence_archive_index").upsert');
    const secondGet = script.indexOf("const secondReadback = await b2.get(bundleKey)");
    expect(firstGet).toBeGreaterThan(put);
    expect(upsert).toBeGreaterThan(firstGet);
    expect(secondGet).toBeGreaterThan(upsert);
    expect(script).toContain("STRUCTURED_EVIDENCE_ARCHIVE_MEMBER_HASH_INVALID");
    expect(script).toContain("json_restore_verified: true");
  });

  it("retains source rows and contains no destructive evidence cleanup", () => {
    expect(script).not.toContain('.from("live_structured_event_evidence").delete');
    expect(script).not.toContain("storage.objects");
    expect(script).not.toContain("storage.remove");
    expect(script).toContain("source_rows_retained: true");
    expect(migration).not.toMatch(/delete\s+from\s+public\.live_structured_event_evidence/i);
  });

  it("indexes exact archived row JSON and hashes", () => {
    expect(migration).toContain("live_structured_event_evidence_archive_index");
    expect(migration).toContain("row_json jsonb not null");
    expect(migration).toContain("row_sha256 text not null");
    expect(migration).toContain("bundle_sha256 text not null");
    expect(migration).toContain("primary key (event_id, fingerprint)");
  });

  it("requires cold archived parents and caps candidate bundles at 1000", () => {
    expect(migration).toContain("p_limit > 1000");
    expect(migration).toContain("p_older_days < 7");
    expect(migration).toContain("ev.structured_payload->'_archive'->>'v' = '2'");
    expect(script).toContain("limit > 1000");
    expect(script).toContain("olderDays < 7");
  });

  it("keeps archive index and candidate RPC service-role only", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.live_structured_event_evidence_archive_index from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.live_structured_event_evidence_archive_index to service_role");
    expect(migration).toContain("revoke all on function public.geomacro_structured_evidence_archive_candidates(integer, integer) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.geomacro_structured_evidence_archive_candidates(integer, integer) to service_role");
  });
});
