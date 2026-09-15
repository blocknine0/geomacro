import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANONICAL_ARCHITECTURE_TOKENS = [
  "Real-world evidence and data",
  "Normalize, classify and preserve provenance",
  "Structured intelligence state",
  "Global Risk Index - Live",
  "Ask Geomacro - Live",
  "Country Risk Object - Private Pilot",
  "Corridor Risk Object - Private Pilot",
  "Risk Gate - Private Pilot",
  "Customer identity + permissions + policy",
  "Customer-controlled action",
  "Arc / Circle / prediction-market technical proof",
] as const;

describe("commercial website source-of-truth contract", () => {
  it("keeps the canonical end-to-end product architecture aligned across source-of-truth docs", () => {
    for (const path of ["README.md", "src/content/docs/02-product-architecture.md"]) {
      const content = read(path);
      for (const token of CANONICAL_ARCHITECTURE_TOKENS) {
        expect(content, `${path} is missing canonical architecture node: ${token}`).toContain(token);
      }
    }

    const overview = read("src/content/docs/01-what-is-geomacro.md");
    expect(overview).toContain("Country Risk Object - Private Pilot");
    expect(overview).toContain("Corridor Risk Object - Private Pilot");
    expect(overview).toContain("Customer identity + permissions + policy");
    expect(overview).toContain("Customer-controlled action");
    expect(overview).toContain("execution_authorized=false");

    const commercial = read("docs/COMMERCIAL_INTELLIGENCE.md");
    expect(commercial).toContain("Current Private Pilot scope is country and directional corridor risk");
    expect(commercial).toContain("Event-specific Risk Objects remain a broader product direction only");
    expect(commercial).toContain("execution_authorized=false");
    expect(commercial).not.toContain("+-- Event scope    -> Event Risk Object");
  });

  it("keeps intelligence products primary and technical proof secondary", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain('label: "Intelligence"');
    expect(shell).toContain('label: "Global Risk Index"');
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

    expect(home).toContain("Live geopolitical + macro risk intelligence");
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

  it("keeps Data, API and Agent availability explicit without advertising a free API", () => {
    const route = read("src/routes/data-api.tsx");

    expect(route).toContain("GOVERNED DATA · PAID API · AGENT ACCESS");
    expect(route).toContain("PUBLIC · FREE");
    expect(route).toContain("FOUNDING ANALYST PILOT");
    expect(route).toContain("FOUNDING API + RISK GATE PILOT");
    expect(route).toContain("INSTITUTIONAL");
    expect(route).toContain("POST https://geomacro.live/api/commercial/structural");
    expect(route).toContain("Free Explorer is website/dashboard access, not a free API");
    expect(route).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(route).toContain("route_modeling_status = NOT_MODELED");
    expect(route).toContain("execution_authorized=false");
    expect(route).not.toContain("PUBLIC · GEOMACRO AGENT V1");
  });

  it("keeps Arc, Circle and market routes explicitly technical proof", () => {
    for (const path of [
      "src/routes/arena.tsx",
      "src/routes/onchain.tsx",
      "src/routes/bridge-swap.tsx",
    ]) {
      expect(read(path)).toContain("TechnicalProofBanner");
    }
  });

  it("keeps the active roadmap intelligence-first and removes the stale market-first source of truth", () => {
    const roadmap = read("src/components/sections/roadmap-section.tsx");

    expect(roadmap).toContain("Intelligence foundation");
    expect(roadmap).toContain("Commercial hardening");
    expect(roadmap).toContain("Institutional Early Access");
    expect(roadmap).toContain("Production expansion");
    expect(roadmap).not.toContain("Autonomous Market Factory");
    expect(roadmap).not.toContain("Mainnet Deployment");
    expect(existsSync(join(ROOT, "src/lib/roadmap.ts"))).toBe(false);
  });

  it("redirects superseded public routes to the canonical product surface", () => {
    const feed = read("src/routes/feed.tsx");
    const bridge = read("src/routes/bridge.tsx");

    expect(feed).toContain('to: "/intelligence"');
    expect(feed).toContain("replace: true");
    expect(bridge).toContain('to: "/bridge-swap"');
    expect(bridge).toContain("replace: true");
  });

  it("keeps the public GRI architecture on the three-domain v1.2 contract", () => {
    const gri = read("src/routes/docs_.gri-architecture.tsx");

    expect(gri).toContain('["Geopolitics", "1/3"]');
    expect(gri).toContain('["Macro", "1/3"]');
    expect(gri).toContain('["Rare earth / critical minerals", "1/3"]');
    expect(gri).toContain("not a current GRI v1.2 scoring domain");
    expect(gri).not.toContain("Base weight 25%");
  });

  it("uses the canonical commercial contact and sitemap host", () => {
    const contact = read("src/routes/contact.tsx");
    const robots = read("public/robots.txt");
    const sitemap = read("public/sitemap.xml");

    expect(contact).toContain("contact@geomacro.live");
    expect(robots).toContain("https://geomacro.live/sitemap.xml");
    expect(robots).not.toContain("https://www.geomacro.live/sitemap.xml");
    expect(sitemap).toContain("https://geomacro.live/risk-gate");
    expect(sitemap).toContain("https://geomacro.live/ask-geomacro");
    expect(sitemap).toContain("https://geomacro.live/data-api");
    expect(sitemap).toContain("https://geomacro.live/docs/51-summary");
    expect(sitemap).not.toContain("https://geomacro.live/feed</loc>");
  });
});
