/**
 * Read-only, queue-less progressive discovery decision support.
 * This is an observation-activity proxy, NOT a verified geopolitical risk score.
 * Signing proves GeoMacro issued the advisory; it does NOT prove a source claim.
 */
const enc = new TextEncoder();
const SHA = /^[a-f0-9]{64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const ISO3 = /^[A-Z]{3}$/;
const DAY = 86400000;
const CATEGORIES = new Set(["geopolitics","macro","rare_earth"]);
const isRecord = v => v !== null && typeof v === "object" && !Array.isArray(v);
export function canonicalProgressiveJson(v) {
  if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalProgressiveJson).join(",") + "]";
  if (isRecord(v)) {
    if (Object.keys(v).some(k => k === "__proto__")) throw Error("PROGRESSIVE_FORBIDDEN_KEY");
    return "{" + Object.keys(v).sort().map(k =>
      JSON.stringify(k) + ":" + canonicalProgressiveJson(v[k])).join(",") + "}";
  }
  throw Error("PROGRESSIVE_NON_JSON");
}
export async function progressiveSha(v) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(v)))]
    .map(x => x.toString(16).padStart(2,"0")).join("");
}
function decodeB64(s) {
  if (typeof s !== "string" || s.length < 40 || s.length > 4096 || !B64.test(s))
    throw Error("PROGRESSIVE_SIGNER_INVALID");
  const raw = atob(s);
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
  if (btoa(String.fromCharCode(...bytes)) !== s) throw Error("PROGRESSIVE_SIGNER_INVALID");
  return bytes;
}
/** Signed payload is scope-bound, hashed and verified with the separately pinned public key. */
export async function signProgressiveDecision(payload, env) {
  const id = String(env?.RISK_GATE_DECISION_ED25519_KEY_ID ?? "");
  if (!/^[A-Za-z0-9._:-]{4,120}$/.test(id))
    throw Error("RISK_GATE_DECISION_SIGNER_UNAVAILABLE");
  const privateBytes = decodeB64(env?.RISK_GATE_DECISION_ED25519_PRIVATE_KEY_PKCS8_B64);
  const publicBytes = decodeB64(env?.RISK_GATE_DECISION_ED25519_PUBLIC_KEY_SPKI_B64);
  const privateKey = await crypto.subtle.importKey("pkcs8", privateBytes,
    {name:"Ed25519"}, false, ["sign"]);
  const publicKey = await crypto.subtle.importKey("spki", publicBytes,
    {name:"Ed25519"}, false, ["verify"]);
  const canonical = canonicalProgressiveJson(payload);
  const signature = new Uint8Array(await crypto.subtle.sign("Ed25519",
    privateKey, enc.encode(canonical)));
  if (!await crypto.subtle.verify("Ed25519", publicKey, signature, enc.encode(canonical)))
    throw Error("RISK_GATE_DECISION_SIGNER_KEY_MISMATCH");
  return {
    decision_signature_scheme:"Ed25519",
    decision_signature_key_id:id,
    decision_signature_scope:"geomacro.progressive-risk-gate-decision.v1",
    decision_payload_sha256:await progressiveSha(canonical),
    decision_signature_b64:btoa(String.fromCharCode(...signature)),
  };
}
export async function readProgressiveFacts(db, subject, now=Date.now(), requestedCategory=null) {
  const categoryMap={geopolitics:"geopolitics",macro:"macro",macro_fx:"macro",
    critical_minerals:"rare_earth",rare_earth:"rare_earth"};
  const category=typeof requestedCategory==="string"?
    categoryMap[requestedCategory.toLowerCase()]:null;
  if(requestedCategory!==null&&requestedCategory!==undefined&&!category)
    throw Error("PROGRESSIVE_CATEGORY_INVALID");
  const observationCategory=category==="geopolitics"?"GEOPOLITICS":
    category==="macro"?"MACRO_FX":category==="rare_earth"?"CRITICAL_MINERALS":null;
  const ids = subject.type === "country" ? [subject.id] :
    subject.type === "corridor" ? subject.id.split(">") : [];
  if (!ids.length || ids.length > 2 || ids.some(x => !ISO3.test(x)))
    throw Error("PROGRESSIVE_SUBJECT_INVALID");
  const cutoff = new Date(now - 72 * 3600000).toISOString();
  const ceiling = new Date(now).toISOString();
  const whereIds = ids.map(() => "?").join(",");
  // Distinct publishers are compared only WITHIN the same country/category/event,
  // not over unrelated stories in a country/category cell.
  const query = `SELECT COUNT(*) AS unique_events,
    COALESCE(MAX(publisher_count),0) AS max_publisher_count,
    COALESCE(SUM(CASE WHEN publisher_count>=2 THEN 1 ELSE 0 END),0) AS corroborated_events,
    COUNT(DISTINCT CASE WHEN publisher_count>=2 THEN country_iso3 ELSE NULL END) AS corroborated_countries,
    MAX(last_event_clock) AS latest_event_clock,
    GROUP_CONCAT(DISTINCT category) AS categories
    FROM (
      SELECT country_iso3,category,event_fingerprint,
        COUNT(DISTINCT CASE WHEN clock_basis='ORIGINAL_PUBLICATION' THEN publisher_domain END) AS publisher_count,
        MAX(event_clock) AS last_event_clock
      FROM progressive_risk_gate_facts
      WHERE country_iso3 IN (${whereIds}) AND event_clock>=? AND event_clock<=?
        ${category?"AND category=?":""}
      GROUP BY country_iso3,category,event_fingerprint
    )`;
  // Existing continuously refreshed Google/Reuters/ANI/AP discovery index
  // supplies Basic without a second writer, queue or a new publisher pull.
  // Those Google-index observations are NOT independent original proof.
  const [row,indexRow] = await Promise.all([
    db.prepare(query).bind(...ids,cutoff,ceiling,...(category?[category]:[])).first(),
    // A single row's independent_source_count is not proof of two originals.
    // Count two ACTUAL independently fetched publisher pages for the SAME
    // event_id; never let Google index copies or a forged counter grant Standard.
    db.prepare(`WITH native_events AS (
      SELECT event_id,entity_id,category,MAX(event_at) AS latest_event_clock,
        COUNT(DISTINCT CASE WHEN status='CORROBORATED'
          AND fact_basis='ARTICLE_FULL_TEXT' AND original_page_fetched=1
          THEN source_host END) AS native_original_hosts
      FROM unverified_observations
      WHERE entity_type='COUNTRY' AND entity_id IN (${whereIds})
        AND event_at>=? AND event_at<=?
        ${observationCategory?"AND category=?":""}
      GROUP BY entity_id,category,event_id
    )
    SELECT COUNT(*) AS index_events,MAX(latest_event_clock) AS latest_index_clock,
      COALESCE(MAX(CASE WHEN native_original_hosts>=2
        THEN native_original_hosts ELSE 0 END),0) AS native_corroborated_publisher_count
    FROM native_events`)
      .bind(...ids,cutoff,ceiling,...(observationCategory?[observationCategory]:[])).first()
  ]);
  const events = Math.max(0,Number(row?.unique_events ?? 0),
    Number(indexRow?.index_events ?? 0));
  // Existing global 20-minute collector can promote ONLY same-event,
  // independently observed original-page corroboration after this count.
  // Its trusted D1 state gives Standard
  // continuous autonomous promotion even before a new fact batch is admitted.
  // Google-index-only records remain Basic.
  const legacyNative=subject.type==="country"
    ?Math.max(0,Number(indexRow?.native_corroborated_publisher_count??0)):0;
  const sourceCount = Math.max(0,Number(row?.max_publisher_count ?? 0),legacyNative);
  const countries = Math.max(0,Number(row?.corroborated_countries ?? 0));
  return {
    distinct_events:events,
    corroboration_sources_count:sourceCount,
    corroborated_events:Math.max(0,Number(row?.corroborated_events ?? 0)),
    category_coverage:String(row?.categories ?? "").split(",").filter(c => CATEGORIES.has(c)),
    latest_event_clock:[row?.latest_event_clock,indexRow?.latest_index_clock]
      .filter(x=>typeof x==="string").sort().at(-1)??null,
    standard_ready: (countries === ids.length && sourceCount >= 2) || legacyNative>=2,
  };
}
export function progressiveTierMatrix(facts, signedGroReady, sevenDayRollupReady) {
  const standard = facts.standard_ready === true;
  // Progressive delivery is monotone in verified authority, not in the
  // presence of a signed object alone. An absent 7-day history is HOLD.
  const complex = standard && signedGroReady === true && sevenDayRollupReady === true;
  return {
    basic:{active:true,status:"ACTIVE"},
    standard:{
      active:standard,status:standard?"ACTIVE":"PENDING",
      corroboration_sources_count:facts.corroboration_sources_count,
      ...(!standard?{missing:["TWO_DISTINCT_PUBLISHERS_SAME_EVENT_WITHIN_72H"]}:{})
    },
    complex:{
      active:complex,status:complex?"ACTIVE":"LOCKED",
      signed_gro_ready:Boolean(signedGroReady),
      seven_day_rollup_ready:Boolean(sevenDayRollupReady),
      ...(!complex ? {missing:[
        ...(!standard?["TWO_DISTINCT_PUBLISHERS_SAME_EVENT_WITHIN_72H"]:[]),
        ...(!signedGroReady?["CURRENT_VERIFIED_SIGNED_GRO"]:[]),
        ...(!sevenDayRollupReady?["VERIFIED_SEVEN_DAY_ROLLUP"]:[])
      ]}:{})
    }
  };
}
const DOMAIN_BY_CATEGORY=Object.freeze({
 geopolitics:"geopolitics",macro:"macro_fx",macro_fx:"macro_fx",
 critical_minerals:"critical_minerals",rare_earth:"critical_minerals"
});
const DRIVER_BY_CATEGORY=Object.freeze({
 geopolitics:"conflict",macro:"macro_stress",macro_fx:"macro_stress",
 critical_minerals:"critical_minerals",rare_earth:"critical_minerals"
});
const DRIVER_DOMAIN=Object.freeze({
 conflict:"geopolitics",sanctions:"geopolitics",political_instability:"geopolitics",
 trade_policy:"geopolitics",monetary_policy:"macro_fx",inflation:"macro_fx",
 labor_market:"macro_fx",currency_fx:"macro_fx",macro_stress:"macro_fx",
 rare_earth_supply:"critical_minerals",critical_minerals:"critical_minerals",
 shipping_logistics:"critical_minerals"
});
const actionFor=decision=>({CONTINUE:"CONTINUE",REDUCE_LIMIT:"REDUCE_EXPOSURE",
 REQUIRE_APPROVAL:"REQUIRE_HUMAN_APPROVAL",PAUSE:"BLOCK"})[decision];
