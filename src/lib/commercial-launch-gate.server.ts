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
      (process.env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS ?? "")
        .split(",")
        .map(normalizeProvider)
        .filter(Boolean),
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

  if (state.disabledProviders.includes(normalizedProvider)) {
    throw new Error(
      `${providerErrorPrefix(provider)}_PRODUCTION_QUARANTINED`,
    );
  }
}
