import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("Geomacro post-launch commercial website presentation", () => {
  const shell = read("src/components/site-shell.tsx");
  const pricing = read("src/routes/pricing.tsx");
  const api = read("src/routes/data-api.tsx");
  const riskGate = read("src/routes/risk-gate.tsx");
  const about = read("src/routes/about.tsx");
  const institutional = read("src/routes/institutional.tsx");
  const research = read("src/routes/research.tsx");
  const retired = read("server/middleware/05-retire-noncommercial-surfaces.ts");

  it("uses navigable buyer-ready intelligence, indices, ask, API, institutions and pricing", () => {
    for (const route of ["/intelligence", "/risk-indices", "/ask-geomacro", "/data-api", "/institutional", "/pricing"]) {
      expect(shell).toContain(`to: "${route}"`);
    }
    expect(shell).toContain('to: "/global-risk", label: "Global Risk History"');
    expect(shell).toContain('<Link to="/risk-indices" className="hover:text-foreground">Risk Indices</Link>');
    expect(shell).toContain('<Link to="/about" className="hover:text-foreground">About & Trust</Link>');
    expect(institutional).toContain('<Link to="/risk-indices">Risk Indices</Link>');
    expect(research).toContain('<Link to="/risk-indices">Verify current Risk Indices');
    expect(shell).not.toContain('to: "/global-risk", label: "Risk Indices"');
  });

  it("offers all three commercial buying paths without faking checkout or entitlements", () => {
    expect(pricing).toContain("Free Explorer");
    expect(pricing).toContain("0.05");
    expect(pricing).toContain("20,000");
    expect(pricing).toContain("Monthly access");
    expect(pricing).toContain("mailto:contact@geomacro.live?subject=Geomacro%20monthly");
    expect(pricing).toContain("Annual & enterprise");
    expect(pricing).toContain("mailto:contact@geomacro.live?subject=Geomacro%20annual");
    expect(pricing).toContain("Monthly self-service checkout is not yet available");
    expect(pricing).toContain("Pay-per-call availability is confirmed by the live checkout");
  });

  it("keeps technical and noncommercial messaging away from the main buyer journey", () => {
    for (const s of [shell, pricing, api, about, riskGate]) {
      expect(s).not.toMatch(/raw article text|prediction markets|bridge & swap|testnet USDC/iu);
    }
    expect(shell).not.toContain("AgentCommerceStatus compact");
    expect(api).toContain("INTELLIGENCE API · AI AGENTS");
    expect(api).toContain("Get concise, structured Geomacro intelligence built for decisions");
    expect(api).not.toContain("Runtime truth, not marketing copy");
    expect((riskGate.match(/>PRIVATE PILOT<\/Badge>/gu) ?? []).length).toBe(1);
    expect(about).toContain("The customer remains responsible for any decision or action");
  });

  it("retires every legacy experimental public and API entry without breaking archived internal implementation", () => {
    for (const route of ["/testnet-access", "/testnet-console", "/bridge", "/bridge-swap", "/onchain", "/portfolio", "/demo", "/tameion"]) {
      expect(retired).toContain(`["${route}",`);
    }
    expect(retired).toContain("statusCode: 404");
    expect(shell).not.toContain('to: "/bridge"');
    expect(shell).not.toContain('to: "/onchain"');
  });

  it("keeps legal/trust disclosures and live paid-activation boundaries available", () => {
    expect(about).toContain('id="privacy"');
    expect(about).toContain('id="product-use"');
    expect(about).toContain("Risk Gate remains non-authorizing");
    expect(api).toContain("AgentCommerceStatus");
    expect(api).toContain("Paid API requests become available only when the live payment");
    expect(pricing).toContain("AgentCommerceStatus");
    expect(riskGate).toContain("execution_authorized = false");
  });
});
