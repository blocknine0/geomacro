import { randomBytes } from "node:crypto";
import { SignJWT, importJWK, importPKCS8 } from "jose";
import {
  COINBASE_X402_MAINNET_NETWORK,
  COINBASE_X402_MAINNET_USDC,
  type CoinbaseX402Config,
} from "./coinbase-x402.server";

const CDP_HOST = "api.cdp.coinbase.com" as const;
const CDP_ORIGIN = `https://${CDP_HOST}` as const;
export const COINBASE_X402_SUPPORTED_PATH =
  "/platform/v2/x402/supported" as const;

export type CoinbaseX402CapabilityKind = {
  x402Version?: unknown;
  scheme?: unknown;
  network?: unknown;
};

export type CoinbaseX402ReadinessAssessment = {
  ready: boolean;
  settlement_capability_ready: boolean;
  bazaar_extension_advertised: boolean;
  production_binding_ready: boolean;
  reason_codes: string[];
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function assessCoinbaseX402FacilitatorCapabilities(
  payload: unknown,
  config: Pick<CoinbaseX402Config, "environment" | "network" | "asset" | "apiKeyId" | "apiKeySecret">,
): CoinbaseX402ReadinessAssessment {
  const object = asObject(payload);
  const kinds = Array.isArray(object?.kinds) ? object?.kinds : [];
  const extensions = Array.isArray(object?.extensions)
    ? object?.extensions.filter((item): item is string => typeof item === "string")
    : [];

  const exactNetworkSupported = kinds.some((candidate) => {
    const kind = asObject(candidate);
    return (
      kind?.x402Version === 2 &&
      kind?.scheme === "exact" &&
      kind?.network === config.network
    );
  });
  const bazaarAdvertised = extensions.includes("bazaar");
  const credentialsPresent = Boolean(config.apiKeyId && config.apiKeySecret);
  const productionBindingReady =
    config.environment !== "production" ||
    (config.network === COINBASE_X402_MAINNET_NETWORK &&
      config.asset.toLowerCase() === COINBASE_X402_MAINNET_USDC.toLowerCase());

  const reasonCodes: string[] = [];
  if (!credentialsPresent) reasonCodes.push("CDP_API_CREDENTIALS_MISSING");
  if (!exactNetworkSupported) reasonCodes.push("FACILITATOR_V2_EXACT_NETWORK_UNSUPPORTED");
  if (!bazaarAdvertised) reasonCodes.push("FACILITATOR_BAZAAR_EXTENSION_NOT_ADVERTISED");
  if (!productionBindingReady) reasonCodes.push("PRODUCTION_BASE_USDC_BINDING_INVALID");

  return {
    ready:
      credentialsPresent &&
      exactNetworkSupported &&
      bazaarAdvertised &&
      productionBindingReady,
    settlement_capability_ready: exactNetworkSupported,
    bazaar_extension_advertised: bazaarAdvertised,
    production_binding_ready: productionBindingReady,
    reason_codes: reasonCodes,
  };
}

async function generateSupportedJwt(config: CoinbaseX402Config) {
  if (!config.apiKeyId || !config.apiKeySecret) {
    throw new Error("CDP_API_CREDENTIALS_MISSING");
  }

  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const claims = {
    sub: config.apiKeyId,
    iss: "cdp",
    uris: [`GET ${CDP_HOST}${COINBASE_X402_SUPPORTED_PATH}`],
  };

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
  if (decoded.length !== 64) throw new Error("CDP_API_KEY_SECRET_INVALID");
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

/**
 * Live, no-settlement readiness probe. It only asks Coinbase which x402
 * protocol/network capabilities the authenticated facilitator currently
 * advertises. It never verifies or settles a payment and cannot unlock the
 * Geomacro commercial launch gate.
 */
export async function checkCoinbaseX402FacilitatorReadiness(
  config: CoinbaseX402Config,
): Promise<CoinbaseX402ReadinessAssessment> {
  if (!config.apiKeyId || !config.apiKeySecret) {
    return assessCoinbaseX402FacilitatorCapabilities(null, config);
  }

  const jwt = await generateSupportedJwt(config);
  const response = await fetch(new URL(COINBASE_X402_SUPPORTED_PATH, CDP_ORIGIN), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`CDP_X402_SUPPORTED_HTTP_${response.status}`);
  }

  return assessCoinbaseX402FacilitatorCapabilities(await response.json(), config);
}