function decisionForProxy(parsed,score,confidence,drivers){
 const p=parsed.policy;let decision;
 if(score<=p.continue_max_score)decision="CONTINUE";
 else if(score<=p.reduce_limit_max_score)decision="REDUCE_LIMIT";
 else if(score<=p.require_approval_max_score)decision="REQUIRE_APPROVAL";
 else decision="PAUSE";
 const reasons=["observation_proxy_policy_evaluated"];
 if(decision==="CONTINUE"&&confidence<p.minimum_confidence_for_auto_continue){
  decision="REQUIRE_APPROVAL";reasons.push("confidence_below_auto_continue_threshold");
 }
 if(decision==="CONTINUE"&&p.require_commercial_verification_for_continue){
  decision="REQUIRE_APPROVAL";reasons.push("commercial_verification_required");
 }
 if(decision==="CONTINUE"&&typeof p.max_positive_delta_for_auto_continue==="number"){
  // Observation proxies intentionally carry no historical score delta.
 }
 const hardStops=p.hard_stop_driver_contributions??{};
 if(drivers.some(x=>typeof hardStops[x.driver]==="number"&&
    x.score_contribution>=hardStops[x.driver])){
  decision="PAUSE";reasons.push("hard_stop_driver_triggered");
 }
 return {decision,recommended_action:actionFor(decision),reason_codes:reasons};
}
export function provisionalRiskGate(parsed,facts,now=Date.now()) {
 const distinct=Math.max(0,Number(facts?.distinct_events)||0);
 const sources=Math.max(0,Number(facts?.corroboration_sources_count)||0);
 const corroborated=Math.max(0,Number(facts?.corroborated_events)||0);
 const standardReady=facts?.standard_ready===true&&sources>=2;
 const hasFacts=distinct>0;
 // The 0-100 result remains an observation-activity proxy, never a 7-day GRO.
 const proxyScore=hasFacts?Math.min(100,Math.round(100*(1-Math.exp(-0.20*distinct)))):100;
 const confidence=!hasFacts?0:standardReady?
  Math.min(0.85,Number((0.60+0.05*sources+0.02*corroborated).toFixed(2))):
  Math.min(0.55,Number((0.30+0.05*distinct).toFixed(2)));
 const requested=typeof parsed.category==="string"?parsed.category.toLowerCase():null;
 const categories=[...new Set((facts?.category_coverage??[]).map(x=>String(x).toLowerCase()))];
 if(requested)categories.unshift(requested);
 const selected=categories.find(x=>DOMAIN_BY_CATEGORY[x])??requested??"geopolitics";
 const affectedDomain=DOMAIN_BY_CATEGORY[selected]??"geopolitics";
 const drivers=[...new Set([...categories,selected].map(x=>DRIVER_BY_CATEGORY[x]).filter(Boolean))];
 const topDrivers=hasFacts?drivers.map(driver=>({driver,
  score_contribution:Number((proxyScore/Math.max(1,drivers.length)).toFixed(2)),
  delta_contribution:null})):[];
 const policyDecision=decisionForProxy(parsed,proxyScore,confidence,topDrivers);
 const at=new Date(now).toISOString();
 const reason=!hasFacts?"no_current_evidence":standardReady?"corroborated_observation_proxy":"discovery_only_provisional";
 return {
  schema_version:"risk-gate-1.0",request_id:parsed.request_id,
  decision:policyDecision.decision,recommended_action:policyDecision.recommended_action,
  reason_codes:[reason,...policyDecision.reason_codes],
  counterfactual:{version:"risk-gate-counterfactual-v1.0.0",current_action:policyDecision.recommended_action,
   next_less_restrictive_action:policyDecision.decision==="PAUSE"?"REQUIRE_HUMAN_APPROVAL":
    policyDecision.decision==="REQUIRE_APPROVAL"?"REDUCE_EXPOSURE":
    policyDecision.decision==="REDUCE_LIMIT"?"CONTINUE":"CONTINUE",
   blockers:[{type:"verification",reason_code:"verified_signed_gro_required_for_executable_policy",
    current_value:standardReady?"CORROBORATED_OBSERVATION_PROXY":"DISCOVERY_ONLY",
    required_value:"VERIFIED",delta_required:null}],
   note:"Counterfactual context only; it never authorizes execution."},
  subject:{...parsed.subject,name:null},
  risk:{object_id:"derived-observation:"+parsed.subject.id+":"+at,score:proxyScore,
   label:hasFacts?"WATCH":"CRITICAL",previous_score:null,delta:null,confidence,
   verification_status:"INCOMPLETE",commercial_eligibility_status:"UNVERIFIED",
   generated_at:at,expires_at:new Date(now+3*3600000).toISOString(),
   methodology_version:"discovery-activity-proxy-v1"},
  top_drivers:topDrivers,
  policy:{policy_id:parsed.policy.policy_id,policy_version:parsed.policy.policy_version},
  primary_driver:topDrivers[0]?.driver.toUpperCase()??"INSUFFICIENT_VERIFIED_CAUSAL_EVIDENCE",
  affected_domain:topDrivers[0]?DRIVER_DOMAIN[topDrivers[0].driver]??affectedDomain:affectedDomain,
  severity_score:proxyScore,intraday_override:false,flash_check_available:false,
  suggested_mitigation:policyDecision.decision==="CONTINUE"?{exposure_cap_ratio:1,settlement_delay_hours:0}:
   policyDecision.decision==="REDUCE_LIMIT"?{exposure_cap_ratio:0.5,settlement_delay_hours:24}:
   policyDecision.decision==="REQUIRE_APPROVAL"?{exposure_cap_ratio:0,settlement_delay_hours:24}:
   {exposure_cap_ratio:0,settlement_delay_hours:0},
  risk_metric_semantics:standardReady?"CORROBORATED_OBSERVATION_PROXY":
   hasFacts?"OBSERVATION_DENSITY_PROXY":"NO_DATA_POLICY_SENTINEL",
  observation_count:distinct,corroboration_sources_count:sources,execution_authorized:false
 };
}
/** Shared Basic/Standard decision builder used by partner and Store adapters.
 * It consumes only admitted fact counts; it never promotes raw source rights. */
