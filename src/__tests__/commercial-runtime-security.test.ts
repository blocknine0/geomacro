import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function filesUnder(path: string): string[] {
  const absolute = join(ROOT, path);
  return readdirSync(absolute).flatMap((name) => {
    const child = join(path, name);
    return statSync(join(ROOT, child)).isDirectory() ? filesUnder(child) : [child];
  });
}

function expectPinnedActions(path: string) {
  const source = read(path);
  expect(source, path).not.toMatch(/uses:\s+[^\s]+@v\d+(?:\.\d+)*\b/);
  for (const line of source.split("\n").filter((item) => item.includes("uses:"))) {
    expect(line, `${path}: ${line}`).toMatch(/@[0-9a-f]{40}(?:\s|$)/);
  }
  if (source.includes("actions/checkout@")) {
    expect(source, path).toContain("persist-credentials: false");
  }
}

describe("commercial runtime security baseline", () => {
  it("pins the country-flash validation and worker supply chain", () => {
    expectPinnedActions(".github/workflows/country-flash-validation.yml");
    expectPinnedActions(".github/workflows/country-flash-worker-image.yml");

    const validation = read(".github/workflows/country-flash-validation.yml");
    expect(validation).toContain("deno-version: v2.9.6");

    const image = read(".github/workflows/country-flash-worker-image.yml");
    expect(image).toContain('${IMAGE}:${GITHUB_SHA}');
    expect(image).not.toContain('${IMAGE}:latest');
  });

  it("fails closed before production country-flash deployment", () => {
    const source = read(".github/workflows/deploy-country-flash-supabase.yml");
    expectPinnedActions(".github/workflows/deploy-country-flash-supabase.yml");
    expect(source).toContain("permissions:\n  contents: read");
    expect(source).toContain("github.ref == 'refs/heads/main'");
    expect(source).toContain("EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx");
    expect(source).toContain('SUPABASE_PROJECT_ID" != "$EXPECTED_SUPABASE_PROJECT_REF');
    expect(source).toContain("supabase db push --dry-run");
    expect(source).toContain("version: 2.117.0");
    expect(source).not.toContain("version: latest");
    expect(source).toContain("cancel-in-progress: false");
  });

  it("hardens scheduled ReliefWeb production writes", () => {
    const source = read(".github/workflows/ingest-reliefweb-live.yml");
    expectPinnedActions(".github/workflows/ingest-reliefweb-live.yml");
    expect(source).toContain("if: github.ref == 'refs/heads/main'");
    expect(source).toContain("SUPABASE_URL: ${{ secrets.APP_SUPABASE_URL }}");
    expect(source).toContain("assert-authoritative-supabase.mjs");
    expect(source).toContain("bun install --frozen-lockfile --ignore-scripts");
  });

  it("keeps browser source free of privileged VITE credentials", () => {
    const envExample = read(".env.example");
    expect(envExample).not.toMatch(
      /^VITE_[A-Z0-9_]*(?:SERVICE_ROLE|PRIVATE_KEY|SIGNING|FLASH_INGEST_TOKEN|TELEGRAM_SESSION)[A-Z0-9_]*=/m,
    );

    const browserSource = filesUnder("src")
      .filter((path) => /\.(?:ts|tsx|js|jsx)$/.test(path))
      .filter((path) => !path.includes("/__tests__/"))
      .map(read)
      .join("\n");

    expect(browserSource).not.toMatch(
      /import\.meta\.env\.VITE_[A-Z0-9_]*(?:SERVICE_ROLE|PRIVATE_KEY|SIGNING|FLASH_INGEST_TOKEN|TELEGRAM_SESSION)/,
    );
  });

  it("detects actual hosted admin-key bindings without flagging harmless documentation", () => {
    const workflowSources = filesUnder(".github/workflows")
      .filter((path) => path.endsWith(".yml") || path.endsWith(".yaml"))
      .map(read)
      .join("\n");

    for (const secret of [
      "TREASURY_PRIVATE_KEY_1",
      "TREASURY_PRIVATE_KEY_2",
      "LIQUIDITY_PRIVATE_KEY",
      "DEPLOYER_PRIVATE_KEY",
    ]) {
      const binding = new RegExp(`secrets\\.${secret}\\b`);
      expect(workflowSources).not.toMatch(binding);
    }
  });

  it("runs pinned CodeQL with least privilege", () => {
    const source = read(".github/workflows/codeql-security.yml");
    expect(source).toContain("contents: read");
    expect(source).toContain("security-events: write");
    expectPinnedActions(".github/workflows/codeql-security.yml");
  });
});
