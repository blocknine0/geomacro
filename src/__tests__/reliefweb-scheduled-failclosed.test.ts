import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { observeApprovedReliefWeb } from "../../scripts/ops/observe-approved-reliefweb-live.mjs";

const now = new Date("2026-10-12T12:00:00.000Z");
const appname = "geomacro-approved-observer-test";

describe("ReliefWeb scheduled acceptance semantics", () => {
  it("reports one attempted network call and never retries transport failures", async () => {
    const fetchImpl = vi.fn(async () => { throw Error("transport unavailable"); });
    const proof = await observeApprovedReliefWeb({ now, appname, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(proof).toMatchObject({
      status: "TRANSPORT_DEGRADED", api_requests: 1, b2_requests: 0,
      supabase_requests: 0, commercial_eligible: false,
    });
  });

  it("does not retry provider server errors in the same scheduled cycle", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));
    const proof = await observeApprovedReliefWeb({ now, appname, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(proof).toMatchObject({
      status: "UPSTREAM_HTTP_DEGRADED", api_requests: 1,
      raw_report_bodies_stored: false, commercial_eligible: false,
    });
  });

  it("requires a real provider 2xx result before the scheduled job can pass", () => {
    const reader = readFileSync("scripts/ops/observe-approved-reliefweb-live.mjs", "utf8");
    expect(reader).toContain('if (proof.status !== "LIVE_METADATA_TRANSPORT")');
    expect(reader).toContain("process.exitCode=3");
    expect(reader).toContain('empty("INVALID_PROVIDER_RESPONSE"');
  });
});
