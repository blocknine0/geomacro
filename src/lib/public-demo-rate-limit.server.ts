import { createHash } from "node:crypto";

export type PublicDemoRateLimitOptions = {
  namespace: string;
  windowMs: number;
  maxPerClient: number;
  maxGlobal: number;
  maxClientBuckets?: number;
};

type Bucket = {
  resetAt: number;
  count: number;
};

const DEFAULT_MAX_CLIENT_BUCKETS = 2048;
const clientBuckets = new Map<string, Bucket>();
const globalBuckets = new Map<string, Bucket>();

function clientHint(request: Request) {
  const candidate =
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("true-client-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  return candidate.slice(0, 256);
}

function clientKey(namespace: string, request: Request) {
  const digest = createHash("sha256")
    .update(clientHint(request), "utf8")
    .digest("hex");
  return `${namespace}:${digest}`;
}

function consumeBucket(
  map: Map<string, Bucket>,
  key: string,
  now: number,
  windowMs: number,
  maximum: number,
) {
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { resetAt: now + windowMs, count: 1 });
    return true;
  }

  existing.count += 1;
  return existing.count <= maximum;
}

function purgeExpiredClientBuckets(now: number) {
  for (const [key, bucket] of clientBuckets) {
    if (bucket.resetAt <= now) clientBuckets.delete(key);
  }
}

/**
 * Best-effort in-process protection for the public technical demo.
 *
 * Per-client hints can be proxy-supplied and are therefore not treated as a
 * security boundary. A separate namespace-global bucket prevents simple header
 * rotation from bypassing all throttling. The client map is capped so spoofed
 * identities cannot grow process memory without bound.
 *
 * This is intentionally not described as a distributed production rate limiter.
 */
export function allowPublicDemoRequest(
  request: Request,
  options: PublicDemoRateLimitOptions,
) {
  const now = Date.now();

  const globalAllowed = consumeBucket(
    globalBuckets,
    options.namespace,
    now,
    options.windowMs,
    options.maxGlobal,
  );
  if (!globalAllowed) return false;

  const maximumBuckets =
    options.maxClientBuckets ?? DEFAULT_MAX_CLIENT_BUCKETS;

  if (clientBuckets.size >= maximumBuckets) {
    purgeExpiredClientBuckets(now);
  }

  let key = clientKey(options.namespace, request);
  if (!clientBuckets.has(key) && clientBuckets.size >= maximumBuckets) {
    // Bound memory even when an attacker rotates proxy headers/IP hints.
    key = `${options.namespace}:overflow`;
  }

  return consumeBucket(
    clientBuckets,
    key,
    now,
    options.windowMs,
    options.maxPerClient,
  );
}
