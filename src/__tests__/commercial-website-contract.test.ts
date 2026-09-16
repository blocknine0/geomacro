import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const COMMERCIAL_PUBLIC_SURFACES = [
  "src/components/home/commercial-home.tsx",
  "src/components/site-shell.tsx",
  "src/routes/intelligence.tsx",
  "src/routes/global-risk.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
  "src/routes/research.tsx",
  "src/routes/institutional.tsx",
  "src/routes/about.tsx",
] as const;

const STALE_PRIMARY_POSITIONING = [
  "prediction market for geopolitical",
  "prediction markets are the core",
  "prediction market platform",
  "trade on geopolitical",
  "bet on geopolitical",
  "decentralized prediction market",
] as const;

describe("commercial website source-of-truth contract", () => {
  it("keeps the canonical end-to-end product architecture aligned across source-of-truth docs", () => {
    const canonical = read("docs/CANONICAL_PRODUCT_ARCHITECTURE.md");
    const website = read("docs/WEBSITE_INFORMATION_ARCHITECTURE.md");
    const riskGate = read("docs/RISK_GATE.md");

    for (const marker of [
      "Risk Intelligence",
      "Global Risk Index",
      "Risk Gate",
      "Risk Object",
      "Ask Geomacro",
      "Data/API",
      "Research",
      "For Institutions",
    ]) {
      expect(canonical).toContain(marker);
    }

    expect(website).toContain("intelligence-first");
    expect(riskGate).toContain("execution_authorized");
  });

  it("keeps a centralized architecture classification for every major surface family", () => {
    const canonical = read("docs/CANONICAL_PRODUCT_ARCHITECTURE.md");

    for (const route of [
      "/intelligence",
      "/global-risk",
      "/risk-gate",
      "/ask-geomacro",
      "/data-api",
      "/research",
      "/institutional",
      "/arena",
      "/onchain",
      "/bridge-swap",
      "/pipeline",
    ]) {
      expect(canonical, `canonical surface matrix is missing ${route}`).toContain(`\`${route}\``);
    }

    expect(canonical).toContain("Data/API, institutional packaging, agent protocols and payment rails are **delivery or presentation layers around this hierarchy**");
    expect(canonical).toContain("never a parallel risk engine");
    expect(canonical).toContain("Permanent Arc Testnet technical proof");
  });

  it("blocks stale market-first positioning from primary commercial surfaces", () => {
    for (const path of COMMERCIAL_PUBLIC_SURFACES) {
      const normalized = read(path).toLowerCase();
      for (const phrase of STALE_PRIMARY_POSITIONING) {
        expect(normalized, `${path} reintroduced stale primary positioning: ${phrase}`).not.toContain(phrase.toLowerCase());
      }
    }
  });

  it("keeps intelligence products primary and technical proof secondary", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain('label: "Intelligence"');
    expect(shell).toContain('label: "Risk Indices"');
    expect(shell).toContain('label: "Risk Gate"');
    expect(shell).toContain('label: "Ask Geomacro"');
    expect(shell).toContain('label: "Data & API"');
    expect(shell).toContain('label: "Research"');
    expect(shell).toContain('label: "For Institutions"');
    expect(shell).toContain("Technical Proof");
    expect(shell).toContain('label: "Prediction Markets"');
    expect(shell).toContain('label: "Bridge & Swap"');
    expect(shell).toContain('title="Intelligence products"');
    expect(shell).toContain('title="Technical proof"');
  });

  it("keeps the homepage on the same architecture and status boundaries", () => {
    const home = read("src/components/home/commercial-home.tsx");

    expect(home).toContain("Live geopolitical + macro + critical-mineral intelligence");
    expect(home).toContain("View Risk Indices");
    expect(home).toContain("Risk Gate · Private Pilot");
    expect(home).toContain("Arc / Circle · Technical Proof");
    expect(home).toContain("Country / corridor Risk Object verified");
    expect(home).toContain("execution_authorized");
    expect(home).toContain("Secondary technical proof");
    expect(home).toContain("They are not the main commercial product");
  });

  it("keeps public intelligence surfaces wallet-free by default", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain("if (!address && !executionContext) return null");
    expect(shell).toContain('pathname === "/arena"');
    expect(shell).toContain('pathname === "/onchain"');
    expect(shell).toContain('pathname === "/bridge-swap"');
    expect(shell).not.toContain('pathname === "/intelligence" ||');
  });

  it("keeps Risk Gate within the verified Private Pilot scope", () => {
    const route = read("src/routes/risk-gate.tsx");

    expect(route).toContain("PRIVATE PILOT");
    expect(route).toContain("country or corridor risk");
    expect(route).toContain("execution_authorized = false");
    expect(route).toContain("directional corridors built from their endpoints");
    expect(route).toContain("does not claim full physical-route or counterparty modelling");
    expect(route).not.toContain("country, corridor and event risk");
  });

  it("keeps institutional workflow in Risk Gate -> customer policy -> customer action order", () => {
    const institutional = read("src/routes/institutional.tsx");
    expect(institutional).toContain("Risk Gate");
    expect(institutional).toContain("customer");
  });

  it("keeps Data, API and Agent availability explicit without advertising a free API", () => {
    const dataApi = read("src/routes/data-api.tsx");
    expect(dataApi).toContain("Private Pilot");
    expect(dataApi).not.toContain("free API");
  });

  it("keeps Arc, Circle and market routes explicitly technical proof", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).toContain("Technical Proof");
    expect(shell).toContain("Prediction Markets");
    expect(shell).toContain("Arc / Onchain");
    expect(shell).toContain("Bridge & Swap");
  });

  it("keeps the active roadmap intelligence-first and removes the stale market-first source of truth", () => {
    const roadmap = read("src/routes/roadmap.tsx");
    expect(roadmap.toLowerCase()).toContain("intelligence");
  });

  it("redirects superseded public routes to the canonical product surface", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toBeTruthy();
  });

  it("keeps the public GRI architecture on the three-domain v1.2 contract", () => {
    const current = read("src/lib/gri-current-contract.ts");
    const engine = read("scripts/lib/gri-engine-v12.js");
    expect(current).toContain('GRI_METHOD_VERSION = "gri-v1.2.0"');
    expect(engine).toContain('GRI_CATEGORIES = ["geopolitics", "macro", "rare_earth"]');
  });

  it("uses the canonical commercial contact and sitemap host", () => {
    const sitemap = read("public/sitemap.xml");
    expect(sitemap).toContain("https://geomacro.live");
  });
});
