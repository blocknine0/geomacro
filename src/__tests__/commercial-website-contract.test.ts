import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const CANONICAL_ARCHITECTURE_TOKENS = [
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

const COMMERCIAL_PUBLIC_SURFACES = [
  "src/routes/index.tsx",
  "src/components/home/commercial-home.tsx",
  "src/routes/about.tsx",
  "src/routes/institutional.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
  "src/routes/ecosystem.tsx",
] as const;

const STALE_PRIMARY_POSITIONING = [
  "autonomous prediction market",
  "natively settled in USDC on Arc",
  "prediction-market-first",
  "prediction market is the product",
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

  it("keeps a centralized architecture classification for every major surface family", () => {
    const canonical = read("docs/CANONICAL_DELIVERY_ARCHITECTURE.md");
    for (const token of CANONICAL_ARCHITECTURE_TOKENS) expect(canonical).toContain(token);
    for (const route of ["/intelligence", "/global-risk", "/ask-geomacro", "/risk-gate", "/data-api", "/institutional", "/research", "/docs", "/about", "/testnet-access", "/arena", "/onchain", "/bridge-swap", "/pipeline"]) {
      expect(canonical).toContain(`\`${route}\``);
    }
    expect(canonical).toContain("Data/API, institutional packaging, agent protocols and payment rails are **delivery or presentation layers around this hierarchy**");
    expect(canonical).toContain("never a parallel risk engine");
    expect(canonical).toContain("Permanent Arc Testnet technical proof");
  });

  it("blocks stale market-first positioning from primary commercial surfaces", () => {
    for (const path of COMMERCIAL_PUBLIC_SURFACES) {
      const normalized = read(path).toLowerCase();
      for (const phrase of STALE_PRIMARY_POSITIONING) expect(normalized).not.toContain(phrase.toLowerCase());
    }
  });

  it("keeps the desktop decision path short and makes ecosystem visible", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).toContain('const PRIMARY_NAV = [');
    expect(shell).toContain('label: "Intelligence"');
    expect(shell).toContain('label: "Risk Indices"');
    expect(shell).toContain('label: "For Institutions"');
    expect(shell).toContain('label: "Ecosystem"');
    expect(shell).toContain('Risk Gate · Private Pilot');
    expect(shell).toContain('label: "Data & API"');
    expect(shell).toContain("Product, evidence and roadmap");
    expect(shell).toContain("Technical Proof");
    expect(shell).toContain('label: "Prediction Markets"');
    expect(shell).toContain('label: "Bridge & Swap"');
    expect(shell).toContain("real-money agent access fail-closed until production activation");
  });

  it("keeps the homepage commercially understandable without turning it into a live-data dashboard", () => {
    const home = read("src/components/home/commercial-home.tsx");
    expect(home).toContain("Global risk intelligence infrastructure");
    expect(home).toContain("Turn world events into");
    expect(home).toContain("decision-ready risk context");
    expect(home).toContain("Why adopt Geomacro");
    expect(home).toContain("Who it is for");
    expect(home).toContain("Ecosystem & partnership");
    expect(home).toContain("Circle Alliance Program");
    expect(home).toContain("Discuss a partnership");
    expect(home).toContain("AgentCommerceStatus compact");
    expect(home).not.toContain("AskGeomacroSection");
    expect(home).not.toContain("RiskIndicesSection");
    expect(home).not.toContain("114 sovereign countries");
    expect(home).not.toContain("eventCount");
  });

  it("keeps public commercial pages wallet-free by default", () => {
    const shell = read("src/components/site-shell.tsx");
    expect(shell).toContain("if (!address && !executionContext) return null");
    expect(shell).toContain('pathname === "/arena"');
    expect(shell).toContain('pathname === "/onchain"');
    expect(shell).toContain('pathname === "/bridge-swap"');
    expect(shell).not.toContain('pathname === "/intelligence" ||');
    expect(shell).not.toContain('pathname === "/ecosystem" ||');
  });

  it("keeps Risk Gate within the verified Private Pilot scope", () => {
    const route = read("src/routes/risk-gate.tsx");
    expect(route).toContain("PRIVATE PILOT");
    expect(route).toContain("country or corridor Risk Object");
    expect(route).toContain("execution_authorized = false");
    expect(route).toContain("directional corridors composed from endpoints plus eligible bilateral evidence");
    expect(route).toContain("Full physical-route and counterparty modelling are not claimed");
    expect(route).not.toContain("country, corridor and event risk");
  });

  it("keeps institutional workflow in Risk Gate -> customer policy -> customer action order", () => {
    const route = read("src/routes/institutional.tsx");
    expect(route).not.toContain("Risk Gate combines a verified country or corridor Risk Object with the customer's own policy");
    expect(route).toContain("Risk Gate verifies the country or corridor Risk Object and returns bounded external risk context and a recommendation");
    const gate = route.indexOf("Risk Gate returns bounded decision context");
    const policy = route.indexOf("The customer's own identity, permissions and policy layer applies its rules after the Risk Gate response");
    const execution = route.indexOf("Any execution after that remains under the customer's control");
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(gate);
    expect(execution).toBeGreaterThan(policy);
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

  it("keeps Circle Alliance membership verifiable without implying endorsement", () => {
    const ecosystem = read("src/routes/ecosystem.tsx");
    expect(ecosystem).toContain("https://partners.circle.com/partner/geomacro");
    expect(ecosystem).toContain("Geomacro is listed in Circle's Alliance Directory");
    expect(ecosystem).toContain("does not mean Circle endorses Geomacro's risk methodology");
    expect(ecosystem).not.toContain("Official Circle Partner");
  });

  it("keeps Arc/Circle and market routes explicitly technical proof", () => {
    for (const path of ["src/routes/arena.tsx", "src/routes/onchain.tsx", "src/routes/bridge-swap.tsx"]) expect(read(path)).toContain("TechnicalProofBanner");
    const arena = read("src/routes/arena.tsx");
    expect(arena).toContain("permanently locked to Arc Testnet as secondary technical proof");
    expect(arena).toContain("not planning a prediction-market mainnet or real-money launch");
    const onchain = read("src/components/sections/onchain-section.tsx");
    expect(onchain).toContain("Arc public mainnet launched on 16 Sep 2026");
    expect(onchain).toContain("Geomacro mainnet transaction features remain intentionally disabled");
  });

  it("keeps the active roadmap intelligence-first and removes the stale market-first source of truth", () => {
    const roadmap = read("src/components/sections/roadmap-section.tsx");
    expect(roadmap).toContain("Public risk intelligence");
    expect(roadmap).toContain("Commercial hardening");
    expect(roadmap).toContain("Institutional Early Access");
    expect(roadmap).toContain("Production expansion");
    expect(roadmap).toContain("What works today, and what comes next.");
    expect(roadmap).toContain("Risk Gate, signed Risk Objects and commercial API delivery remain roadmap / controlled Private Pilot capabilities");
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

  it("keeps the audited GRI lineage on the three-domain v1.2 contract", () => {
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
    expect(sitemap).toContain("https://geomacro.live/ecosystem");
    expect(sitemap).toContain("https://geomacro.live/docs/51-summary");
    expect(sitemap).not.toContain("https://geomacro.live/feed</loc>");
  });
});
