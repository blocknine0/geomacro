type Bucket = {
  count: number;
  resetAt: number;
};

export type TestnetPublicProtectionInput = {
  principalId: string;
  publicApiKey: string;
  now?: number;
};

const WINDOW_MS = 60_000;
const MAX_PER_PRINCIPAL_PER_KEY = 30;
const MAX_GLOBAL_PER_KEY = 600;
const MAX_ACTIVE_PER_PRINCIPAL = 4;
const MAX_ACTIVE_GLOBAL = 32;
const MAX_BUCKETS = 4096;

const principalBuckets = new Map<string, Bucket>();
const globalBuckets = new Map<string, Bucket>();
const activeByPrincipal = new Map<string, number>();
let activeGlobal = 0;

function consume(map: Map<string, Bucket>, key: string, now: number, maximum: number) {
  const current = map.get(key);
  if (!current || current.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 } as const;
  }

  current.count += 1;
  if (current.count <= maximum) {
    return { allowed: true, retryAfterSeconds: 0 } as const;
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  } as const;
}

function purgeExpired(now: number) {
  for (const [key, bucket] of principalBuckets) {
    if (bucket.resetAt <= now) principalBuckets.delete(key);
  }
  for (const [key, bucket] of globalBuckets) {
    if (bucket.resetAt <= now) globalBuckets.delete(key);
  }
}

function boundedPrincipalKey(principalId: string, publicApiKey: string, now: number) {
  if (principalBuckets.size >= MAX_BUCKETS) purgeExpired(now);
  const key = `${publicApiKey}:${principalId}`;
  if (!principalBuckets.has(key) && principalBuckets.size >= MAX_BUCKETS) {
    return `${publicApiKey}:overflow`;
  }
  return key;
}

/**
 * Best-effort process-local backpressure for the browser Testnet surface.
 * Durable security and payment idempotency still live in the database.
 * This protects one app process from burst traffic; it is not represented as a
 * distributed edge rate limiter.
 */
export function checkTestnetPublicRateLimit(input: TestnetPublicProtectionInput) {
  const now = input.now ?? Date.now();
  const global = consume(globalBuckets, input.publicApiKey, now, MAX_GLOBAL_PER_KEY);
  if (!global.allowed) return global;

  const principalKey = boundedPrincipalKey(input.principalId, input.publicApiKey, now);
  return consume(principalBuckets, principalKey, now, MAX_PER_PRINCIPAL_PER_KEY);
}

export function acquireTestnetPublicSlot(input: TestnetPublicProtectionInput) {
  const principalKey = `${input.publicApiKey}:${input.principalId}`;
  const activeForPrincipal = activeByPrincipal.get(principalKey) ?? 0;
  if (activeGlobal >= MAX_ACTIVE_GLOBAL || activeForPrincipal >= MAX_ACTIVE_PER_PRINCIPAL) {
    return null;
  }

  activeGlobal += 1;
  activeByPrincipal.set(principalKey, activeForPrincipal + 1);
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeGlobal = Math.max(0, activeGlobal - 1);
    const current = activeByPrincipal.get(principalKey) ?? 0;
    if (current <= 1) activeByPrincipal.delete(principalKey);
    else activeByPrincipal.set(principalKey, current - 1);
  };
}

export const TESTNET_PUBLIC_PROTECTION_POLICY = {
  window_ms: WINDOW_MS,
  max_requests_per_principal_per_public_key: MAX_PER_PRINCIPAL_PER_KEY,
  max_requests_global_per_public_key: MAX_GLOBAL_PER_KEY,
  max_active_per_principal: MAX_ACTIVE_PER_PRINCIPAL,
  max_active_global_per_process: MAX_ACTIVE_GLOBAL,
  max_rate_limit_buckets: MAX_BUCKETS,
} as const;

export function resetTestnetPublicProtectionForTests() {
  principalBuckets.clear();
  globalBuckets.clear();
  activeByPrincipal.clear();
  activeGlobal = 0;
}
