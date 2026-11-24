import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("published pricing and current access status are truthful across commercial website", () => {
  const guide = read("src/components/commercial-access-guide.tsx");
  const pricing = read("src/routes/pricing.tsx");
  const homepage = read("src/components/home/live-intelligence-showcase.tsx");
  const api = read("src/routes/pricing.tsx");
  const riskGate = read("src/routes/risk-gate.tsx");
  const shell = read("src/components/site-shell.tsx");
  const roadmap = read("src/components/sections/roadmap-section.tsx");
  const commerce = read("src/components/agent-commerce-status.tsx");
  const policy = read("src/content/docs/48-status-labels.md");

  it("shows published per-call pricing and an access enquiry without an API-key coming-soon banner", () => {
    const notice = read("src/components/api-keys-notice.tsx");
    expect(pricing).toContain("Just exploring?");
    expect(pricing).toContain("<ApiKeysNotice />");
    expect(notice).toContain("Per-call API pricing");
    expect(notice).toContain("Published");
    expect(notice).toContain("Contact us to confirm access for your deployment.");
    expect(notice).not.toMatch(/API keys.*coming soon/iu);
    expect(shell).not.toContain("<CommercialAccessGuide />");
    expect(pricing).not.toContain("Subscribe now");
  });

  it("shows mainnet USDC access options without hardcoding payment activation", () => {
    expect(guide).toContain("useAgentCommerceStatus()");
    expect(guide).toContain('commerce.mode === "production"');
    expect(guide).toContain('"Mainnet USDC · activation confirmed"');
    expect(guide).toContain('"Mainnet USDC · activation required"');
    expect(guide).toContain("/api/v1/payments/usdc-risk-gate");
    expect(guide).toContain("Live checks govern checkout and crediting.");
    expect(commerce).toContain("Mainnet USDC · production activation pending");
    expect(commerce).toContain('state.mode === "production"');
    expect(api).toContain("<ApiKeysNotice />");
  });

  it("preserves restricted pilot status and states the bounded mainnet payment options", () => {
    expect(riskGate).toContain(">PRIVATE PILOT</Badge>");
    expect(riskGate).toContain("mainnet USDC pay-per-call");
    expect(riskGate).toContain("USDC packs");
    expect(riskGate).toContain("Arc, Base, and Polygon");
    expect(riskGate).not.toContain("Coming Soon for general access");
    expect(shell).not.toContain('to: "/risk-gate"');
    expect(shell).not.toContain('to="/risk-gate"');
    expect(riskGate).toContain("execution_authorized = false");
  });

  it("does not present autonomous agent and future services as active products", () => {
    expect(api).not.toContain("CategoryApiLaunchPanel");
    const buyer = read("src/components/category-api-launch-panel.tsx");
    expect(buyer).toContain("published_only");
    expect(buyer).toContain("response.status!==402");
    expect(roadmap).not.toContain("API keys · Coming soon");
    expect(roadmap).toContain("Store & API access");
    expect(roadmap).toContain("Each commercial request needs its own eligible result and payment quote.");
    expect(roadmap).toContain("Marketplace listings · Planned");
    expect(policy).toContain("PLANNED / COMING SOON");
    expect(policy).toContain("Coming Soon");
  });

  it("keeps working annual enterprise email enquiries open and never invents subscription prices", () => {
    expect(pricing).toContain("Building for a team?");
    expect(pricing).toContain('to="/contact"');
    expect(read("src/routes/contact.tsx")).toContain("mailto:contact@geomacro.live");
    expect(guide).not.toContain("monthly_price_usdc");
    expect(guide).not.toContain("Unlimited calls");
  });
});
