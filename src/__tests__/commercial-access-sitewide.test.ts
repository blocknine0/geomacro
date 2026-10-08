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
    expect(shell).toContain('import { CommercialAccessGuide } from "@/components/commercial-access-guide"');
    expect(shell).toContain('pathname === "/pricing" ? null : <CommercialAccessGuide />');
    expect(guide).toContain('aria-label="Choose how to access Geomacro"');
    expect(guide).toContain('to="/pricing"');
  });

  it("distinguishes public free exploration from charged API and monthly enquiries", () => {
    expect(guide).toContain("Explore free");
    expect(guide).toContain("Browse public Intelligence and Risk Indices");
    expect(guide).toContain("Ask Geomacro and read research");
    expect(guide).toContain("Pay per call");
    expect(guide).toContain("0.05 USDC per successful delivery");
    expect(guide).toContain("Structured intelligence for APIs and AI agents");
    expect(guide).toContain("Monthly access");
    expect(guide).toContain("Recurring intelligence for teams and workflows");
    expect(guide).toContain('mailto:contact@geomacro.live?subject=Geomacro%20monthly');
    expect(guide).toContain("Monthly subscription checkout is Coming Soon; plan enquiries are open.");
    expect(pricing).toContain("Monthly subscriptions are Coming Soon. You can request a tailored plan and quote now.");
    expect(pricing).toContain("Annual & enterprise");
  });

  it("provides buyer action on Intelligence, Ask and Docs without promising paid availability", () => {
    expect(intelligence).toContain("Free to browse.");
    expect(intelligence).toContain("compare access options");
    expect(ask).toContain("Ask a public risk question for free");
    expect(ask).toContain("compare API and monthly access");
    expect(docs).toContain("Explore free Intelligence");
    expect(docs).toContain("Compare API & monthly access");
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
    expect(roadmap).toContain("Enterprise agreements and support");
    expect(contact).toContain("Scope, service terms and access are agreed before commercial delivery.");
  });
});
