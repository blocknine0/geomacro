import {
  createHmac,
} from "node:crypto";

import { CENTRAL_SECURITY_POLICIES } from "../../workers/control-plane/src/central-security-policies.mjs";
import { consumeD1CentralSecurityBudget, centralSecurityBudgetFailureCode } from "./d1-central-security-budget.server";
const POLICIES = CENTRAL_SECURITY_POLICIES as Record<Exclude<CentralSecurityRouteClass, "page">, BudgetPolicy>;


export const CENTRAL_SECURITY_VERSION =
  "geomacro-central-security-v1.1.1-d1" as const;

export const REAL_FUNDS_SECURITY_ACK =
  "I_ACCEPT_REAL_FUNDS_SECURITY_GATES" as const;


export type CentralSecurityRouteClass =
  | "page"
  | "public_api"
  | "api_write"
  | "server_function"
  | "risk_gate"
  | "commercial"
  | "payment"
  | "internal";

export type CentralSecurityDecision = {
  allowed: boolean;
  status: number;
  code: string;
  routeClass: CentralSecurityRouteClass;
  retryAfterSeconds?: number;
};


type BudgetPolicy = {
  windowSeconds: number;
  perClient: number;
  global: number;
  maxBodyBytes: number;
  distributed: boolean;
  failClosed: boolean;
};


type Bucket = {
  resetAt: number;
  count: number;
};


const LOCAL_WINDOW_MS = 10_000;
const MAX_LOCAL_CLIENT_BUCKETS = 4096;
const localClientBuckets = new Map<string, Bucket>();
const localGlobalBuckets = new Map<string, Bucket>();





function normalizedPathname(pathname: string): string {
  const value = String(pathname || "/").split("?", 1)[0] || "/";
  return value.startsWith("/") ? value : `/${value}`;
}


export function isCoinbaseTestnetLocalSecurityFallbackAllowed(
  pathnameInput: string,
  routeClass: CentralSecurityRouteClass,
): boolean {
  const coinbaseEnvironment =
    process.env.COINBASE_X402_ENVIRONMENT?.trim().toLowerCase();

  return (
    routeClass === "payment" &&
    (
      normalizedPathname(pathnameInput).startsWith("/api/x402") ||
      [
        "/api/v1/intelligence/query",
        "/api/v1/intelligence/geopolitics",
        "/api/v1/intelligence/macro-fx",
        "/api/v1/intelligence/critical-minerals",
      ].includes(normalizedPathname(pathnameInput))
    ) &&
    coinbaseEnvironment === "testnet"
  );
}


export function classifyCentralSecurityRoute(
  pathnameInput: string,
  methodInput: string,
): CentralSecurityRouteClass {
  const pathname = normalizedPathname(pathnameInput);
  const method = String(methodInput || "GET").toUpperCase();

  // The buyer availability/offer endpoint is explicitly NEVER a payment
  // handler. Its POST only checks the canonical signed-source deliverability,
  // rejects any payment/authorization header, and has its own low quota
  // (3/client and 24 globally per minute, bounded 8 KiB JSON). When frozen
  // Supabase distributed abuse control is unavailable, keep this no-charge
  // preflight reachable under public_api's keyed in-process burst guard.
  // Do NOT extend this exception to canonical x402 POST or paid aliases.
  if (pathname === "/api/v1/intelligence/availability" &&
      ["GET", "POST", "OPTIONS"].includes(method)) return "public_api";

  // These three category GETs are read-only discovery/official-observation
  // surfaces. Public abuse controls still apply, including an HMAC client
  // fingerprint and local burst guard. POST / payment-signature methods remain
  // on the strict distributed/fail-closed PAYMENT path without exceptions.
  if (method === "GET" && [
    "/api/v1/intelligence/geopolitics",
    "/api/v1/intelligence/macro-fx",
    "/api/v1/intelligence/critical-minerals",
  ].includes(pathname)) {
    return "public_api";
  }

  if (
    pathname.startsWith("/api/x402") ||
    pathname === "/api/v1/intelligence/query" ||
    pathname === "/api/v1/intelligence/geopolitics" ||
    pathname === "/api/v1/intelligence/macro-fx" ||
    pathname === "/api/v1/intelligence/critical-minerals" ||
    pathname.startsWith("/api/goat") ||
    pathname === "/api/agent/risk"
  ) {
    return "payment";
  }

  if (
    pathname === "/api/risk-gate" ||
    pathname.startsWith("/api/risk-gate/")
  ) {
    return "risk_gate";
  }

  if (
    pathname.startsWith("/api/commercial") ||
    pathname.startsWith("/api/testnet") ||
    pathname.startsWith("/api/testnet-tester")
  ) {
    return "commercial";
  }

  if (pathname.startsWith("/api/internal")) {
    return "internal";
  }

  if (
    pathname.includes("/_serverFn/") ||
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/__serverFn")
  ) {
    return "server_function";
  }

  if (pathname.startsWith("/api/")) {
    return ["GET", "HEAD", "OPTIONS"].includes(method)
      ? "public_api"
      : "api_write";
  }

  return "page";
}


