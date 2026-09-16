import process from "node:process";
import { assertCommercialLaunchAuthorized } from "./commercial-launch-gate.server";

export const NEVERMINED_ENVIRONMENTS = {
  sandbox: {
    facilitator_url: "https://facilitator.sandbox.nevermined.app",
    commercial_revenue: false,
  },
  live: {
    facilitator_url: "https://facilitator.live.nevermined.app",
    commercial_revenue: true,
  },
} as const;

export type NeverminedEnvironment = keyof typeof NEVERMINED_ENVIRONMENTS;
export type NeverminedScheme = "nvm:erc4337" | "nvm:card-delegation";

export type NeverminedX402Config = {
  environment: NeverminedEnvironment;
  facilitatorUrl: string;
  apiKey: string;
  planId: string;
  scheme: NeverminedScheme;
  maxAmount: bigint;
  commercialRevenue: boolean;
};

const PLAN_ID = /^[0-9]{1,96}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,38}$/;
const SAFE_SECRET = /^[^\u0000-\u001F\u007F]{1,4096}$/;

function required(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!SAFE_SECRET.test(value)) throw new Error(`${name} is not configured or contains invalid control characters`);
  return value;
}

export function neverminedEnvironment(): NeverminedEnvironment | null {
  const value = process.env.NEVERMINED_X402_ENVIRONMENT?.trim().toLowerCase();
  return value === "sandbox" || value === "live" ? value : null;
}

export function getNeverminedX402Config(): NeverminedX402Config | null {
  const environment = neverminedEnvironment();
  if (!environment) return null;

  if (environment === "live") {
    assertCommercialLaunchAuthorized("nevermined");
  }

  const apiKey = required("NEVERMINED_NVM_API_KEY");
  const planId = required("NEVERMINED_PLAN_ID");
  if (!PLAN_ID.test(planId)) throw new Error("NEVERMINED_PLAN_ID must be a bounded numeric plan identifier");

  const schemeRaw = required("NEVERMINED_X402_SCHEME");
  if (schemeRaw !== "nvm:erc4337" && schemeRaw !== "nvm:card-delegation") {
    throw new Error("NEVERMINED_X402_SCHEME must be nvm:erc4337 or nvm:card-delegation");
  }

  const maxAmountRaw = required("NEVERMINED_X402_MAX_AMOUNT");
  if (!POSITIVE_INTEGER.test(maxAmountRaw)) {
    throw new Error("NEVERMINED_X402_MAX_AMOUNT must be a positive bounded integer");
  }

  const expected = NEVERMINED_ENVIRONMENTS[environment];
  return {
    environment,
    facilitatorUrl: expected.facilitator_url,
    apiKey,
    planId,
    scheme: schemeRaw,
    maxAmount: BigInt(maxAmountRaw),
    commercialRevenue: expected.commercial_revenue,
  };
}

export function isNeverminedX402Configured() {
  try {
    return getNeverminedX402Config() !== null;
  } catch {
    return false;
  }
}
