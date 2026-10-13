import { readB2CommercialSourceRights, type B2CommercialSourceRight } from "./b2-live.server";
import { certifiedWdiAttributionRights } from "./wdi-attributed-structural-product.server";
import { approvedWdiAttribution } from "./world-bank-derived-attribution";
import type { PrivateOnDemandMacroDriver } from "./on-demand-private-macro-drivers.server";
import type { WorldBankWdiAttribution } from "./world-bank-derived-attribution";

export type PrivateOnDemandMacroRightsStatus =
  | "NO_ANNUAL_EVIDENCE"
  | "UNVERIFIED_ANNUAL_EVIDENCE"
  | "RIGHTS_RECEIPT_UNAVAILABLE"
  | "SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE"
  | "ATTRIBUTION_NOT_SUPPORTED_BY_PRIVATE_OUTPUT"
  | "DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT";

export type PrivateOnDemandMacroRightsProof = {
  status: PrivateOnDemandMacroRightsStatus;
  checked_driver_count: number;
  rights_verified_driver_count: number;
  // Source rights alone never validate a calibrated score, signed object or payment.
  signed_intelligence_verified: false;
  payment_eligible: false;
  /** Fixed licence-credit metadata required in the final, signed product.
   *  No customer-facing result is deliverable until that happens.
   */
  required_data_attribution: WorldBankWdiAttribution | null;
};

const SOURCE_ID = "world_bank_indicators";
type RightsReader = () => Promise<B2CommercialSourceRight[] | null>;

function result(
  status: PrivateOnDemandMacroRightsStatus,
  checked_driver_count: number,
  rights_verified_driver_count = 0,
  required_data_attribution: WorldBankWdiAttribution | null = null,
): PrivateOnDemandMacroRightsProof {
  return {
    status, checked_driver_count, rights_verified_driver_count,
    signed_intelligence_verified: false, payment_eligible: false,
    required_data_attribution,
  };
}

function structurallySafe(drivers: readonly PrivateOnDemandMacroDriver[]): boolean {
  if (drivers.length < 1 || drivers.length > 2) return false;
  const country = drivers[0].country_iso3;
  const unique = new Set(drivers.map(driver => driver.driver));
  return /^[A-Z]{3}$/.test(country) && unique.size === drivers.length &&
    drivers.every(driver =>
      driver.schema === "geomacro.private-annual-macro-driver.v1" &&
      driver.country_iso3 === country &&
      (driver.driver === "inflation" || driver.driver === "real_gdp_growth") &&
      driver.observation_type === "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" &&
      driver.methodology_status === "DIRECTIONAL_ONLY_NOT_A_CALIBRATED_RISK_SCORE" &&
      Number.isInteger(driver.latest_observation_year) &&
      driver.previous_observation_year === driver.latest_observation_year - 1 &&
      /^[a-f0-9]{64}$/.test(driver.source_observation_sha256) &&
      driver.source_commercial_rights_verified === false &&
      driver.publisher_release_date_verified === false &&
      driver.confidence_calibrated === false &&
      driver.score_verified === false && driver.signed === false &&
      driver.payment_eligible === false);
}

/**
 * Read *one* existing B2 commercial-rights snapshot only when private annual
 * evidence exists. No Supabase fallback and no new provider data acquisition.
 * Fail closed for missing/stale snapshots and unmet attribution obligations.
 *
 * This is solely a private rights prerequisite, NOT a source fact attestation,
 * licensed news event, scored risk, GRO signature or x402 payment approval.
 * Never return source IDs, licence names, raw numerical values or evidence
 * hashes through the customer-facing discovery boundary.
 */
export async function checkPrivateOnDemandMacroRights(
  drivers: readonly PrivateOnDemandMacroDriver[],
  options: { readRights?: RightsReader } = {},
): Promise<PrivateOnDemandMacroRightsProof> {
  if (drivers.length === 0) return result("NO_ANNUAL_EVIDENCE", 0);
  if (!structurallySafe(drivers)) return result("UNVERIFIED_ANNUAL_EVIDENCE", 0);

  let rows: B2CommercialSourceRight[] | null;
  try {
    rows = await (options.readRights ?? readB2CommercialSourceRights)();
  } catch {
    return result("RIGHTS_RECEIPT_UNAVAILABLE", drivers.length);
  }
  if (!rows) return result("RIGHTS_RECEIPT_UNAVAILABLE", drivers.length);
  const matching = rows.filter(row => row.source_id === SOURCE_ID);
  if (matching.length !== 1) {
    return result("SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE", drivers.length);
  }
  // Exception ONLY for the exact rights-certified WDI source=2 annual
  // indicators. They require fixed CC BY 4.0 credit in the final product.
  // This receipt is private and never upgrades a news search to a paid answer.
  const rights=certifiedWdiAttributionRights(rows);
  if(!rights.eligible)return result(
    rights.reason==="WDI_RIGHTS_CONTRACT_MISMATCH"
      ?"ATTRIBUTION_NOT_SUPPORTED_BY_PRIVATE_OUTPUT"
      :"SOURCE_NOT_CERTIFIED_FOR_DERIVED_USE",drivers.length);
  const indicators=drivers.map(x=>x.driver==="inflation"
    ? "FP.CPI.TOTL.ZG" as const : "NY.GDP.MKTP.KD.ZG" as const);
  return result("DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT",
    drivers.length,drivers.length,approvedWdiAttribution(indicators));
}
