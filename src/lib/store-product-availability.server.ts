import { ZodError } from "zod";
import { agentAdaptiveQuerySchema, buildAgentQueryPlan } from "./agent-query-plan";
import {
  checkAgentQueryDeliverability, publicAgentQueryAvailability,
  type AgentQueryDeliverability,
} from "./agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "./agent-query-external-modules.server";
import { resolveEligiblePublishedCapabilityPrice } from "./verified-capability-coinbase-binding.server";
import { resolveGeomacroCapabilityPrice, publicCapabilityPricingCatalog } from "./capability-pricing-catalog";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";

type Plan = ReturnType<typeof buildAgentQueryPlan>;
type ClassifiedPrice = ReturnType<typeof resolveGeomacroCapabilityPrice>;
const MAX_BODY_BYTES = 8 * 1024;
const PATH = "/api/v1/intelligence/products-availability";
const PURCHASE = "/api/v1/intelligence/query";
const HEADERS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
} as const;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...HEADERS, ...headers } });
const denied = (code: string, status: number) => json({
  ok: false, chargeable: false, payment_required_now: false,
  payment_authorized: false, execution_authorized: false,
  error: { code },
}, status);

/** Discovery is static and does not read D1/B2 or infer that a sale is ready. */
export function storeProductAvailabilityDiscovery() {
  return {
    schema_version: "geomacro.store-product-availability.v1",
    status: "DISCOVERY_NOT_LIVE_DATA_PROOF",
    method: "POST",
    endpoint: PATH,
    purchase_endpoint: PURCHASE,
    canonical_price_endpoint: "/api/v1/pricing",
    preflight_requires_explicit_product: true,
    preflight_checks_original_native_clock_and_rights: true,
    signed_products_require_independently_verified_current_proof: true,
    preflight_is_not_a_frozen_buyer_payload: true,
    preflight_is_not_an_x402_quote: true,
    preflight_is_not_payment_authorization: true,
    payment_rail_independence: "DATA_ONLY_CHECK_WHILE_RAIL_MAY_BE_LOCKED",
    charged_now: false,
    supported_products: publicCapabilityPricingCatalog().map(row => ({
      capability: row.capability,
      variants: row.variants.map(price => ({
        variant: price.variant,
        amount_usdc: price.amount_usdc,
        amount_atomic: price.amount_atomic,
        currency: price.currency,
        indicative_catalog_only: true,
      })),
    })),
    example_requests: GEOMACRO_STORE_REQUEST_EXAMPLES,
    example_signed_new_issued_after_must_be_updated: true,
    country_routing_is_not_verified_current_coverage: true,
  };
}

/** Read-only per-request DATA proof, independent of merchant launch.
 * Does not generate an object, quote, signed proof, ledger reservation,
 * storage mutation, payment, or broader right to sell raw upstream content.
 * The canonical POST alone can prepare exact immutable bytes and issue 402.
 */
