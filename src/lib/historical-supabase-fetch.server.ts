import { createHash } from "node:crypto";
import { consumeD1CentralSecurityBudget } from "./d1-central-security-budget.server";

const HISTORICAL_ORIGIN = "https://nqvpcbnnvjsrlvyxxevk.supabase.co";
const ROUTE = "historical_supabase_fallback";
const GLOBAL_CLIENT = createHash("sha256")
  .update("geomacro-historical-fallback-one-shared-central-budget-v1")
  .digest("hex");

/**
 * Every privileged historical PostgREST request consumes ONE atomic D1 budget
 * ticket. No local-cache/rate-limit illusion across Cloudflare isolates.
 * B2 is checked first by structural-context; this is a last-resort fallback.
 */
export async function quotaGuardedHistoricalFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  deps: {
    reserve?: typeof consumeD1CentralSecurityBudget;
    fetcher?: typeof fetch;
  } = {},
): Promise<Response> {
  const requestUrl = input instanceof Request ? input.url :
    input instanceof URL ? input.href : String(input);
  const target = new URL(requestUrl);
  const method = String(init?.method ?? (input instanceof Request ? input.method : "GET"))
    .toUpperCase();
  if (target.origin !== HISTORICAL_ORIGIN ||
      !target.pathname.startsWith("/rest/v1/") ||
      method !== "GET" || target.username || target.password) {
    throw new Error("HISTORICAL_FALLBACK_PINNED_READ_ONLY_REQUIRED");
  }
  const receipt = await (deps.reserve ?? consumeD1CentralSecurityBudget)(
    ROUTE, GLOBAL_CLIENT,
  );
  if (receipt.allowed !== true) {
    throw new Error("HISTORICAL_FALLBACK_CENTRAL_D1_BUDGET_HELD");
  }
  return (deps.fetcher ?? fetch)(input, {
    ...init,
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(6500),
  });
}
