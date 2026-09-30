import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("commercial public surface v2", () => {
  it("uses separate Risk Indices as the current public product across buyer-facing pages", () => {
    const surfaces = [
      read("src/routes/index.tsx"),
      read("src/routes/about.tsx"),
      read("src/routes/ask-geomacro.tsx"),
      read("src/routes/research.tsx"),
      read("src/routes/docs.tsx"),
      read("src/routes/data-api.tsx"),
      read("src/routes/roadmap.tsx"),
      read("src/components/home/commercial-home.tsx"),
      read("src/components/ask/ask-workspace.tsx"),
      read("src/components/intelligence/event-detail-workspace.tsx"),
    ];

    for (const surface of surfaces) {
      expect(surface).not.toContain("View Global Risk Index");
      expect(surface).not.toContain("Open Global Risk Index");
      expect(surface).not.toContain("Open the Global Risk Index");
      expect(surface).not.toContain("Verified GRI snapshot unavailable");
      expect(surface).not.toContain("Verified snapshot unavailable");
    }

    expect(read("src/routes/about.tsx")).toContain("Geopolitical, Macroeconomic and Critical Minerals Risk Indices");
    expect(read("src/routes/data-api.tsx")).toContain("Separate Geopolitical, Macroeconomic and Critical Minerals Risk Indices");
    expect(read("src/routes/research.tsx")).toContain("Separate public indices, preserved versioned lineage.");
  });

  it("keeps GRI v1.2 as proof lineage rather than a second current headline product", () => {
    const about = read("src/routes/about.tsx");
    const research = read("src/routes/research.tsx");
    const docs = read("src/routes/docs.tsx");
    const llms = read("public/llms.txt");

    expect(about).not.toContain("GRI v1.2 - Live");
    expect(about).not.toContain("combined GRI");
    expect(research).toContain("historical combined GRI remains a versioned proof record");
    expect(docs).toContain("Historical GRI material therefore remains available as a methodology and proof reference");
    expect(llms).toContain("Historical combined-GRI snapshots remain versioned audit records");
  });

  it("makes the homepage a commercial explanation surface rather than a data dashboard", () => {
    const home = read("src/components/home/commercial-home.tsx");
    const shell = read("src/components/site-shell.tsx");

    expect(home).toContain("Global risk intelligence");
    expect(home).toContain("Know what changed.");
    expect(home).toContain("Know why it matters.");
    expect(home).toContain("Three risk domains");
    expect(home).toContain("Not another raw-data feed.");
    expect(home).toContain("Built for real workflows");
    expect(home).toContain("Critical minerals & rare earths");
    expect(home).toContain("Machine and commercial access lives in dedicated product surfaces with explicit availability and product boundaries.");
    expect(home).not.toContain("AskGeomacroSection");
    expect(home).not.toContain("RiskIndicesSection");
    expect(home).not.toContain("eventCount");
    expect(home).not.toContain("114 sovereign countries");
    expect(shell).toContain('const PRODUCTION_EVIDENCE_ROUTES = new Set(["/risk-gate", "/research"]);');
  });

  it("exposes buyer-ready trust, privacy, product-use and security-contact boundaries", () => {
    const about = read("src/routes/about.tsx");
    const shell = read("src/components/site-shell.tsx");
    const securityPath = join(ROOT, "public/.well-known/security.txt");

    expect(about).toContain('id="privacy"');
    expect(about).toContain('id="product-use"');
    expect(about).toContain("No independent external security certification or production SLA is claimed unless actually completed or contracted.");
    expect(about).toContain("Risk Gate remains non-authorizing");
    expect(shell).toContain('href="/about#privacy"');
    expect(shell).toContain('href="/about#product-use"');
    expect(existsSync(securityPath)).toBe(true);
    expect(read("public/.well-known/security.txt")).toContain("contact@geomacro.live");
  });

  it("keeps the Circle Alliance claim verifiable and explicitly non-endorsing on the ecosystem surface", () => {
    const ecosystem = read("src/routes/ecosystem.tsx");
    const home = read("src/components/home/commercial-home.tsx");

    expect(ecosystem).toContain("https://partners.circle.com/partner/geomacro");
    expect(ecosystem).toContain("Circle Alliance");
    expect(ecosystem).toContain("It does not mean Circle endorses Geomacro");
    expect(ecosystem).not.toContain("Official Circle Partner");
    expect(home).not.toContain("Official Circle Partner");
  });

  it("keeps runtime agent-commerce status truthful without promoting paid x402 as homepage content", () => {
    const status = read("src/components/agent-commerce-status.tsx");
    const home = read("src/components/home/commercial-home.tsx");
    const dataApi = read("src/routes/data-api.tsx");

    expect(status).toContain('/api/x402/intelligence');
    expect(status).toContain('environment === "production"');
    expect(status).toContain("controlled pre-launch");
    expect(status).toContain("Testnet settlement is not commercial revenue");
    expect(dataApi).toContain("AgentCommerceStatus");
    expect(dataApi).toContain("x402 pay per call");
    expect(dataApi).toContain("Real-money x402 access stays fail-closed");
    expect(home).not.toContain("AgentCommerceStatus compact");
    expect(home).not.toContain("0.05 USDC");
    expect(home).not.toContain("x402 pay per call");
  });

  it("qualifies commercial conversations before sensitive pilot work", () => {
    const contact = read("src/routes/contact.tsx");

    expect(contact).toContain("Bring the workflow.");
    expect(contact).toContain("What decision or review should Geomacro support?");
    expect(contact).toContain("What would make the evaluation useful enough to continue?");
    expect(contact).toContain("Do not send seed phrases, private keys, production secrets or unnecessary personal/confidential data by email.");
    expect(contact).toContain("The fastest conversation starts with the decision you are trying to improve");
  });

  it("documents fail-soft public Risk Indices without synthetic fallback", () => {
    const availability = read("src/content/docs/12-data-availability.md");
    const workspace = read("src/components/risk-indices/risk-indices-workspace.tsx");

    expect(availability).toContain("a previously verified reading stays visible if a later refresh fails");
    expect(availability).toContain("neutral refreshing/loading state");
    expect(availability).toContain("does not receive a synthetic or zero-risk substitute");
    expect(workspace).toContain("Refreshing verified readings");
    expect(workspace).not.toContain("risk.error?.message");
  });

  it("keeps machine discovery aligned with the same three-domain commercial identity", () => {
    const agentContract = read("src/lib/geomacro-agent-contract.ts");
    const agentDiscovery = read("public/.well-known/geomacro-agent.json");
    const commerceDiscovery = read("public/.well-known/geomacro-commerce.json");

    expect(agentContract).toContain("critical-mineral risk intelligence");
    expect(agentDiscovery).toContain("critical-mineral risk intelligence");
    expect(agentDiscovery).toContain('"current_public_risk_indices": true');
    expect(commerceDiscovery).toContain("critical-mineral risk intelligence");
    expect(commerceDiscovery).toContain('"critical minerals risk"');
  });
});
