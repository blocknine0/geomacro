/**
 * No-funds prelaunch checks run against a real HTTPS origin. A transient
 * transport failure must not be misclassified as available/paid or cause an
 * unbounded stalled runner. Retry only thrown NETWORK failures, never HTTP
 * status codes or unexpected body/contract content. This helper cannot write,
 * settle, authorize or call arbitrary URLs.
 */
const HOST = "https://geomacro.live";
const ALLOWED = new Map([
  ["/.well-known/x402.json", "GET"],
  ["/api/x402/risk/availability", "POST"],
]);
export const X402_NO_FUNDS_MAX_ATTEMPTS = 2;
export const X402_NO_FUNDS_ATTEMPT_TIMEOUT_MS = 10_000;

export async function fetchBoundedNoFunds(url, init = {}, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const parsed = new URL(String(url));
  const method = String(init.method ?? "GET").toUpperCase();
  if (parsed.origin !== HOST || parsed.search || parsed.hash || parsed.username ||
      parsed.password || ALLOWED.get(parsed.pathname) !== method ||
      init.redirect !== "error" || typeof fetchImpl !== "function") {
    throw new Error("X402_NO_FUNDS_REQUEST_BOUNDARY_INVALID");
  }
  if (method === "POST" &&
      (typeof init.body !== "string" || init.body.length > 16_384)) {
    throw new Error("X402_NO_FUNDS_QUERY_TOO_LARGE");
  }
  // A bounded AbortSignal stays alive through response.text()/json() reads.
  // Every attempt gets its own timeout. Network errors are not acceptance.
  let lastError;
  for (let attempt = 1; attempt <= X402_NO_FUNDS_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchImpl(parsed.href, {
        ...init,
        method,
        redirect: "error",
        signal: AbortSignal.timeout(X402_NO_FUNDS_ATTEMPT_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (attempt < X402_NO_FUNDS_MAX_ATTEMPTS) {
        await sleep(500 * attempt);
      }
    }
  }
  throw new Error("X402_NO_FUNDS_LIVE_ORIGIN_UNREACHABLE", {cause:lastError});
}
