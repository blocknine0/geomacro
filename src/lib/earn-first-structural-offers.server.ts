import { ZodError } from "zod";
import { agentAdaptiveQuerySchema, buildAgentQueryPlan } from "./agent-query-plan";
import {
  checkAgentQueryDeliverability, publicAgentQueryAvailability,
  type AgentQueryDeliverability,
} from "./agent-query-deliverability.server";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";
import { getCoinbaseX402Config } from "./coinbase-x402.server";
import { STORE_STRUCTURAL_PRODUCTS } from "./store-product-selection";
import {qualifiedStructuralBaselinePreflight} from "./structural-baseline-eligibility";
import {buildCountryTierIndex,evaluateCountryTier} from "./country-tier-coverage.server";
import {country195ByIso3} from "./canonical-country-registry-195";

const MAX_BODY_BYTES = 8 * 1024;
const PURCHASE_PATH = "/api/v1/intelligence/query";
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
  GET: async ({request}: {request?:Request} = {}) => {
    if(request && new URL(request.url).searchParams.get("view")==="country-tiers")
      return response(buildCountryTierIndex());
    return response({
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
    instructions: "POST delivery_tier structural_baseline. Legacy requests require one country/topic. Explicit product selection supports country/corridor digests or full profiles with at least two qualified dimensions. Preflight checks data only; request an exact quote on the canonical purchase endpoint. It is not a payment receipt.",
    country_tiers_index: "/api/v1/intelligence/availability?view=country-tiers",
  });
  },
  POST: async ({request}: {request: Request}) =>
    new URL(request.url).searchParams.get("view")==="country-tiers"
      ? preflightCountryTier(request) : preflightStructuralBaseline(request),
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
  const eligible = qualifiedStructuralBaselinePreflight(plan, availability);
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


/**
 * One-country tier evaluation, reusing four exact structural-country-digest
 * paid-path module preflights but never quoting or charging. No extrapolation
 * from routing, country-name aliases, publisher home country or news cadence.
 */
export async function preflightCountryTier(request:Request,opts:{
  rateLimit?:(r:Request)=>boolean;
  check?:Parameters<typeof evaluateCountryTier>[1]["check"];
  live?:Parameters<typeof evaluateCountryTier>[1]["live"];
  now?:Date;
}={}):Promise<Response>{
  if(request.headers.has("payment-signature")||request.headers.has("authorization"))
    return notChargeable("COUNTRY_TIERS_PAYMENT_NOT_ACCEPTED",400);
  const q=new URL(request.url).searchParams;
  if(q.size!==1||q.get("view")!=="country-tiers")
    return notChargeable("COUNTRY_TIERS_QUERY_INVALID",400);
  if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type")??""))
    return notChargeable("COUNTRY_TIERS_JSON_REQUIRED",415);
  const accepted=opts.rateLimit?.(request)??allowPublicDemoRequest(request,{
    namespace:"geomacro-earn-first-country-tier-preflight",
    windowMs:60_000,maxPerClient:2,maxGlobal:12,
  });
  if(!accepted)return notChargeable("COUNTRY_TIERS_RATE_LIMITED",429);
  const declared=Number(request.headers.get("content-length")??0);
  if(!Number.isFinite(declared)||declared>512||declared<0)
    return notChargeable("COUNTRY_TIERS_BODY_TOO_LARGE",413);
  let country:string;
  try{
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>512)throw Error("INVALID_BODY");
    const payload=JSON.parse(raw) as Record<string,unknown>;
    if(!payload||typeof payload!=="object"||Array.isArray(payload)||
      Object.keys(payload).length!==1||typeof payload.country_iso3!=="string"||
      !country195ByIso3(payload.country_iso3))throw Error("INVALID_COUNTRY");
    country=payload.country_iso3;
  }catch{return notChargeable("COUNTRY_TIERS_COUNTRY_INVALID",400)}
  try{
    const result=await evaluateCountryTier(country,{check:opts.check,live:opts.live,now:opts.now});
    return response({ok:true,...result});
  }catch{
    return notChargeable("COUNTRY_TIERS_RUNTIME_UNAVAILABLE",503);
  }
}
