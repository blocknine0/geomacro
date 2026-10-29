#!/usr/bin/env node
/**
 * 195 UN-members-and-observers x 3 domains x 4 question archetypes x 2 actors
 * = 4,680 immutable synthetic QUESTION scenarios, not invented facts/answers.
 * A separate 1,170-case country/category/actor set rotates through live probes.
 * Default is offline generation, with zero requests. --live is strictly
 * rate-limited, no-funds and cannot imply a paid 200 delivery.
 *
 * Does not import any PREDGE module, mutate any D1/B2 state, or log secrets.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { select195x3LiveSample } from "../lib/195x3-live-sample.mjs";

const sha = v => createHash("sha256").update(v).digest("hex");
const flags = new Set(process.argv.slice(2));
const live = flags.has("--live");
const limitArg = [...flags].find(x => x.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 6;
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30) throw Error("BOUNDED_LIVE_LIMIT_REQUIRED_1_TO_30");
const delay = Number(process.env.GEOMACRO_195_AUDIT_DELAY_MS ?? 5000);
if (!Number.isSafeInteger(delay) || delay < 4000 || delay > 30000) throw Error("LIVE_PROBE_DELAY_OUT_OF_RANGE");
const root = process.env.GEOMACRO_195_AUDIT_ORIGIN ?? "https://geomacro.live";
if (root !== "https://geomacro.live") throw Error("PRODUCTION_ORIGIN_PINNED_NO_ARBITRARY_TARGETS");

const countryFile = readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const rows = countryFile.match(/const COUNTRY_ROWS=`([\s\S]*?)`;/u)?.[1]?.trim().split("\n");
if (!rows || rows.length !== 195) throw Error("COUNTRY_195_REGISTRY_MISSING");
const countries = rows.map(line => {
  const [iso3,iso2,name] = line.split("|");
  if (!/^[A-Z]{3}$/u.test(iso3) || !/^[A-Z]{2}$/u.test(iso2) || !name) throw Error("COUNTRY_ROW_INVALID");
  return {iso3,iso2,name};
});
if (new Set(countries.map(c=>c.iso3)).size!==195 || new Set(countries.map(c=>c.iso2)).size!==195 ||
    !countries.some(c=>c.iso3==="PSE") || !countries.some(c=>c.iso3==="VAT"))
  throw Error("COUNTRY_UNIVERSE_INVALID");
const sources = JSON.parse(readFileSync("config/answer-source-candidates-195x3.v1.json","utf8"));
if (sources.execution!=="NON_ACTIVE_RESEARCH_REGISTRY" || sources.candidate_sources.length < 6)
  throw Error("SOURCE_CATALOGUE_REVIEW_REQUIRED");

const topics = {
  geopolitics:[
    {id:"sanctions",topic:"sanctions_restrictions",text:"What are the latest sanctions or export restrictions affecting"},
    {id:"conflict",topic:"conflict_geopolitics",text:"What verified armed-conflict or security developments affect"},
    {id:"governance",topic:"political_governance",text:"What has changed in elections or political governance in"},
    {id:"tariff",topic:"trade_corridor",text:"How do new tariffs and trade policy affect"}
  ],
  macro:[
    {id:"inflation",topic:"macro_risk",text:"What is the latest official inflation and monetary-policy release for"},
    {id:"foreign_exchange",topic:"fx_external_risk",text:"What are the foreign exchange and reserves developments for"},
    {id:"sovereign_debt",topic:"sovereign_risk",text:"What official sovereign debt and fiscal deficit evidence exists for"},
    {id:"banking",topic:"banking_financial_system",text:"What are the latest bank liquidity and financial-system signals for"}
  ],
  critical_minerals:[
    {id:"lithium",topic:"critical_minerals",text:"What new lithium mining or production developments have been published for"},
    {id:"copper",topic:"critical_minerals",text:"What official copper production and export changes are evidenced for"},
    {id:"rare_earth",topic:"critical_minerals",text:"What rare earth refining or processing disruptions are verified in"},
    {id:"graphite",topic:"critical_minerals",text:"What graphite supply and export restrictions are documented for"}
  ]
};
const categories = Object.keys(topics);
const matrix=[];
const liveCandidates=[];
let n=0;
for (const [i,country] of countries.entries()) {
  for (const category of categories) {
    const liveScenario=topics[category][i%topics[category].length].id;
    for (const selected of topics[category]) {
      for (const actor of ["human","machine"]) {
        const multilingualSample=selected.id===topics[category][0].id;
        const isBn = multilingualSample && i%19===5 && actor==="human";
        const isHi = multilingualSample && i%19===8 && actor==="human";
        const language=isBn?"bn":isHi?"hi":"en";
        const translated=isBn
          ? {geopolitics:"সর্বশেষ নিষেধাজ্ঞা ও ভূরাজনৈতিক ঘটনা কী?",macro:"সর্বশেষ মুদ্রাস্ফীতি ও সুদের হার কী?",critical_minerals:"লিথিয়াম ও গুরুত্বপূর্ণ খনিজের সাম্প্রতিক পরিস্থিতি কী?"}[category]
          : isHi
            ? {geopolitics:"नवीनतम प्रतिबंध और भू-राजनीतिक घटनाएं क्या हैं?",macro:"नवीनतम मुद्रास्फीति और ब्याज दरें क्या हैं?",critical_minerals:"लिथियम और महत्वपूर्ण खनिजों की ताज़ा स्थिति क्या है?"}[category]
            : null;
        const question=translated ? `${country.name}: ${translated}`
          : `${selected.text} ${country.name}? Return dated evidence, uncertainty, and what to monitor, without guessing.`;
        const id="G195-"+String(++n).padStart(5,"0");
        const subject={type:"country",country_iso3:country.iso3};
        const payload={question, client_request_id:id,
          // A person can ask only a question, while an agent passes explicit ISO3.
          ...(actor==="machine" || language!=="en" ? {subjects:[subject],topics:[selected.topic]} : {}),
          ...(language!=="en"?{language}:{})
        };
        const key=category==="critical_minerals"?"critical_minerals":category;
        const testCase={id,country_iso3:country.iso3,country:country.name,category,
          scenario:selected.id,topic:selected.topic,actor,language,
          request_body:payload,endpoint:"/api/v1/intelligence/structured-answer",
          expected_evidence:sources.classification[key].must_have,
          prospective_source_ids:sources.candidate_sources
            .filter(s=>s.categories.includes(category)).map(s=>s.id),
          // This is a REQUIREMENTS inventory, not claimed publisher/evidence access.
          source_coverage_status:"NOT_MEASURED",
          response_status:"NOT_TESTED",http_status:null,error_code:null,
          payment_submitted:false,settlement_performed:false};
        matrix.push(testCase);
        if(selected.id===liveScenario)liveCandidates.push(testCase);
      }
    }
  }
}
if(matrix.length!==4680 || new Set(matrix.map(x=>x.id)).size!==4680 ||
   liveCandidates.length!==1170 || new Set(liveCandidates.map(x=>x.id)).size!==1170 ||
   categories.some(category=>matrix.filter(x=>x.category===category).length!==1560) ||
   countries.some(c=>matrix.filter(x=>x.country_iso3===c.iso3).length!==24) ||
   matrix.filter(x=>x.actor==="human").length!==2340 ||
   matrix.filter(x=>x.actor==="machine").length!==2340 ||
   categories.some(category=>topics[category].some(topic=>
     !matrix.some(x=>x.category===category&&x.scenario===topic.id))))
  throw Error("QUESTION_MATRIX_INTEGRITY_FAILED");

const manifestHash=sha(JSON.stringify(matrix.map(({id,country_iso3,category,scenario,actor,language,request_body})=>
  ({id,country_iso3,category,scenario,actor,language,request_body}))));
// Rotate over the candidate list itself; indexing a permutation of the full
// 4,680-case matrix silently under-selected live probes.
const epochDay=Math.max(0,Math.floor((Date.now()-Date.UTC(2026,9,29))/86400000));
const selected=live ? select195x3LiveSample(liveCandidates,limit,epochDay) : [];
function errorCode(json) {
 const value=json?.error?.code??json?.error_code??json?.code??json?.reason;
 return typeof value==="string"?value.slice(0,110):null;
}
function classify(status,code) {
 if(status===402)return "X402_CHALLENGE_UNPAID_NOT_DELIVERED";
 if(status===200)return "SECURITY_ALERT_UNPAID_200";
 if(status===429)return "RATE_LIMIT";
 if(status===400 || status===415)return "INPUT_SCHEMA_OR_QUERY_INTERPRETATION";
 if(status===422)return /SOURCE|EVIDENCE|UNAVAILABLE|FRESH|SIGN|LICEN|RIGHT|QUALIF|PROOF/iu.test(code??"")
   ?"EVIDENCE_OR_SOURCE_UNAVAILABLE":"UNFULFILLED_SCOPE_OR_UNKNOWN_DEPENDENCY";
 if(status===503)return "DEPENDENCY_OR_QUOTA_UNAVAILABLE";
 if(status===403)return "AUTHORIZATION_OR_RIGHTS_REFUSAL";
 if(status===404)return "ROUTE_NOT_FOUND";
 return "UNEXPECTED_HTTP_"+status;
}
const results=[];
for (const [i,item] of selected.entries()) {
 let outcome={id:item.id,iso3:item.country_iso3,category:item.category,actor:item.actor,
   status:"NETWORK_FAILURE",http_status:null,error_code:null,
   payment_header_present:false,delivery_hash_header_present:false};
 try {
   const response=await fetch(root+item.endpoint,{
     method:"POST",redirect:"error",
     headers:{"Content-Type":"application/json","Accept":"application/json",
       "Cache-Control":"no-store","User-Agent":"GeoMacro-195x3-NoFunds-Regression/1.0"},
     body:JSON.stringify(item.request_body),signal:AbortSignal.timeout(12000)
   });
   const ctype=response.headers.get("content-type")??"";
   const text=await response.text();
   const safe=ctype.includes("application/json") && text.length<=100000;
   const json=safe?JSON.parse(text):null;
   outcome={...outcome,http_status:response.status,error_code:errorCode(json),
     payment_header_present:Boolean(response.headers.get("payment-required")),
     delivery_hash_header_present:Boolean(response.headers.get("x-geomacro-delivery-sha256")),
     status:safe?classify(response.status,errorCode(json)):"NON_JSON_OR_OVERSIZED"};
 }catch(error){outcome.error_code=String(error?.name??"NETWORK_ERROR").slice(0,64);}
 item.response_status=outcome.status;
 item.http_status=outcome.http_status;
 item.error_code=outcome.error_code;
 results.push(outcome);
 if(i<selected.length-1)await new Promise(r=>setTimeout(r,delay));
}
const counts={};
for(const x of results)counts[x.status]=(counts[x.status]??0)+1;
const cells= countries.flatMap(country=>categories.map(category=>{
 const found=results.filter(x=>x.iso3===country.iso3&&x.category===category);
 const codes=[...new Set(found.map(x=>x.error_code).filter(Boolean))];
 return {iso3:country.iso3,category,attempted:found.length,
   unpaid_quote_challenges:found.filter(x=>x.status==="X402_CHALLENGE_UNPAID_NOT_DELIVERED").length,
   failures:found.filter(x=>!["X402_CHALLENGE_UNPAID_NOT_DELIVERED"].includes(x.status)).length,
   error_codes:codes,paid_structured_deliveries_verified:0,
   remaining_source_evidence:"NEEDS_CANONICAL_READBACK_AND_ORIGINAL_PROOF"};
}));
const output=resolve(process.env.RUNNER_TEMP??"/tmp","geomacro-195x3-query-regression");
mkdirSync(output,{recursive:true});
const summary={
 schema:"geomacro.195x3-human-machine-structured-output-audit.v1",generated_at:new Date().toISOString(),
 country_universe:"193_UN_members_plus_2_observer_states",countries:195,categories:3,
 total_question_scenarios:4680,human:2340,machine:2340,matrix_cells:585,
 question_archetypes_per_country_category:4,
 live_probe_candidate_scenarios:1170,
 manifest_sha256:manifestHash, mode:live?"PRODUCTION_UNPAID_PROBE":"OFFLINE_TEST_CASE_GENERATION",
 live_requests_attempted:results.length,live_result_classes:counts,
 paid_structured_deliveries_verified:0,usdc_spent:"0",source_registration_is_not_ingestion:true,
 source_families_newly_active:0,source_rights_or_original_event_auto_approved:false,
 predge_modified:false,
 interpretation:"A 402 is an unpaid quote, not a paid delivery; a source catalogue is not original evidence."
};
writeFileSync(output+"/summary.json",JSON.stringify(summary,null,2)+"\n");
writeFileSync(output+"/question-manifest.json",JSON.stringify({summary,cases:matrix},null,2)+"\n");
writeFileSync(output+"/live-probe-candidate-manifest.json",JSON.stringify({
  summary:{...summary,total_question_scenarios:liveCandidates.length,
    human:585,machine:585,mode:"LIVE_PROBE_CANDIDATES_NOT_EXECUTED"},cases:liveCandidates
},null,2)+"\n");
writeFileSync(output+"/country-category-gaps.json",JSON.stringify({summary,cells},null,2)+"\n");
writeFileSync(output+"/live-no-funds-results.json",JSON.stringify({summary,results},null,2)+"\n");
console.log(JSON.stringify({output,summary}));
if((counts.SECURITY_ALERT_UNPAID_200??0)>0)process.exitCode=2;
