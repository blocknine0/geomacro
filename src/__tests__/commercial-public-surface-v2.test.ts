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
    expect(read("src/routes/data-api.tsx")).toContain("Current public Risk Indices and methodology context");
    expect(read("src/routes/research.tsx")).toContain("Separate public indices, preserved audited lineage");
  });

  it("keeps GRI v1.2 as proof lineage rather than a second current headline product", () => {
    const about = read("src/routes/about.tsx");
    const research = read("src/routes/research.tsx");
    const docs = read("src/routes/docs.tsx");
    const llms = read("public/llms.txt");

    expect(about).toContain("audited GRI v1.2 proof lineage");
    expect(about).toContain("not a second live headline index");
    expect(research).toContain("historical combined GRI remains a versioned proof record");
    expect(docs).toContain("Historical GRI material therefore remains available as a methodology and audit reference");
    expect(llms).toContain("Historical combined-GRI snapshots remain versioned audit records");
  });

  it("exposes buyer-ready trust, privacy, product-use and security-contact boundaries", () => {
    const about = read("src/routes/about.tsx");
    const shell = read("src/components/site-shell.tsx");
    const securityPath = join(ROOT, "public/.well-known/security.txt");

    expect(about).toContain('id="privacy"');
    expect(about).toContain('id="product-use"');
    expect(about).toContain("There is no claim of an independent external security audit");
    expect(about).toContain("Risk Gate remains non-authorizing");
    expect(shell).toContain('href="/about#privacy"');
    expect(shell).toContain('href="/about#product-use"');
    expect(existsSync(securityPath)).toBe(true);
    expect(read("public/.well-known/security.txt")).toContain("contact@geomacro.live");
  });

  it("keeps the coverage banner dated and non-production-claiming", () => {
    const proof = read("src/components/production-coverage-proof.tsx");
    const shell = read("src/components/site-shell.tsx");

    expect(proof).toContain("Controlled coverage evidence · verified 16 Sep 2026");
    expect(proof).toContain("dated controlled-workflow coverage result");
    expect(proof).not.toContain("Production workflow evidence");
    expect(shell).toContain("Dated 114-country controlled-workflow evidence");
    expect(shell).not.toContain("114-country production-workflow proof");
  });

  it("qualifies commercial conversations before sensitive pilot work", () => {
    const contact = read("src/routes/contact.tsx");

    expect(contact).toContain("Bring a real risk workflow");
    expect(contact).toContain("The decision point Geomacro would support");
    expect(contact).toContain("How you would judge a useful pilot");
    expect(contact).toContain("Do not email seed phrases, private keys, production secrets");
    expect(contact).toContain("Agree any commercial, support, security and data-handling boundaries");
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
