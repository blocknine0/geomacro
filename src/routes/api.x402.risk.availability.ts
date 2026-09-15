import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { buildAgentQueryPlan } from "../lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../lib/agent-query-deliverability.server";

const MAX_BODY_BYTES = 16 * 1024;

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function body(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) throw new Response("Content-Type must be application/json", { status: 415 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Response("Request body too large", { status: 413 });
  try { return JSON.parse(raw) as unknown; } catch { throw new Response("Request body is not valid JSON", { status: 400 }); }
}

export const Route = createFileRoute("/api/x402/risk/availability")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }),
      POST: async ({ request }) => {
        try {
          const plan = buildAgentQueryPlan(await body(request));
          const availability = await checkAgentQueryDeliverability(plan);
          return json({
            ok: availability.deliverable,
            chargeable: availability.deliverable,
            payment_required_now: false,
            price_usdc_if_available: "0.02",
            availability,
            execution_authorized: false,
            note: availability.deliverable
              ? "This no-charge check confirms the requested structural modules are currently deliverable. Payment is performed only on the paid resource."
              : "Geomacro will not request or settle payment for this query while required coverage is unavailable or stale.",
          }, availability.deliverable ? 200 : 422);
        } catch (error) {
          if (error instanceof Response) return json({ ok: false, chargeable: false, payment_required_now: false, error: { code: "INVALID_AVAILABILITY_REQUEST", message: await error.text() }, execution_authorized: false }, error.status);
          if (error instanceof ZodError) return json({ ok: false, chargeable: false, payment_required_now: false, error: { code: "INVALID_ADAPTIVE_QUERY", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, execution_authorized: false }, 400);
          console.error("[x402-availability] check failed", error);
          return json({ ok: false, chargeable: false, payment_required_now: false, error: { code: "AVAILABILITY_CHECK_UNAVAILABLE", message: "Availability could not be proven. Payment is disabled for this request." }, execution_authorized: false }, 503);
        }
      },
    },
  },
});
