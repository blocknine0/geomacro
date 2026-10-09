import { beforeEach, describe, expect, it, vi } from "vitest";

const canonical = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), OPTIONS: vi.fn() }));
vi.mock("./mainnet-intelligence-endpoint.server", () => ({ mainnetIntelligenceHandlers: canonical }));
import { createCategoryIntelligenceHandlers } from "./category-intelligence-alias.server";

const categories = [
  { category: "geopolitics", topics: ["conflict_geopolitics"], requiredModules: ["geopolitical_security"] },
  { category: "macro-fx", topics: ["macro_risk", "fx_external_risk"], requiredModules: ["external_fx", "macro_monetary", "sovereign_fiscal"] },
  { category: "critical-minerals", topics: ["critical_minerals"], requiredModules: ["critical_minerals"] },
] as const;

beforeEach(() => vi.resetAllMocks());

describe("category HTTP discovery and canonical dispatch", () => {
  it.each(categories)("advertises only $category while retaining actual runtime mode", async (config) => {
    const path = `/api/v1/intelligence/${config.category}`;
    canonical.GET.mockResolvedValue(Response.json({
      ok: true, topics: ["risk_object"], endpoint: "https://geomacro.live/api/v1/intelligence/query",
      environment: "testnet", network: "eip155:84532", execution_authorized: false,
    }, { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } }));
    const response = await createCategoryIntelligenceHandlers({ ...config, path }).GET({
      request: new Request(`https://geomacro.live${path}?topics=risk_object`),
    });
    const body = await response.json();
    expect(body.endpoint).toBe(`https://geomacro.live${path}`);
    expect(body.canonical_endpoint).toBe("https://geomacro.live/api/v1/intelligence/query");
    expect(body.category).toBe(config.category);
    expect(body.topics).toEqual(config.topics);
    expect(body.required_modules).toEqual(config.requiredModules);
    expect(body.environment).toBe("testnet");
    expect(body.network).toBe("eip155:84532");
    expect(body.execution_authorized).toBe(false);
    expect(body.freshness.discovery_proves_current_data).toBe(false);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("does not convert unconfigured service into successful discovery", async () => {
    const failure = Response.json({ ok: false, configured: false }, { status: 503 });
    canonical.GET.mockResolvedValue(failure);
    const response = await createCategoryIntelligenceHandlers(categories[0]).GET({
      request: new Request("https://geomacro.live/api/v1/intelligence/geopolitics"),
    });
    expect(response).toBe(failure);
    expect(canonical.POST).not.toHaveBeenCalled();
  });

  it.each(categories)("preserves $category freshness and payment binding on POST", async (config) => {
    canonical.POST.mockResolvedValue(Response.json({ chargeable: false }, { status: 422 }));
    const response = await createCategoryIntelligenceHandlers(config).POST({ request: new Request(
      `https://geomacro.live/api/v1/intelligence/${config.category}`, {
        method: "POST", headers: { "Content-Type": "application/json", "payment-signature": "test-proof" },
        body: JSON.stringify({ subjects: [{ type: "country", country_iso3: "IND" }], max_age_seconds: 3600 }),
      },
    ) });
    const forwarded = canonical.POST.mock.calls[0][0].request as Request;
    expect(forwarded.url).toBe("https://geomacro.live/api/v1/intelligence/query");
    expect(forwarded.headers.get("payment-signature")).toBe("test-proof");
    expect(await forwarded.json()).toMatchObject({ topics: config.topics, max_age_seconds: 3600 });
    expect(response.status).toBe(422);
  });
});
