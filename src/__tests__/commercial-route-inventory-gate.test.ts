import { describe, expect, it } from "vitest";
import { buildCommercialRouteInventory } from "../../scripts/lib/commercial-route-inventory.mjs";

describe("#1414 commercial route inventory gate", () => {
  const inventory = buildCommercialRouteInventory(process.cwd());

  it("explicitly dispositions every generated TanStack route", () => {
    expect(inventory.ok).toBe(true);
    expect(inventory.tanstack_route_count).toBe(inventory.tanstack_routes.length);
    expect(inventory.tanstack_route_count).toBeGreaterThan(40);
    expect(inventory.policy.unregistered_tanstack_route_behavior).toBe("FAIL_CLOSED");
  });

  it("keeps primary buyer navigation production-only", () => {
    const byRoute = new Map(inventory.tanstack_routes.map((row) => [row.route, row]));
    expect(inventory.primary_navigation.length).toBeGreaterThan(0);
    for (const route of inventory.primary_navigation) {
      expect(byRoute.get(route)?.classification, route).toBe("PRODUCTION");
    }
  });

  it("keeps testnet, demo and technical-proof surfaces out of production classification", () => {
    const byRoute = new Map(inventory.tanstack_routes.map((row) => [row.route, row]));
    for (const route of ["/testnet-access", "/testnet-console", "/demo", "/tameion", "/arena", "/onchain", "/bridge-swap", "/portfolio"]) {
      expect(byRoute.get(route)?.classification, route).not.toBe("PRODUCTION");
    }
  });

  it("keeps Risk Gate private-pilot and x402 controlled-prelaunch until explicit activation", () => {
    const byRoute = new Map(inventory.tanstack_routes.map((row) => [row.route, row]));
    expect(byRoute.get("/risk-gate")?.status).toBe("PRIVATE_PILOT");
    for (const row of inventory.tanstack_routes.filter((item) => item.route.startsWith("/api/x402/"))) {
      expect(row.status, row.route).toBe("CONTROLLED_PRELAUNCH");
    }
  });

  it("defaults unclassified Nitro server APIs to internal-only rather than public promotion", () => {
    expect(inventory.nitro_api_count).toBeGreaterThan(0);
    expect(inventory.policy.unknown_nitro_api_behavior).toBe("INTERNAL_ONLY");
    for (const route of inventory.nitro_api_routes.filter((item) => item.endpoint.startsWith("/api/public/"))) {
      expect(route.classification, route.endpoint).toBe("PRODUCTION");
    }
  });
});
