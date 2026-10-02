import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/auto-ingest-news.yml";
const helperPath = "scripts/invoke-live-structure-with-retry.mjs";
const freshnessProbePath = "scripts/ops/probe-public-intelligence-live-fallback.ts";
const productionReaderPath = "src/lib/public-intelligence-production.server.ts";
const runtimePath = "supabase/functions/live-structure-intelligence/index.ts";

const workflow = fs.readFileSync(workflowPath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const freshnessProbe = fs.readFileSync(freshnessProbePath, "utf8");
const productionReader = fs.readFileSync(productionReaderPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

describe("Auto Ingest News reliability contract", () => {
  it("keeps ingestion fail-closed while using a bounded structured-intelligence handoff", () => {
    expect(workflow).toContain('timeout-minutes: 45');
    expect(workflow).toContain("id: structure");
    expect(workflow).toContain("node scripts/invoke-live-structure-with-retry.mjs");
    expect(workflow).toContain('LIVE_STRUCTURE_MAX_ATTEMPTS: "4"');
    expect(workflow).toContain('LIVE_STRUCTURE_ATTEMPT_TIMEOUT_MS: "90000"');
    expect(workflow).not.toContain("--retry-all-errors");
  });

  it("routes only the explicit Supabase egress restriction to the read-only public freshness fallback", () => {
    expect(workflow).toContain("supabase-preflight:");
    expect(workflow).toContain("available: ${{ steps.classify.outputs.available }}");
    expect(workflow).toContain("exceed_egress_quota");
    expect(workflow).toContain("mode=egress_restricted");
    expect(workflow).toContain("needs: supabase-preflight");
    expect(workflow).toContain("needs.supabase-preflight.outputs.available == 'true'");
    expect(workflow).toContain("public-live-freshness-fallback:");
    expect(workflow).toContain("needs.supabase-preflight.outputs.available == 'false'");
    expect(workflow).toContain("bun scripts/ops/probe-public-intelligence-live-fallback.ts");
  });

  it("proves public freshness without bypassing verified scoring or introducing a Supabase serving dependency", () => {
    expect(freshnessProbe).toContain("readProductionPublicIntelligence");
    expect(freshnessProbe).toContain("payload.current_within_24h === true");
    expect(freshnessProbe).toContain('row.public_status === "live_observed"');
    expect(freshnessProbe).toContain("row.severity === null && row.delta === null");
    expect(freshnessProbe).toContain('payload.mode === "live_observed_only"');
    expect(freshnessProbe).toContain("delete process.env.B2_KEY_ID");
    expect(freshnessProbe).toContain("artifacts/public-intelligence-live-fallback.json");
    expect(freshnessProbe).not.toContain("getAppSupabase");
    expect(freshnessProbe).not.toContain("createClient(");
  });

  it("uses multiple independent open sources for the live-observed continuity overlay", () => {
    expect(productionReader).toContain("api.gdeltproject.org");
    expect(productionReader).toContain("earthquake.usgs.gov");
    expect(productionReader).toContain("api.reliefweb.int");
    expect(productionReader).toContain("Promise.allSettled");
    expect(productionReader).toContain('public_status: "live_observed"');
    expect(productionReader).toContain("severity: null");
    expect(productionReader).toContain("delta: null");
    expect(productionReader).not.toContain("getAppSupabase");
  });

  it("targets the exact freshly exported manifest after verified B2 offload", () => {
    expect(workflow).toContain("B2_FRAGMENT_TARGET_ID: ${{ steps.export_fragment.outputs.manifest_id }}");
    expect(workflow).toContain("LIVE_STRUCTURE_FRAGMENT_ID: ${{ steps.export_fragment.outputs.manifest_id }}");
    expect(helper).toContain("LIVE_STRUCTURE_FRAGMENT_ID");
    expect(helper).toContain("JSON.stringify({ fragment_id: requestedFragmentId })");
    expect(helper).toContain("Structured-intelligence target mismatch");
    expect(helper).toContain("payload.has_more === true");
    expect(runtime).toContain("parsed.fragment_id");
    expect(runtime).toContain('"resolved_live_fragment_locations"');
    expect(runtime).toContain("requestedFragmentId");
    expect(runtime).toContain("downloadVerifiedB2Fragment(manifest.object_path, manifest.compressed_sha256)");
  });

  it("runs safe private diagnostics only when the structure handoff fails", () => {
    expect(workflow).toContain("always() && steps.structure.outcome == 'failure'");
    expect(workflow).toContain("node scripts/diagnose-live-structure-runtime.mjs");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("retries only bounded transient HTTP/network failures and validates ok=true", () => {
    expect(helper).toContain("new Set([408, 425, 429, 500, 502, 503, 504])");
    expect(helper).toContain("maxAttempts > 6");
    expect(helper).toContain("payload?.ok === true");
    expect(helper).toContain("Failure is non-transient; refusing to retry.");
    expect(helper).toContain("AbortController");
    expect(helper).not.toContain("LIVE_STRUCTURE_TOKEN}`");

    const result = spawnSync(process.execPath, ["--check", helperPath], {
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
