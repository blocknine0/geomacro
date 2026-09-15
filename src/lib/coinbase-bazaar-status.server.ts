import { randomBytes } from "node:crypto";
import { SignJWT, importJWK, importPKCS8 } from "jose";
import { getCoinbaseX402Config, type CoinbaseX402Config } from "./coinbase-x402.server";
import { requireRiskSupabase } from "./risk-supabase.server";

const CDP_HOST = "api.cdp.coinbase.com" as const;
const CDP_ORIGIN = `https://${CDP_HOST}` as const;
const DISCOVERY_SEARCH_PATH = "/platform/v2/x402/discovery/search" as const;
const BAZAAR_STATUSES = new Set(["success", "processing", "rejected"]);

export const COINBASE_BAZAAR_RESOURCE_URL = "https://geomacro.live/api/x402/risk" as const;

type DiscoveryResource = {
  resource?: unknown;
  lastUpdated?: unknown;
  serviceName?: unknown;
  description?: unknown;
  type?: unknown;
  x402Version?: unknown;
};

type DiscoveryPayload = {
  resources?: unknown;
  partialResults?: unknown;
  searchMethod?: unknown;
};

function boundedText(value: unknown, max = 500) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function canonicalResource(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function matchCoinbaseBazaarResource(payload: unknown, resourceUrl: string) {
  const object = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as DiscoveryPayload)
    : {};
  const resources = Array.isArray(object.resources) ? object.resources : [];
  const expected = canonicalResource(resourceUrl);
  const match = resources.find((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    return canonicalResource((candidate as DiscoveryResource).resource) === expected;
  }) as DiscoveryResource | undefined;

  return {
    indexed: Boolean(match),
    resource: resourceUrl,
    last_updated: boundedText(match?.lastUpdated, 80),
    service_name: boundedText(match?.serviceName, 120),
    search_method: boundedText(object.searchMethod, 80),
    partial_results: object.partialResults === true,
  };
}

async function generateDiscoveryJwt(config: CoinbaseX402Config) {
  if (!config.apiKeyId || !config.apiKeySecret) throw new Error("CDP_API_CREDENTIALS_MISSING");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: config.apiKeyId,
    iss: "cdp",
    uris: [`GET ${CDP_HOST}${DISCOVERY_SEARCH_PATH}`],
  };
  const nonce = randomBytes(16).toString("hex");

  if (config.apiKeySecret.includes("BEGIN")) {
    const key = await importPKCS8(config.apiKeySecret, "ES256");
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: config.apiKeyId, typ: "JWT", nonce })
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 120)
      .sign(key);
  }

  const decoded = Buffer.from(config.apiKeySecret, "base64");
  if (decoded.length !== 64) {
    throw new Error("CDP_API_KEY_SECRET_INVALID");
  }
  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);
  const key = await importJWK(
    {
      kty: "OKP",
      crv: "Ed25519",
      d: seed.toString("base64url"),
      x: publicKey.toString("base64url"),
    },
    "EdDSA",
  );
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: config.apiKeyId, typ: "JWT", nonce })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

export async function fetchCoinbaseBazaarCatalogStatus(
  config: CoinbaseX402Config,
  resourceUrl = COINBASE_BAZAAR_RESOURCE_URL,
) {
  if (!config.apiKeyId || !config.apiKeySecret) throw new Error("CDP_API_CREDENTIALS_MISSING");

  const url = new URL(DISCOVERY_SEARCH_PATH, CDP_ORIGIN);
  url.searchParams.set("query", resourceUrl);
  url.searchParams.set("network", config.network);
  url.searchParams.set("asset", config.asset);
  url.searchParams.set("scheme", "exact");
  url.searchParams.set("payTo", config.payTo);
  url.searchParams.set("limit", "20");

  const jwt = await generateDiscoveryJwt(config);
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`CDP_BAZAAR_DISCOVERY_HTTP_${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return matchCoinbaseBazaarResource(payload, resourceUrl);
}

export async function latestCoinbaseBazaarTelemetry(config: CoinbaseX402Config) {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("commercial_payment_events")
    .select("occurred_at,metadata")
    .eq("environment", config.commercialEnvironment)
    .eq("provider", "coinbase_cdp_x402")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? (data.metadata as Record<string, unknown>)
    : {};
  const rawStatus = typeof metadata.bazaar_status === "string" ? metadata.bazaar_status : null;
  const status = rawStatus && BAZAAR_STATUSES.has(rawStatus) ? rawStatus : null;

  return {
    occurred_at: boundedText(data.occurred_at, 80),
    extension_echoed: metadata.bazaar_extension_echoed === true,
    status,
    rejected_reason:
      status === "rejected" ? boundedText(metadata.bazaar_rejected_reason, 500) : null,
  };
}

export function currentCoinbaseBazaarConfig() {
  const config = getCoinbaseX402Config();
  if (!config?.apiKeyId || !config.apiKeySecret) return null;
  return config;
}