export function generateProgressiveRiskGateDecision(parsed,facts,tier,
 signedGroReady=false,sevenDayRollupReady=false,now=Date.now()){
 const tierActivationMatrix=progressiveTierMatrix(facts,Boolean(signedGroReady),
  Boolean(sevenDayRollupReady));
 const tierReady=tier==="basic_focused"?facts.distinct_events>0:
  tier==="standard"?tierActivationMatrix.standard.active===true:
  tier==="complex_full"?tierActivationMatrix.complex.active===true:false;
 let result=provisionalRiskGate(parsed,facts,now);
 if(!tierReady)result={...result,decision:"PAUSE",recommended_action:"BLOCK",
  reason_codes:["INSUFFICIENT_EVIDENCE"],primary_driver:"INSUFFICIENT_EVIDENCE",
  execution_authorized:false};
 return {result,tierReady,tierActivationMatrix};
}
export async function sevenDayRollupIsReady(env, subject, now=Date.now(),fetcher=fetch) {
  if(subject?.type!=="country"||!ISO3.test(subject.id)||
     !Number.isSafeInteger(now)||!env?.DB?.prepare)return false;
  const rawUrl=String(env?.RISK_GATE_SUPABASE_URL??"");
  const key=String(env?.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY??"");
  let url;try{url=new URL(rawUrl)}catch{return false}
  if(url.protocol!=="https:"||url.username||url.password||
     !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)||key.length<32)return false;
  const today=new Date(now).toISOString().slice(0,10);
  const yesterday=new Date(now-DAY).toISOString().slice(0,10);
  const q=new URL("/rest/v1/geomacro_risk_signal_7d",url);
  q.searchParams.set("select","domain,rollup_day,scored_days,verification_status,source_snapshot_sha256,verified_gro_sha256");
  q.searchParams.set("country_iso3","eq."+subject.id);
  q.searchParams.set("rollup_day","gte."+yesterday);
  q.searchParams.set("limit","12");
  try {
    const resp=await fetcher(q.href,{
      headers:{apikey:key,...(key.startsWith("sb_secret_")?{}:{authorization:"Bearer "+key})},
      redirect:"error",signal:AbortSignal.timeout(650)
    });
    if(!resp.ok||resp.redirected)return false;
    const value=await resp.json();
    if(!Array.isArray(value)||value.length>12)return false;
    // The Supabase rollup is a *claim* about 7 days. It is not proof:
    // scored_days may include Basic provisional values. Verify each real day.
    const dayClaims=new Map();
    const domains=new Set(["geopolitics","macro_fx","critical_minerals"]);
    for(const row of value){
      const day=row?.rollup_day;
      if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day)||
         day<yesterday||day>today||!domains.has(row?.domain)||
         row.scored_days!==7||row.verification_status!=="VERIFIED"||
         !SHA.test(String(row.source_snapshot_sha256??""))||
         !SHA.test(String(row.verified_gro_sha256??"")))continue;
      const group=dayClaims.get(day)??new Map();
      if(group.has(row.domain))return false;
      group.set(row.domain,row);
      dayClaims.set(day,group);
    }
    const {signedSnapshotRows}=await import("./unified-risk-gate.mjs");
    for(const [day,claims] of [...dayClaims.entries()].sort(([a],[b])=>b.localeCompare(a))){
      if(claims.size!==3)continue;
      const claimed=[...claims.values()];
      if(!claimed.every(row=>
        row.source_snapshot_sha256===claimed[0].source_snapshot_sha256&&
        row.verified_gro_sha256===claimed[0].verified_gro_sha256))continue;
      const from=new Date(Date.parse(day+"T00:00:00.000Z")-6*DAY).toISOString().slice(0,10);
      // This single bounded indexed D1 range read validates EVERY daily
      // immutable snapshot's original HMAC and exact stored SHA, not one
      // unverified aggregate counter or seven copies of a single day.
      const rows=await signedSnapshotRows(env,
        "entity_type='COUNTRY' AND entity_id=? AND day_utc>=? AND day_utc<=?",
        [subject.id,from,day]);
      if(rows.length!==7)continue;
      const expected=Array.from({length:7},(_,i)=>
        new Date(Date.parse(from+"T00:00:00.000Z")+i*DAY).toISOString().slice(0,10));
      if(!rows.every((row,i)=>{
        const snapshot=row.snapshot,score=snapshot?.verified_unified_risk_score;
        return row.day_utc===expected[i]&&row.entity_id===subject.id&&
          row.entity_type==="COUNTRY"&&
          snapshot?.target_type==="COUNTRY"&&snapshot?.target_id===subject.id&&
          snapshot?.generated_at===row.generated_at&&
          row.proof?.timestamp_utc===row.generated_at&&
          row.generated_at?.slice(0,10)===expected[i]&&
          SHA.test(String(snapshot?.signed_gro_payload_sha256??""))&&
          typeof score==="number"&&Number.isFinite(score)&&score>=0&&score<=1&&
          ["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].every(category=>{
            const n=snapshot?.categories?.[category]?.risk_score;
            return typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1;
          });
      }))continue;
      const latest=rows[6];
      if(latest.content_sha256===claimed[0].source_snapshot_sha256&&
         latest.snapshot.signed_gro_payload_sha256===claimed[0].verified_gro_sha256)
        return true;
    }
    return false;
  }catch{return false}
}
