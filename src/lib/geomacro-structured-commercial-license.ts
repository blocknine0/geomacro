/**
 * Geomacro's CUSTOMER-FACING structured-intelligence product licence.
 * Controls terms for Geomacro-owned DERIVED EXPRESSION only.
 * It does NOT grant third-party upstream article/dataset rights, permit
 * redistribution of raw inputs, certify source eligibility, or charge money.
 */
export const GEOMACRO_STRUCTURED_LICENSE_ID=
  "geomacro.structured-intelligence-commercial-license.v1" as const;
export const GEOMACRO_STRUCTURED_LICENSE_PATH=
  "/legal/structured-intelligence-license.html" as const;
export const GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH=
  "/.well-known/geomacro-structured-license.json" as const;
export const GEOMACRO_STRUCTURED_LICENSE_EFFECTIVE_AT=
  "2026-10-18" as const;

export const GEOMACRO_STRUCTURED_LICENSE_DISCOVERY=Object.freeze({
  id:GEOMACRO_STRUCTURED_LICENSE_ID,
  version:"1.0.0",
  licensor:"Geomacro",
  human_readable:GEOMACRO_STRUCTURED_LICENSE_PATH,
  machine_readable:GEOMACRO_STRUCTURED_LICENSE_MACHINE_PATH,
  applies_to:"ELIGIBLE_GEOMACRO_ORIGINAL_DERIVED_STRUCTURED_OUTPUT_ONLY",
  permitted_use:"CONTRACTED_INTERNAL_AND_EMBEDDED_APPLICATION_USE",
  excluded:"RAW_UPSTREAM_OR_THIRD_PARTY_MATERIAL_AND_BULK_DATA_RESALE",
  raw_source_material_delivered:false,
  raw_upstream_redistribution_granted:false,
  upstream_source_rights_granted:false,
  existing_attribution_obligations_unchanged:true,
  source_eligibility_still_required:true,
  customer_license_acceptance_implied_by_discovery:false,
  customer_payment_authorized_by_license:false,
  commercial_product_availability_proven_by_license:false,
  execution_authorized:false,
} as const);

/** Public headers ONLY on actual derived-product 402 offers and 200 delivery.
 * A license reference discloses terms; it does not prove buyer acceptance or
 * authorize funds when there is no independently verified deliverability.
 */
export const GEOMACRO_STRUCTURED_LICENSE_HEADERS=Object.freeze({
  "X-Geomacro-Output-License":GEOMACRO_STRUCTURED_LICENSE_ID,
  "Link":'<https://geomacro.live'+GEOMACRO_STRUCTURED_LICENSE_PATH+'>; rel="license"',
  "X-Geomacro-Raw-Data-Delivered":"false",
} as const);