function firstForwardedValue(value: string | null): string {
  return String(value ?? "")
    .split(",", 1)[0]
    ?.trim()
    .slice(0, 256) || "";
}


function clientNetworkHint(headers: Headers): string {
  return (
    firstForwardedValue(headers.get("cf-connecting-ip")) ||
    firstForwardedValue(headers.get("true-client-ip")) ||
    firstForwardedValue(headers.get("x-real-ip")) ||
    firstForwardedValue(headers.get("x-forwarded-for")) ||
    "unknown"
  );
}


function fingerprintPepper(): string {
  const value = String(
    process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER ??
      process.env.GEOMACRO_API_CREDENTIAL_PEPPER ??
      process.env.APP_SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      "",
  ).trim();

  if (value.length < 32) {
    throw new Error(
      "Central security requires a server-only fingerprint pepper or service-role secret of at least 32 characters",
    );
  }

  return value;
}


export function centralSecurityClientKey(
  headers: Headers,
): string {
  const networkHint = clientNetworkHint(headers);

  return createHmac(
    "sha256",
    fingerprintPepper(),
  )
    .update("geomacro-central-security-client-v1\0", "utf8")
    .update(networkHint, "utf8")
    .digest("hex");
}


function consumeLocalBucket(
  map: Map<string, Bucket>,
  key: string,
  maximum: number,
  now: number,
): boolean {
  const existing = map.get(key);

  if (!existing || existing.resetAt <= now) {
    map.set(key, {
      resetAt: now + LOCAL_WINDOW_MS,
      count: 1,
    });
    return true;
  }

  existing.count += 1;
  return existing.count <= maximum;
}


function purgeExpiredLocalBuckets(now: number): void {
  for (const [key, bucket] of localClientBuckets) {
    if (bucket.resetAt <= now) {
      localClientBuckets.delete(key);
    }
  }
}


function localBurstAllowed(
  routeClass: Exclude<CentralSecurityRouteClass, "page">,
  clientKey: string,
  policy: BudgetPolicy,
): boolean {
  const now = Date.now();

  const localGlobalMax = Math.max(
    200,
    Math.ceil(policy.global / 6) * 2,
  );

  if (
    !consumeLocalBucket(
      localGlobalBuckets,
      routeClass,
      localGlobalMax,
      now,
    )
  ) {
    return false;
  }

  if (localClientBuckets.size >= MAX_LOCAL_CLIENT_BUCKETS) {
    purgeExpiredLocalBuckets(now);
  }

  const localClientMax = Math.max(
    10,
    Math.ceil(policy.perClient / 6) * 2,
  );

  let key = `${routeClass}:${clientKey}`;
  if (
    !localClientBuckets.has(key) &&
    localClientBuckets.size >= MAX_LOCAL_CLIENT_BUCKETS
  ) {
    key = `${routeClass}:overflow`;
  }

  return consumeLocalBucket(
    localClientBuckets,
    key,
    localClientMax,
    now,
  );
}


function headerTooLarge(
  headers: Headers,
  name: string,
  maximum: number,
): boolean {
  return (headers.get(name)?.length ?? 0) > maximum;
}


function envelopeDecision(
  routeClass: Exclude<CentralSecurityRouteClass, "page">,
  method: string,
  headers: Headers,
  policy: BudgetPolicy,
): CentralSecurityDecision | null {
  const normalizedMethod = method.toUpperCase();

  if (["TRACE", "CONNECT"].includes(normalizedMethod)) {
    return {
      allowed: false,
      status: 405,
      code: "CENTRAL_SECURITY_METHOD_BLOCKED",
      routeClass,
    };
  }

  if (
    headerTooLarge(headers, "authorization", 4096) ||
    headerTooLarge(headers, "cookie", 16 * 1024) ||
    headerTooLarge(headers, "payment-signature", 96 * 1024) ||
    headerTooLarge(headers, "x-forwarded-for", 2048)
  ) {
    return {
      allowed: false,
      status: 431,
      code: "CENTRAL_SECURITY_HEADERS_TOO_LARGE",
      routeClass,
    };
  }

  const rawContentLength = headers.get("content-length");
  if (rawContentLength) {
    if (!/^\d+$/.test(rawContentLength)) {
      return {
        allowed: false,
        status: 400,
        code: "CENTRAL_SECURITY_INVALID_CONTENT_LENGTH",
        routeClass,
      };
    }

    const contentLength = Number(rawContentLength);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > policy.maxBodyBytes
    ) {
      return {
        allowed: false,
        status: 413,
        code: "CENTRAL_SECURITY_BODY_TOO_LARGE",
        routeClass,
      };
    }
  }

  // Ambiguous framing is rejected before route parsing. Modern edge runtimes
  // usually normalize this already, but keeping the invariant here protects
  // deployments that expose both headers.
  if (
    headers.has("content-length") &&
    headers.has("transfer-encoding")
  ) {
    return {
      allowed: false,
      status: 400,
      code: "CENTRAL_SECURITY_AMBIGUOUS_FRAMING",
      routeClass,
    };
  }

  return null;
}


