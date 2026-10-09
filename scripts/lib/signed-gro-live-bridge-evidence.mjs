// No payment, signing key, B2 payload, source URL or raw GRO is ever output.
// The authenticated D1 canary is run separately with production Actions secrets.
const SAFE_CODES = new Set([
  "INSUFFICIENT_COVERAGE", "NOT_AVAILABLE",
  "STALE_REQUIRED_DATA", "COMMERCIAL_SOURCE_NOT_ELIGIBLE",
]);
const SAFE_MODULES = new Set(["signed_risk_object","risk_gate","gri_context",
  "hot_topics","sovereign_fiscal","political_governance","macro_monetary",
  "external_fx","critical_minerals","geopolitical_security","trade_corridor"]);
export function classifySignedGroLiveBridge({ backendCanary, status, body }) {
  if (backendCanary?.ok !== true ||
      backendCanary?.serving_store !== "cloudflare-d1" ||
      backendCanary?.signature_valid !== true ||
      backendCanary?.commercial_eligibility_verified !== true ||
      backendCanary?.external_payment_performed !== false ||
      backendCanary?.execution_authorized !== false ||
      backendCanary?.country_iso3 !== "USA") {
    throw new Error("SIGNED_GRO_BACKEND_CANARY_NOT_VERIFIED");
  }
  if (body?.payment_required_now !== false ||
      body?.execution_authorized !== false ||
      !/^[0-9a-f]{64}$/u.test(String(body?.query_plan_hash ?? ""))) {
    throw new Error("SIGNED_GRO_BRIDGE_UNSAFE_PRELAUNCH_RESPONSE");
  }
  const a = body?.availability;
  const missingModules = Array.isArray(a?.missing_modules)
    ? [...new Set(a.missing_modules.filter(x => typeof x === "string" && SAFE_MODULES.has(x)))].sort()
    : [];
  const summary = {
    schema: "geomacro.signed-gro-live-bridge.v1",
    country_iso3: "USA",
    backend_d1_signed_gro_verified: true,
    production_funds_authorized: false,
    payment_performed: false,
    execution_authorized: false,
    site_http_status: status,
    site_deliverable: a?.deliverable === true,
    site_code: SAFE_CODES.has(a?.code) ? a.code : a?.code === "AVAILABLE" ? "AVAILABLE" : "UNEXPECTED",
    site_missing_modules: missingModules,
    site_secret_config: "NOT_OBSERVABLE_FROM_GITHUB",
    site_build_revision: "NOT_INFERRED_FROM_BACKEND",
  };
  if (status === 200 && a?.deliverable === true && a.code === "AVAILABLE") {
    return { ...summary, outcome: "LIVE_TESTNET_NO_CHARGE_AVAILABLE", action: "MAINNET_AND_GLOBAL_COVERAGE_STILL_UNVERIFIED" };
  }
  if (status === 422 && a?.deliverable === false && SAFE_CODES.has(a.code)) {
    return {
      ...summary,
      outcome: missingModules.includes("signed_risk_object")
        ? "BACKEND_VERIFIED_SITE_SIGNED_GRO_MISSING"
        : "BACKEND_VERIFIED_SITE_OTHER_MODULE_UNAVAILABLE",
      action: "CHECK_EXACT_LOVABLE_PUBLISHED_SHA_AND_SERVER_CONTROL_PLANE_TOKEN_WITHOUT_DISCLOSING_SECRET",
    };
  }
  throw new Error("SIGNED_GRO_BRIDGE_UNEXPECTED_AVAILABILITY_CONTRACT");
}
