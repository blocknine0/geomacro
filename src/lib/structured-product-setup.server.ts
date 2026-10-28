import { buildAgentQueryPlan } from "./agent-query-plan";
import {
  checkAgentQueryDeliverability,
  publicAgentQueryAvailability,
} from "./agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "./agent-query-external-modules.server";
import { assembleVerifiedCapabilityProduct } from "./capability-x402-offer.server";
import { freezeCanonicalCapabilityHttpBody } from "./capability-x402-exact-http-body.server";
import { geomacroPricedStructuredOutput } from "./capability-structured-output-contract";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
};
const boundary = {
  chargeable: false,
  payment_required_now: false,
  payment_authorized: false,
  settlement_attempted: false,
  quote_issued: false,
  customer_payload_returned: false,
  execution_authorized: false,
};
function response(body: Record<string, unknown>, status = 200) {
  return Response.json({ ...body, ...boundary }, { status, headers });
}

/** Performs the same admission and product assembly as paid delivery, but
 * returns only validation metadata. Never freezes a ledger quote, signs an
 * object, enables a payment rail, publishes data or returns unpaid content. */
export async function checkStructuredProductSetup(
  request: Request,
  options: {
    check?: typeof checkAgentQueryDeliverability;
    assemble?: typeof assembleVerifiedCapabilityProduct;
    rateLimit?: (request: Request) => boolean;
  } = {},
) {
  if (["payment-signature", "x-payment", "authorization"].some((key) => request.headers.has(key)))
    return response({ ok: false, error: "SETUP_PAYMENT_NOT_ACCEPTED" }, 400);
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return response({ ok: false, error: "SETUP_JSON_REQUIRED" }, 415);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > 8192)
    return response({ ok: false, error: "SETUP_BODY_TOO_LARGE" }, 413);
  if (
    !(
      options.rateLimit?.(request) ??
      allowPublicDemoRequest(request, {
        namespace: "geomacro-structured-product-setup",
        windowMs: 60_000,
        maxPerClient: 3,
        maxGlobal: 24,
      })
    )
  )
    return response({ ok: false, error: "SETUP_RATE_LIMITED" }, 429);
  let plan: ReturnType<typeof buildAgentQueryPlan>;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 8192)
      return response({ ok: false, error: "SETUP_BODY_TOO_LARGE" }, 413);
    plan = buildAgentQueryPlan(JSON.parse(body));
    // This setup is bounded to one country/directional corridor and an exact
    // SKU. Comparison/ranking censuses remain on their existing paid path.
    if (!plan.product || plan.subjects.length !== 1 || plan.as_of || plan.ranking || plan.change)
      return response({ ok: false, error: "SETUP_EXACT_SINGLE_PRODUCT_REQUIRED" }, 400);
  } catch {
    return response({ ok: false, error: "SETUP_REQUEST_INVALID" }, 400);
  }
  if (plan.product?.capability === "risk_gate_bundle" || plan.topics.includes("risk_gate"))
    return response({ ok: false, status: "COMING_SOON", error: "RISK_GATE_COMING_SOON_NO_CHARGE" }, 422);
  let availability;
  try {
    availability = await (options.check ?? checkAgentQueryDeliverability)(plan, {
      externalModuleChecker: checkAgentQueryExternalModule,
    });
  } catch {
    return response({ ok: false, status: "DEPENDENCY_UNAVAILABLE" }, 503);
  }
  const shared = {
    product: plan.product,
    query_plan_hash: plan.query_plan_hash,
    required_modules: plan.required_modules,
    availability: publicAgentQueryAvailability(availability),
  };
  if (!availability.deliverable)
    return response({ ok: false, status: "DATA_NOT_READY", ...shared }, 422);
  try {
    const { price, prepared } = await (options.assemble ?? assembleVerifiedCapabilityProduct)({
      plan,
      availability,
      clientRequestId: null,
    });
    const frozen = freezeCanonicalCapabilityHttpBody(prepared);
    const contract = geomacroPricedStructuredOutput(price.capability, price.variant);
    return response({
      ok: true,
      status: "PRODUCT_PREPARED_PAYMENT_NOT_CHECKED",
      ...shared,
      price_usdc: price.amount_usdc,
      amount_atomic: price.amount_atomic,
      output_contract: contract.schema,
      required_fields_validated: contract.customer_receives,
      prepared_product_sha256: frozen.sha256,
      checked_at: new Date().toISOString(),
      readiness_is_not_a_payment_quote: true,
      recheck_required_at_purchase: true,
    });
  } catch {
    // Raw exception strings can contain source identities, URLs or payload
    // fragments. Never expose internal qualification failures to customers.
    return response({ ok: false, status: "PRODUCT_PREPARATION_BLOCKED", ...shared }, 422);
  }
}
