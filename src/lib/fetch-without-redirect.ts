/** workerd rejects redirect:"error" before sending the request. Use manual
 * mode and reject every 3xx without following Location or forwarding secrets.
 * Exactly one attempt: reservations and writes must never be replayed here. */
export async function fetchWithoutRedirectUsing(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetchImpl(input, {...init, redirect: "manual"});
  if ((response.status >= 300 && response.status < 400) ||
      response.type === "opaqueredirect" || response.redirected) {
    void response.body?.cancel().catch(() => {});
    throw new TypeError("UPSTREAM_REDIRECT_REJECTED");
  }
  return response;
}

export function fetchWithoutRedirect(input: RequestInfo | URL, init?: RequestInit) {
  return fetchWithoutRedirectUsing(globalThis.fetch, input, init);
}
