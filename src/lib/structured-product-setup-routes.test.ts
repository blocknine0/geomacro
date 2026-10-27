import { describe, it, expect, vi, beforeEach } from "vitest";
const calls = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), check: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (config: unknown) => config }));
vi.mock("./earn-first-structural-offers.server", () => ({
  earnFirstStructuralOfferHandlers: {
    GET: calls.get,
    POST: calls.post,
    OPTIONS: async () => new Response(null, { status: 204 }),
  },
}));
vi.mock("./structured-product-setup.server", () => ({ checkStructuredProductSetup: calls.check }));
import { Route as Availability } from "../routes/api.v1.intelligence.availability";
import { Route as Pricing } from "../routes/api.v1.pricing";
type Handlers = {
  server: {
    handlers: {
      GET: (ctx: { request: Request }) => Promise<Response>;
      POST: (ctx: { request: Request }) => Promise<Response>;
    };
  };
};
const availability = (Availability as unknown as Handlers).server.handlers;
const pricing = (Pricing as unknown as Handlers).server.handlers;
const req = (query = "") => ({
  request: new Request("https://geomacro.live/api/v1/intelligence/availability" + query),
});
beforeEach(() => {
  vi.clearAllMocks();
  calls.get.mockResolvedValue(Response.json({ legacy: true }));
  calls.post.mockResolvedValue(Response.json({ legacy: true }));
  calls.check.mockResolvedValue(Response.json({ setup: true }));
});
describe("setup routing without changing legacy preflight", () => {
  it("publishes all twelve products on both explicit setup views", async () => {
    for (const handler of [availability.GET, pricing.GET]) {
      const response = await handler(req("?view=setup"));
      expect(response.status).toBe(200);
      expect((await response.json()).products).toHaveLength(12);
    }
  });
  it("retains legacy handlers and routes only explicit setup requests to new checker", async () => {
    await availability.GET(req());
    await availability.POST(req());
    expect(calls.get).toHaveBeenCalledOnce();
    expect(calls.post).toHaveBeenCalledOnce();
    await availability.POST(req("?view=setup"));
    expect(calls.check).toHaveBeenCalledOnce();
  });
  it.each(["?view=setup&view=setup", "?view=setup&price=0.001", "?view=unknown"])(
    "rejects malformed setup query %s before any data check",
    async (query) => {
      expect((await availability.POST(req(query))).status).toBe(400);
      expect((await pricing.GET(req(query))).status).toBe(400);
      expect(calls.check).not.toHaveBeenCalled();
      expect(calls.post).not.toHaveBeenCalled();
    },
  );
});
