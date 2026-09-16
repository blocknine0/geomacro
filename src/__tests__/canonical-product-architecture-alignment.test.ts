import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const PRODUCT_ARCHITECTURE_TOKENS = [
  "Real-world evidence and data",
  "Normalize, classify and preserve provenance",
  "Structured intelligence state",
  "Separate Risk Indices - Live",
  "Ask Geomacro - Live",
  "Country Risk Object - Private Pilot",
  "Corridor Risk Object - Private Pilot",
  "Risk Gate - Private Pilot",
  "Customer identity + permissions + policy",
  "Customer-controlled action",
  "Arc / Circle / prediction-market technical proof",
] as const;

const CURRENT_PRODUCT_TRUTH_FILES = [
  "README.md",
  "src/content/docs/01-what-is-geomacro.md",
  "src/content/docs/02-product-architecture.md",
  "docs/CANONICAL_DELIVERY_ARCHITECTURE.md",
  "docs/COMMERCIAL_INTELLIGENCE.md",
] as const;

const MACHINE_BOUNDARY_DOCS = [
  "src/content/docs/22-machine-readable-risk-objects.md",
  "src/content/docs/23-product-specific-intelligence-policies.md",
  "src/content/docs/26-agent-intelligence.md",
  "docs/RISK_GATE.md",
] as const;

