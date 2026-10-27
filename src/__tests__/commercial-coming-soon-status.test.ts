import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("Coming Soon status is truthful across commercial website", () => {
  const guide = read("src/components/commercial-access-guide.tsx");
  const pricing = read("src/routes/pricing.tsx");
  const homepage = read("src/components/home/live-intelligence-showcase.tsx");
  const api = read("src/routes/data-api.tsx");
  const riskGate = read("src/routes/risk-gate.tsx");
  const shell = read("src/components/site-shell.tsx");
  const roadmap = read("src/components/sections/roadmap-section.tsx");
  const commerce = read("src/components/agent-commerce-status.tsx");
  const policy = read("src/content/docs/48-status-labels.md");

  it("marks store browsing free while API keys and self-service checkout remain coming soon", () => {
    const notice = read("src/components/api-keys-notice.tsx");
    expect(pricing).toContain("Just exploring?");
    expect(pricing).toContain("<ApiKeysNotice />");
    expect(notice).toContain("API keys");
    expect(notice).toContain("Coming soon");
    expect(notice).toContain("Self-service access and checkout are not open yet.");
    expect(shell).not.toContain("<CommercialAccessGuide />");
    expect(pricing).not.toContain("Subscribe now");
  });

  it("does not hardcode paid API availability when production activation has not been proven", () => {
    expect(guide).toContain("useAgentCommerceStatus()");
    expect(guide).toContain('commerce.mode === "production"');
    expect(guide).toContain('"Check live checkout"');
    expect(guide).toContain('"Coming Soon"');
    expect(commerce).toContain("Mainnet USDC · production activation pending");
    expect(commerce).toContain('state.mode === "production"');
    expect(api).toContain("<ApiKeysNotice />");
  });

  it("preserves restricted pilot status but labels unrestricted public access Coming Soon", () => {
    expect(riskGate).toContain(">PRIVATE PILOT</Badge>");
    expect(riskGate).toContain("Coming Soon for general access");
    expect(shell).not.toContain('to: "/risk-gate"');
    expect(shell).not.toContain('to="/risk-gate"');
    expect(riskGate).toContain("execution_authorized = false");
  });

  it("does not present autonomous agent and future services as active products", () => {
    expect(api).not.toContain("CategoryApiLaunchPanel");
    const buyer = read("src/components/category-api-launch-panel.tsx");
    expect(buyer).toContain("published_only");
    expect(buyer).toContain("response.status!==402");
    expect(roadmap).toContain("API keys · Coming soon");
    expect(roadmap).toContain("Scoped pilot integrations remain available by agreement.");
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
