import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
describe("commercial public surface v2", () => {
  it("uses separate Risk Indices as the current public product across buyer-facing pages", () => {
    const surfaces = ["src/routes/index.tsx","src/routes/about.tsx","src/routes/ask-geomacro.tsx","src/routes/research.tsx","src/routes/docs.tsx","src/routes/data-api.tsx","src/routes/roadmap.tsx","src/components/home/commercial-home.tsx","src/components/ask/ask-workspace.tsx","src/components/intelligence/event-detail-workspace.tsx"].map(read);
    for (const surface of surfaces) {
      expect(surface).not.toContain("View Global Risk Index"); expect(surface).not.toContain("Open Global Risk Index"); expect(surface).not.toContain("Verified GRI snapshot unavailable");
    }
    expect(read("src/routes/about.tsx")).toContain("Geopolitical, Macroeconomic and Critical Minerals Risk Indices");
    expect(read("src/routes/data-api.tsx")).toContain("Risk Indices");
    expect(read("src/routes/data-api.tsx")).toContain("methodology context");
    expect(read("src/routes/research.tsx")).toContain("Separate public indices, preserved audited lineage");
  });
  it("keeps GRI v1.2 as proof lineage rather than a second current headline product", () => {
    expect(read("src/routes/about.tsx")).toContain("audited GRI v1.2 proof lineage"); expect(read("src/routes/research.tsx")).toContain("historical combined GRI remains a versioned proof record"); expect(read("public/llms.txt")).toContain("Historical combined-GRI snapshots remain versioned audit records");
  });
  it("exposes buyer-ready trust, privacy, product-use and security-contact boundaries", () => {
    const about=read("src/routes/about.tsx"), shell=read("src/components/site-shell.tsx"); expect(about).toContain('id="privacy"'); expect(about).toContain('id="product-use"'); expect(shell).toContain('href="/about#privacy"'); expect(existsSync(join(ROOT,"public/.well-known/security.txt"))).toBe(true);
  });
  it("keeps the coverage proof dated and off the homepage", () => {
    const proof=read("src/components/production-coverage-proof.tsx"), shell=read("src/components/site-shell.tsx"); expect(proof).toContain("Controlled coverage evidence · verified 16 Sep 2026"); expect(proof).toContain("dated controlled-workflow coverage result");
    const routesBlock=shell.slice(shell.indexOf("const PRODUCTION_EVIDENCE_ROUTES"), shell.indexOf("const GITHUB_URL")); expect(routesBlock).not.toContain('"/",'); for(const route of ["/risk-gate","/data-api","/research","/institutional","/about"]) expect(routesBlock).toContain(`"${route}"`);
  });
  it("qualifies commercial conversations before sensitive pilot work", () => { const contact=read("src/routes/contact.tsx"); expect(contact).toContain("Bring a real risk workflow"); expect(contact).toContain("Do not email seed phrases, private keys, production secrets"); });
  it("documents fail-soft public Risk Indices without synthetic fallback", () => { const a=read("src/content/docs/12-data-availability.md"), w=read("src/components/risk-indices/risk-indices-workspace.tsx"); expect(a).toContain("a previously verified reading stays visible if a later refresh fails"); expect(w).toContain("Refreshing verified readings"); expect(w).not.toContain("risk.error?.message"); });
  it("keeps machine discovery aligned with the same three-domain commercial identity", () => { const a=read("public/.well-known/geomacro-agent.json"), c=read("public/.well-known/geomacro-commerce.json"); expect(a).toContain("critical-mineral risk intelligence"); expect(a).toContain('"current_public_risk_indices": true'); expect(c).toContain("critical-mineral risk intelligence"); });
});
