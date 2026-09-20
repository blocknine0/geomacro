import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const WORKFLOW_DIR = ".github/workflows";
const AGENTIC_PATH_RE =
  /agent|x402|goat|coinbase|circle|nevermined|a2a|commerce|commercial|marketplace|risk-gate|risk.?object|live-testnet|production-(?:acceptance|intelligence)|canary|prelisting|partner-preflight|hot-topic|federico/i;

const KNOWN_AGENTIC_WORKFLOWS = [
  ".github/workflows/product-ci.yml",
  ".github/workflows/agent-query-production-readiness.yml",
  ".github/workflows/coinbase-x402-adaptive-base-sepolia-paid-e2e.yml",
  ".github/workflows/coinbase-x402-base-sepolia-acceptance.yml",
  ".github/workflows/coinbase-x402-mainnet-readiness.yml",
  ".github/workflows/circle-x402-prelaunch-readiness.yml",
  ".github/workflows/nevermined-x402-sandbox-acceptance.yml",
  ".github/workflows/goat-testnet3-provider-dry-run.yml",
  ".github/workflows/goat-testnet3-local-paid-e2e.yml",
  ".github/workflows/goat-testnet3-paid-artifact-replay.yml",
  ".github/workflows/goat-testnet3-reconcile-existing.yml",
  ".github/workflows/goat-testnet3-local-paid-readiness.yml",
  ".github/workflows/goat-acceptance-windows.yml",
  ".github/workflows/commercial-coordinated-launch-preflight.yml",
  ".github/workflows/commercial-release-candidate-evidence.yml",
  ".github/workflows/commercial-release-candidate-freeze.yml",
  ".github/workflows/final-nonmainnet-launch-acceptance.yml",
  ".github/workflows/final-production-acceptance.yml",
  ".github/workflows/marketplace-listing-observation.yml",
  ".github/workflows/marketplace-submission-evidence.yml",
  ".github/workflows/post-listing-health.yml",
  ".github/workflows/production-canary-cohort-acceptance.yml",
  ".github/workflows/production-provider-canary.yml",
  ".github/workflows/external-production-revenue-proof.yml",
  ".github/workflows/commerce-freeze-quarantine-drill.yml",
  ".github/workflows/commerce-safety-drill-acceptance.yml",
  ".github/workflows/public-production-prelisting-health.yml",
  ".github/workflows/structured-commerce-db-concurrency.yml",
  ".github/workflows/live-testnet-developer-api-paid-e2e.yml",
  ".github/workflows/live-testnet-authenticated-e2e.yml",
  ".github/workflows/commercial-pilot-readiness.yml",
  ".github/workflows/commercial-production-acceptance.yml",
  ".github/workflows/commercial-api-production-acceptance.yml",
  ".github/workflows/public-demo-risk-refresh.yml",
  ".github/workflows/dan-commercial-readiness-v2.yml",
  ".github/workflows/testnet-tester-validation.yml",
  ".github/workflows/risk-gate-staging-load.yml",
  ".github/workflows/risk-gate-core-resilience.yml",
  ".github/workflows/risk-gate-testnet-acceptance.yml",
  ".github/workflows/global-risk-gate-country-readiness.yml",
  ".github/workflows/production-intelligence-readiness.yml",
  ".github/workflows/commercial-country-pilot-acceptance.yml",
  ".github/workflows/invinoveritas-partner-preflight.yml",
  ".github/workflows/hot-topic-family-readiness.yml",
  ".github/workflows/risk-gate-production-proof.yml",
  ".github/workflows/ops-goat-provider-proof-free.yml",
  ".github/workflows/ops-goat-staging-challenge-probe.yml",
  ".github/workflows/federico-seven-day-risk-refresh.yml",
  ".github/workflows/risk-object-key-lifecycle-ci.yml",
  ".github/workflows/republish-country-risk-object-key-rotation.yml",
  ".github/workflows/all-data-corridor-matrix.yml",
];

const read = (path: string) => readFileSync(path, "utf8");

function workflowFiles(): string[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => `${WORKFLOW_DIR}/${name}`);
}

