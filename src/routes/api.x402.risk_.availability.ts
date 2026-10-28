import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { buildAgentQueryPlan } from "../lib/agent-query-plan";
import { checkAgentQueryDeliverability, publicAgentQueryAvailability } from "../lib/agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "../lib/agent-query-external-modules.server";
import { getCoinbaseX402Config } from "../lib/coinbase-x402.server";
import {resolveEligibleCoinbaseCapabilityConfig} from "../lib/verified-capability-coinbase-binding.server";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import { exactGeomacroUsdcRail } from "../lib/usdc-native-rail-identities";

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

export const Route = createFileRoute("/api/x402/risk_/availability")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        try {
          // No funds, and no secrets: identify the *actual data* blocker even
          // while the Coinbase/mainnet commercial ACK deliberately stays OFF.
          // Query-specific public availability remains rate-limited to
          // protect the free source and D1/B2 budgets.
          if (!allowPublicDemoRequest(request, {
            namespace: "coinbase-store-no-funds-readiness",
            windowMs: 60_000, maxPerClient: 12, maxGlobal: 24,
          })) {
            return json({ ok: false, chargeable: false, payment_required_now: false,
              error: { code: "AVAILABILITY_RATE_LIMITED" },
              execution_authorized: false }, 429);
          }
          const plan = buildAgentQueryPlan(await body(request));
          const availability = await checkAgentQueryDeliverability(plan, {
            externalModuleChecker: checkAgentQueryExternalModule,
          });
          const dataStatus = publicAgentQueryAvailability(availability);
          let config;
          try {
            config = getCoinbaseX402Config();
          } catch {
            // Never expose launch-ACK values, receiver IDs or secret config
            // details publicly. Missing rail does not excuse skipped source
            // qualification or promote a request to payable.
            return json({
              ok: false, chargeable: false, payment_required_now: false,
              payment_rail_ready: false,
              data_deliverable_without_payment: availability.deliverable,
              availability: dataStatus,
              error: { code: "COINBASE_X402_CONFIGURATION_INVALID" },
              execution_authorized: false,
            }, 503);
          }
          if (!config) {
            return json({
              ok: false, chargeable: false, payment_required_now: false,
              payment_rail_ready: false,
              data_deliverable_without_payment: availability.deliverable,
              availability: dataStatus,
              error: { code: "COINBASE_X402_NOT_CONFIGURED" },
              execution_authorized: false,
            }, 503);
          }
          if (plan.product && (config.environment !== "production" || config.commercialEnvironment !== "mainnet" ||
              exactGeomacroUsdcRail(config.network, config.asset)?.id !== "base" || !config.apiKeyId || !config.apiKeySecret)) {
            return json({ ok: false, chargeable: false, payment_required_now: false,
              payment_rail_ready: false, data_deliverable_without_payment: availability.deliverable,
              availability: dataStatus, error: { code: "STORE_MAINNET_CONFIGURATION_REQUIRED" },
              execution_authorized: false }, 503);
          }
          let pricedConfig = null;
          if (availability.deliverable) {
            try {
              pricedConfig = resolveEligibleCoinbaseCapabilityConfig(plan, availability, config);
            } catch {
              return json({ok:false,chargeable:false,payment_required_now:false,
                execution_authorized:false,
                error:{code:"CAPABILITY_PRICE_ELIGIBILITY_UNVERIFIED_NO_CHARGE"}},422);
            }
          }
          return json({
            ok: availability.deliverable,
            chargeable: availability.deliverable,
            payment_required_now: false,
            product: "geomacro_adaptive_risk_intelligence_v1",
            query_plan_hash: plan.query_plan_hash,
            exact_price: pricedConfig ? {
              amount_usdc: pricedConfig.priceUsdc,
              amount_atomic: pricedConfig.amountAtomic,
              asset: "USDC",
              asset_contract: pricedConfig.asset,
              network: pricedConfig.network,
            } : null,
            availability: publicAgentQueryAvailability(availability),
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
