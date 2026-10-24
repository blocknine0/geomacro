/** Illustrative request timestamp for schema examples. A real newly-issued
 * request replaces it with current UTC; old timestamps never become proof. */
export const STORE_ISSUED_AFTER_EXAMPLE = "2026-10-24T00:00:00.000Z";
const country = { type: "country", country_iso3: "USA" } as const;
const corridor = { type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CAN" } as const;
const structural = { fulfillment_mode: "published_only", delivery_tier: "structural_baseline" } as const;
const signed = { fulfillment_mode: "published_only", delivery_tier: "signed_risk_intelligence" } as const;
const gate = { policy_preset: "balanced", action_type: "exposure_review" } as const;
export const GEOMACRO_STORE_REQUEST_EXAMPLES = {
  country_digest: { ...structural, product: { capability: "structural_country_digest", variant: "standard" }, subjects: [country], topics: ["critical_minerals"], detail: "compact" },
  corridor_digest: { ...structural, product: { capability: "structural_corridor_digest", variant: "standard" }, subjects: [corridor], topics: ["critical_minerals"], detail: "compact" },
  country_profile: { ...structural, product: { capability: "structural_country_profile", variant: "standard" }, subjects: [country], topics: ["macro_risk", "fx_external_risk"], detail: "full" },
  corridor_profile: { ...structural, product: { capability: "structural_corridor_profile", variant: "standard" }, subjects: [corridor], topics: ["macro_risk", "fx_external_risk"], detail: "full" },
  query_focused: { ...signed, product: { capability: "intelligence_query", variant: "focused" }, subjects: [country], topics: ["critical_minerals"], detail: "compact" },
  query_standard: { ...signed, product: { capability: "intelligence_query", variant: "standard" }, subjects: [country], topics: ["macro_risk", "fx_external_risk"], detail: "standard" },
  query_complex: { ...signed, product: { capability: "intelligence_query", variant: "complex_multi_source" }, subjects: [country], topics: ["macro_risk", "fx_external_risk", "critical_minerals"], detail: "full" },
  signed_existing: { ...signed, product: { capability: "signed_risk_object", variant: "existing_valid_signed" }, subjects: [country], topics: ["risk_object"], detail: "compact" },
  signed_new: { ...signed, product: { capability: "signed_risk_object", variant: "newly_qualified_signed", issued_after: STORE_ISSUED_AFTER_EXAMPLE }, subjects: [country], topics: ["risk_object"], detail: "compact" },
  gate_existing: { ...signed, product: { capability: "risk_gate_bundle", variant: "existing_proof_preflight" }, subjects: [country], topics: ["risk_gate", "risk_object"], risk_gate_context: gate, detail: "compact" },
  gate_standard: { ...signed, product: { capability: "risk_gate_bundle", variant: "standard" }, subjects: [country], topics: ["risk_gate", "risk_object", "critical_minerals"], risk_gate_context: gate, detail: "standard" },
  gate_complex: { ...signed, product: { capability: "risk_gate_bundle", variant: "complex_multi_source" }, subjects: [country], topics: ["risk_gate", "risk_object", "macro_risk", "fx_external_risk", "critical_minerals"], risk_gate_context: gate, detail: "full" },
} as const;
