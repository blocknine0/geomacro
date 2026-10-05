import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const workflowPath = ".github/workflows/auto-ingest-news.yml";
const orchestratorWorkflowPath = ".github/workflows/intelligence-orchestrator.yml";
const orchestratorPath = "scripts/intelligence-orchestrator.mjs";
const loaderPath = "scripts/lib/direct-postgres-supabase-loader.mjs";
const d1StatePath = "scripts/lib/d1-control-plane-state.mjs";
const d1ShimPath = "scripts/lib/d1-orchestrator-supabase-shim.mjs";
const helperPath = "scripts/invoke-live-structure-with-retry.mjs";
const freshnessProbePath = "scripts/ops/probe-public-intelligence-live-fallback.ts";
const productionReaderPath = "src/lib/public-intelligence-production.server.ts";
const runtimePath = "supabase/functions/live-structure-intelligence/index.ts";
const workflow = fs.readFileSync(workflowPath, "utf8");
const orchestratorWorkflow = fs.readFileSync(orchestratorWorkflowPath, "utf8");
const orchestrator = fs.readFileSync(orchestratorPath, "utf8");
const loader = fs.readFileSync(loaderPath, "utf8");
const d1State = fs.readFileSync(d1StatePath, "utf8");
const d1Shim = fs.readFileSync(d1ShimPath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const freshnessProbe = fs.readFileSync(freshnessProbePath, "utf8");
const productionReader = fs.readFileSync(productionReaderPath, "utf8");
const runtime = fs.readFileSync(runtimePath, "utf8");

describe("Auto Ingest News reliability contract", () => {
  it("keeps the manual wrapper recovery-only and delegates to the canonical single owner", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("group: geomacro-intelligence-orchestrator");
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST: news_ingest');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_FORCE_TASKS: news_ingest');
    expect(workflow).toContain("supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(workflow).toContain("node scripts/intelligence-orchestrator.mjs");
    expect(workflow).not.toContain("run: node scripts/ingest-news.js");
  });

  it("keeps scheduler/control state D1-authoritative instead of requiring Supabase availability", () => {
    expect(orchestratorWorkflow).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(orchestratorWorkflow).toContain("D1_DATABASE_ID=$DB_ID");
    expect(orchestratorWorkflow).toContain("D1/B2 scheduler runtime validated without requiring Supabase availability");
    expect(orchestratorWorkflow).toContain("Supabase unavailable: D1/B2 heartbeat remains live");
    expect(loader).toContain('ORCHESTRATOR_SHIM_URL = "geomacro:d1-orchestrator-supabase"');
    expect(loader).toContain("d1-orchestrator-supabase-shim.mjs");
    expect(d1State).toContain("pipeline_checkpoint");
    expect(d1State).toContain("CLOUDFLARE_API_TOKEN");
    expect(d1State).toContain("D1_DATABASE_ID");
    expect(d1Shim).toContain('const TABLE = "live_intelligence_scheduler_state"');
    expect(d1Shim).toContain("d1-control-state-no-supabase");
  });

  it("preserves the canonical news ingestion and bounded structure handoff inside the single owner", () => {
    expect(orchestrator).toContain('key: "news_ingest"');
    expect(orchestrator).toContain('["node", ["scripts/ingest-news.js"], "."]');
    expect(orchestrator).toContain('["node", ["scripts/export-admitted-events-for-structure.mjs"], "."]');
    expect(orchestrator).toContain('["node", ["scripts/invoke-live-structure-with-retry.mjs"], "."]');
    expect(orchestratorWorkflow).toContain('LIVE_STRUCTURE_MAX_ATTEMPTS: "4"');
    expect(orchestratorWorkflow).toContain('LIVE_STRUCTURE_ATTEMPT_TIMEOUT_MS: "90000"');
    expect(helper).not.toContain("--retry-all-errors");
  });

  it("proves scored B2 continuity while allowing only explicitly unscored current observations", () => {
    expect(freshnessProbe).toContain("https://geomacro.live/api/public/intelligence");
    expect(freshnessProbe).toContain('mode === "verified_b2"');
    expect(freshnessProbe).toContain('mode === "verified_b2_plus_live_observed"');
    expect(freshnessProbe).toContain('status === "live_observed"');
    expect(freshnessProbe).toContain('title.startsWith("Geomacro finds ")');
    expect(freshnessProbe).toContain('title.startsWith("Geomacro observes ")');
    expect(freshnessProbe).toContain("row?.severity !== null");
    expect(freshnessProbe).toContain("row?.delta !== null");
    expect(freshnessProbe).toContain("synthetic_freshness: false");
    expect(freshnessProbe).toContain("raw_source_score_inference: false");
    expect(productionReader).not.toContain("earthquake.usgs.gov");
    expect(productionReader).toContain('public_status: "verified_b2" | "live_observed"');
  });

  it("keeps targeted fragment verification in the canonical structurer contract", () => {
    expect(helper).toContain("LIVE_STRUCTURE_FRAGMENT_ID");
    expect(helper).toContain("JSON.stringify({ fragment_id: requestedFragmentId })");
    expect(helper).toContain("Structured-intelligence target mismatch");
    expect(helper).toContain("payload.has_more === true");
    expect(runtime).toContain("parsed.fragment_id");
    expect(runtime).toContain('"resolved_live_fragment_locations"');
    expect(runtime).toContain("requestedFragmentId");
    expect(runtime).toContain("downloadVerifiedB2Fragment(manifest.object_path, manifest.compressed_sha256)");
  });

  it("retries only bounded transient HTTP/network failures and validates ok=true", () => {
    expect(helper).toContain("new Set([408, 425, 429, 500, 502, 503, 504])");
    expect(helper).toContain("maxAttempts > 6");
    expect(helper).toContain("payload?.ok === true");
    expect(helper).toContain("Failure is non-transient; refusing to retry.");
    expect(helper).toContain("AbortController");
    const result = spawnSync(process.execPath, ["--check", helperPath], { encoding: "utf8" });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
