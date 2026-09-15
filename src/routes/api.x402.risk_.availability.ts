import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { buildAgentQueryPlan } from "../lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../lib/agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "../lib/agent-query-external-modules.server";
import { getCoinbaseX402Config } from "../lib/coinbase-x402.server";

const MAX_BODY_BYTES = 16 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function body(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Response("Request body is not valid JSON", { status: 400 });
  }
}

export const Route = createFileRoute("/api/x402/risk/availability")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          let config;
          try {
            config = getCoinbaseX402Config();
          } catch (error) {
            return json({
              ok: false,
              chargeable: false,
              payment_required_now: false,
              error: {
                code: "COINBASE_X402_CONFIGURATION_INVALID",
                message: error instanceof Error ? error.message : "Coinbase x402 configuration is invalid.",
              },
              execution_authorized: false,
            }, 503);
          }
          if (!config) {
            return json({
              ok: false,
              chargeable: false,
              payment_required_now: false,
              error: { code: "COINBASE_X402_NOT_CONFIGURED", message: "Coinbase x402 is not enabled in this runtime." },
              execution_authorized: false,
            }, 503);
          }

          const plan = buildAgentQueryPlan(await body(request));
          const availability = await checkAgentQueryDeliverability(plan, {
            externalModuleChecker: checkAgentQueryExternalModule,
          });
          return json({
            ok: availability.deliverable,
            chargeable: availability.deliverable,
            payment_required_now: false,
            product: "geomacro_adaptive_risk_intelligence_v1",
            query_plan_hash: plan.query_plan_hash,
            exact_price: {
              amount_usdc: config.priceUsdc,
              amount_atomic: config.amountAtomic,
              asset: "USDC",
              asset_contract: config.asset,
              network: config.network,
            },
            availability,
            execution_authorized: false,
            note: availability.deliverable
              ? "No-charge check passed. The exact requested product is currently deliverable; payment occurs only on the paid resource."
              : "Geomacro will not request or settle payment while required coverage is unavailable, stale, or commercially ineligible.",
          }, availability.deliverable ? 200 : 422);
        } catch (error) {
          if (error instanceof Response) {
            return json({
              ok: false,
              chargeable: false,
              payment_required_now: false,
              error: { code: "INVALID_AVAILABILITY_REQUEST", message: await error.text() },
              execution_authorized: false,
            }, error.status);
          }
          if (error instanceof ZodError) {
            return json({
              ok: false,
              chargeable: false,
              payment_required_now: false,
              error: {
                code: "INVALID_ADAPTIVE_QUERY",
                issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
              },
              execution_authorized: false,
            }, 400);
          }
          console.error("[x402-availability] check failed", error);
          return json({
            ok: false,
            chargeable: false,
            payment_required_now: false,
            error: {
              code: "AVAILABILITY_CHECK_UNAVAILABLE",
              message: "Availability could not be proven. Payment is disabled for this request.",
            },
            execution_authorized: false,
          }, 503);
        }
      },
    },
  },
});
