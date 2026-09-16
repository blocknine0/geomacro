import process from "node:process";

/**
 * Global commercial launch gate.
 *
 * No provider may accept production funds before the coordinated Geomacro
 * launch. Provider-specific credentials or mainnet flags are intentionally
 * insufficient to bypass this gate.
 */
export const COMMERCIAL_LAUNCH_ACK = "I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH" as const;

export type CommercialLaunchState = {
  authorized: boolean;
  mode: "prelaunch" | "launched";
};

export function getCommercialLaunchState(): CommercialLaunchState {
  const authorized = process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK?.trim() === COMMERCIAL_LAUNCH_ACK;
  return { authorized, mode: authorized ? "launched" : "prelaunch" };
}

export function assertCommercialLaunchAuthorized(provider: string) {
  if (!getCommercialLaunchState().authorized) {
    throw new Error(
      `${provider.toUpperCase()}_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH`,
    );
  }
}
