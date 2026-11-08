import process from "node:process";

/**
 * Global commercial launch gate.
 *
 * No provider may accept production funds before the coordinated Geomacro
 * launch. Provider-specific credentials or mainnet flags are intentionally
 * insufficient to bypass this gate.
 *
 * Incident controls remain independent of the launch acknowledgement:
 * - GEOMACRO_COMMERCE_EMERGENCY_FREEZE=true blocks every production rail.
 * - GEOMACRO_COMMERCE_DISABLED_PROVIDERS is a comma-separated provider
 *   quarantine list for isolating one unhealthy rail without waiting for a
 *   redeploy.
 */
export const COMMERCIAL_LAUNCH_ACK = "I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH" as const;

/**
 * Owner-directed interim product scope: ONLY native USDC on Base/Polygon.
 * This is a code-level hard stop; environment flags cannot reactivate
 * fiat/card, Arc, reseller or alternative payment providers.
 * Historical verified PayPal reversal/refund intake is a separate
 * non-sale action and must remain operational.
 *
 * Even an allowed provider still requires every existing owner ACK,
 * evidence, source rights, finality and durable-ledger acceptance gate.
 */
export const GEOMACRO_NEW_SALES_RAIL_SCOPE="CRYPTO_ONLY_BASE_POLYGON_NATIVE_USDC" as const;
export const GEOMACRO_APPROVED_CRYPTO_PROVIDERS=Object.freeze([
  "coinbase_x402", // existing Base native USDC
  "xpay_x402",     // Base native USDC
  "dexter_x402",   // Base / Polygon native USDC
]);
export const GEOMACRO_DISABLED_NEW_SALE_PROVIDERS=Object.freeze([
  "paypal","nevermined","goat_x402","circle_gateway_x402",
]);


const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export type CommercialLaunchState = {
  ownerAuthorized: boolean;
  emergencyFrozen: boolean;
  authorized: boolean;
  mode: "prelaunch" | "launched" | "frozen";
  disabledProviders: string[];
};

function normalizeProvider(provider: string) {
  return provider.trim().toLowerCase();
}

function providerErrorPrefix(provider: string) {
  return normalizeProvider(provider).toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function getDisabledProviders() {
  return Array.from(
    new Set(
      [
        ...GEOMACRO_DISABLED_NEW_SALE_PROVIDERS,
        ...(process.env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS ?? "").split(","),
      ].map(normalizeProvider).filter(Boolean),
    ),
  ).sort();
}

export function getCommercialLaunchState(): CommercialLaunchState {
  const ownerAuthorized =
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK?.trim() === COMMERCIAL_LAUNCH_ACK;
  const emergencyFrozen = TRUE_VALUES.has(
    process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE?.trim().toLowerCase() ?? "",
  );
  const disabledProviders = getDisabledProviders();
  const authorized = ownerAuthorized && !emergencyFrozen;

  return {
    ownerAuthorized,
    emergencyFrozen,
    authorized,
    mode: emergencyFrozen ? "frozen" : authorized ? "launched" : "prelaunch",
    disabledProviders,
  };
}

export function assertCommercialLaunchAuthorized(provider: string) {
  const state = getCommercialLaunchState();
  const normalizedProvider = normalizeProvider(provider);

  if (!state.ownerAuthorized) {
    throw new Error(
      `${providerErrorPrefix(provider)}_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH`,
    );
  }

  if (state.emergencyFrozen) {
    throw new Error("GEOMACRO_COMMERCE_EMERGENCY_FREEZE_ACTIVE");
  }

  if (!GEOMACRO_APPROVED_CRYPTO_PROVIDERS.includes(normalizedProvider)) {
    throw new Error(
      `${providerErrorPrefix(provider)}_NEW_SALES_OUTSIDE_CRYPTO_ONLY_SCOPE`,
    );
  }

  if (state.disabledProviders.includes(normalizedProvider)) {
    throw new Error(
      `${providerErrorPrefix(provider)}_PRODUCTION_QUARANTINED`,
    );
  }
}
