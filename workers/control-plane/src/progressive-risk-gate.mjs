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
export async function readProgressiveFacts(db, subject, now=Date.now()) {
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
      GROUP BY country_iso3,category,event_fingerprint
    )`;
  // Existing continuously refreshed Google/Reuters/ANI/AP discovery index
  // supplies Basic without a second writer, queue or a new publisher pull.
  // Those Google-index observations are NOT independent original proof.
  const [row,indexRow] = await Promise.all([
    db.prepare(query).bind(...ids,cutoff,ceiling).first(),
    db.prepare(`SELECT COUNT(DISTINCT event_id) AS index_events,
      MAX(event_at) AS latest_index_clock,
      MAX(CASE WHEN status='CORROBORATED'
        AND fact_basis='ARTICLE_FULL_TEXT' AND original_page_fetched=1
        AND independent_source_count>=2 THEN independent_source_count ELSE 0 END)
          AS native_corroborated_publisher_count
      FROM unverified_observations
      WHERE entity_type='COUNTRY' AND entity_id IN (${whereIds})
        AND event_at>=? AND event_at<=?`)
      .bind(...ids,cutoff,ceiling).first()
  ]);
  const events = Math.max(0,Number(row?.unique_events ?? 0),
    Number(indexRow?.index_events ?? 0));
  // Existing global 20-minute collector already promotes ONLY same-event,
  // native original-page corroboration. Its trusted D1 state gives Standard
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
  const standard = facts.standard_ready;
  return {
    basic:{active:true,status:"ACTIVE"},
    standard:{
      active:standard,status:standard?"ACTIVE":"PENDING",
      corroboration_sources_count:facts.corroboration_sources_count,
      ...(!standard?{missing:["TWO_DISTINCT_PUBLISHERS_SAME_EVENT_WITHIN_72H"]}:{})
    },
    complex:{
      active:Boolean(signedGroReady),status:signedGroReady?"ACTIVE":"LOCKED",
      signed_gro_ready:Boolean(signedGroReady),
      seven_day_rollup_ready:Boolean(sevenDayRollupReady),
      ...(!signedGroReady || !sevenDayRollupReady ? {missing:[
        ...(!signedGroReady?["CURRENT_VERIFIED_SIGNED_GRO"]:[]),
        ...(!sevenDayRollupReady?["VERIFIED_SEVEN_DAY_ROLLUP"]:[])
      ]}:{})
    }
  };
}
export function provisionalRiskGate(parsed,facts,now=Date.now()) {
  const hasFacts = facts.distinct_events>0;
  // The 0-100 result is EXPLICITLY an observed news-activity proxy. 100
  // with zero observations is a conservative policy sentinel, not incident severity.
  const proxyScore = hasFacts ?
    Math.min(100,Math.round(100 * (1-Math.exp(-0.20*facts.distinct_events)))):100;
  const decision = hasFacts?"REQUIRE_APPROVAL":"PAUSE";
  const action = hasFacts?"REQUIRE_HUMAN_APPROVAL":"BLOCK";
  const reason = hasFacts?"discovery_only_provisional":"no_current_evidence";
  const at = new Date(now).toISOString();
  return {
    schema_version:"risk-gate-1.0",request_id:parsed.request_id,
    decision,recommended_action:action,reason_codes:[reason],
    counterfactual:{
      version:"risk-gate-counterfactual-v1.0.0",current_action:action,
      next_less_restrictive_action:hasFacts?"REDUCE_EXPOSURE":"REQUIRE_HUMAN_APPROVAL",
      blockers:[{type:"verification",reason_code:"verified_signed_gro_required_for_executable_policy",
        current_value:"DISCOVERY_ONLY",required_value:"VERIFIED",
        delta_required:null}],
      note:"Counterfactual context only; it never authorizes execution."
    },
    subject:{...parsed.subject,name:null},
    risk:{
      object_id:"derived-observation:"+parsed.subject.id+":"+at,
      score:proxyScore,label:hasFacts?"WATCH":"CRITICAL",
      previous_score:null,delta:null,confidence:0,
      verification_status:"INCOMPLETE",commercial_eligibility_status:"UNVERIFIED",
      generated_at:at,expires_at:new Date(now+3*3600000).toISOString(),
      methodology_version:"discovery-activity-proxy-v1"
    },
    top_drivers:[],
    policy:{policy_id:parsed.policy.policy_id,policy_version:parsed.policy.policy_version},
    primary_driver:"INSUFFICIENT_VERIFIED_CAUSAL_EVIDENCE",
    affected_domain:"geopolitics",severity_score:proxyScore,
    intraday_override:false,flash_check_available:false,
    suggested_mitigation:{exposure_cap_ratio:0,settlement_delay_hours:24},
    risk_metric_semantics:hasFacts?"OBSERVATION_DENSITY_PROXY":"NO_DATA_POLICY_SENTINEL",
    observation_count:facts.distinct_events,
    corroboration_sources_count:facts.corroboration_sources_count,
    execution_authorized:false
  };
}
export async function sevenDayRollupIsReady(env, subject, now=Date.now(),fetcher=fetch) {
  if(subject.type!=="country")return false;
  const rawUrl=String(env?.RISK_GATE_SUPABASE_URL??"");
  const key=String(env?.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY??"");
  let url;try{url=new URL(rawUrl)}catch{return false}
  if(url.protocol!=="https:"||url.username||url.password||
     !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)||key.length<32)return false;
  const q=new URL("/rest/v1/geomacro_risk_signal_7d",url);
  q.searchParams.set("select","domain,rollup_day,scored_days,verification_status,source_snapshot_sha256");
  q.searchParams.set("country_iso3","eq."+subject.id);
  q.searchParams.set("rollup_day","gte."+new Date(now-DAY).toISOString().slice(0,10));
  q.searchParams.set("limit","12");
  try {
    const resp=await fetcher(q.href,{
      headers:{apikey:key,authorization:"Bearer "+key},
      redirect:"error",signal:AbortSignal.timeout(650)
    });
    if(!resp.ok)return false;
    const value=await resp.json();
    const ready=new Set();
    if(!Array.isArray(value))return false;
    for(const row of value){
      if(row?.scored_days>=7 && row?.verification_status==="VERIFIED" &&
        SHA.test(String(row?.source_snapshot_sha256??""))){
        ready.add(row.domain);
      }
    }
    return ["geopolitics","macro_fx","critical_minerals"].every(x=>ready.has(x));
  }catch{return false}
}
