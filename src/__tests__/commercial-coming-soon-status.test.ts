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

  it("marks free explorer available while monthly self-service remains Coming Soon", () => {
    expect(guide).toContain('"Available now"');
    expect(guide).toContain('"Coming Soon · enquiries open"');
    expect(guide).toContain("Monthly subscription checkout is Coming Soon");
    expect(pricing).toContain("Coming Soon · Monthly checkout");
    expect(pricing).toContain("Monthly subscriptions are Coming Soon");
    expect(pricing).toContain("Request monthly access");
    expect(homepage).toContain("Monthly access · Coming Soon");
    expect(pricing).not.toContain("Subscribe now");
  });

  it("does not hardcode paid API availability when production activation has not been proven", () => {
    expect(guide).toContain("useAgentCommerceStatus()");
    expect(guide).toContain('commerce.mode === "production"');
    expect(guide).toContain('"Check live checkout"');
    expect(guide).toContain('"Coming Soon"');
    expect(commerce).toContain("Coming Soon · x402 commercial access · production activation pending");
    expect(commerce).toContain('state.mode === "production"');
    expect(api).toContain("AgentCommerceStatus");
  });

  it("preserves restricted pilot status but labels unrestricted public access Coming Soon", () => {
    expect(riskGate).toContain(">PRIVATE PILOT</Badge>");
    expect(riskGate).toContain("Coming Soon for general access");
    expect(shell).toContain("Risk Gate · Private Pilot");
    expect(shell).toContain("Public access Coming Soon");
    expect(riskGate).toContain("execution_authorized = false");
  });

  it("does not present autonomous agent and future services as active products", () => {
    expect(api).toContain("Standalone Geomacro AI Agent:");
    expect(api).toContain("Coming Soon");
    expect(roadmap).toContain("COMING SOON · IN PROGRESS");
    expect(roadmap).toContain("COMING SOON · EARLY ACCESS");
    expect(roadmap).toContain("COMING SOON · FUTURE");
    expect(policy).toContain("PLANNED / COMING SOON");
    expect(policy).toContain("Coming Soon");
  });

  it("keeps working annual enterprise email enquiries open and never invents subscription prices", () => {
    expect(pricing).toContain("Email enterprise sales");
    expect(pricing).toContain("mailto:contact@geomacro.live?subject=Geomacro%20annual");
    expect(pricing).toContain("Annual pricing is quoted directly");
    expect(guide).not.toContain("monthly_price_usdc");
    expect(guide).not.toContain("Unlimited calls");
  });
});
