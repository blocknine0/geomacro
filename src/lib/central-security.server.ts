import {
  createHmac,
} from "node:crypto";

import {
  requireRiskSupabase,
} from "./risk-supabase.server";


export const CENTRAL_SECURITY_VERSION =
  "geomacro-central-security-v1.0.0" as const;

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


const POLICIES: Record<Exclude<CentralSecurityRouteClass, "page">, BudgetPolicy> = {
  public_api: {
    windowSeconds: 60,
    perClient: 240,
    global: 5000,
    maxBodyBytes: 128 * 1024,
    distributed: true,
    // Public read/proof surfaces remain available for diagnosis if the
    // privileged abuse-control store is temporarily unavailable. They still
    // receive the bounded in-process burst guard.
    failClosed: false,
  },
  api_write: {
    windowSeconds: 60,
    perClient: 60,
    global: 1200,
    maxBodyBytes: 64 * 1024,
    distributed: true,
    failClosed: true,
  },
  server_function: {
    windowSeconds: 60,
    perClient: 60,
    global: 1200,
    maxBodyBytes: 128 * 1024,
    distributed: true,
    failClosed: true,
  },
  risk_gate: {
    windowSeconds: 60,
    perClient: 90,
    global: 1500,
    maxBodyBytes: 32 * 1024,
    distributed: true,
    failClosed: true,
  },
  commercial: {
    windowSeconds: 60,
    perClient: 90,
    global: 1500,
    maxBodyBytes: 32 * 1024,
    distributed: true,
    failClosed: true,
  },
  payment: {
    windowSeconds: 60,
    perClient: 45,
    global: 900,
    maxBodyBytes: 32 * 1024,
    distributed: true,
    failClosed: true,
  },
  internal: {
    windowSeconds: 60,
    perClient: 30,
    global: 300,
    maxBodyBytes: 64 * 1024,
    distributed: true,
    failClosed: true,
  },
};


function normalizedPathname(pathname: string): string {
  const value = String(pathname || "/").split("?", 1)[0] || "/";
  return value.startsWith("/") ? value : `/${value}`;
}


export function classifyCentralSecurityRoute(
  pathnameInput: string,
  methodInput: string,
): CentralSecurityRouteClass {
  const pathname = normalizedPathname(pathnameInput);
  const method = String(methodInput || "GET").toUpperCase();

  if (
    pathname.startsWith("/api/x402") ||
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
    const db = requireRiskSupabase();
    const { data, error } = await db.rpc(
      "consume_central_security_budget",
      {
        p_route_class: routeClass,
        p_client_key: clientKey,
        p_window_seconds: policy.windowSeconds,
        p_client_limit: policy.perClient,
        p_global_limit: policy.global,
      },
    );

    if (error) throw error;

    const result =
      data &&
      typeof data === "object" &&
      !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;

    if (!result || result.ok !== true) {
      throw new Error("Central security budget returned invalid state");
    }

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
      error instanceof Error ? error.message : "unknown error",
    );

    if (policy.failClosed) {
      return {
        allowed: false,
        status: 503,
        code: "CENTRAL_SECURITY_UNAVAILABLE",
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