describe("canonical product architecture alignment", () => {
  it("keeps the screenshot architecture identical across canonical product truth", () => {
    for (const path of CURRENT_PRODUCT_TRUTH_FILES) {
      const content = read(path);
      for (const token of PRODUCT_ARCHITECTURE_TOKENS) {
        expect(content, `${path} is missing canonical product node: ${token}`).toContain(token);
      }
    }
  });

  it("keeps one governed intelligence foundation instead of payment or API-specific risk engines", () => {
    const contract = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    const architecture = read("src/content/docs/02-product-architecture.md");

    expect(contract).toContain("one governed intelligence foundation");
    expect(contract).toContain("not a separate risk engine");
    expect(contract).toContain("A subscription, payment, authentication or transport adapter is **not a separate risk engine**");
    expect(architecture).toContain("one shared evidence and provenance foundation");
    expect(architecture).toContain("does not create a separate dataset, score engine, Risk Object path or Risk Gate implementation");
  });

  it("keeps the current Risk Object and Risk Gate scope to country and directional corridor", () => {
    const architecture = read("src/content/docs/02-product-architecture.md");
    const commercial = read("docs/COMMERCIAL_INTELLIGENCE.md");
    const riskGateDoc = read("docs/RISK_GATE.md");
    const riskGateRoute = read("src/routes/risk-gate.tsx");
    const surfaces = read("src/content/docs/03-product-surfaces.md");
    const riskObjects = read("src/content/docs/22-machine-readable-risk-objects.md");

    for (const content of [architecture, commercial, riskGateDoc, riskGateRoute, surfaces, riskObjects]) {
      expect(content).toContain("Event-specific Risk Objects");
      expect(content).toMatch(/country.*corridor|corridor.*country/is);
    }

    expect(commercial).toContain("Current Private Pilot scope is country and directional corridor risk");
    expect(riskGateRoute).toContain("directional corridors built from their endpoints");
    expect(riskGateRoute).toContain("does not claim full physical-route or counterparty modelling");
    expect(riskGateDoc).not.toContain("+-- Event scope    -> Event Risk Object direction");
  });

  it("keeps customer identity, permissions, policy, funds and execution customer-controlled", () => {
    const contract = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    const architecture = read("src/content/docs/02-product-architecture.md");
    const commercial = read("docs/COMMERCIAL_INTELLIGENCE.md");
    const riskGateDoc = read("docs/RISK_GATE.md");
    const home = read("src/components/home/commercial-home.tsx");
    const riskGateRoute = read("src/routes/risk-gate.tsx");
    const institutional = read("src/routes/institutional.tsx");

    for (const content of [contract, architecture, commercial, riskGateDoc]) {
      expect(content).toContain("Customer identity + permissions + policy");
      expect(content).toContain("Customer-controlled action");
    }

    expect(contract).toContain("The customer owns the identity, permissions and policy layer");
    expect(architecture).toContain("The customer owns the identity, permissions and policy layer");
    expect(commercial).toContain("The customer owns the identity, permissions and policy layer");
    expect(riskGateDoc).toContain("customer retains identity, permissions, policy, funds and control of any downstream execution");

    expect(home).not.toContain("applies the customer's policy");
    expect(riskGateRoute).not.toContain("applies the customer's policy");
    expect(home).toContain("Customer-owned policy applied by the customer system");
    expect(riskGateRoute).toContain("The customer's own identity, permissions and policy layer applies its rules");
    expect(institutional).toContain("customer controls execution");
  });

  it("keeps machine-facing docs in Risk Gate -> customer policy -> customer action order", () => {
    for (const path of MACHINE_BOUNDARY_DOCS) {
      const content = read(path);
      const normalized = content.toLowerCase();
      const gate = normalized.indexOf("risk gate - private pilot");
      const policy = normalized.indexOf("customer identity + permissions + policy");
      const action = normalized.indexOf("customer-controlled action");

      expect(gate, `${path} must name the Private Pilot Risk Gate`).toBeGreaterThanOrEqual(0);
      expect(policy, `${path} must place customer-owned policy after Risk Gate`).toBeGreaterThan(gate);
      expect(action, `${path} must place customer-controlled action after customer policy`).toBeGreaterThan(policy);
      expect(content, `${path} must preserve non-authorization`).toContain("execution_authorized");
    }
  });

  it("preserves the non-authorizing Risk Gate boundary everywhere it is commercially described", () => {
    for (const path of [
      "README.md",
      "src/content/docs/01-what-is-geomacro.md",
      "src/content/docs/02-product-architecture.md",
      "src/content/docs/03-product-surfaces.md",
      "src/content/docs/22-machine-readable-risk-objects.md",
      "src/content/docs/23-product-specific-intelligence-policies.md",
      "src/content/docs/26-agent-intelligence.md",
      "docs/CANONICAL_DELIVERY_ARCHITECTURE.md",
      "docs/COMMERCIAL_INTELLIGENCE.md",
      "docs/RISK_GATE.md",
      "src/routes/risk-gate.tsx",
      "src/routes/about.tsx",
    ]) {
      expect(read(path), `${path} must preserve the non-authorizing boundary`).toContain("execution_authorized");
    }
  });

  it("keeps intelligence primary and Arc, Circle and prediction markets secondary technical proof", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const shell = read("src/components/site-shell.tsx");
    const about = read("src/routes/about.tsx");
    const predictionDocs = read("src/content/docs/34-prediction-markets.md");

    expect(home).toContain("Secondary technical proof");
    expect(home).toContain("They are not Geomacro's primary commercial identity");
    expect(shell).toContain("Technical Proof");
    expect(shell).toContain('label: "Prediction Markets"');
    expect(about).toContain("Risk intelligence is the product");
    expect(about).toContain("Technical Proof:");
    expect(predictionDocs).toContain("TECHNICAL PROOF · ARC TESTNET");
    expect(predictionDocs).toContain("secondary application and feedback layer");
  });

  it("keeps public intelligence wallet-free and confines wallets to explicit technical execution surfaces", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain("if (!address && !executionContext) return null");
    expect(shell).toContain('pathname === "/arena"');
    expect(shell).toContain('pathname === "/onchain"');
    expect(shell).toContain('pathname === "/bridge-swap"');
    expect(shell).not.toContain('pathname === "/intelligence" ||');
    expect(shell).not.toContain('pathname === "/global-risk" ||');
    expect(shell).not.toContain('pathname === "/risk-gate" ||');
  });

  it("keeps the root website on the current commercial home rather than the superseded market-first hero", () => {
    const root = read("src/routes/index.tsx");

    expect(root).toContain('import { CommercialHome } from "@/components/home/commercial-home"');
    expect(root).toContain("component: CommercialHome");
    expect(root).not.toContain("HeroSection");
    expect(root).toContain("Geopolitical, Macro & Critical Minerals Risk Intelligence");
  });

  it("labels Data & API precisely instead of implying a generally public API", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const dataApi = read("src/routes/data-api.tsx");

    expect(home).toContain("PUBLIC DATA + PRIVATE PILOT API");
    expect(dataApi).toContain("GOVERNED DATA · PAID API · AGENT ACCESS");
    expect(dataApi).toContain("Free Explorer is website/dashboard access, not a free API");
    expect(dataApi).toContain("execution_authorized=false");
  });
});
