import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const PINNED_ACTION_PATTERN = /uses:\s+[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}(?:\s|#|$)/;
const ACTION_USE_PATTERN = /uses:\s+([^\s#]+)/g;
const BUN_LOCKED_RUNTIME_WORKFLOWS = [
  ".github/workflows/auto-ingest-news.yml",
  ".github/workflows/auto-create-markets.yml",
  ".github/workflows/auto-resolve-markets.yml",
  ".github/workflows/auto-resolve-disputes.yml",
  ".github/workflows/auto-finalize-markets.yml",
  ".github/workflows/sync-lifecycle.yml",
  ".github/workflows/sync-stakes.yml",
  ".github/workflows/security-monitor.yml",
  ".github/workflows/auto-recovery.yml",
  ".github/workflows/Auto-generate-briefings.yml",
  ".github/workflows/ingest-reliefweb-live.yml",
];

function expectPinnedActions(path: string) {
  const source = read(path);
  const uses = [...source.matchAll(ACTION_USE_PATTERN)].map((match) => match[0]);
  expect(uses.length, path).toBeGreaterThan(0);
  for (const use of uses) {
    expect(use, `${path}: ${use}`).toMatch(PINNED_ACTION_PATTERN);
  }
}

describe("commercial runtime security baseline", () => {
  it("pins the country-flash validation and worker supply chain", () => {
    for (const path of [
      ".github/workflows/country-flash-validation.yml",
      ".github/workflows/country-flash-worker-image.yml",
    ]) {
      expectPinnedActions(path);
    }

    const worker = read(".github/workflows/country-flash-worker-image.yml");
    expect(worker).toContain("persist-credentials: false");
    expect(worker).toContain("permissions:\n  contents: read\n  packages: write");
    expect(worker).toContain('cosign-version: "v3.0.5"');
    expect(worker).not.toMatch(/@v\d/);
    expect(worker).not.toMatch(/@main\b/);
    expect(worker).not.toMatch(/@master\b/);
  });

  it("fails closed before production country-flash deployment", () => {
    const deploy = read(".github/workflows/deploy-country-flash-supabase.yml");
    expectPinnedActions(".github/workflows/deploy-country-flash-supabase.yml");
    expect(deploy).toContain('CONTAINER_ENABLED: "1"');
    expect(deploy).toContain('ANALYTICS_PROFILE: "FULL"');
    expect(deploy).toContain('if [ "$CONTAINER_ENABLED" != "1" ]');
    expect(deploy).toContain('if [ "$ANALYTICS_PROFILE" != "FULL" ]');
    expect(deploy).toContain('TESTNET_CHAIN_READS_ENABLED: "0"');
    expect(deploy).toContain("shellcheck scripts/install-bun.sh scripts/supply-chain/*.sh");
  });

  it("uses the canonical Bun lockfile for privileged and scheduled runtime workflows", () => {
    for (const path of BUN_LOCKED_RUNTIME_WORKFLOWS) {
      const source = read(path);
      expectPinnedActions(path);
      expect(source, path).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
      expect(source, path).toContain('bun-version: "1.4.2"');
      expect(source, path).toContain("bun install --frozen-lockfile --ignore-scripts");
      expect(source, path).not.toContain("npm ci");
      expect(source, path).not.toContain("cache: npm");
      expect(source, path).not.toMatch(/\bnpm install\b/);
    }
  });

  it("hardens scheduled production intelligence writes", () => {
    for (const path of [
      ".github/workflows/auto-ingest-news.yml",
      ".github/workflows/ingest-reliefweb-live.yml",
    ]) {
      const source = read(path);
      expectPinnedActions(path);
      expect(source, path).toContain("github.ref == 'refs/heads/main'");
      expect(source, path).toContain("assert-authoritative-supabase.mjs");
      expect(source, path).not.toMatch(/\bnpm install\b/);
    }

    const ingest = read(".github/workflows/auto-ingest-news.yml");
    expect(ingest).toContain("github.repository == 'blocknine0/geomacro'");
    expect(ingest).toContain("bun install --frozen-lockfile --ignore-scripts");
    expect(ingest).toContain("Prediction-market creation is not part of this");

    const reliefWeb = read(".github/workflows/ingest-reliefweb-live.yml");
    expect(reliefWeb).toContain("SUPABASE_URL: ${{ secrets.APP_SUPABASE_URL }}");
    expect(reliefWeb).toContain("bun install --frozen-lockfile --ignore-scripts");
  });

  it("keeps browser source free of privileged VITE credentials", () => {
    const envExample = read(".env.example");
    expect(envExample).not.toMatch(/VITE_(SUPABASE_SERVICE_ROLE_KEY|GROQ_API_KEY|CEREBRAS_API_KEY|GEMINI_API_KEY|MISTRAL_API_KEY|GUARDIAN_API_KEY|PRIVATE_KEY)/);
  });

  it("runs pinned CodeQL with least privilege", () => {
    const source = read(".github/workflows/codeql-security.yml");
    expectPinnedActions(".github/workflows/codeql-security.yml");
    expect(source).toContain("security-events: write");
    expect(source).toContain("contents: read");
    expect(source).not.toContain("contents: write");
  });
});
