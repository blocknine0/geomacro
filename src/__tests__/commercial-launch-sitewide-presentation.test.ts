import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("Geomacro post-launch commercial website presentation", () => {
  const shell = read("src/components/site-shell.tsx");
  const pricing = read("src/routes/pricing.tsx");
  const api = read("src/routes/pricing.tsx");
  const riskGate = read("src/routes/risk-gate.tsx");
  const about = read("src/routes/about.tsx");
  const institutional = read("src/routes/institutional.tsx");
  const research = read("src/routes/research.tsx");
  const retired = read("server/middleware/05-retire-noncommercial-surfaces.ts");

  it("uses navigable buyer-ready intelligence, indices, ask, API, institutions and pricing", () => {
    for (const route of ["/intelligence", "/risk-indices", "/ask-geomacro", "/institutional", "/pricing"]) {
      expect(shell).toContain(`to: "${route}"`);
    }
    expect(shell).not.toContain('to: "/global-risk"');
    expect(shell).toContain('<Link to="/risk-indices" className="hover:text-foreground">Risk Indices</Link>');
    expect(shell).toContain('<Link to="/about" className="hover:text-foreground">About & Trust</Link>');
    expect(institutional).toContain('href: "/intelligence"');
    expect(research).toContain('href: "/risk-indices"');
    expect(shell).not.toContain('to: "/global-risk", label: "Risk Indices"');
  });

  it("offers the store catalog and launch enquiries without fake checkout", () => {
    const notice = read("src/components/api-keys-notice.tsx");
    const catalog = read("src/components/capability-price-schedule.tsx");
    expect(pricing).toContain("Geomacro Store");
    expect(pricing).toContain("<CapabilityPriceSchedule />");
    expect(read("src/routes/data-api.tsx")).toContain('redirect({ to: "/pricing", replace: true })');
    expect(pricing).toContain("<CategoryApiPricing />");
    expect(api).toContain("CategoryApiPricing");
    expect(read("src/components/category-api-pricing.tsx")).toContain("There is no category surcharge.");
    expect(notice).toContain("API keys");
    expect(notice).toContain("Coming soon");
    expect(notice).toContain("Self-service access and checkout are not open yet.");
    expect(catalog).toContain("GEOMACRO_CAPABILITY_PRICES");
    expect(catalog).toContain("Enquire about this product");
    expect(catalog).not.toContain("Buy now");
  });

  it("keeps technical and noncommercial messaging away from the main buyer journey", () => {
    for (const s of [shell, pricing, api, about, riskGate]) {
      expect(s).not.toMatch(/raw article text|prediction markets|bridge & swap|testnet USDC/iu);
    }
    expect(shell).not.toContain("AgentCommerceStatus compact");
    expect(api).toContain("API & Agents");
    expect(api).toContain("All products deliver structured Geomacro JSON.");
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
    expect(api).toContain("<ApiKeysNotice />");
    expect(api).toContain("Paid API requests become available only when the live payment");
    expect(pricing).toContain("ApiKeysNotice");
    expect(riskGate).toContain("execution_authorized = false");
  });
});
