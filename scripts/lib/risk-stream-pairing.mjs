import {canonicalRiskStreamCategory,eventFingerprint,eventIdentityFields,normalizedEventIdentity}
 from "./risk-stream-event-fingerprint.mjs";
import {RISK_STREAM_CATEGORY_ROLES} from "./risk-stream-source-rights-manifest.mjs";
import {createHash} from "node:crypto";

const fail=code=>{throw Error("RISK_STREAM_PAIRING_"+code)};
const WINDOW_48H=48*3600000;
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const PARENT=/^[a-z0-9_.:-]{1,100}$/u;
const HEX=/^[a-f0-9]{64}$/u;

/** Pair only independent, exact-claim originals; disputes/retractions veto a group. */
export function pairRiskStreamOriginals(originals,now=Date.now()){
 const current=now instanceof Date?now.getTime():typeof now==="number"?now:Date.parse(now);
 if(!Number.isFinite(current)||!Array.isArray(originals))fail("INPUT_INVALID");
 const groups=new Map();
 for(const original of originals){
  const fingerprint=eventFingerprint(original);
  const at=Date.parse(original.published_at);
  if(!Number.isFinite(at)||at>current||current-at>72*3600000)
   fail("ORIGINAL_CLOCK_INVALID");
  const occurred=Date.parse(normalizedEventIdentity(original).occurred_at);
  if(!Number.isFinite(occurred)||occurred>current||at<occurred-5*60000)
   fail("EVENT_CLOCK_INVALID");
  if(!SOURCE.test(original.source_id??"")||!DOMAIN.test(original.publisher_root_domain??"")||
     !PARENT.test(original.parent_media_entity??""))fail("SOURCE_IDENTITY_INVALID");
  if(!["confirms","disputes","retracts"].includes(original.reporting_position))
   fail("REPORTING_POSITION_INVALID");
  const key=fingerprint;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({original,fingerprint,at});
 }
 const pairs=[],contradictions=[];
 for(const [fingerprint,group] of groups){
  if(group.some(item=>item.original.reporting_position!=="confirms")){
   contradictions.push({event_fingerprint:fingerprint,
    state:"MATERIAL_CONTRADICTION",pair:null});
   continue;
  }
  const category=canonicalRiskStreamCategory(group[0]?.original.category);
  const required=RISK_STREAM_CATEGORY_ROLES[category];
  if(!required)fail("CATEGORY_INVALID");
  let found=null;
  for(let i=0;i<group.length&&!found;i++)for(let j=i+1;j<group.length;j++){
   const a=group[i],b=group[j],x=a.original,y=b.original;
   if(canonicalRiskStreamCategory(x.category)!==canonicalRiskStreamCategory(y.category)||
      (x.country_iso3??normalizedEventIdentity(x).country_iso3)!==
       (y.country_iso3??normalizedEventIdentity(y).country_iso3)||
      x.source_id===y.source_id||x.publisher_root_domain===y.publisher_root_domain||
      x.parent_media_entity===y.parent_media_entity||
      !eventIdentityFields(x).entities.some(entity=>
       eventIdentityFields(y).entities.includes(entity))||
      Math.abs(a.at-b.at)>WINDOW_48H||
      !required.every(role=>[x.source_role,y.source_role].includes(role)))continue;
   if(typeof x.raw_payload!=="string"||x.raw_payload.length<16||x.raw_payload.length>8000||
      typeof y.raw_payload!=="string"||y.raw_payload.length<16||y.raw_payload.length>8000)continue;
   const hashA=createHash("sha256").update(x.raw_payload).digest("hex");
   const hashB=createHash("sha256").update(y.raw_payload).digest("hex");
   if((x.original_page_sha256&&x.original_page_sha256!==hashA)||
      (y.original_page_sha256&&y.original_page_sha256!==hashB)||
      !HEX.test(hashA)||!HEX.test(hashB)||hashA===hashB)continue;
   found=[x,y];break;
  }
  if(found)pairs.push({event_fingerprint:fingerprint,state:"QUALIFIED_PAIR",items:found});
 }
 return {schema:"geomacro.risk-stream-independent-original-pairs.v1",pairs,
  contradictions,unpaired_event_fingerprints:[...groups.keys()].filter(key=>
   !pairs.some(pair=>pair.event_fingerprint===key)&&
   !contradictions.some(item=>item.event_fingerprint===key))};
}
