import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/ops/b2-compact-structured-event-bundle.mjs", "utf8");
const workflow = readFileSync(".github/workflows/structured-event-b2-bundle-compaction.yml", "utf8");
const migration = readFileSync("supabase/migrations/20260930183000_structured_event_bundle_compaction.sql", "utf8");

describe("structured event B2 bundle compaction", () => {
  it("stays manual-only, production-scoped and request-budgeted", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain('B2_REQUEST_BUDGET: "8"');
    expect(workflow).toContain('default: "25"');
    expect(workflow).toContain("persist-credentials: false");
  });

  it("probes B2 read capability before any new bundle write", () => {
    const preflight = script.indexOf("const preflightReadback = await b2.getOptional(preflightKey)");
    const put = script.indexOf("await b2.put(bundleKey, compressed)");
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(put).toBeGreaterThan(preflight);
    expect(script).toContain("STRUCTURED_EVENT_BUNDLE_READ_PREFLIGHT_COLLISION");
    expect(script).toContain("pre_write_b2_read_preflight_verified: true");
    expect(script).toContain("b2_read_preflight_verified_before_write: true");
  });

  it("archives one multi-record bundle and verifies full B2 readback before hot-row compaction", () => {
    const put = script.indexOf("await b2.put(bundleKey, compressed)");
    const firstGet = script.indexOf("const firstReadback = await b2.get(bundleKey)");
    const verify = script.indexOf("verifyBundle(firstReadback, bundleSha, members)");
    const rpc = script.indexOf('db.rpc("geomacro_compact_structured_event_payload_bundle"');
    expect(put).toBeGreaterThanOrEqual(0);
    expect(firstGet).toBeGreaterThan(put);
    expect(verify).toBeGreaterThan(firstGet);
    expect(rpc).toBeGreaterThan(verify);
    expect(script).toContain("STRUCTURED_EVENT_BUNDLE_MEMBER_HASH_INVALID");
    expect(script).toContain("geomacro.structured-event-payload-bundle.v1");
  });

  it("keeps the established v2 cold-parent marker while identifying bundle members explicitly", () => {
    expect(script).toContain("v: 2");
    expect(script).toContain('t: "bundle-v1"');
    expect(script).toContain("m: eventId");
    expect(script).toContain("p: payloadSha256");
    expect(migration).toContain("v_archive->>'v' <> '2'");
    expect(migration).toContain("v_archive->>'t' <> 'bundle-v1'");
    expect(migration).toContain("v_archive->>'m' <> v_id::text");
  });

  it("verifies B2 a second time after database compaction and rolls back transactionally on failure", () => {
    const rpc = script.indexOf('db.rpc("geomacro_compact_structured_event_payload_bundle"');
    const secondGet = script.indexOf("const secondReadback = await b2.get(bundleKey)");
    const rollback = script.indexOf("await rollback(updates)", secondGet);
    expect(secondGet).toBeGreaterThan(rpc);
    expect(rollback).toBeGreaterThan(secondGet);
    expect(script).toContain('db.rpc("geomacro_restore_structured_event_payload_bundle"');
    expect(script).toContain("STRUCTURED_EVENT_BUNDLE_POST_UPDATE_RESTORE_FAILED");
  });

  it("chunks database verification reads for the 1000-row upper bound", () => {
    expect(script).toContain("const VERIFY_READ_CHUNK_SIZE = 100");
    expect(script).toContain("async function readEventRowsByIds(ids, failureCode)");
    expect(script).toContain("offset += VERIFY_READ_CHUNK_SIZE");
    expect(script).toContain("ids.slice(offset, offset + VERIFY_READ_CHUNK_SIZE)");
    expect(script).not.toContain('.in("id", ids)');
    expect(script).toContain("restoreUpdates.map((item) => item.id)");
    expect(script).toContain("updates.map((item) => item.id)");
  });

  it("never deletes structured-event rows or Supabase Storage objects", () => {
    expect(script).not.toContain('.from("live_structured_events").delete(');
    expect(script).not.toContain("storage.objects");
    expect(script).not.toContain("storage.remove");
    expect(script).not.toContain(".storage.from");
    expect(migration).not.toMatch(/delete\s+from\s+public\.live_structured_events/i);
    expect(migration).not.toContain("storage.objects");
  });

  it("uses exact source matching, row locks and an all-or-nothing batch capped at 1000", () => {
    expect(migration).toContain("jsonb_array_length(p_updates) > 1000");
    expect(migration).toContain("for update;");
    expect(migration).toContain("v_current_last_seen_at is distinct from v_last_seen_at");
    expect(migration).toContain("v_current_payload is distinct from v_expected_payload");
    expect(migration).toContain("v_current_payload is distinct from v_expected_pointer");
    expect(script).toContain("limit > 1000");
    expect(script).toContain("olderDays < 7");
  });

  it("keeps compaction RPCs service-role only", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("revoke all on function public.geomacro_compact_structured_event_payload_bundle(jsonb) from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.geomacro_restore_structured_event_payload_bundle(jsonb) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.geomacro_compact_structured_event_payload_bundle(jsonb) to service_role");
    expect(migration).toContain("grant execute on function public.geomacro_restore_structured_event_payload_bundle(jsonb) to service_role");
  });
});
