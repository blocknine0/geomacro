import {GRI_CURRENT_READING_WINDOW_HOURS} from "./gri-current-contract";
import {PUBLIC_RISK_INDICES_CONTRACT_VERSION,type PublicRiskIndices} from "./risk-indices.types";

/**
 * Validate each certified domain INDEPENDENTLY. Previously the browser
 * rejected the entire verified package when even one domain lacked a value
 * or two history samples, throwing away genuinely available readings.
 *
 * An internal triage score is not a GRI index: this function accepts only
 * the pre-existing certified public risk-indices contract, never private
 * internal-news-score envelopes, free Finds or customer-side estimates.
 */
export function verifiedRiskIndicesShape(data:PublicRiskIndices|null|undefined,now=Date.now()):data is PublicRiskIndices{
 if(!data||data.contractVersion!==PUBLIC_RISK_INDICES_CONTRACT_VERSION||
  data.parentMethodologyVersion!=="gri-v1.2.0"||
  data.proofScope!=="verified-category-projection"||
  data.verificationStatus!=="verified"||!Array.isArray(data.indices)||
  data.indices.length!==3||!Number.isFinite(now))return false;
 const snapshot=Date.parse(data.snapshotAsOf);
 if(!Number.isFinite(snapshot)||snapshot>now+5*60_000||
  typeof data.snapshotId!=="string"||data.snapshotId.length<1||
  typeof data.proofHash!=="string"||!/^[a-f0-9]{64}$/i.test(data.proofHash))
  return false;
 const expected=new Map([
  ["geopolitics","geopolitics"],["macro","macro"],["critical_minerals","rare_earth"]
 ]);
 for(const index of data.indices){
  if(!expected.has(index.key)||expected.get(index.key)!==index.sourceCategory)return false;
  expected.delete(index.key);
  if(index.readingStatus!=="current"&&index.readingStatus!=="last_verified")return false;
  if(index.status==="unavailable"){
   // A missing signed domain must not smuggle a synthetic 0 or historical
   // score as if it were a verified currently eligible reading.
   if(index.score!==null||index.rawScore!==null||
    index.readingAsOf!==null||index.readingSnapshotId!==null||
    index.previousScore!==null||index.changePoints!==null||
    index.confidence!==null)return false;
  }else if(index.status==="available"){
   const readingAt=Date.parse(index.readingAsOf??"");
   if(index.score===null||!Number.isFinite(index.score)||
    index.score<0||index.score>100||
    !Number.isFinite(readingAt)||readingAt>snapshot||
    !index.readingSnapshotId||
    index.rawScore===null||!Number.isFinite(index.rawScore)||
    index.rawScore<0||index.rawScore>100)return false;
  }else return false;
  if(!index.series||!index.series["24H"]||!index.series["7D"]||!index.series["30D"])return false;
  for(const span of ["24H","7D","30D"] as const){
   const series=index.series[span];
   if(series.buckets!==null&&!Array.isArray(series.buckets))return false;
  }
 }
 return expected.size===0;
}

/** Downgrade already cached indices as their real native clock ages. */
export function ageVerifiedRiskIndices(data:PublicRiskIndices,now=Date.now()):PublicRiskIndices{
 return {...data,indices:data.indices.map(index=>{
  if(index.status!=="available"||index.readingAsOf===null)return index;
  const time=Date.parse(index.readingAsOf);
  const age=Number.isFinite(time)?Math.max(0,(now-time)/(60*60_000)):null;
  const current=index.readingStatus==="current"&&age!==null&&
   time<=now&&age<=GRI_CURRENT_READING_WINDOW_HOURS;
  return {...index,readingAgeHours:age,readingStatus:current?"current" as const:"last_verified" as const};
 })};
}
