import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PRIMARY_ROUTES = [
  "src/routes/index.tsx",
  "src/routes/intelligence.tsx",
  "src/routes/global-risk.tsx",
  "src/routes/ask-geomacro.tsx",
  "src/routes/institutional.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
  "src/routes/pricing.tsx",
  "src/routes/ecosystem.tsx",
  "src/routes/research.tsx",
  "src/routes/docs.tsx",
  "src/routes/about.tsx",
  "src/routes/roadmap.tsx",
  "src/routes/contact.tsx",
] as const;

describe("final commercial website closure", () => {
  it("keeps every primary commercial route canonical", () => {
    for (const path of PRIMARY_ROUTES) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
      expect(read(path), path).toContain('rel: "canonical"');
    }
  });

  it("keeps public navigation commercial and wallet-free", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).not.toContain("useWallet");
    expect(shell).not.toContain("TECHNICAL_NAV");
    for (const marker of ["Testnet", "Prediction Markets", "Bridge & Swap", "Arc / Onchain"]) {
      expect(shell).not.toContain(marker);
    }
    for (const route of ["/intelligence", "/global-risk", "/data-api", "/institutional", "/pricing", "/contact"]) {
      expect(shell).toContain(route);
    }
  });

  it("keeps Risk Gate controlled and x402 fail-closed until production activation", () => {
    const riskGate = read("src/routes/risk-gate.tsx");
    const dataApi = read("src/routes/data-api.tsx");
    const status = read("src/components/agent-commerce-status.tsx");
    expect(riskGate).toContain("PRIVATE PILOT");
    expect(riskGate).toContain("execution_authorized = false");
    expect(dataApi).toContain("Real-money x402 access stays fail-closed");
    expect(status).toContain("production activation pending");
  });

  it("removes retired products from public docs and discovery", () => {
    const manifest = JSON.parse(read("src/content/docs-manifest.json")) as Array<{ slug: string }>;
    expect(manifest).toHaveLength(48);
    for (const slug of ["34-prediction-markets", "35-cctp-bridge-and-swap", "36-arc-testnet", "37-research-and-experimental-layers"]) {
      expect(manifest.some((entry) => entry.slug === slug)).toBe(false);
    }

    const sitemap = read("public/sitemap.xml").toLowerCase();
    const llms = read("public/llms.txt").toLowerCase();
    for (const marker of ["prediction-market", "bridge-and-swap", "arc-testnet", "testnet"]) {
      expect(sitemap).not.toContain(marker);
      expect(llms).not.toContain(marker);
    }
  });

  it("keeps the website architecture commercial-only", () => {
    const architecture = read("docs/WEBSITE_INFORMATION_ARCHITECTURE.md");
    expect(architecture).toContain("commercial source of truth for the public website");
    expect(architecture).toContain("PRODUCTION GATED");
    expect(architecture).toContain("Retired route rule");
    expect(architecture).not.toContain("Technical Proof routes");
  });
});
