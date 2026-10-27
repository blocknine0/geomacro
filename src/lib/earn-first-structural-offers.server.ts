import { ZodError } from "zod";
import { agentAdaptiveQuerySchema, buildAgentQueryPlan } from "./agent-query-plan";
import {
  checkAgentQueryDeliverability, publicAgentQueryAvailability,
  type AgentQueryDeliverability,
} from "./agent-query-deliverability.server";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";
import { getCoinbaseX402Config } from "./coinbase-x402.server";
import { STORE_STRUCTURAL_PRODUCTS } from "./store-product-selection";
import { resolveGeomacroCapabilityPrice } from "./capability-pricing-catalog";

const MAX_BODY_BYTES = 8 * 1024;
const PURCHASE_PATH = "/api/v1/intelligence/query";
const FIRST_SALE_PRICE=resolveGeomacroCapabilityPrice("structural_country_digest","standard");
const FIRST_SALE_SAMPLE=Object.freeze({
  schema_version:"geomacro.agent-query.v1",
  product:{capability:"structural_country_digest",variant:"standard"},
  delivery_tier:"structural_baseline",fulfillment_mode:"published_only",
  subjects:[{type:"country",country_iso3:"AUS"}],
  topics:["critical_minerals"],detail:"compact",
});
// This is an executable buyer request template, not proof this market has
// current commercially permitted evidence or that USDC settlement is enabled.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

const templates = [
  { category: "Geopolitics", topics: ["conflict_geopolitics"], module_scope: "geopolitical_security" },
  { category: "Macro/FX", topics: ["macro_risk"], module_scope: "macro_monetary" },
  { category: "Macro/FX", topics: ["fx_external_risk"], module_scope: "external_fx" },
  { category: "Critical Minerals", topics: ["critical_minerals"], module_scope: "critical_minerals" },
] as const;

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function notChargeable(code: string, status = 422) {
  return response({
    ok: false, chargeable: false, payment_required_now: false,
    execution_authorized: false, error: { code },
  }, status);
}

export const earnFirstStructuralOfferHandlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
  GET: async () => response({
    schema_version: "geomacro.earn-first-offers.v1",
    chargeable: false,
    payment_required_now: false,
    execution_authorized: false,
    product_scope: "HISTORICAL_STRUCTURAL_BASELINE_ONLY",
    signed_current_risk_object: false,
    current_event_or_risk_score_promised: false,
    independently_signed_gri_required_for_baseline: false,
    source_native_verified_observation_required: true,
    commercial_derived_use_rights_required: true,
    full_country_risk_assessment_included: false,
    no_new_release_is_not_a_live_event: true,
    purchase_endpoint: PURCHASE_PATH,
    availability_endpoint: "/api/v1/intelligence/availability",
    offers: templates,
    supported_store_products: STORE_STRUCTURAL_PRODUCTS,
    first_qualified_country_digest:{
      schema_version:"geomacro.first-sale-structural-country-digest.v1",
      capability:FIRST_SALE_PRICE.capability,variant:FIRST_SALE_PRICE.variant,
      catalog_price_usdc:FIRST_SALE_PRICE.amount_usdc,
      catalog_amount_atomic:FIRST_SALE_PRICE.amount_atomic,
      catalog_price_is_payment_quote:false,
      payment_authorized:false,payment_required_now:false,
      signed_current_risk_object_included:false,
      availability:{method:"POST",path:"/api/v1/intelligence/availability"},
      purchase:{method:"POST",path:PURCHASE_PATH,only_after_exact_eligible_preflight:true},
      example_no_funds_request:FIRST_SALE_SAMPLE,
      data_freshness_and_commercial_rights_must_be_verified:true,
      real_merchant_activation_and_separate_owner_authorization_required:true,
      current_merchant_status:"RECHECK_AT_REQUEST_TIME",
      historical_unscored_only:true,
    },
    instructions: "POST delivery_tier structural_baseline. Legacy requests require one country/topic. Explicit product selection supports country/corridor digests or full profiles with at least two qualified dimensions. Preflight checks data only; request an exact quote on the canonical purchase endpoint. It is not a payment receipt.",
  }),
  POST: async ({request}: {request: Request}) =>
    preflightStructuralBaseline(request),
};

/**
 * Explicit buyer preflight. It cannot settle, quote, or prepare paid payloads.
 * It checks *exactly* the same source freshness/rights deliverability modules
 * as canonical x402; a positive response is never billed or marketed as GRO.
 */
