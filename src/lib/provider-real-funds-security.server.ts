import process from "node:process";

import { COMMERCIAL_LAUNCH_ACK } from "./commercial-launch-gate.server";
import { REAL_FUNDS_SECURITY_ACK } from "./central-security.server";

export type ProviderRealFundsSecurityState = {
  required: boolean;
  ready: boolean;
  providers: {
    coinbase_mainnet: boolean;
    circle_gateway_mainnet: boolean;
    nevermined_live: boolean;
    goat_mainnet: boolean;
  };
  checks: {
    central_mode_enforced: boolean;
    owner_security_ack: boolean;
    coordinated_launch_ack: boolean;
    dedicated_fingerprint_pepper: boolean;
    dedicated_api_credential_pepper: boolean;
  };
};

function normalized(name: string) {
  return process.env[name]?.trim().toLowerCase() ?? "";
}

export function providerRealFundsSecurityState(): ProviderRealFundsSecurityState {
  const providers = {
    coinbase_mainnet: normalized("COINBASE_X402_ENVIRONMENT") === "production",
    circle_gateway_mainnet: normalized("CIRCLE_X402_ENVIRONMENT") === "production",
    nevermined_live: normalized("NEVERMINED_X402_ENVIRONMENT") === "live",
    goat_mainnet: normalized("GOATX402_ENVIRONMENT") === "mainnet",
  } as const;

  const required = Object.values(providers).some(Boolean);
  const checks = {
    central_mode_enforced: normalized("GEOMACRO_CENTRAL_SECURITY_MODE") === "enforce",
    owner_security_ack:
      process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK?.trim() ===
      REAL_FUNDS_SECURITY_ACK,
    coordinated_launch_ack:
      process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK?.trim() ===
      COMMERCIAL_LAUNCH_ACK,
    dedicated_fingerprint_pepper:
      String(process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER ?? "").trim()
        .length >= 32,
    dedicated_api_credential_pepper:
      String(process.env.GEOMACRO_API_CREDENTIAL_PEPPER ?? "").trim().length >=
      32,
  } as const;

  return {
    required,
    ready: !required || Object.values(checks).every(Boolean),
    providers,
    checks,
  };
}

export function assertProviderRealFundsSecurityReady() {
  const state = providerRealFundsSecurityState();
  if (state.required && !state.ready) {
    throw new Error("PROVIDER_REAL_FUNDS_SECURITY_GATE_LOCKED");
  }
  return state;
}
