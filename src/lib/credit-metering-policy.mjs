/**
 * Canonical prepaid CREDIT metering, shared across SSR and D1 Worker.
 * Direct USDC cash quotes are a separate billing mode with no credit/USD
 * conversion. Historical funded receipts retain their recorded contract.
 */
export const GEOMACRO_CREDIT_CONTRACT_VERSION="credits-v1.1.0";
export const GEOMACRO_CREDIT_COSTS=Object.freeze({
 intelligence_query:1,gri_read:1,structural_country_digest:3,
 structural_corridor_digest:5,structural_country_profile:8,
 structural_corridor_profile:12,signed_risk_object:10,risk_gate_bundle:15,
});
/** Advertised capabilities are NOT permission to activate unavailable sales. */
export const GEOMACRO_NEW_SALE_TIER_CAPABILITIES=Object.freeze({
 starter_dev:Object.freeze(["intelligence_query","structural_country_digest","structural_country_profile"]),
 pro_analyst:Object.freeze(["intelligence_query","structural_country_digest","structural_corridor_digest","structural_country_profile","structural_corridor_profile"]),
 business_pilot:Object.freeze(["intelligence_query","structural_country_digest","structural_corridor_digest","structural_country_profile","structural_corridor_profile","signed_risk_object","risk_gate_bundle"]),
});
/** The paid-authorize and paid-debit customer paths must have identical scope. */
export const GEOMACRO_CUSTOMER_METERABLE_CAPABILITIES=Object.freeze([
 "intelligence_query","structural_country_digest","structural_corridor_digest",
 "structural_country_profile","structural_corridor_profile","signed_risk_object",
]);
