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
  "src/routes/agent-access.tsx",
  "src/routes/about.tsx",
  "src/routes/institutional.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/data-api.tsx",
] as const;

const STALE_PRIMARY_POSITIONING = [
  "autonomous prediction market",
  "natively settled in usdc on arc",
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

    for (const token of CANONICAL_ARCHITECTURE_TOKENS) {
      expect(canonical, `canonical contract is missing architecture node: ${token}`).toContain(token);
    }

    for (const route of [
      "/intelligence",
      "/global-risk",
      "/ask-geomacro",
      "/agent-access",
      "/risk-gate",
      "/data-api",
      "/institutional",
      "/research",
      "/docs",
      "/about",
      "/testnet-access",
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

  it("keeps the primary navigation focused and moves supporting material into Resources", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain('label: "Intelligence"');
    expect(shell).toContain('label: "Risk Indices"');
    expect(shell).toContain('label: "Ask Geomacro"');
    expect(shell).toContain('label: "Access & Pricing"');
    expect(shell).toContain('label: "Risk Gate"');
    expect(shell).toContain('label: "For Institutions"');
    expect(shell).toContain('label: "Data & API"');
    expect(shell).toContain('label: "Research"');
    expect(shell).toContain('label: "Documentation"');
    expect(shell).toContain("Resources");
    expect(shell).toContain("Technical Proof");
    expect(shell).toContain('label: "Prediction Markets"');
    expect(shell).toContain('label: "Bridge & Swap"');
    expect(shell).toContain('title="Product"');
    expect(shell).toContain('title="Resources"');
    expect(shell).toContain('title="Technical proof"');
  });

  it("keeps the homepage optimized for fast comprehension rather than procurement evidence", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const shell = read("src/components/site-shell.tsx");
    const evidenceRoutes = shell.match(/const PRODUCTION_EVIDENCE_ROUTES = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";

    expect(home).toContain("Geomacro in 40 seconds");
    expect(home).toContain("Understand global risk");
    expect(home).toContain("Agent pay-per-call · Mainnet pre-launch");
    expect(home).toContain("Risk Gate · Private Pilot");
    expect(home).toContain("Free for evaluation. Paid when you need depth, automation or scale.");
    expect(home).toContain("execution_authorized");
    expect(home).toContain("Secondary technical proof");
    expect(home).toContain("prediction markets remain Testnet-only");
    expect(evidenceRoutes).not.toContain('"/"');
  });

  it("keeps public intelligence and commercial-information surfaces wallet-free by default", () => {
    const shell = read("src/components/site-shell.tsx");

    expect(shell).toContain("if (!address && !executionContext) return null");
    expect(shell).toContain('pathname === "/arena"');
    expect(shell).toContain('pathname === "/onchain"');
    expect(shell).toContain('pathname === "/bridge-swap"');
    expect(shell).not.toContain('pathname === "/intelligence" ||');
    expect(shell).not.toContain('pathname === "/agent-access" ||');
  });

  it("keeps the pay-per-call product pre-launch until production funds are authorized", () => {
    const route = read("src/routes/agent-access.tsx");

    expect(route).toContain("ACCESS & PRICING · MAINNET PAY-PER-CALL PRE-LAUNCH · REAL FUNDS OFF");
    expect(route).toContain("0.02 USDC / successful paid call");
    expect(route).toContain("Free deliverability check before payment");
    expect(route).toContain("live HTTP 402 challenge or approved provider plan is the payment authority");
    expect(route).toContain("Credit pools are usage allowances, not public monetary list prices");
    expect(route).toContain("execution_authorized=false");
    expect(route).not.toContain("Buy now");
    expect(route).not.toContain("Pay now");
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
    expect(route).toContain("LIVE · FREE");
    expect(route).toContain("MAINNET PRE-LAUNCH");
    expect(route).toContain("FOUNDING PILOT");
    expect(route).toContain("FOUNDING / PRIVATE PILOT");
    expect(route).toContain("INSTITUTIONAL");
    expect(route).toContain("POST https://geomacro.live/api/commercial/structural");
    expect(route).toContain("POST https://geomacro.live/api/x402/intelligence");
    expect(route).toContain("Free Explorer is website/dashboard access, not a free API");
    expect(route).toContain("ENDPOINT_COMPOSED_V0_1");
    expect(route).toContain("route_modeling_status = NOT_MODELED");
    expect(route).toContain("execution_authorized=false");
  });

  it("keeps Arc, Circle and market routes explicitly technical proof", () => {
    for (const path of [
      "src/routes/arena.tsx",
      "src/routes/onchain.tsx",
      "src/routes/bridge-swap.tsx",
    ]) {
      expect(read(path)).toContain("TechnicalProofBanner");
    }

    const arena = read("src/routes/arena.tsx");
    expect(arena).toContain("permanently locked to Arc Testnet as secondary technical proof");
    expect(arena).toContain("not planning a prediction-market mainnet or real-money launch");
  });

  it("keeps the active roadmap in the commercial release order", () => {
    const roadmap = read("src/components/sections/roadmap-section.tsx");

    expect(roadmap).toContain("Public intelligence foundation");
    expect(roadmap).toContain("Commercial hardening + pre-launch machine access");
    expect(roadmap).toContain("Coordinated commercial launch");
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
    expect(sitemap).toContain("https://geomacro.live/agent-access");
    expect(sitemap).toContain("https://geomacro.live/risk-gate");
    expect(sitemap).toContain("https://geomacro.live/ask-geomacro");
    expect(sitemap).toContain("https://geomacro.live/data-api");
    expect(sitemap).toContain("https://geomacro.live/docs/51-summary");
    expect(sitemap).not.toContain("https://geomacro.live/feed</loc>");
  });
});
