import { defineEventHandler, setResponseHeaders, setResponseStatus } from "h3";

import {
  COINBASE_BAZAAR_RESOURCE_URL,
  currentCoinbaseBazaarConfig,
  fetchCoinbaseBazaarCatalogStatus,
  latestCoinbaseBazaarTelemetry,
} from "../../../src/lib/coinbase-bazaar-status.server";

const CACHE_MS = 30_000;

type CachedPayload = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

let cached: CachedPayload | null = null;

function headers(event: Parameters<typeof setResponseHeaders>[0]) {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
}

export default defineEventHandler(async (event) => {
  headers(event);

  if (cached && cached.expiresAt > Date.now()) return cached.payload;

  const config = currentCoinbaseBazaarConfig();
  if (!config) {
    setResponseStatus(event, 503);
    return {
      ok: false,
      service: "Geomacro Coinbase x402 Bazaar Status",
      error: "Coinbase x402 catalog credentials are not configured in this runtime.",
      execution_authorized: false,
    };
  }

  try {
    const [catalog, telemetry] = await Promise.all([
      fetchCoinbaseBazaarCatalogStatus(config, COINBASE_BAZAAR_RESOURCE_URL),
      latestCoinbaseBazaarTelemetry(config),
    ]);

    const payload = {
      ok: true,
      service: "Geomacro Coinbase x402 Bazaar Status",
      facilitator: "Coinbase CDP",
      environment: config.environment,
      network: config.network,
      resource: COINBASE_BAZAAR_RESOURCE_URL,
      settlement_extension: telemetry,
      catalog: {
        indexed: catalog.indexed,
        last_updated: catalog.last_updated,
        service_name: catalog.service_name,
        search_method: catalog.search_method,
        partial_results: catalog.partial_results,
      },
      checked_at: new Date().toISOString(),
      execution_authorized: false,
    };

    cached = { expiresAt: Date.now() + CACHE_MS, payload };
    return payload;
  } catch (error) {
    console.error("[coinbase-x402] Bazaar status lookup failed", error);
    setResponseStatus(event, 503);
    return {
      ok: false,
      service: "Geomacro Coinbase x402 Bazaar Status",
      resource: COINBASE_BAZAAR_RESOURCE_URL,
      error: "Coinbase Bazaar status is temporarily unavailable.",
      execution_authorized: false,
    };
  }
});
