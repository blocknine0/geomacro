import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function filesBelow(relativeDir: string): string[] {
  const root = join(ROOT, relativeDir);
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const absolute = join(dir, name);
      const stat = statSync(absolute);
      if (stat.isDirectory()) visit(absolute);
      else if (/\.(?:md|txt|json|xml|html|tsx|ts)$/i.test(name)) out.push(absolute);
    }
  };
  visit(root);
  return out;
}

const PUBLIC_COMMERCIAL_FILES = [
  ...filesBelow("src/content/docs"),
  ...filesBelow("public").filter((path) => !path.includes("/.well-known/security.txt")),
  "src/components/site-shell.tsx",
  "src/components/customer-care.tsx",
  "src/components/agent-commerce-status.tsx",
  "src/components/home/commercial-home.tsx",
  "src/routes/index.tsx",
  "src/routes/intelligence.tsx",
  "src/routes/global-risk.tsx",
  "src/routes/risk-indices.tsx",
  "src/routes/ask-geomacro.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
  "src/routes/pricing.tsx",
  "src/routes/institutional.tsx",
  "src/routes/ecosystem.tsx",
  "src/routes/research.tsx",
  "src/routes/docs.tsx",
  "src/routes/about.tsx",
  "src/routes/roadmap.tsx",
  "src/routes/contact.tsx",
  "docs/WEBSITE_INFORMATION_ARCHITECTURE.md",
  "README.md",
].map((path) => path.startsWith(ROOT) ? path : join(ROOT, path));

const RETIRED_MARKERS = [
  /\btestnet\b/i,
  /prediction[\s-]?markets?/i,
  /\bbridge\b/i,
  /\bswap\b/i,
];

describe("commercial public-surface retirement", () => {
  it("keeps retired experimental product identity out of every public commercial artifact", () => {
    for (const path of PUBLIC_COMMERCIAL_FILES) {
      const source = readFileSync(path, "utf8");
      for (const marker of RETIRED_MARKERS) {
        expect(source, `retired marker ${marker} leaked into ${path}`).not.toMatch(marker);
      }
    }
  });

  it("keeps legacy direct routes redirect-only or fail-closed", () => {
    const redirects: Array<[string, string]> = [
      ["src/routes/arena.tsx", "/intelligence"],
      ["src/routes/bridge.tsx", "/data-api"],
      ["src/routes/bridge-swap.tsx", "/data-api"],
      ["src/routes/onchain.tsx", "/data-api"],
      ["src/routes/testnet-access.tsx", "/data-api"],
      ["src/routes/testnet-console.tsx", "/data-api"],
      ["src/routes/demo.tsx", "/data-api"],
      ["src/routes/pipeline.tsx", "/research"],
    ];
    for (const [relative, target] of redirects) {
      const source = readFileSync(join(ROOT, relative), "utf8");
      expect(source).toContain(`to: "${target}"`);
      expect(source).toContain("replace: true");
    }

    const retiredApi = readFileSync(join(ROOT, "src/routes/api/testnet-tester/$.tsx"), "utf8");
    expect(retiredApi).toContain('error: "NOT_FOUND"');
    expect(retiredApi).not.toContain("runH3Handler");
  });
});
