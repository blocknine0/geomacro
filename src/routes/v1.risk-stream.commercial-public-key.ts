import { createFileRoute } from "@tanstack/react-router";
import { fetchWithoutRedirect } from "../lib/fetch-without-redirect";

const ORIGIN = "https://geomacro-control-plane.daspallab202391.workers.dev";
const HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function forwardCommercialPublicKey(
  fetcher: typeof fetchWithoutRedirect = fetchWithoutRedirect,
): Promise<Response> {
  try {
    const upstream = await fetcher(`${ORIGIN}/v1/risk-stream/commercial-public-key`, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      throw new Error("REDIRECT_FORBIDDEN");
    }
    const outHeaders = new Headers(HEADERS);
    const ct = upstream.headers.get("content-type");
    if (ct) outHeaders.set("content-type", ct);
    return new Response(await upstream.text(), { status: upstream.status, headers: outHeaders });
  } catch {
    return Response.json(
      { ok: false, error: "COMMERCIAL_PUBLIC_KEY_UNAVAILABLE" },
      { status: 502, headers: HEADERS },
    );
  }
}

export const Route = createFileRoute("/v1/risk-stream/commercial-public-key")({
  server: {
    handlers: {
      GET: async () => forwardCommercialPublicKey(),
    },
  },
});
