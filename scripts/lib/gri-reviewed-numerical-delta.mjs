/**
 * Genuine reviewed GRI v1.2 snapshots MUST show an exact numerical movement
 * relative to the independently B2-readback verified historical snapshot.
 *
 * This is a DIRECT SCORE DIFFERENCE, not an event-level change-attribution
 * proof. No independent attribution, previously unknown severity, fresh
 * evidence, rights, signature, or GRI publication is created here.
 *
 * Call ONLY after the signed reviewer, qualified independent original events
 * and exact historical B2 SHA/gzip/continuity checks already passed.
 */
import {GRI_METHOD_VERSION} from "./gri-engine-v12.js";

const SHA=/^[0-9a-f]{64}$/u;
const fail=(what)=>{throw Error("GRI_REVIEWED_NUMERICAL_DELTA_"+what)};
const finiteScore=(n)=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=100;
const validTime=(s)=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&/Z$/u.test(s);

export function reviewedNumericalGriDelta(calculation,verifiedHistoryRows){
  if(!calculation||calculation.methodologyVersion!==GRI_METHOD_VERSION||
     !finiteScore(calculation.rawScore)||
     !Number.isInteger(calculation.displayScore)||
     !finiteScore(calculation.displayScore)||
     calculation.coverage!==1||
     !Array.isArray(calculation.categories)||
     !Array.isArray(verifiedHistoryRows)||
     verifiedHistoryRows.length<2||verifiedHistoryRows.length>1000)
    fail("INCOMPLETE_CURRENT_CALCULATION_OR_HISTORY");
  const previous=verifiedHistoryRows[0];
  if(!previous||previous.status!=="published"||
     previous.verification_status!=="verified"||
     previous.methodology_version!==GRI_METHOD_VERSION||
     !SHA.test(previous.proof_hash??"")||
     !SHA.test(previous.calculation_hash??"")||
     !finiteScore(previous.raw_score)||
     !Number.isInteger(previous.display_score)||
     !finiteScore(previous.display_score)||
     !validTime(previous.as_of)||!validTime(calculation.asOf)||
     Date.parse(previous.as_of)>=Date.parse(calculation.asOf))
    fail("PREVIOUS_SIGNED_SNAPSHOT_INVALID_OR_NOT_PRIOR");
  const delta=calculation.rawScore-previous.raw_score;
  if(!Number.isFinite(delta)||Math.abs(delta)>100)
    fail("INVALID_NUMERICAL_DIFFERENCE");
  return Object.freeze({
    previous_as_of:previous.as_of,
    previous_raw_score:previous.raw_score,
    previous_display_score:previous.display_score,
    change_points:delta,
    // The v1.2 portable proof in this path has previousCalculation=null.
    // Do not claim an independently signed attribution/hash of that change.
    change_hash:null,
    change_attribution:null,
    comparison_method:"VERIFIED_HISTORICAL_RAW_SCORE_DIFFERENCE_ONLY",
    verified_previous_snapshot_id:previous.id,
    numerical_change_not_event_attribution:true,
  });
}
