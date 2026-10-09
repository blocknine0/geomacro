// Fixed-endpoint original-publisher discovery only. Two bounded network
// attempts per feed, never a license, score or public-publication override.
// Each attempt owns a fresh deadline; a timed-out AbortSignal cannot be reused.
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_PAUSE_MS = 350;

export async function fetchOriginalPublisherWithRecovery(url, {
  fetchImpl = fetch,
  headers,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error("ORIGINAL_FEED_URL_INVALID"); }
  if (u.protocol !== "https:" || u.username || u.password ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1_000 ||
      timeoutMs > DEFAULT_TIMEOUT_MS) {
    throw new Error("ORIGINAL_FEED_REQUEST_INVALID");
  }
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let res;
    try {
      res = await fetchImpl(url, {
        redirect: "error",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      if (attempt === 2) throw new Error("ORIGINAL_FEED_NETWORK_UNAVAILABLE");
      await pause(RETRY_PAUSE_MS);
      continue;
    }
    if (!TRANSIENT_STATUS.has(res.status) || attempt === 2) return res;
    // HTTP transient responses must not be returned as false success,
    // and pending response streams cannot accumulate across attempts.
    try { await res.body?.cancel(); } catch { /* request still fails closed */ }
    await pause(RETRY_PAUSE_MS);
  }
  throw new Error("ORIGINAL_FEED_RECOVERY_EXHAUSTED");
}
