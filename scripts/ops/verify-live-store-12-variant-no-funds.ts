#!/usr/bin/env bun
/**
 * Manual 12-variant live Store readiness census. PUBLIC, READ-ONLY, NO-FUNDS.
 * This does not create signatures, mint rights, call paid query, send a wallet
 * authorization, change live configuration or claim settlement/revenue.
 *
 * Built from the same 12 canonical public request examples as the Store UI.
 */
import { GEOMACRO_STORE_REQUEST_EXAMPLES } from "../../src/lib/store-product-examples";
import { resolveGeomacroCapabilityPrice } from "../../src/lib/capability-pricing-catalog";

const HOST = "https://geomacro.live";
const ENDPOINT = HOST + "/api/x402/risk/availability";
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,100}$/u;
type Result = {
  case_id: string;
  capability: string;
  variant: string;
  expected_price_usdc: string;
  http_status: number | null;
  readiness: "ELIGIBLE_NO_FUNDS_PREFLIGHT_ONLY" | "NOT_ELIGIBLE" | "UNAVAILABLE_OR_RUNTIME_LOCKED" | "UNEXPECTED_RESPONSE";
  reason_code: string;
  missing_module_count: number;
  stale_module_count: number;
  ineligible_source_count: number;
  price_match: boolean;
  genuine_data_deliverable_without_payment: boolean | null;
};
function count(values: unknown) { return Array.isArray(values) ? values.length : 0; }
function safeCode(raw: unknown) {
  return typeof raw === "string" && SAFE_CODE.test(raw) ? raw : "UNSPECIFIED";
}
function newRequest(template: Record<string, unknown>, key: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...template,
    schema_version: "geomacro.agent-query.v1",
    evidence: "required",
  };
  // This is ONLY the buyer's moving cutoff, never a forged published-at time.
  // An actual newly signed, valid GRO must have been issued after it.
  if (key === "signed_new") {
    const product = template.product as Record<string, unknown>;
    body.product = { ...product, issued_after: new Date(Date.now() - 30_000).toISOString() };
  }
  return body;
}
async function inspect(key: string, template: Record<string, unknown>): Promise<Result> {
  const product = template.product as {capability:string;variant:string};
  const price = resolveGeomacroCapabilityPrice(product.capability, product.variant);
  const base: Result = {
    case_id: key, capability: price.capability, variant: price.variant,
    expected_price_usdc: price.amount_usdc, http_status: null,
    readiness: "UNAVAILABLE_OR_RUNTIME_LOCKED", reason_code: "UNREACHABLE",
    missing_module_count: 0, stale_module_count: 0,
    ineligible_source_count: 0, price_match: false,
    genuine_data_deliverable_without_payment: null,
  };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(newRequest(template, key)),
      signal: AbortSignal.timeout(15_000),
    });
    base.http_status = response.status;
    // A no-funds availability endpoint must never issue a payable challenge.
    if (response.status === 402 || response.headers.has("payment-required")) {
      return { ...base, readiness: "UNEXPECTED_RESPONSE", reason_code: "PAYMENT_CHALLENGE_ON_NO_FUNDS_PREFLIGHT" };
    }
    let data: Record<string, any>;
    try {
      const parsed: unknown = await response.json();
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
        throw Error("NON_OBJECT");
      data = parsed as Record<string, any>;
    } catch {
      return { ...base, readiness: "UNEXPECTED_RESPONSE", reason_code: "NON_JSON_RESPONSE" };
    }
    const availability = data.availability ?? {};
    const exact = data.exact_price ?? {};
    const safeBoundaries =
      data.payment_required_now === false && data.execution_authorized === false;
    const priceMatch = exact.amount_usdc === price.amount_usdc &&
      exact.amount_atomic === price.amount_atomic &&
      exact.network === "eip155:8453" &&
      String(exact.asset_contract ?? "").toLowerCase() ===
        "0x833589fcD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
    const success = response.status === 200 && data.ok === true &&
      data.chargeable === true && availability.deliverable === true &&
      availability.code === "AVAILABLE" && safeBoundaries && priceMatch;
    return {
      ...base, price_match: priceMatch,
      genuine_data_deliverable_without_payment: typeof data.data_deliverable_without_payment === "boolean" ?
        data.data_deliverable_without_payment : (typeof availability.deliverable === "boolean" ? availability.deliverable : null),
      missing_module_count: count(availability.missing_modules),
      stale_module_count: count(availability.stale_modules),
      ineligible_source_count: Number.isSafeInteger(availability.ineligible_source_count) ?
        availability.ineligible_source_count : 0,
      readiness: success ? "ELIGIBLE_NO_FUNDS_PREFLIGHT_ONLY" :
        response.status === 422 ? "NOT_ELIGIBLE" :
        response.status === 503 ? "UNAVAILABLE_OR_RUNTIME_LOCKED" :
        "UNEXPECTED_RESPONSE",
      reason_code: success ? "AVAILABLE" : safeCode(data.error?.code ?? availability.code),
    };
  } catch {
    return base;
  }
}
const entries = Object.entries(GEOMACRO_STORE_REQUEST_EXAMPLES);
if (entries.length !== 12) throw Error("STORE_EXAMPLE_COUNT_CHANGED_FAIL_CLOSED");
const results: Result[] = [];
for (const [key, value] of entries) {
  results.push(await inspect(key, value as unknown as Record<string, unknown>));
}
const eligible = results.filter(row => row.readiness === "ELIGIBLE_NO_FUNDS_PREFLIGHT_ONLY").length;
const summary = {
  schema_version: "geomacro.store-twelve-variant-no-funds-census.v1",
  checked_at: new Date().toISOString(),
  canonical_host: HOST,
  checked_variant_count: results.length,
  eligible_variant_count: eligible,
  blocked_variant_count: results.length - eligible,
  all_variants_data_preflight_eligible: eligible === 12,
  payment_requested: false,
  payment_sent: false,
  settlement_attempted: false,
  product_created_by_census: false,
  mainnet_launch_authorized: false,
  warning: "Data availability alone does not prove immutable product-byte readiness, HTTP 402, real provider settlement, legal permission or customer delivery.",
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (eligible !== 12) process.exitCode = 2;
