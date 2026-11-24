import { createFileRoute } from "@tanstack/react-router";
import { fetchWithoutRedirect } from "../lib/fetch-without-redirect";

const ORIGIN = "https://geomacro-control-plane.daspallab202391.workers.dev";
export const PREDGE_DECISION_SUPPORT_NOTICE =
  "Decision support only. GeoMacro does not initiate, authorize, approve, or execute any payment, trade, or transaction. All execution decisions, actions, and resulting outcomes remain the sole responsibility of the user or AI agent.";

const BASE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Vary": "Authorization",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Predge-End-Buyer-Id, X-Predge-Market-Id",
};

export async function forwardPredgePaidRiskGate(
  request: Request,
  fetcher: typeof fetchWithoutRedirect = fetchWithoutRedirect,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: BASE_HEADERS });
  }
  if (request.method !== "POST") {
    return Response.json(
      { ok: false, error: "METHOD_NOT_ALLOWED", execution_authorized: false, decision_support_notice: PREDGE_DECISION_SUPPORT_NOTICE },
      { status: 405, headers: BASE_HEADERS },
    );
  }

  const forwardHeaders = new Headers();
  for (const [k, v] of request.headers.entries()) {
    const lk = k.toLowerCase();
    if (lk === "authorization" || lk === "content-type" || lk === "accept" || lk.startsWith("x-predge-") || lk.startsWith("x-geomacro-")) {
      forwardHeaders.set(k, v);
    }
  }
  if (!forwardHeaders.has("content-type")) forwardHeaders.set("content-type", "application/json");

  try {
    const bodyText = await request.text();
    const upstream = await fetcher(`${ORIGIN}/v2/partner/predge/paid-risk-gate`, {
      method: "POST",
      redirect: "manual",
      headers: forwardHeaders,
      body: bodyText,
      signal: AbortSignal.timeout(15_000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      throw new Error("REDIRECT_FORBIDDEN");
    }

    const outHeaders = new Headers(BASE_HEADERS);
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (lk.startsWith("x-geomacro-") || lk === "content-type") {
        outHeaders.set(k, v);
      }
    });

    const raw = await upstream.text();
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const enriched = {
          ...(parsed as Record<string, unknown>),
          decision_support_notice: PREDGE_DECISION_SUPPORT_NOTICE,
        };
        outHeaders.set("content-type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(enriched), { status: upstream.status, headers: outHeaders });
      }
    } catch {
      // Fall through to raw passthrough if upstream body is non-JSON.
    }
    return new Response(raw, { status: upstream.status, headers: outHeaders });
  } catch {
    return Response.json(
      {
        ok: false,
        error: "PREDGE_PAID_RISK_GATE_PROXY_UNAVAILABLE",
        execution_authorized: false,
        decision_support_notice: PREDGE_DECISION_SUPPORT_NOTICE,
      },
      { status: 502, headers: BASE_HEADERS },
    );
  }
}

export const Route = createFileRoute("/v2/partner/predge/paid-risk-gate")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => forwardPredgePaidRiskGate(request),
      POST: async ({ request }) => forwardPredgePaidRiskGate(request),
    },
  },
});