export function realFundsSecurityState() {
  const coinbaseMainnet =
    process.env.COINBASE_X402_ENVIRONMENT
      ?.trim()
      .toLowerCase() === "production";

  const goatMainnet =
    process.env.GOATX402_ENVIRONMENT
      ?.trim()
      .toLowerCase() === "mainnet";

  const required =
    coinbaseMainnet || goatMainnet;

  const centralMode =
    process.env.GEOMACRO_CENTRAL_SECURITY_MODE
      ?.trim()
      .toLowerCase() === "enforce";

  const ownerAck =
    process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK
      ?.trim() === REAL_FUNDS_SECURITY_ACK;

  const fingerprintPepperReady =
    String(
      process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER ?? "",
    ).trim().length >= 32;

  const credentialPepperReady =
    String(
      process.env.GEOMACRO_API_CREDENTIAL_PEPPER ?? "",
    ).trim().length >= 32;

  const checks = {
    central_mode_enforced: centralMode,
    owner_security_ack: ownerAck,
    dedicated_fingerprint_pepper: fingerprintPepperReady,
    dedicated_api_credential_pepper: credentialPepperReady,
  } as const;

  return {
    required,
    ready:
      !required || Object.values(checks).every(Boolean),
    coinbase_mainnet: coinbaseMainnet,
    goat_mainnet: goatMainnet,
    checks,
  } as const;
}


export async function enforceCentralRequestSecurity(
  input: {
    pathname: string;
    method: string;
    headers: Headers;
  },
): Promise<CentralSecurityDecision> {
  const routeClass =
    classifyCentralSecurityRoute(
      input.pathname,
      input.method,
    );

  if (routeClass === "page") {
    return {
      allowed: true,
      status: 200,
      code: "CENTRAL_SECURITY_PAGE_PASS",
      routeClass,
    };
  }

  const policy = POLICIES[routeClass];
  const envelope = envelopeDecision(
    routeClass,
    input.method,
    input.headers,
    policy,
  );

  if (envelope) return envelope;

  if (routeClass === "payment") {
    const realFunds = realFundsSecurityState();
    if (realFunds.required && !realFunds.ready) {
      return {
        allowed: false,
        status: 503,
        code: "REAL_FUNDS_SECURITY_GATE_LOCKED",
        routeClass,
      };
    }
  }

  let clientKey: string;
  try {
    clientKey = centralSecurityClientKey(input.headers);
  } catch {
    return {
      allowed: false,
      status: 503,
      code: "CENTRAL_SECURITY_KEY_UNAVAILABLE",
      routeClass,
    };
  }

  if (!localBurstAllowed(routeClass, clientKey, policy)) {
    return {
      allowed: false,
      status: 429,
      code: "CENTRAL_SECURITY_BURST_LIMITED",
      routeClass,
      retryAfterSeconds: Math.ceil(LOCAL_WINDOW_MS / 1000),
    };
  }

  if (!policy.distributed) {
    return {
      allowed: true,
      status: 200,
      code: "CENTRAL_SECURITY_LOCAL_PASS",
      routeClass,
    };
  }

  try {
    const result = await consumeD1CentralSecurityBudget(routeClass, clientKey);

    const retryAfterSeconds =
      Number.isFinite(Number(result.retry_after_seconds))
        ? Math.max(1, Number(result.retry_after_seconds))
        : policy.windowSeconds;

    if (result.allowed !== true) {
      return {
        allowed: false,
        status: 429,
        code: "CENTRAL_SECURITY_RATE_LIMITED",
        routeClass,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      status: 200,
      code: "CENTRAL_SECURITY_DISTRIBUTED_PASS",
      routeClass,
    };
  } catch (error) {
    console.error(
      "[central-security] distributed abuse control unavailable",
      routeClass,
      centralSecurityBudgetFailureCode(error),
    );

    if (
      isCoinbaseTestnetLocalSecurityFallbackAllowed(
        input.pathname,
        routeClass,
      )
    ) {
      return {
        allowed: true,
        status: 200,
        code: "CENTRAL_SECURITY_TESTNET_LOCAL_DEGRADED_PASS",
        routeClass,
      };
    }

    if (policy.failClosed) {
      return {
        allowed: false,
        status: 503,
        code: centralSecurityBudgetFailureCode(error),
        routeClass,
      };
    }

    return {
      allowed: true,
      status: 200,
      code: "CENTRAL_SECURITY_LOCAL_DEGRADED_PASS",
      routeClass,
    };
  }
}
