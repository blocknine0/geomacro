import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("final non-mainnet launch acceptance contract", () => {
  it("keeps every acceptance drill nonproduction and evidence-producing", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    const backup = read("scripts/db/disposable-backup-restore-drill.sh");
    const live = read("scripts/ops/live-launch-surface-smoke.mjs");
    const security = read("scripts/ops/external-surface-security-smoke.mjs");
    const rollback = read("scripts/ops/nonproduction-rollback-incident-drill.mjs");
    const stagingProvision = read("scripts/ops/provision-ephemeral-risk-gate-staging.ts");

    expect(workflow).toContain("Final Non-Mainnet Launch Acceptance");
    expect(workflow).toContain("Replay migrations and perform disposable backup/restore drill");
    expect(workflow).toContain("Run live public surface smoke");
    expect(workflow).toContain("Run outside-in non-destructive security smoke");
    expect(workflow).toContain("Run bounded staging Risk Gate load");
    expect(workflow).toContain("Build rollback target");
    expect(workflow).toContain("Run nonproduction rollback and incident drill");

    expect(backup).toContain("DISPOSABLE_LOCAL_ONLY");
    expect(backup).toContain("refusing backup/restore drill against non-local database URL");
    expect(backup).toContain("production_database_touched: false");

    expect(live).toContain("payment_performed: false");
    expect(live).toContain("production_activation_performed: false");
    expect(live).toContain('commerce?.service?.status === "prelaunch"');
    expect(live).toContain('commerce?.commercial_contract?.production_funds_authorized === false');
    expect(live).toContain('discovery?.status === "prelaunch"');
    expect(live).toContain('discovery?.productionFundsAuthorized === false');
    expect(live).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA");
    expect(live).toContain("/.well-known/geomacro-build.json");
    expect(live).toContain('optionalCompatibilityAliases = ["/.well-known/x402"]');
    expect(live).toContain('"/.well-known/x402.json"');
    expect(live).toContain('evidence.result = "FAIL"');
    expect(live).toContain("persistEvidence();");
    expect(live).toContain("resolvePublicHost");
    expect(live).toContain("curl-pinned-public-dns");
    expect(live).toContain("public_dns");

    expect(security).toContain("destructive_testing: false");
    expect(security).toContain("payment_performed: false");
    expect(security).toContain("BOUNDARY: this is not a third-party penetration test or certification");

    expect(rollback).toContain("NONPRODUCTION_ONLY");
    expect(rollback).toContain('manifest.production_funds_authorized === false');
    expect(rollback).toContain("production_activation_performed: false");

    expect(stagingProvision).toContain("production_data_used: false");
    expect(stagingProvision).toContain("production_funds_used: false");
    expect(stagingProvision).toContain("permanent_credential_used: false");
    expect(stagingProvision).toContain('process.env.NODE_ENV === "production"');
    expect(stagingProvision).toContain('"127.0.0.1", "localhost", "::1"');
  });

  it("uses a self-contained disposable Risk Gate staging stack", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    const riskSupabase = read("src/lib/risk-supabase.server.ts");

    expect(workflow).toContain("Start disposable local Supabase and replay migrations");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase status -o env");
    expect(workflow).toContain("GEOMACRO_SUPABASE_RUNTIME_MODE=primary");
    expect(workflow).toContain("scripts/ops/provision-ephemeral-risk-gate-staging.ts");
    expect(workflow).toContain("bun run dev -- --host 127.0.0.1 --port 3000");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_ACK: STAGING_ONLY");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_REQUESTS: ${{ github.event_name == 'workflow_dispatch' && inputs.staging_requests || '24' }}");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_CONCURRENCY: ${{ github.event_name == 'workflow_dispatch' && inputs.staging_concurrency || '4' }}");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_MODE: ${{ github.event_name == 'workflow_dispatch' && inputs.staging_mode || 'mixed' }}");
    expect(workflow).not.toContain("RISK_GATE_STAGING_BASE_URL: ${{ vars.RISK_GATE_STAGING_BASE_URL }}");
    expect(workflow).not.toContain("RISK_GATE_STAGING_API_KEY: ${{ secrets.RISK_GATE_STAGING_API_KEY }}");
    expect(workflow).not.toContain("environment: staging");
    expect(workflow).toContain("artifacts/ephemeral-risk-gate-staging-provision.json");
    expect(workflow).toContain("supabase stop --no-backup");

    expect(riskSupabase).toContain('env.NODE_ENV === "production"');
    expect(riskSupabase).toContain('parsed.hostname === "127.0.0.1"');
    expect(riskSupabase).toContain('parsed.hostname === "localhost"');
    expect(riskSupabase).toContain("AUTHORITATIVE_RISK_PROJECT_REF");
  });

  it("treats Early Warning distribution as a launch-critical prelaunch surface", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    const distribution = JSON.parse(read("config/auto-distribution.json"));

    for (const requiredPath of [
      "config/auto-distribution.json",
      "scripts/marketing/auto-distribute-alert.mjs",
      "scripts/marketing/distribution-receipt-ledger.mjs",
      "scripts/marketing/poll-public-early-warning.mjs",
      "src/routes/api.early-warning.ts",
      "supabase/migrations/937_early_warning_alert_ledger.sql",
      "supabase/migrations/94*_early_warning_distribution*.sql",
    ]) {
      expect(workflow).toContain(requiredPath);
    }

    expect(workflow).toContain("Verify receipt-wired Early Warning distribution remains shadow-only");
    expect(workflow).toContain("node scripts/marketing/test-public-feed-adapter.mjs");
    expect(workflow).toContain("node scripts/marketing/test-distribution-receipt-ledger.mjs");
    expect(workflow).toContain("Early Warning fixture unexpectedly reached live mode");

    expect(distribution.mode).toBe("prelaunch-shadow");
    expect(distribution.default_dry_run).toBe(true);
    expect(distribution.live_publish_enabled).toBe(false);
    expect(distribution.receipt_policy.live_worker_wired).toBe(true);
    expect(distribution.receipt_policy.ambiguous_outcome_retry).toBe("manual_only");
    expect(distribution.receipt_policy.stale_unfinalized_claim_retry).toBe("manual_only");
  });

  it("keeps host-compatible x402 discovery truthful and prelaunch-only", () => {
    const extensionless = JSON.parse(read("public/.well-known/x402"));
    const json = JSON.parse(read("public/.well-known/x402.json"));
    const commerce = JSON.parse(read("public/.well-known/geomacro-commerce.json"));
    const marketplace = JSON.parse(read("config/agent-marketplace-distribution.json"));

    expect(extensionless).toEqual(json);
    expect(json.x402Version).toBe(2);
    expect(json.status).toBe("prelaunch");
    expect(json.productionFundsAuthorized).toBe(false);
    expect(json.resources).toEqual([]);
    expect(json.boundaries.execution_authorized).toBe(false);
    expect(json.boundaries.wallet_custody).toBe(false);
    expect(json.boundaries.transaction_signing).toBe(false);
    expect(json.plannedResources).toHaveLength(3);
    for (const resource of json.plannedResources) {
      expect(resource.production_enabled).toBe(false);
    }
    expect(json.hosting_fallback.mode).toBe("static_prelaunch");
    expect(json.hosting_fallback.production_launch_rule).toContain("must not advertise paid production resources");
    expect(commerce.discovery.x402).toBe("https://geomacro.live/.well-known/x402.json");
    expect(commerce.discovery.x402_extensionless_alias).toBe("https://geomacro.live/.well-known/x402");
    expect(marketplace.canonical_x402_discovery).toBe("https://geomacro.live/.well-known/x402.json");
    expect(marketplace.x402_extensionless_compatibility_alias).toBe("https://geomacro.live/.well-known/x402");
  });

  it("requires post-publish live acceptance instead of racing Git sync", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    const mirror = read(".github/workflows/sync-lovable-main.yml");

    expect(workflow).toContain("published_sha");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA: ${{ inputs.published_sha }}");
    expect(workflow).toContain('[[ "${PUBLISHED_SHA,,}" == "${GITHUB_SHA,,}" ]]');
    expect(mirror).toContain("public/.well-known/geomacro-build.json");
    expect(mirror).toContain('"canonical_main_sha": "${GITHUB_SHA}"');
    expect(mirror).toContain('"production_activation_performed": false');
  });

  it("does not embed production launch acknowledgements or permit production load targeting", () => {
    const workflow = read(".github/workflows/final-nonmainnet-launch-acceptance.yml");
    expect(workflow).not.toContain("I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH");
    expect(workflow).not.toContain("I_ACCEPT_REAL_USDC");
    expect(workflow).not.toContain("NEVERMINED_X402_ENVIRONMENT: live");
    expect(workflow).toContain("RISK_GATE_LOAD_TEST_ACK: STAGING_ONLY");
    expect(workflow).toContain("scripts/load-test-risk-gate-staging.ts --self-test");
  });
});