export async function preflightStructuralBaseline(
  request: Request,
  opts: {
    check?: (plan: ReturnType<typeof buildAgentQueryPlan>) => Promise<AgentQueryDeliverability>;
    rateLimit?: (request: Request) => boolean;
    paymentRailReady?: () => boolean;
  } = {},
): Promise<Response> {
  // Payment headers on an uncharged availability endpoint are rejected.
  if (request.headers.has("payment-signature") ||
      request.headers.has("authorization"))
    return notChargeable("PREFLIGHT_PAYMENT_NOT_ACCEPTED", 400);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return notChargeable("PREFLIGHT_JSON_REQUIRED", 415);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BODY_BYTES)
    return notChargeable("PREFLIGHT_TOO_LARGE", 413);
  const allowed = opts.rateLimit?.(request) ??
    allowPublicDemoRequest(request, {
      namespace: "geomacro-earn-first-structural-preflight",
      windowMs: 60_000, maxPerClient: 3, maxGlobal: 24,
    });
  if (!allowed) return notChargeable("PREFLIGHT_RATE_LIMITED", 429);
  let parsed: unknown;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES)
      return notChargeable("PREFLIGHT_TOO_LARGE", 413);
    parsed = JSON.parse(body);
  } catch { return notChargeable("PREFLIGHT_INVALID_JSON", 400); }

  let plan: ReturnType<typeof buildAgentQueryPlan>;
  try {
    const input = agentAdaptiveQuerySchema.parse(parsed);
    if (input.delivery_tier !== "structural_baseline")
      return notChargeable("PREFLIGHT_EXPLICIT_BASELINE_REQUIRED", 400);
    plan = buildAgentQueryPlan(input);
    if (plan.delivery_tier !== "structural_baseline" ||
        plan.required_modules.includes("signed_risk_object") ||
        plan.required_modules.includes("hot_topics") ||
        plan.required_modules.includes("risk_gate") ||
        plan.required_modules.includes("gri_context"))
      return notChargeable("PREFLIGHT_SCOPE_VIOLATION", 400);
  } catch (error) {
    return notChargeable(error instanceof ZodError
      ? "PREFLIGHT_INVALID_REQUEST" : "PREFLIGHT_UNSUPPORTED_REQUEST", 400);
  }

  let availability: AgentQueryDeliverability;
  try {
    availability = await (opts.check ?? checkAgentQueryDeliverability)(plan);
  } catch {
    return notChargeable("PREFLIGHT_GOVERNED_DATA_UNAVAILABLE", 503);
  }
  // Never report an accidental checker success without subject/module proof.
  // Positive availability must include actual source-native observation time
  // AND a rights-certified derived-commercial source contract. No flags from a
  // mismatched or empty checker response can become a buyer purchase offer.
  const observed = availability.subjects[0]?.latest_evidence_at;
  const observedAt = typeof observed === "string" ? Date.parse(observed) : Number.NaN;
  const rightsReady = availability.source_contracts.length > 0 &&
    availability.source_contracts.every(contract =>
      ["COMMERCIAL_OK", "DERIVED_ONLY"].includes(contract.commercial_usage_status ?? "") &&
      contract.attribution_required === false);
  const eligible = availability.deliverable === true &&
    availability.code === "AVAILABLE" &&
    availability.query_plan_hash === plan.query_plan_hash &&
    availability.subjects.length === 1 &&
    Number.isFinite(observedAt) && observedAt <= Date.now() &&
    rightsReady &&
    availability.ineligible_source_ids.length === 0 &&
    availability.missing_modules.length === 0 &&
    availability.stale_modules.length === 0 &&
    plan.required_modules.every(module =>
      availability.subjects[0].available_modules.includes(module));
  if (!eligible) return response({
    ok: false, chargeable: false, payment_required_now: false,
    execution_authorized: false, query_plan_hash: plan.query_plan_hash,
    status: "NOT_CURRENTLY_DELIVERABLE",
    availability: publicAgentQueryAvailability(availability),
  }, 422);

  let paymentRailReady = false;
  try {
    paymentRailReady = opts.paymentRailReady?.() ?? (() => {
      const config = getCoinbaseX402Config();
      return config?.environment === "production" &&
        Boolean(config.apiKeyId && config.apiKeySecret);
    })();
  } catch { /* Production ACK, emergency freeze, or missing credentials. */ }

  return response({
    ok: true,
    schema_version: "geomacro.earn-first-preflight.v1",
    status: paymentRailReady ? "ELIGIBLE_FOR_X402_QUOTE" : "ELIGIBLE_BUT_PAYMENT_RAIL_LOCKED",
    chargeable: false, payment_required_now: false, execution_authorized: false,
    current_scored_risk_delivered: false, signed_gro_delivered: false,
    delivery_tier: "structural_baseline",
    query_plan_hash: plan.query_plan_hash,
    purchase_endpoint: PURCHASE_PATH,
    payment_rail_ready: paymentRailReady,
    price_authoritative_only_in_canonical_x402_quote: true,
    availability: publicAgentQueryAvailability(availability),
  });
}
