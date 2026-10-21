// Pure, safe classifications for private Supabase Storage backup transport.
// No object names, credentials, URL paths or response bodies are surfaced.
export function classifyLegacyStorageResponse(status) {
 if (!Number.isInteger(status) || status < 100 || status > 599) return "INVALID_HTTP_STATUS";
 if (status === 200) return "OK";
 if (status === 401 || status === 403) return "SOURCE_AUTHORIZATION_DENIED";
 if (status === 404 || status === 410) return "SOURCE_OBJECT_MISSING";
 if (status === 408 || status === 425 || status === 429 || status === 500 ||
     status === 502 || status === 503 || status === 504 ||
     status === 520 || status === 522 || status === 524) return "SOURCE_TRANSIENT_HTTP";
 return "SOURCE_UNEXPECTED_HTTP";
}
export function isRetryableOriginalStorageCategory(category) {
 return category === "SOURCE_TRANSIENT_HTTP" ||
        category === "SOURCE_NETWORK_OR_TIMEOUT" ||
        category === "SOURCE_BODY_INTERRUPTED";
}
export function retryDelayMs(attempt, retryAfterHeader) {
 if (!Number.isInteger(attempt) || attempt < 0 || attempt > 6)
   throw new Error("INVALID_RETRY_ATTEMPT");
 // Retry-After: seconds only; do not parse dates or unsafe strings.
 const header = String(retryAfterHeader??"").trim();
 const seconds = /^[0-9]{1,2}$/.test(header) ? Number(header) : 0;
 const exponential = Math.min(16000, 1000 * (2 ** attempt));
 return Math.max(Math.min(20000, seconds * 1000), exponential);
}
