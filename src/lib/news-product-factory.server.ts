import { buildAgentQueryPlan } from "./agent-query-plan";
import {
  checkAgentQueryDeliverability,
  publicAgentQueryAvailability,
} from "./agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "./agent-query-external-modules.server";
import { assembleVerifiedCapabilityProduct } from "./capability-x402-offer.server";
import { buildNewsProductPacket } from "./news-product-factory";
import type { normalizeReusableNewsJson } from "./reusable-news-json";

/** Internal materializer. Caller selects a product, never supplies a price,
 * admission flag or model-generated signature. An extracted news item is the
 * trigger/scope seed; its unverified claims are not smuggled into paid bytes. */
export async function materializeNewsProduct(
  input: {
    news: ReturnType<typeof normalizeReusableNewsJson>;
    product_id: string;
    destination_country_iso3?: string;
    issued_after?: string;
  },
  options: {
    check?: typeof checkAgentQueryDeliverability;
    assemble?: typeof assembleVerifiedCapabilityProduct;
  } = {},
) {
  const packet = await buildNewsProductPacket(input.news, {
    destination_country_iso3: input.destination_country_iso3,
  });
  const selected = packet.products.find((p) => p.id === input.product_id);
  if (!selected) throw Error("NEWS_FACTORY_PRODUCT_UNKNOWN");
  const base = {
    packet_sha256: packet.packet_sha256,
    input_id: packet.input_id,
    product_id: selected.id,
    news_extraction_verified: false,
    quote_issued: false,
    payment_authorized: false,
    execution_authorized: false,
  };
  if (!selected.canonical_request) return { ...base, status: selected.status };
  const request = structuredClone(selected.canonical_request);
  if (selected.id === "signed_new") {
    if (!input.issued_after) return { ...base, status: "RECENT_ISSUANCE_CUTOFF_REQUIRED" };
    (request.product as Record<string, unknown>).issued_after = input.issued_after;
  } else if (input.issued_after) throw Error("NEWS_FACTORY_ISSUANCE_SCOPE_INVALID");
  const plan = buildAgentQueryPlan(request);
  let availability;
  try {
    availability = await (options.check ?? checkAgentQueryDeliverability)(plan, {
      externalModuleChecker: checkAgentQueryExternalModule,
    });
  } catch {
    return { ...base, status: "CONTEXT_DEPENDENCY_UNAVAILABLE" };
  }
  if (!availability.deliverable)
    return {
      ...base,
      status: "CONTEXT_NOT_AVAILABLE",
      availability: publicAgentQueryAvailability(availability),
    };
  let result;
  try {
    result = await (options.assemble ?? assembleVerifiedCapabilityProduct)({
      plan,
      availability,
      clientRequestId: null,
    });
  } catch {
    return { ...base, status: "CONTEXT_PREPARATION_BLOCKED" };
  }
  const { price, prepared } = result;
  if (
    price.capability !== selected.capability ||
    price.variant !== selected.variant ||
    price.amount_atomic !== selected.amount_atomic
  )
    throw Error("NEWS_FACTORY_PRICE_BINDING_INVALID");
  return {
    ...base,
    status: "QUALIFIED_CONTEXT_PREPARED",
    canonical_request: request,
    purchase_endpoint: selected.purchase_endpoint,
    price,
    prepared_context: prepared,
    news_draft: selected.draft,
    news_draft_is_not_in_qualified_customer_bytes: true,
    canonical_purchase_rechecks_and_settles: true,
  };
}
