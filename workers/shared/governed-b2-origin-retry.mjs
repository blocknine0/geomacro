// Fail-closed, quota-aware recovery for existing Cloudflare verified B2 origins.
// Each invocation of readOnce MUST acquire its own atomic D1 GET reservation and
// independently calculate a fresh AWS SigV4 signature before contacting B2.
// Only transport errors and transient 408/5xx responses get one bounded retry.
// 401/403/404/429, missing D1, quota denial, hashes, signatures and expiry
// never qualify for retry or for a synthetic successful response.
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;
const RETRYABLE = /^B2_(?:EDGE_|INTELLIGENCE_EDGE_)(?:TRANSPORT_UNAVAILABLE|READ_(?:408|500|502|503|504))$/;
const B2_STATUS = /^B2_(?:EDGE_|INTELLIGENCE_EDGE_)READ_(\d{3})$/;

export function retryableGovernedB2OriginFailure(error) {
  return error instanceof Error && RETRYABLE.test(error.message);
}

// Whitelisted categories only: never emit exception stacks, response bodies,
// credentials, object names, bucket names or secrets in diagnostics.
export function classifyGovernedB2OriginFailure(error) {
  const code = error instanceof Error ? error.message : "";
  if (code === "B2_EDGE_CONFIG_REQUIRED" ||
      code === "B2_INTELLIGENCE_EDGE_CONFIG_REQUIRED") return "B2_CREDENTIAL_CONFIG_MISSING";
  if (code === "B2_QUOTA_D1_UNAVAILABLE" ||
      code.startsWith("B2_QUOTA_")) return "D1_QUOTA_OR_RECEIPT_FAILURE";
  if (code.endsWith("_SHARED_ACCOUNT_QUOTA_EXHAUSTED") ||
      code === "B2_GLOBAL_DAILY_QUOTA_EXHAUSTED") return "D1_ACCOUNT_QUOTA_DENIED";
  if (code === "B2_EDGE_TRANSPORT_UNAVAILABLE" ||
      code === "B2_INTELLIGENCE_EDGE_TRANSPORT_UNAVAILABLE") return "B2_TRANSPORT_UNAVAILABLE";
  const status = B2_STATUS.exec(code)?.[1];
  if (status === "401") return "B2_CREDENTIALS_REJECTED";
  if (status === "403") return "B2_FORBIDDEN_OR_PROVIDER_CAP";
  if (status === "404") return "B2_OBJECT_NOT_FOUND";
  if (status === "429") return "B2_PROVIDER_RATE_LIMIT";
  if (status && ["408","500","502","503","504"].includes(status))
    return "B2_UPSTREAM_TRANSIENT";
  if (status) return "B2_UPSTREAM_REJECTED";
  if (code.endsWith("_SIZE_INVALID")) return "B2_OBJECT_SIZE_INVALID";
  return "VERIFIED_EVIDENCE_OR_RUNTIME_UNAVAILABLE";
}

export async function withGovernedB2OriginRetry(readOnce, {pause = ms =>
  new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  if (typeof readOnce !== "function") throw new TypeError("B2_READ_CALLBACK_REQUIRED");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await readOnce();
    } catch (error) {
      if (attempt === MAX_ATTEMPTS || !retryableGovernedB2OriginFailure(error)) throw error;
      await pause(RETRY_DELAY_MS);
    }
  }
  throw new Error("B2_BOUNDED_RETRY_EXHAUSTED");
}
