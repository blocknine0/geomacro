/** Authenticated dashboard controls must reflect verified account/session state only. */
export function customerDashboardAccess(
  authenticated: boolean,
  loading: boolean,
  signedOut: boolean,
): "checking" | "authenticated" | "anonymous" {
  if (signedOut) return "anonymous";
  if (loading) return "checking";
  return authenticated ? "authenticated" : "anonymous";
}

/**
 * Logout is successful ONLY after the server acknowledges session revocation.
 * A network failure, a non-2xx status, or a malformed JSON response must
 * never be presented to the customer as successful logout.
 */
export async function revokeCustomerSession(
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher("/api/v1/customer/auth", {
    method: "DELETE",
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok ||
      typeof payload !== "object" ||
      payload === null ||
      !("ok" in payload) ||
      (payload as {ok?: unknown}).ok !== true) {
    const code = typeof payload === "object" && payload !== null && "code" in payload &&
      typeof (payload as {code?: unknown}).code === "string" ?
      String((payload as {code:string}).code) : "CUSTOMER_LOGOUT_NOT_CONFIRMED";
    throw new Error(code);
  }
}
