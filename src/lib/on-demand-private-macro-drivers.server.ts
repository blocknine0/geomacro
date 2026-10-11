import { createHash } from "node:crypto";
import type { PrivateOfficialMacroChange } from "./on-demand-global-discovery.server";

/**
 * One reusable on-demand engine: interpret authentic annual official macro
 * observations as directional STRUCTURAL evidence without inventing a risk
 * score, news event, source licence, GRO signature or payment entitlement.
 *
 * This interface is PRIVATE. Only safe aggregate counts can cross the API
 * discovery boundary until the governed score+rights+signing bridge is ready.
 */
export type PrivateOnDemandMacroDriver = {
  schema: "geomacro.private-annual-macro-driver.v1";
  country_iso3: string;
  driver: "inflation" | "real_gdp_growth";
  direction: "INCREASING" | "DECREASING" | "UNCHANGED";
  latest_observation_year: number;
  previous_observation_year: number;
  change_percentage_points: number;
  cause: string;
  source_observation_sha256: string;
  observation_type: "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS";
  methodology_status: "DIRECTIONAL_ONLY_NOT_A_CALIBRATED_RISK_SCORE";
  source_commercial_rights_verified: false;
  publisher_release_date_verified: false;
  confidence_calibrated: false;
  score_verified: false;
  signed: false;
  payment_eligible: false;
};

const METHOD_INDICATORS = {
  "FP.CPI.TOTL.ZG": {
    driver: "inflation",
    label: "Annual consumer price inflation",
  },
  "NY.GDP.MKTP.KD.ZG": {
    driver: "real_gdp_growth",
    label: "Annual real GDP growth",
  },
} as const;

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function isValid(input: PrivateOfficialMacroChange, now: Date): boolean {
  const known = Object.prototype.hasOwnProperty.call(METHOD_INDICATORS, input.indicator);
  if (!known || !/^[A-Z]{3}$/.test(input.country_iso3)) return false;
  const {latest_observation_year: latest, previous_observation_year: previous} = input;
  if (!Number.isInteger(latest) || !Number.isInteger(previous) ||
      previous !== latest - 1 || previous < 1960 || latest > now.getUTCFullYear()) return false;
  const {latest_annual_pct: current, previous_annual_pct: prior,
    annual_rate_change_percentage_points: delta} = input;
  if (![current,prior,delta].every(v => typeof v === "number" && Number.isFinite(v))) return false;
  if (Math.abs(current) > 10000 || Math.abs(prior) > 10000) return false;
  if (delta !== Math.round((current-prior)*1e5)/1e5) return false;
  if (input.observation_type !== "ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS" ||
      input.publisher_original_release_date_verified !== false ||
      input.derived_commercial_rights_verified !== false ||
      input.risk_score_verified !== false || input.paid_delivery_allowed !== false) return false;
  return input.source_observation_sha256 === hash([
    input.country_iso3,input.indicator,latest,current,previous,prior,
  ]);
}

/**
 * Fully deterministic; no provider calls, no storage, no external model or
 * false re-dating. Fail the whole bundle closed if even one row is corrupt,
 * duplicated, cross-country or pretends to be a chargeable result.
 */
export function buildPrivateOnDemandMacroDrivers(
  inputs: readonly PrivateOfficialMacroChange[],
  options: { now?: Date } = {},
): PrivateOnDemandMacroDriver[] {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime()) || inputs.length > 2) return [];
  if (inputs.length === 0) return [];
  const countries = new Set(inputs.map(x => x.country_iso3));
  const indicators = new Set(inputs.map(x => x.indicator));
  if (countries.size !== 1 || indicators.size !== inputs.length ||
      inputs.some(x => !isValid(x,now))) return [];
  return inputs.map((input):PrivateOnDemandMacroDriver => {
    const method=METHOD_INDICATORS[input.indicator];
    const delta=input.annual_rate_change_percentage_points;
    const direction=delta>0 ? "INCREASING" : delta<0 ? "DECREASING" : "UNCHANGED";
    const verb=direction==="INCREASING"?"increased":
      direction==="DECREASING"?"decreased":"was unchanged";
    return {
      schema:"geomacro.private-annual-macro-driver.v1",
      country_iso3:input.country_iso3,
      driver:method.driver,direction,
      latest_observation_year:input.latest_observation_year,
      previous_observation_year:input.previous_observation_year,
      change_percentage_points:delta,
      cause:`${method.label} ${verb} between ${input.previous_observation_year} and ${input.latest_observation_year}; this does not establish today's risk level.`,
      source_observation_sha256:input.source_observation_sha256,
      observation_type:"ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS",
      methodology_status:"DIRECTIONAL_ONLY_NOT_A_CALIBRATED_RISK_SCORE",
      source_commercial_rights_verified:false,publisher_release_date_verified:false,
      confidence_calibrated:false,score_verified:false,signed:false,
      payment_eligible:false,
    };
  }).sort((a,b)=>a.driver.localeCompare(b.driver));
}
