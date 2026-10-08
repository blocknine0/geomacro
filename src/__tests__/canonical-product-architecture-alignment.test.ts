import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const TOKENS = [
  "Real-world evidence and data",
  "Structured intelligence state",
  "Separate Risk Indices - Live",
  "Ask Geomacro - Live",
  "Country Risk Object - Private Pilot",
  "Corridor Risk Object - Private Pilot",
  "Risk Gate - Private Pilot",
  "Customer identity + permissions + policy",
  "Customer-controlled action",
] as const;

describe("canonical product architecture alignment", () => {
  it("keeps one governed commercial architecture across canonical docs", () => {
    for (const path of ["README.md", "src/content/docs/01-what-is-geomacro.md", "src/content/docs/02-product-architecture.md", "docs/CANONICAL_DELIVERY_ARCHITECTURE.md"]) {
      const content = read(path);
      for (const token of TOKENS) expect(content, path).toContain(token);
      expect(content).not.toContain("prediction-market technical proof");
    }
  });

  it("keeps Risk Objects and Risk Gate scoped and non-authorizing", () => {
    for (const path of [
      "src/content/docs/02-product-architecture.md",
      "src/content/docs/03-product-surfaces.md",
      "src/content/docs/22-machine-readable-risk-objects.md",
      "docs/COMMERCIAL_INTELLIGENCE.md",
      "docs/RISK_GATE.md",
      "src/routes/risk-gate.tsx",
    ]) {
      const content = read(path);
      expect(content).toMatch(/country.*corridor|corridor.*country/is);
      expect(content).toContain("execution_authorized");
    }
  });

  it("keeps the public shell free of retired execution products", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).not.toContain("useWallet");
    expect(shell).not.toMatch(/Technical Proof|Testnet|Bridge & Swap|Prediction Markets|Arc \/ Onchain/);
  });

  it("keeps the root website commercial-category first", () => {
    const root = read("src/routes/index.tsx");
    expect(root).toContain('import { CommercialHome } from "@/components/home/commercial-home"');
    expect(root).toContain("<CommercialHome />");
    expect(root).not.toContain("HeroSection");
    expect(root).toContain("Global Risk Intelligence Infrastructure");
  });

  it("labels Data & API as governed commercial access", () => {
    const dataApi = read("src/routes/data-api.tsx");
    expect(dataApi).toContain("INTELLIGENCE API · AI AGENTS");
    expect(dataApi).toContain("Free Explorer is website/dashboard access, not a free API");
    expect(dataApi).toContain("execution_authorized=false");
  });
});
