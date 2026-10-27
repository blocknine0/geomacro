import { publicGeomacroStructuredOutputCatalog } from "./capability-structured-output-contract";
import {
  resolveGeomacroCapabilityPrice,
  GEOMACRO_CAPABILITY_PRICING_VERSION,
} from "./capability-pricing-catalog";
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "./store-product-examples";

export const STRUCTURED_PRODUCT_SETUP_PATH = "/api/v1/pricing?view=setup";
export const STRUCTURED_PRODUCT_CHECK_PATH = "/api/v1/intelligence/availability?view=setup";

/** Static setup only. Every template selects an exact existing product; all
 * prices and output fields come from the canonical catalogs. No data fetched. */
export function structuredProductSetup() {
  const contracts = publicGeomacroStructuredOutputCatalog();
  const examples = Object.entries(GEOMACRO_STORE_REQUEST_EXAMPLES);
  const products = contracts.map((contract) => {
    const matches = examples.filter(
      ([, request]) =>
        request.product.capability === contract.capability &&
        request.product.variant === contract.variant,
    );
    if (matches.length !== 1) throw Error("STRUCTURED_SETUP_TEMPLATE_MISMATCH");
    const [id, example] = matches[0];
    const price = resolveGeomacroCapabilityPrice(contract.capability, contract.variant);
    return {
      id,
      capability: contract.capability,
      variant: contract.variant,
      price_usdc: price.amount_usdc,
      amount_atomic: price.amount_atomic,
      subject_scope: contract.subject_scope,
      description: contract.description,
      required_fields: contract.customer_receives,
      conditional_fields: contract.only_when_verified,
      prerequisites: [...contract.common_preconditions, ...contract.extra_preconditions],
      example_request: example,
      request_time_fields: id === "signed_new" ? ["product.issued_after"] : [],
      request_time_instruction:
        id === "signed_new"
          ? "Replace product.issued_after with current UTC before requesting. Only a genuinely new, independently verified publication can qualify."
          : null,
      shared_data_policy: "REUSE_EXISTING_QUALIFIED_EVIDENCE_IN_EXACT_REQUEST_SCOPE",
      signed_object_fee: price.included_signed_object_charge,
      preparation_status: "CHECK_EXACT_REQUEST",
      payment_authorized: false,
    };
  });
  return {
    schema: "geomacro.structured-product-setup.v1",
    pricing_version: GEOMACRO_CAPABILITY_PRICING_VERSION,
    currency: "USDC",
    decimals: 6,
    capability_count: new Set(products.map((p) => p.capability)).size,
    variant_count: products.length,
    products,
    preparation_check: {
      method: "POST",
      path: STRUCTURED_PRODUCT_CHECK_PATH,
      returns: "READINESS_SUMMARY_ONLY",
      customer_payload_returned: false,
      quote_issued: false,
      settlement_attempted: false,
    },
    purchase: {
      method: "POST",
      path: "/api/v1/intelligence/query",
      exact_request_rechecked_before_quote: true,
    },
    data_flow: [
      "existing canonical evidence",
      "exact subject/topic and native-date qualification",
      "exact price classification",
      "structured assembly and output-boundary validation",
      "immutable quote and verified settlement",
      "same frozen JSON to users and agents",
    ],
    ingestion_per_product: false,
    raw_source_payload_delivered: false,
    missing_evidence_never_fabricated: true,
    execution_authorized: false,
    live_availability_claimed: false,
    payment_authorized: false,
  } as const;
}
