import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("commercial access is explained sitewide", () => {
  const guide = read("src/components/commercial-access-guide.tsx");
  const shell = read("src/components/site-shell.tsx");
  const pricing = read("src/routes/pricing.tsx");
  const intelligence = read("src/routes/intelligence.tsx");
  const ask = read("src/components/ask/ask-workspace.tsx");
  const docs = read("src/routes/docs.tsx");
  const docMetadata = read("src/routes/docs_.$slug.tsx");

  it("shares one commercial access guide with every route except pricing, where the comparison is already complete", () => {
    expect(shell).not.toContain('import { CommercialAccessGuide }');
    expect(shell).toContain('{ to: "/pricing", label: "Store & API" }');
    expect(guide).toContain('aria-label="Choose how to access Geomacro"');
    expect(guide).toContain('to="/pricing"');
    expect(shell.split('<Link to="/contact" className="hover:text-foreground">Contact</Link>').length - 1).toBe(1);
    expect(shell).toContain("X (@GeomacroLive)");
    expect(shell).not.toContain("Twitter");
  });

  it("distinguishes public free exploration from charged API and monthly enquiries", () => {
    expect(guide).toContain("Explore free");
    expect(guide).toContain("Browse public Intelligence and Risk Indices");
    expect(guide).toContain("Ask Geomacro and read research");
    expect(guide).toContain("Pay per call");
    expect(guide).toContain("Exact USDC price by capability");
    const schedule=read("src/components/capability-price-schedule.tsx");
    const dataApi=read("src/routes/pricing.tsx");
    expect(schedule).toContain("GEOMACRO_CAPABILITY_PRICES");
    expect(schedule).toContain("GEOMACRO_PUBLIC_PRICING_GROUPS");
    expect(schedule).toContain("GEOMACRO_CAPABILITY_PRICING_VERSION");
    expect(schedule).toContain("without a second object charge");
    expect(pricing).not.toContain("<CapabilityPriceSchedule />");
    expect(read("src/routes/data-api.tsx")).toContain('redirect({ to: "/pricing", replace: true })');
    expect(pricing).not.toContain("Launch price for the first 20,000");
    expect(dataApi).not.toContain("Launch price for the first 20,000");
    expect(guide).toContain("Structured intelligence for APIs and AI agents");
    expect(guide).toContain("Prepaid API access");
    expect(guide).toContain("Arc, Base, and Polygon mainnet checkout");
    expect(guide).toContain("Direct pay-per-call needs no account");
    expect(guide).toContain("execution_authorized: false");
    const notice = read("src/components/api-keys-notice.tsx");
    expect(notice).toContain("POST https://geomacro.live/api/v1/payments/usdc-risk-gate");
    expect(notice).toContain("POST https://geomacro.live/api/v1/risk-gate");
    expect(notice).toContain("GET https://geomacro.live/v1/risk-stream/commercial-public-key");
    expect(notice).toContain("No account needed");
    expect(notice).toContain("Base (8453), Polygon PoS (137), and Arc (5042)");
    expect(notice).toContain("$0.15 BASIC / $0.20 STANDARD / $0.30 COMPLEX");
    expect(notice).toContain("Insufficient evidence costs $0");
    expect(notice).toContain("live Arc, Base, or Polygon checkout");
    expect(pricing).toContain("Building for a team?");
  });

  it("provides buyer action on Intelligence, Ask and Docs without promising paid availability", () => {
    expect(intelligence).toContain("Unlock Ed25519-Signed Risk Gate &amp; AI-Agent JSON");
    expect(intelligence).toContain('to="/pricing"');
    expect(ask).toContain("Public chat is free; structured API products use separate x402 pricing.");
    expect(ask).toContain("compare API and monthly access");
    expect(docs).toContain("Explore free Intelligence");
    expect(docs).toContain("Visit Store");
  });

  it("does not expose editorial content type labels or a synthetic live subscription", () => {
    expect(docMetadata).toContain('{ property: "og:type", content: "website" }');
    expect(docMetadata).toContain('"@type": "WebPage"');
    expect(docMetadata).not.toContain('content: "article"');
    expect(docMetadata).not.toContain('"@type": "TechArticle"');
    expect(guide).not.toContain("Subscribe now");
    expect(guide).not.toContain("Unrestricted API");
    expect(guide).not.toContain("Guaranteed coverage");
  });

  it("avoids technical jargon in first view while preserving governance references", () => {
    const roadmap = read("src/components/sections/roadmap-section.tsx");
    const contact = read("src/routes/contact.tsx");
    expect(intelligence).toContain("Previous verified risk assessments remain available for comparison");
    expect(roadmap).not.toContain("API keys · Coming soon");
    expect(roadmap).toContain("Store & API access");
    expect(contact).toContain("Do not send private keys, seed phrases or production secrets.");
  });
});