export async function preflightStoreProductData(
  request: Request,
  options: {
    rateLimit?: (request: Request) => boolean;
    check?: (plan: Plan) => Promise<AgentQueryDeliverability>;
    classify?: (plan: Plan, availability: AgentQueryDeliverability) => ClassifiedPrice;
  } = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (url.search || url.hash) return denied("STORE_PREFLIGHT_QUERY_UNSUPPORTED", 400);
  if (request.headers.has("authorization") || request.headers.has("payment-signature"))
    return denied("STORE_PREFLIGHT_PAYMENT_HEADERS_FORBIDDEN", 400);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return denied("STORE_PREFLIGHT_JSON_REQUIRED", 415);
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null &&
      (!/^\d+$/.test(lengthHeader) || Number(lengthHeader) > MAX_BODY_BYTES))
    return denied("STORE_PREFLIGHT_TOO_LARGE", 413);
  if (!(options.rateLimit?.(request) ?? allowPublicDemoRequest(request, {
    namespace: "geomacro-store-product-data-preflight",
    windowMs: 60_000, maxPerClient: 2, maxGlobal: 12,
  }))) return denied("STORE_PREFLIGHT_RATE_LIMITED", 429);

  let plan: Plan;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES)
      return denied("STORE_PREFLIGHT_TOO_LARGE", 413);
    const input = agentAdaptiveQuerySchema.parse(JSON.parse(raw));
    if (!input.product || input.fulfillment_mode !== "published_only")
      return denied("STORE_PREFLIGHT_EXPLICIT_PUBLISHED_PRODUCT_REQUIRED", 400);
    plan = buildAgentQueryPlan(input);
    if (!plan.product || plan.product.capability !== input.product.capability ||
        plan.product.variant !== input.product.variant)
      return denied("STORE_PREFLIGHT_PRODUCT_BINDING_INVALID", 400);
  } catch (error) {
    return denied(error instanceof ZodError
      ? "STORE_PREFLIGHT_INVALID_PRODUCT_PLAN"
      : "STORE_PREFLIGHT_INVALID_REQUEST", 400);
  }

  let availability: AgentQueryDeliverability;
  try {
    availability = await (options.check?.(plan) ??
      checkAgentQueryDeliverability(plan, {
        externalModuleChecker: checkAgentQueryExternalModule,
      }));
  } catch {
    return denied("STORE_PREFLIGHT_GOVERNED_PROOF_UNAVAILABLE", 503);
  }
  // Reject mismatched, stale, missing, or partial proof before even using the
  // canonical price classifier. No client assertion creates eligibility.
  if (!availability || availability.deliverable !== true ||
      availability.code !== "AVAILABLE" ||
      availability.query_plan_hash !== plan.query_plan_hash ||
      availability.subjects.length !== plan.subjects.length ||
      availability.missing_modules.length !== 0 ||
      availability.stale_modules.length !== 0 ||
      availability.ineligible_source_ids.length !== 0) {
    return json({
      ok: false, status: "DATA_NOT_CURRENTLY_DELIVERABLE",
      chargeable: false, payment_required_now: false,
      payment_authorized: false, execution_authorized: false,
      query_plan_hash: plan.query_plan_hash,
      availability: availability ? publicAgentQueryAvailability(availability) : null,
    }, 422);
  }

  let price: ClassifiedPrice;
  try {
    price = options.classify?.(plan, availability) ??
      resolveEligiblePublishedCapabilityPrice(plan, availability);
    if (price.capability !== plan.product!.capability ||
        price.variant !== plan.product!.variant)
      throw Error("STORE_PREFLIGHT_VARIANT_MISMATCH");
    const catalog = resolveGeomacroCapabilityPrice(price.capability, price.variant);
    if (price.amount_atomic !== catalog.amount_atomic ||
        price.amount_usdc !== catalog.amount_usdc)
      throw Error("STORE_PREFLIGHT_CATALOG_MISMATCH");
  } catch {
    return denied("STORE_PREFLIGHT_CAPABILITY_PROOF_UNVERIFIED", 422);
  }

  return json({
    ok: true,
    schema_version: "geomacro.store-product-data-preflight.v1",
    status: "DATA_ELIGIBLE_NOT_YET_PREPARED_OR_PAYABLE",
    selected_product: { capability: price.capability, variant: price.variant },
    catalog_price: {
      amount_usdc: price.amount_usdc, amount_atomic: price.amount_atomic,
      currency: "USDC", authoritative_payment_quote: false,
    },
    query_plan_hash: plan.query_plan_hash,
    availability: publicAgentQueryAvailability(availability),
    next_endpoint: PURCHASE,
    requires_canonical_prepared_customer_bytes_and_merchant_authorization: true,
    chargeable: false, payment_required_now: false,
    payment_authorized: false, execution_authorized: false,
  });
}

export const storeProductAvailabilityHandlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: HEADERS }),
  GET: async () => json(storeProductAvailabilityDiscovery(), 200, {
    "Cache-Control": "public, max-age=300, must-revalidate",
  }),
  POST: async ({request}: {request: Request}) => preflightStoreProductData(request),
};