function changedWorkflowFiles(): string[] {
  const base = process.env.WORKFLOW_GOVERNANCE_BASE_SHA?.trim();
  if (!base || !/^[0-9a-f]{40}$/i.test(base)) return [];

  const output = execFileSync(
    "git",
    ["diff", "--name-only", `${base}...HEAD`, "--", WORKFLOW_DIR],
    { encoding: "utf8" },
  );

  return output
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path));
}

function governanceTargets(): string[] {
  const existing = new Set(workflowFiles());
  const targets = new Set<string>();

  for (const path of KNOWN_AGENTIC_WORKFLOWS) {
    if (existing.has(path)) targets.add(path);
  }

  for (const path of existing) {
    if (AGENTIC_PATH_RE.test(path)) targets.add(path);
  }

  for (const path of changedWorkflowFiles()) {
    if (existing.has(path)) targets.add(path);
  }

  return [...targets];
}

function expectPinnedActions(path: string) {
  const source = read(path);
  const usesLines = source
    .split("\n")
    .filter((line) => /^\s*(?:-\s*)?uses:\s*\S+/.test(line));

  for (const line of usesLines) {
    const target = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)/)?.[1] ?? "";
    if (target.startsWith("./")) continue;
    expect(line, `${path}: ${line}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/i);
  }

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*(?:-\s*)?uses:\s*actions\/checkout@/i.test(lines[i])) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
    expect(window, path).toContain("persist-credentials: false");
  }
}

describe("agentic economy recurrence prevention", () => {
  it("governs all known agentic workflows and every workflow changed by the current revision", () => {
    const targets = governanceTargets();
    expect(targets.length, "workflow governance must never run with an empty target set").toBeGreaterThan(0);

    for (const path of targets) {
      expectPinnedActions(path);

      const source = read(path);
      if (/\bbun install\b/.test(source)) {
        expect(source, path).toContain("bun install --frozen-lockfile");
        expect(source, path).not.toMatch(/\bnpm ci\b|\bnpm install\b/);
      }
    }
  });

  it("keeps Product CI itself inside the workflow-change protection path", () => {
    const source = read(".github/workflows/product-ci.yml");
    expect(source).toContain("'.github/workflows/**'");
    expect(source).toContain("WORKFLOW_GOVERNANCE_BASE_SHA");
    expect(source).toContain("scripts/db/check-migration-safety.mjs");
    expectPinnedActions(".github/workflows/product-ci.yml");
  });

  it("keeps manual acceptance bound to the exact candidate SHA", () => {
    for (const path of [
      ".github/workflows/commerce-freeze-quarantine-drill.yml",
      ".github/workflows/commerce-safety-drill-acceptance.yml",
      ".github/workflows/marketplace-listing-observation.yml",
      ".github/workflows/marketplace-submission-evidence.yml",
      ".github/workflows/final-production-acceptance.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("inputs.candidate_sha");
      expect(source, path).toContain("CANDIDATE_SHA");
      expect(source, path).toContain("DISPATCH_SHA");
      expect(source, path).toContain("persist-credentials: false");
    }
  });

  it("keeps production payment rails explicitly prelaunch and non-authorizing", () => {
    for (const path of [
      ".github/workflows/coinbase-x402-mainnet-readiness.yml",
      ".github/workflows/circle-x402-prelaunch-readiness.yml",
      ".github/workflows/nevermined-x402-sandbox-acceptance.yml",
      ".github/workflows/commercial-coordinated-launch-preflight.yml",
      ".github/workflows/final-nonmainnet-launch-acceptance.yml",
    ]) {
      const source = read(path);
      expect(source, path).toContain("contents: read");
      expect(source, path).not.toMatch(
        /^\s*(?:[A-Z0-9_]+:\s*)?I_ACCEPT_REAL_USDC\s*$/m,
      );
      expect(source, path).not.toMatch(
        /^\s*(?:[A-Z0-9_]+:\s*)?I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH\s*$/m,
      );
    }

    const finalAcceptance = read(".github/workflows/final-production-acceptance.yml");
    expect(finalAcceptance).toContain("inputs.candidate_sha");
    expect(finalAcceptance).toContain("node scripts/commerce/verify-final-production-acceptance.mjs");
    expect(read("scripts/commerce/verify-final-production-acceptance.mjs")).toContain("production_enabled");
    expect(read("scripts/commerce/verify-final-production-acceptance.mjs")).toContain("execution_authorized");
  });
});
